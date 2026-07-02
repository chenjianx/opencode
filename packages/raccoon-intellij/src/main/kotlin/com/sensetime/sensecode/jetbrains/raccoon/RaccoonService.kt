package com.sensetime.sensecode.jetbrains.raccoon

import com.google.gson.JsonParser
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.content.ContentManagerEvent
import com.intellij.ui.content.ContentManagerListener
import java.io.File

/**
 * Project-scoped owner of the Raccoon sidecar + webview surfaces. Spawns the Node sidecar, builds
 * the JCEF webview(s), and routes messages between them following the stdio RPC protocol in rpc.ts.
 *
 * Two webview surfaces mirror the VSCode host: the always-present "chat" surface and a lazily
 * created "settings" surface (a second tool-window tab, opened on the sidecar's `openSettings`
 * signal). Each surface tags its outgoing messages with its own `source`; the sidecar's provider
 * owns readiness + state hydration per surface.
 *
 * Created lazily by [RaccoonToolWindowFactory]; disposed with the project.
 */
@Service(Service.Level.PROJECT)
class RaccoonService(private val project: Project) : Disposable {
    private val log = logger<RaccoonService>()
    private var chatWebview: RaccoonWebview? = null
    private var settingsWebview: RaccoonWebview? = null
    private var sidecar: SidecarProcess? = null
    private var serverPort: Int? = null

    private var toolWindow: ToolWindow? = null
    private var settingsContent: Content? = null

    /** Last chat-mode seen in a state frame; used when creating a session (parity with the webview). */
    @Volatile
    private var currentMode: String = "build"

    /** Called by the tool window factory: build the chat surface, start the sidecar, wire actions. */
    fun initToolWindow(toolWindow: ToolWindow) {
        this.toolWindow = toolWindow

        val view = RaccoonWebview(source = "chat", onWebviewMessage = { onWebviewMessage("chat", it) })
        Disposer.register(this, view)
        chatWebview = view

        val plugin = RaccoonPaths.resolve()
        val proc = SidecarProcess(
            nodePath = plugin.nodePath,
            sidecarCjs = plugin.sidecarCjs,
            workingDir = project.basePath ?: System.getProperty("user.dir"),
            raccoonBin = plugin.raccoonBin,
            onMessage = ::onSidecarMessage,
        )
        sidecar = proc
        proc.start()

        // Send init so the sidecar can build the orchestrator with our workspace + locale.
        val directory = (project.basePath ?: System.getProperty("user.dir")).jsonEscaped()
        val locale = java.util.Locale.getDefault().toLanguageTag().jsonEscaped()
        proc.send("""{"type":"init","directory":"$directory","locale":"$locale","autocompleteEnabled":false}""")

        val content = ContentFactory.getInstance().createContent(view.component, "", false)
        toolWindow.contentManager.addContent(content)

        toolWindow.setTitleActions(
            listOf(
                NewSessionAction(project),
                HistoryAction(project),
                SettingsAction(project),
            )
        )
    }

    // ---- Title-bar action entry points (parity with VSCode's view/title toolbar) ----

    /** Start a fresh session in the chat surface. Mode mirrors the webview's own New Session button. */
    fun newSession() {
        sendChatMessage("""{"type":"createSession","mode":"${currentMode.jsonEscaped()}"}""")
    }

    /** Switch the chat surface to the history list (rendered inline via `showHistory`). */
    fun openHistory() {
        sendChatMessage("""{"type":"openHistory"}""")
    }

    /** Ask the provider to open settings; the sidecar replies with `openSettings`, which opens the tab. */
    fun openSettings() {
        sendChatMessage("""{"type":"openSettings"}""")
    }

    private fun sendChatMessage(messageJson: String) {
        sidecar?.send("""{"type":"webviewMessage","source":"chat","message":$messageJson}""")
    }

    /** webview -> host: forward every message through the sidecar tagged with its surface source. */
    private fun onWebviewMessage(source: String, json: String) {
        sidecar?.send("""{"type":"webviewMessage","source":"$source","message":$json}""")
    }

    /** sidecar -> host: handle lifecycle frames; relay `post` payloads into the matching surface. */
    private fun onSidecarMessage(json: String) {
        val obj = runCatching { JsonParser.parseString(json).asJsonObject }.getOrNull() ?: return
        when (obj.get("type")?.asString) {
            "post" -> {
                val message = obj.get("message") ?: return
                val source = obj.get("source")?.takeIf { !it.isJsonNull }?.asString ?: "chat"
                trackMode(message)
                ApplicationManager.getApplication().invokeLater {
                    when (source) {
                        "settings" -> settingsWebview?.postToWebview(message.toString())
                        else -> chatWebview?.postToWebview(message.toString())
                    }
                }
            }
            "serverPort" -> {
                serverPort = obj.get("port")?.takeIf { !it.isJsonNull }?.asInt
                log.info("Raccoon server port: $serverPort")
            }
            "log" -> log.info("[sidecar] ${obj.get("message")?.asString}")
            "ready" -> log.info("Raccoon sidecar ready")
            "openSettings" -> ApplicationManager.getApplication().invokeLater { openSettingsTab() }
            "closeSettings" -> ApplicationManager.getApplication().invokeLater { closeSettingsTab() }
        }
    }

