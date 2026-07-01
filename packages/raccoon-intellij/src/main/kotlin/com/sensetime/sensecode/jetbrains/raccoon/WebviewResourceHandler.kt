package com.sensetime.sensecode.jetbrains.raccoon

import com.intellij.ui.jcef.JBCefBrowser
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.callback.CefCallback
import org.cef.callback.CefSchemeHandlerFactory
import org.cef.handler.CefResourceHandler
import org.cef.misc.IntRef
import org.cef.misc.StringRef
import org.cef.network.CefRequest
import org.cef.network.CefResponse
import java.io.InputStream

/**
 * Serves the bundled raccoon-webview assets (under classpath `/webview`) to JCEF over a virtual
 * origin so the React app's absolute `/assets/...` URLs resolve. Registered once per browser's
 * scheme registry via [register].
 *
 * Using a custom `http` host (raccoon.localhost) keeps the page on an http origin, which the
 * webview's own connect-src CSP and the opencode SDK's fetch/EventSource expect.
 */
object WebviewResourceHandler {
    const val SCHEME = "http"
    const val HOST = "raccoon.localhost"
    const val ORIGIN = "$SCHEME://$HOST"

    fun register(browser: JBCefBrowser) {
        browser.jbCefClient.cefClient.let { /* ensure client realized */ }
        org.cef.CefApp.getInstance().registerSchemeHandlerFactory(SCHEME, HOST, Factory())
    }

    private class Factory : CefSchemeHandlerFactory {
        override fun create(browser: CefBrowser?, frame: CefFrame?, schemeName: String?, request: CefRequest?): CefResourceHandler {
            return ResourceHandler()
        }
    }

    private class ResourceHandler : CefResourceHandler {
        private var stream: InputStream? = null
        private var mimeType: String = "application/octet-stream"
        private var status = 200

        override fun processRequest(request: CefRequest, callback: CefCallback): Boolean {
            val url = request.url ?: run {
                callback.cancel(); return false
            }
            // Strip origin + query/hash, default "/" to index.html.
            var path = url.removePrefix(ORIGIN)
            path = path.substringBefore('?').substringBefore('#')
            if (path.isEmpty() || path == "/") path = "/index.html"
            val resourcePath = "/webview$path"

            val resource = javaClass.getResourceAsStream(resourcePath)
            if (resource == null) {
                status = 404
                stream = "Not found: $path".byteInputStream()
                mimeType = "text/plain"
            } else {
                stream = resource
                mimeType = mimeFor(path)
            }
            callback.Continue()
            return true
        }

        override fun getResponseHeaders(response: CefResponse, responseLength: IntRef, redirectUrl: StringRef) {
            response.mimeType = mimeType
            response.status = status
            // The page connects directly to the local opencode server; allow it explicitly.
            response.setHeaderByName("Access-Control-Allow-Origin", "*", true)
            responseLength.set(-1)
        }

        override fun readResponse(dataOut: ByteArray, bytesToRead: Int, bytesRead: IntRef, callback: CefCallback): Boolean {
            val input = stream ?: return false
            val read = input.read(dataOut, 0, bytesToRead)
            if (read <= 0) {
                input.close()
                stream = null
                bytesRead.set(0)
                return false
            }
            bytesRead.set(read)
            return true
        }

        override fun cancel() {
            stream?.close()
            stream = null
        }

        private fun mimeFor(path: String): String = when {
            path.endsWith(".html") -> "text/html"
            path.endsWith(".js") -> "text/javascript"
            path.endsWith(".css") -> "text/css"
            path.endsWith(".json") -> "application/json"
            path.endsWith(".map") -> "application/json"
            path.endsWith(".svg") -> "image/svg+xml"
            path.endsWith(".png") -> "image/png"
            path.endsWith(".woff") -> "font/woff"
            path.endsWith(".woff2") -> "font/woff2"
            path.endsWith(".ttf") -> "font/ttf"
            path.endsWith(".wasm") -> "application/wasm"
            else -> "application/octet-stream"
        }
    }
}
