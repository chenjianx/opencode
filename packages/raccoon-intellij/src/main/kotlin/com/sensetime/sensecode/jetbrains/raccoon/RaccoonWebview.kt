package com.sensetime.sensecode.jetbrains.raccoon

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.logger
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
    private val onWebviewMessage: (String) -> Unit,
) : Disposable {
    private val log = logger<RaccoonWebview>()
    private val browser = JBCefBrowser.createBuilder()
        .setOffScreenRendering(false)
        .build()
    private val jsQuery = JBCefJSQuery.create(browser as JBCefBrowser)

    val component: JComponent get() = browser.component

    init {
        WebviewResourceHandler.register(browser)

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
                // guarantees acquireVsCodeApi exists before the app calls it during mount.
                if (frame.isMain) injectBridge()
            }
        }, browser.cefBrowser)

        browser.loadURL("${WebviewResourceHandler.ORIGIN}/index.html")
    }

    /** Pushes a host->webview message (raw JSON) into the page as a `message` event. */
    fun postToWebview(json: String) {
        val script = "window.__raccoonReceive(${jsonStringLiteral(json)});"
        browser.cefBrowser.executeJavaScript(script, browser.cefBrowser.url, 0)
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

private fun jsonStringLiteral(value: String): String {
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
