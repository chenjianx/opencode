package com.sensetime.sensecode.jetbrains.raccoon

import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.EditorColorsScheme
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.network.CefRequest
import javax.swing.JComponent

/**
 * Hosts the raccoon-webview React UI in a JCEF browser and wires the `acquireVsCodeApi` bridge.
 *
 * The webview's built assets are served from the plugin classpath under a virtual origin
 * (`http://raccoon.localhost/`) by [WebviewResourceHandler]. Once the page loads we inject the
 * shim that backs `acquireVsCodeApi().postMessage` with a [JBCefJSQuery], and expose
 * `window.__raccoonReceive(json)` so the host can push messages in by dispatching a
 * `message` event (matching `window.addEventListener("message")` in vscode.tsx).
 */
class RaccoonWebview(
    /** Which webview surface this instance backs ("chat" or "settings"); tags outgoing messages. */
    val source: String = "chat",
    private val onWebviewMessage: (String) -> Unit,
) : Disposable {
    private val log = logger<RaccoonWebview>()
    private val browser = JBCefBrowser.createBuilder()
        .setOffScreenRendering(false)
        .build()
    private val jsQuery = JBCefJSQuery.create(browser as JBCefBrowser)

    /** Last theme injection snapshot, built on the EDT so the JCEF load thread never reads Swing. */
    @Volatile
    private var themeScript: String = ""

    val component: JComponent get() = browser.component

    init {
        WebviewResourceHandler.register(browser)

        refreshThemeSnapshot()
        subscribeToThemeChanges()

        jsQuery.addHandler { request ->
            try {
                onWebviewMessage(request)
            } catch (e: Exception) {
                log.warn("failed to handle webview message", e)
            }
            null
        }

        browser.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadStart(cefBrowser: CefBrowser, frame: CefFrame, transitionType: CefRequest.TransitionType?) {
                // Deferred module scripts (the React app) run after parsing, so injecting here
                // guarantees acquireVsCodeApi + theme vars exist before the app mounts.
                if (frame.isMain) {
                    injectBridge()
                    injectThemeSnapshot()
                }
            }

            override fun onLoadEnd(cefBrowser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                // Safety net: document.body may not be parsed yet at onLoadStart, so the body class
                // (as opposed to the documentElement vars) can miss. Re-run once the DOM is ready.
                if (frame.isMain) injectThemeSnapshot()
            }
        }, browser.cefBrowser)

        browser.loadURL("${WebviewResourceHandler.ORIGIN}/index.html")
    }

    /** Pushes a host->webview message (raw JSON) into the page as a `message` event. */
    fun postToWebview(json: String) {
        val script = "window.__raccoonReceive(${jsonStringLiteral(json)});"
        browser.cefBrowser.executeJavaScript(script, browser.cefBrowser.url, 0)
    }

    /**
     * Rebuilds the theme injection snapshot from the current IDE colors. Must produce the script on
     * the EDT (reads Swing state); [injectThemeSnapshot] can then run it from any thread.
     */
    private fun refreshThemeSnapshot() {
        val app = ApplicationManager.getApplication()
        if (app.isDispatchThread) {
            themeScript = RaccoonTheme.buildInjectionScript()
        } else {
            app.invokeLater { themeScript = RaccoonTheme.buildInjectionScript() }
        }
    }

    /** Injects the cached theme snapshot (body class + `--vscode-*` vars) into the page. */
    private fun injectThemeSnapshot() {
        val script = themeScript
        if (script.isNotEmpty()) {
            browser.cefBrowser.executeJavaScript(script, browser.cefBrowser.url, 0)
        }
    }

    /** Re-extracts IDE colors and pushes them to the live page immediately. Call on the EDT. */
    private fun applyThemeNow() {
        val script = RaccoonTheme.buildInjectionScript()
        themeScript = script
        browser.cefBrowser.executeJavaScript(script, browser.cefBrowser.url, 0)
    }

    /**
     * Live-updates the webview on IDE theme switches. LAF is application-global; the editor color
     * scheme can change independently (Settings -> Editor -> Color Scheme) yet feeds
     * `--vscode-editor-background`, so we listen for both. The connection is tied to `this`
     * [Disposable] and released automatically on [dispose].
     */
    private fun subscribeToThemeChanges() {
        val connection = ApplicationManager.getApplication().messageBus.connect(this)
        connection.subscribe(LafManagerListener.TOPIC, LafManagerListener { applyThemeNow() })
        connection.subscribe(
            EditorColorsManager.TOPIC,
            EditorColorsListener { _: EditorColorsScheme? -> applyThemeNow() },
        )
    }

    private fun injectBridge() {
        // postMessage(msg) -> JBCefJSQuery -> host; window.__raccoonReceive(json) -> message event.
        val inject = jsQuery.inject("payload")
        val script = """
            (function () {
              if (window.__raccoonBridgeReady) return;
              window.__raccoonBridgeReady = true;
              const state = {};
              window.acquireVsCodeApi = function () {
                return {
                  postMessage: function (message) {
                    const payload = JSON.stringify(message);
                    $inject
                  },
                  getState: function () { return window.__raccoonState; },
                  setState: function (s) { window.__raccoonState = s; },
                };
              };
              window.__raccoonReceive = function (json) {
                const data = JSON.parse(json);
                window.dispatchEvent(new MessageEvent('message', { data: data }));
              };
            })();
        """.trimIndent()
        browser.cefBrowser.executeJavaScript(script, browser.cefBrowser.url, 0)
    }

    override fun dispose() {
        jsQuery.dispose()
        browser.dispose()
    }
}

internal fun jsonStringLiteral(value: String): String {
    val sb = StringBuilder("\"")
    for (c in value) {
        when (c) {
            '\\' -> sb.append("\\\\")
            '"' -> sb.append("\\\"")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> if (c < ' ') sb.append("\\u%04x".format(c.code)) else sb.append(c)
        }
    }
    return sb.append("\"").toString()
}
