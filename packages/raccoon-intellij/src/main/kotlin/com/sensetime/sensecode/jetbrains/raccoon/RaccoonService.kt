package com.sensetime.sensecode.jetbrains.raccoon

import com.google.gson.JsonParser
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import java.io.File
import javax.swing.JComponent

/**
 * Project-scoped owner of the Raccoon sidecar + webview pair. Spawns the Node sidecar, builds the
 * JCEF webview, and routes messages between them following the stdio RPC protocol in rpc.ts.
 *
 * Created lazily by [RaccoonToolWindowFactory]; disposed with the project.
 */
@Service(Service.Level.PROJECT)
class RaccoonService(private val project: Project) : Disposable {
    private val log = logger<RaccoonService>()
    private var webview: RaccoonWebview? = null
    private var sidecar: SidecarProcess? = null
    private var serverPort: Int? = null

    fun createComponent(): JComponent {
        val view = RaccoonWebview(onWebviewMessage = ::onWebviewMessage)
        Disposer.register(this, view)
        webview = view

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

        return view.component
    }

    /** webview -> host: forward every message through the sidecar (the provider owns readiness). */
    private fun onWebviewMessage(json: String) {
        sidecar?.send("""{"type":"webviewMessage","source":"chat","message":$json}""")
    }

    /** sidecar -> host: handle lifecycle frames; relay `post` payloads into the webview. */
    private fun onSidecarMessage(json: String) {
        val obj = runCatching { JsonParser.parseString(json).asJsonObject }.getOrNull() ?: return
        when (obj.get("type")?.asString) {
            "post" -> {
                val message = obj.get("message") ?: return
                ApplicationManager.getApplication().invokeLater {
                    webview?.postToWebview(message.toString())
                }
            }
            "serverPort" -> {
                serverPort = obj.get("port")?.takeIf { !it.isJsonNull }?.asInt
                log.info("Raccoon server port: $serverPort")
            }
            "log" -> log.info("[sidecar] ${obj.get("message")?.asString}")
            "ready" -> log.info("Raccoon sidecar ready")
            "openSettings", "closeSettings" -> {
                // Settings panel is a separate webview surface, deferred to phase 2.
            }
        }
    }

    override fun dispose() {
        sidecar?.dispose()
        sidecar = null
        webview = null
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
