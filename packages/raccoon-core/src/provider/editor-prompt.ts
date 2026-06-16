import type { RaccoonPluginLanguage } from "@opencode-ai/raccoon-webview"
import type { EditorContext, EditorContextAction, EditorDiagnostic } from "./platform.js"

// Pure prompt construction for editor-context actions. Platform-agnostic: it consumes the
// neutral EditorContext and produces the chat prompt string. The VSCode-specific capture of
// selection/diagnostics lives in editor-context.ts.

export function createPrompt(type: EditorContextAction, context: EditorContext, language?: RaccoonPluginLanguage) {
  const location = `${context.filePath}:${context.startLine}-${context.endLine}`
  const base = `${location}\n\`\`\`\n${context.selectedText}\n\`\`\``
  const selectedCode = `\`\`\`\n${context.selectedText}\n\`\`\``
  const replyLanguage = language ? `\nReply in ${languageName(language)}.` : ""
  if (type === "EXPLAIN") {
    return `Explain this selected code from ${location}.
${replyLanguage}

${selectedCode}

Focus on:
1. What the code does in this project context
2. The important control flow, data flow, and side effects
3. Non-obvious APIs, assumptions, or edge cases

Keep the explanation concise and practical. Do not rewrite the code unless a tiny snippet is needed to clarify a point.`
  }
  if (type === "ASK") {
    return `Explain this function or method from ${location}.
${replyLanguage}

${selectedCode}

Focus on what it does, how it fits the surrounding project, and any important side effects or edge cases. Keep the answer concise and practical.`
  }
  if (type === "FIX") {
    return `Fix this selected code from ${location}.
${replyLanguage}
${diagnosticText(context.diagnostics)}

${selectedCode}

Please:
1. Identify the likely bug or failure mode
2. Make the smallest correct change that fixes it
3. Preserve existing style and public behavior unless the bug requires a behavior change
4. Explain what changed and why

If the selected code is insufficient to fix safely, say exactly what surrounding code or runtime detail is needed.`
  }
  if (type === "IMPROVE") {
    return `Improve this selected code from ${location}.
${replyLanguage}

${selectedCode}

Please improve it where there is a clear benefit:
1. Readability and naming
2. Simpler control flow
3. Robustness around edge cases
4. Fit with the surrounding code style

Avoid speculative rewrites, broad refactors, or changing behavior without calling it out. Provide the improved code and a short rationale.`
  }
  if (type === "OPTIMIZE") {
    return `Optimize this function or method from ${location}.
${replyLanguage}

${selectedCode}

Please improve readability, control flow, and robustness where there is a clear benefit. Preserve behavior unless you explicitly call out a necessary behavior change. Provide the improved code and a short rationale.`
  }
  if (type === "REFACTOR") {
    return `Refactor this function or method from ${location}.
${replyLanguage}

${selectedCode}

Please keep behavior unchanged, fit the surrounding code style, and avoid broad speculative rewrites. Provide the refactored code and explain the main changes briefly.`
  }
  if (type === "COMMENT") {
    return `Add useful comments to this function or method from ${location}.
${replyLanguage}

${selectedCode}

Please add only comments that clarify intent, constraints, side effects, or non-obvious control flow. Avoid restating obvious code. Provide the updated code and a short rationale.`
  }
  return base
}

function diagnosticText(diagnostics: EditorDiagnostic[]) {
  if (diagnostics.length === 0) return ""
  return `\nCurrent diagnostics in the selection:\n${diagnostics.map((diagnostic) => `- ${diagnostic.source ?? "Diagnostic"}: ${diagnostic.message}`).join("\n")}`
}

function languageName(language: RaccoonPluginLanguage) {
  if (language === "zh-Hans") return "Simplified Chinese"
  if (language === "zh-Hant") return "Traditional Chinese"
  return "English"
}
