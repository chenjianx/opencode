package com.sensetime.sensecode.jetbrains.raccoon

import com.intellij.ide.ui.LafManager
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.ui.JBColor
import com.intellij.util.ui.UIUtil
import java.awt.Color

/**
 * Emulates the DOM/CSS environment VSCode injects into its webview iframe, so the shared
 * raccoon-webview UI matches the IDE theme instead of falling back to the OS color scheme.
 *
 * raccoon-webview's [styles/base.css] drives every color from `var(--vscode-*, light-dark(..))`
 * and pins light/dark via a `body.vscode-{dark,light,high-contrast(-light)}` class. VSCode supplies
 * both at runtime; the JCEF host doesn't, so here we translate the active IntelliJ LAF / editor
 * colors into that same environment and inject it via `executeJavaScript`.
 *
 * All reads touch Swing/JBColor state, so [buildInjectionScript] MUST be called on the EDT.
 */
internal object RaccoonTheme {
    private enum class ThemeKind {
        DARK, LIGHT, HIGH_CONTRAST, HIGH_CONTRAST_LIGHT;

        fun bodyClass(): String = when (this) {
            DARK -> "vscode-dark"
            LIGHT -> "vscode-light"
            HIGH_CONTRAST -> "vscode-high-contrast"
            HIGH_CONTRAST_LIGHT -> "vscode-high-contrast-light"
        }
    }

    /**
     * Builds a self-contained JS snippet that sets the `body.vscode-*` class and the `--vscode-*`
     * custom properties on `document.documentElement`. Idempotent and safe to re-run on every load
     * or theme change. MUST run on the EDT (reads Swing/JBColor/editor-scheme state).
     */
    fun buildInjectionScript(): String {
        val bodyClass = currentThemeKind().bodyClass()
        val setVars = collectVars().entries.joinToString("\n") { (name, value) ->
            "    r.style.setProperty(${jsonStringLiteral(name)}, ${jsonStringLiteral(value)});"
        }
        return """
            (function () {
              var r = document.documentElement, b = document.body;
              if (b) {
                b.classList.remove('vscode-dark', 'vscode-light', 'vscode-high-contrast', 'vscode-high-contrast-light');
                b.classList.add(${jsonStringLiteral(bodyClass)});
              }
            $setVars
            })();
        """.trimIndent()
    }

    private fun currentThemeKind(): ThemeKind {
        val dark = UIUtil.isUnderDarcula()
        val name = runCatching { LafManager.getInstance().currentUIThemeLookAndFeel?.name }
            .getOrNull().orEmpty().lowercase()
        val highContrast = "high contrast" in name || "high-contrast" in name
        return when {
            highContrast && dark -> ThemeKind.HIGH_CONTRAST
            highContrast -> ThemeKind.HIGH_CONTRAST_LIGHT
            dark -> ThemeKind.DARK
            else -> ThemeKind.LIGHT
        }
    }

    private fun collectVars(): Map<String, String> {
        val scheme = EditorColorsManager.getInstance().globalScheme
        val editorBg = scheme.defaultBackground
        val panelBg = JBColor.namedColor("Panel.background", JBColor.background())
        val panelFg = JBColor.namedColor("Panel.foreground", JBColor.foreground())
        val hover = JBColor.namedColor(
            "List.hoverBackground",
            JBColor.namedColor("Table.hoverBackground", panelBg),
        )
        val font = UIUtil.getLabelFont()

        return linkedMapOf(
            "--vscode-font-family" to font.family,
            "--vscode-font-size" to "${font.size}px",
            "--vscode-editor-background" to editorBg.hex(),
            "--vscode-editor-foreground" to scheme.defaultForeground.hex(),
            "--vscode-foreground" to panelFg.hex(),
            "--vscode-descriptionForeground" to
                JBColor.namedColor("Label.infoForeground", JBColor.gray).hex(),
            "--vscode-panel-border" to
                JBColor.namedColor("Component.borderColor", JBColor.border()).hex(),
            "--vscode-list-hoverBackground" to hover.hex(),
            "--vscode-toolbar-hoverBackground" to
                JBColor.namedColor("ActionButton.hoverBackground", hover).hex(),
            "--vscode-input-background" to
                JBColor.namedColor("TextField.background", editorBg).hex(),
            "--vscode-input-foreground" to
                JBColor.namedColor("TextField.foreground", panelFg).hex(),
            "--vscode-button-background" to
                JBColor.namedColor("Button.background", panelBg).hex(),
            "--vscode-button-foreground" to
                JBColor.namedColor("Button.foreground", panelFg).hex(),
            "--vscode-button-hoverBackground" to
                JBColor.namedColor("Button.hoverBackground", hover).hex(),
            "--vscode-button-secondaryBackground" to
                JBColor.namedColor("Button.background", panelBg).hex(),
            "--vscode-list-activeSelectionBackground" to
                JBColor.namedColor("List.selectionBackground", JBColor(0x2675BF, 0x2F65CA)).hex(),
            "--vscode-list-activeSelectionForeground" to
                JBColor.namedColor("List.selectionForeground", panelFg).hex(),
            "--vscode-focusBorder" to
                JBColor.namedColor("Component.focusColor", JBColor(0x87AFDA, 0x466D94)).hex(),
            "--vscode-errorForeground" to
                JBColor.namedColor("Label.errorForeground", JBColor(0xC7222D, 0xFF5261)).hex(),
            "--vscode-textCodeBlock-background" to editorBg.hex(),
            "--vscode-editor-font-family" to font.family,
            "--vscode-diffEditor-removedTextBackground" to
                JBColor.namedColor("Diff.deleted.background", Color(248, 81, 73, 0x33)).hex(),
            "--vscode-diffEditor-insertedTextBackground" to
                JBColor.namedColor("Diff.inserted.background", Color(46, 160, 67, 0x33)).hex(),
        )
    }

    /** Opaque colors -> `#rrggbb`; translucent -> `#rrggbbaa` (CSS 8-digit hex). */
    private fun Color.hex(): String =
        if (alpha == 255) "#%02x%02x%02x".format(red, green, blue)
        else "#%02x%02x%02x%02x".format(red, green, blue, alpha)
}
