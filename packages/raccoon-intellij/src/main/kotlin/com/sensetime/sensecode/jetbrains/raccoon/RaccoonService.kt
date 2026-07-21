package com.sensetime.sensecode.jetbrains.raccoon

import com.google.gson.JsonParser
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.content.ContentFactory
import java.io.File

/**
 * Project-scoped owner of the Raccoon sidecar + webview surface. Spawns the Node sidecar, builds
 * the JCEF webview, and routes messages between them following the stdio RPC protocol in rpc.ts.
 *
 * There is a single "chat" webview surface. Unlike the VSCode host (which opens settings in a
 * separate editor panel), settings and history both render inline in this one webview, driven by
 * `showSettings`/`showHistory`/`showChat` messages from the sidecar's provider.
 *
 * Created lazily by [RaccoonToolWindowFactory]; disposed with the project.
 */
@Service(Service.Level.PROJECT)
class RaccoonService(private val project: Project) : Disposable {
    private val log = logger<RaccoonService>()
    private var chatWebview: RaccoonWebview? = null
    private var sidecar: SidecarProcess? = null
    private var serverPort: Int? = null

    private var toolWindow: ToolWindow? = null

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
            raccoonBin = plugin.raccoonBin,           onMessage = ::onSidecarMessage,
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

    /** Switch the chat surface to settings (rendered inline via `showSettings`, like history). */
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

    /** sidecar -> host: handle lifecycle frames; relay `post` payloads into the chat surface. */
    private fun onSidecarMessage(json: String) {
        val obj = runCatching { JsonParser.parseString(json).asJsonObject }.getOrNull() ?: return
        when (obj.get("type")?.asString) {
            "post" -> {
                val message = obj.get("message") ?: return
                trackMode(message)
                ApplicationManager.getApplication().invokeLater {
                    chatWebview?.postToWebview(message.toString())
                }
            }
            "serverPort" -> {
                serverPort = obj.get("port")?.takeIf { !it.isJsonNull }?.asInt
                log.info("Raccoon server port: $serverPort")
            }
            "log" -> log.info("[sidecar] ${obj.get("message")?.asString}")
            "ready" -> log.info("Raccoon sidecar ready")
        }
    }

    /** Remember the current chat mode from state frames so New Session opens with the right mode. */
    private fun trackMode(message: com.google.gson.JsonElement) {
        val obj = message as? com.google.gson.JsonObject ?: return
        if (obj.get("type")?.asString != "state") return
        obj.getAsJsonObject("state")?.get("mode")?.takeIf { !it.isJsonNull }?.asString?.let { currentMode = it }
    }

    override fun dispose() {
        sidecar?.dispose()
        sidecar = null
        chatWebview = null
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
        val target = currentTarget()
        val raccoonBin = runCatching {
            extractResource("/bin/$target/raccoon${if (target == "win32-x64") ".exe" else ""}", "raccoon")
        }
            .getOrNull()
            ?.takeIf { isRunnableForCurrentPlatform(File(it)) }
        val node = System.getenv("RACCOON_NODE")?.takeIf { File(it).exists() } ?: findNode()
        return Resolved(node, sidecar, raccoonBin)
    }

    private fun isRunnableForCurrentPlatform(file: File): Boolean {
        if (!file.isFile || !file.canExecute()) return false
        val header = runCatching { file.inputStream().use { it.readNBytes(4) } }.getOrNull() ?: return false
        val os = System.getProperty("os.name").lowercase()
        return when {
            os.contains("win") -> header.size >= 2 && header[0] == 'M'.code.toByte() && header[1] == 'Z'.code.toByte()
            os.contains("mac") -> header.contentEquals(byteArrayOf(0xFE.toByte(), 0xED.toByte(), 0xFA.toByte(), 0xCE.toByte())) ||
                header.contentEquals(byteArrayOf(0xFE.toByte(), 0xED.toByte(), 0xFA.toByte(), 0xCF.toByte())) ||
                header.contentEquals(byteArrayOf(0xCE.toByte(), 0xFA.toByte(), 0xED.toByte(), 0xFE.toByte())) ||
                header.contentEquals(byteArrayOf(0xCF.toByte(), 0xFA.toByte(), 0xED.toByte(), 0xFE.toByte()))
            else -> header.contentEquals(byteArrayOf(0x7F, 'E'.code.toByte(), 'L'.code.toByte(), 'F'.code.toByte()))
        }
    }

    private fun currentTarget(): String {
        val os = System.getProperty("os.name").lowercase()
        val platform = when {
            os.contains("win") -> "win32"
            os.contains("mac") -> "darwin"
            else -> "linux"
        }
        val arch = when (System.getProperty("os.arch").lowercase()) {
            "aarch64", "arm64" -> "arm64"
            else -> "x64"
        }
        return "$platform-$arch"
    }

    private fun extractResource(resourcePath: String, fileName: String): String {
        val input = javaClass.getResourceAsStream(resourcePath)
            ?: error("missing plugin resource: $resourcePath")
        val dir = File(System.getProperty("java.io.tmpdir"), "raccoon-intellij-sidecar").apply { mkdirs() }
        val target = File(dir, fileName)
        input.use { stream -> target.outputStream().use { stream.copyTo(it) } }
        if (resourcePath.startsWith("/bin/")) target.setExecutable(true)
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