    /** Remember the current chat mode from state frames so New Session opens with the right mode. */
    private fun trackMode(message: com.google.gson.JsonElement) {
        val obj = message as? com.google.gson.JsonObject ?: return
        if (obj.get("type")?.asString != "state") return
        obj.getAsJsonObject("state")?.get("mode")?.takeIf { !it.isJsonNull }?.asString?.let { currentMode = it }
    }

    /** Open (or reveal) the settings surface as a second tool-window tab. Must run on the EDT. */
    private fun openSettingsTab() {
        val toolWindow = toolWindow ?: return
        settingsContent?.let {
            toolWindow.contentManager.setSelectedContent(it)
            return
        }
        val view = RaccoonWebview(source = "settings", onWebviewMessage = { onWebviewMessage("settings", it) })
        Disposer.register(this, view)
        settingsWebview = view

        val content = ContentFactory.getInstance().createContent(view.component, "Settings", false).apply {
            isCloseable = true
        }
        settingsContent = content
        toolWindow.contentManager.addContent(content)
        toolWindow.contentManager.setSelectedContent(content)
        toolWindow.contentManager.addContentManagerListener(object : ContentManagerListener {
            override fun contentRemoved(event: ContentManagerEvent) {
                if (event.content !== content) return
                toolWindow.contentManager.removeContentManagerListener(this)
                // User closed the tab: mirror to the provider so its settings surface state resets.
                if (settingsContent === content) {
                    settingsContent = null
                    settingsWebview?.let { Disposer.dispose(it) }
                    settingsWebview = null
                    sidecar?.send("""{"type":"webviewMessage","source":"settings","message":{"type":"closeSettings"}}""")
                }
            }
        })
    }

    /** Close the settings tab in response to the sidecar's `closeSettings` (e.g. logout). EDT only. */
    private fun closeSettingsTab() {
        val content = settingsContent ?: return
        settingsContent = null
        settingsWebview = null
        toolWindow?.contentManager?.removeContent(content, true)
    }

    override fun dispose() {
        sidecar?.dispose()
        sidecar = null
        chatWebview = null
        settingsWebview = null
        settingsContent = null
        toolWindow = null
    }
}

/** Resolves the bundled sidecar.cjs, a `node` runtime, and the opencode binary at runtime. */
private object RaccoonPaths {
    private val log = logger<RaccoonService>()
    data class Resolved(val nodePath: String, val sidecarCjs: String, val raccoonBin: String?)

    fun resolve(): Resolved {
        // sidecar.cjs ships as a plugin resource on the classpath. node can't execute a script
        // inside a jar, so extract it (and its sourcemap) to a stable temp dir on first use.
        val sidecar = extractResource("/sidecar/sidecar.cjs", "sidecar.cjs")
        runCatching { extractResource("/sidecar/sidecar.cjs.map", "sidecar.cjs.map") }
        val raccoonBin = System.getenv("RACCOON_BIN")?.takeIf { File(it).exists() }
        val node = System.getenv("RACCOON_NODE")?.takeIf { File(it).exists() } ?: findNode()
        return Resolved(node, sidecar, raccoonBin)
    }

    private fun extractResource(resourcePath: String, fileName: String): String {
        val input = javaClass.getResourceAsStream(resourcePath)
            ?: error("missing plugin resource: $resourcePath")
        val dir = File(System.getProperty("java.io.tmpdir"), "raccoon-intellij-sidecar").apply { mkdirs() }
        val target = File(dir, fileName)
        input.use { stream -> target.outputStream().use { stream.copyTo(it) } }
        return target.absolutePath
    }

    private fun findNode(): String {
        // Resolve `node` against the login-shell PATH (IntelliJ launched from Finder has a minimal
        // PATH; this picks up nvm/homebrew installs the way the terminal would).
        com.intellij.execution.configurations.PathEnvironmentVariableUtil.findInPath("node")
            ?.let { return it.absolutePath }
        val candidates = listOf("/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node")
        candidates.firstOrNull { File(it).exists() }?.let { return it }
        log.info("node not found in PATH or common locations; falling back to bare 'node'")
        return "node"
    }
}

private fun String.jsonEscaped(): String =
    replace("\\", "\\\\").replace("\"", "\\\"")
