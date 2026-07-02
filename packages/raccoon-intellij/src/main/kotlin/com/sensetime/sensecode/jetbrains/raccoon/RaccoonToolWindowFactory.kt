package com.sensetime.sensecode.jetbrains.raccoon

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory

/** Registers the Raccoon tool window and mounts the JCEF webview backed by the sidecar. */
class RaccoonToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val service = project.getService(RaccoonService::class.java)
        service.initToolWindow(toolWindow)
    }
}
