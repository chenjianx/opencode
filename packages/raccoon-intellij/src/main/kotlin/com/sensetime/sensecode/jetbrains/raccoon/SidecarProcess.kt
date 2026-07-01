package com.sensetime.sensecode.jetbrains.raccoon

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessOutputType
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.util.Key
import java.nio.charset.StandardCharsets

/**
 * Spawns and manages the Node sidecar (`sidecar.cjs`) that runs the RaccoonProvider orchestrator.
 *
 * The bridge is newline-delimited JSON over stdio:
 *  - stdout lines are framed RPC ([SidecarToHost]) and dispatched to [onMessage];
 *  - stderr is human log output, forwarded to the IDE log;
 *  - [send] writes a JSON line to stdin ([HostToSidecar]).
 */
class SidecarProcess(
    private val nodePath: String,
    private val sidecarCjs: String,
    private val workingDir: String,
    private val raccoonBin: String?,
    private val onMessage: (String) -> Unit,
) {
    private val log = logger<SidecarProcess>()
    private var handler: OSProcessHandler? = null
    private val stdoutBuffer = StringBuilder()

    fun start() {
        val cmd = GeneralCommandLine(nodePath, sidecarCjs)
            .withWorkDirectory(workingDir)
            .withCharset(StandardCharsets.UTF_8)
        cmd.environment["OPENCODE_CALLER"] = "intellij"
        if (!raccoonBin.isNullOrBlank()) cmd.environment["RACCOON_BIN"] = raccoonBin

        val process = OSProcessHandler(cmd)
        process.addProcessListener(object : ProcessAdapter() {
            override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                when (outputType) {
                    ProcessOutputType.STDOUT -> consumeStdout(event.text)
                    ProcessOutputType.STDERR -> log.info("[sidecar] ${event.text.trimEnd()}")
                }
            }

            override fun processTerminated(event: ProcessEvent) {
                log.info("Raccoon sidecar terminated (exit ${event.exitCode})")
            }
        })
        process.startNotify()
        handler = process
    }

    /** Writes one JSON-RPC frame to the sidecar's stdin. */
    fun send(json: String) {
        val stream = handler?.process?.outputStream ?: return
        try {
            stream.write((json + "\n").toByteArray(StandardCharsets.UTF_8))
            stream.flush()
        } catch (e: Exception) {
            log.warn("failed to write to sidecar stdin", e)
        }
    }

    fun dispose() {
        val process = handler ?: return
        send("""{"type":"dispose"}""")
        process.destroyProcess()
        handler = null
    }

    private fun consumeStdout(text: String) {
        stdoutBuffer.append(text)
        var newline = stdoutBuffer.indexOf("\n")
        while (newline != -1) {
            val line = stdoutBuffer.substring(0, newline).trim()
            stdoutBuffer.delete(0, newline + 1)
            newline = stdoutBuffer.indexOf("\n")
            if (line.isNotEmpty()) {
                try {
                    onMessage(line)
                } catch (e: Exception) {
                    log.warn("failed to handle sidecar message", e)
                }
            }
        }
    }
}
