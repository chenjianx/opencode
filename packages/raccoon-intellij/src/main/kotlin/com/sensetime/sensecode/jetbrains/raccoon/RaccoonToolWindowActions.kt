package com.sensetime.sensecode.jetbrains.raccoon

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project

/**
 * Tool-window title-bar actions, mirroring the VSCode extension's `view/title` toolbar
 * (New Session, History, Settings). Each resolves the project's [RaccoonService] and delegates.
 */

class NewSessionAction(private val project: Project) :
    AnAction("New Session", "Start a new Raccoon session", AllIcons.General.Add), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        project.getService(RaccoonService::class.java).newSession()
    }
}

class HistoryAction(private val project: Project) :
    AnAction("History", "Browse Raccoon session history", AllIcons.Vcs.History), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        project.getService(RaccoonService::class.java).openHistory()
    }
}

class SettingsAction(private val project: Project) :
    AnAction("Settings", "Open Raccoon settings", AllIcons.General.Settings), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        project.getService(RaccoonService::class.java).openSettings()
    }
}
