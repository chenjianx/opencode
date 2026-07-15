import * as vscode from "vscode"
import type { RaccoonConnectionService } from "../cli-backend/index.js"
import { CompletionProvider } from "./CompletionProvider.js"
import { ErrorBackoff } from "./ErrorBackoff.js"
import { hasValidCredentials, RaccoonFimLlm } from "./llm/RaccoonFimLlm.js"
import { DEFAULT_AUTOCOMPLETE_MODEL } from "@opencode-ai/raccoon-core"
import {
  DEFAULT_AUTOCOMPLETE_OPTIONS,
  type AutocompleteInput,
  type AutocompleteOutcome,
} from "./util/types.js"

export interface AutocompleteSettings {
  enableAutoTrigger?: boolean
  model?: string
}

const INLINE_COMPLETION_ACCEPTED_COMMAND = "raccoon.autocomplete.inline-completion.accepted"

let completionIdCounter = 0

/**
 * VSCode adapter (InlineCompletionItemProvider) over the core CompletionProvider.
 * Ported from continue-rac (extensions/vscode/src/autocomplete/completionProvider.ts),
 * keeping raccoon's connection gating, ErrorBackoff circuit breaker, and the
 * accepted-completion context key.
 */
export class AutocompleteInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private completionProvider: CompletionProvider
  private modelId: string
  private acceptedCommand: vscode.Disposable | null = null
  private lastOutcome: AutocompleteOutcome | undefined

  public readonly backoff = new ErrorBackoff()
  private fatalNotified = false

  constructor(
    modelId: string,
    private readonly connectionService: RaccoonConnectionService,
    private readonly getSettings: () => AutocompleteSettings | null,
    private readonly workspacePath: string,
    private readonly onFatalError?: (status: number | null) => void,
    private readonly log: (msg: string) => void = () => {},
    private readonly onActivity?: (active: boolean) => void,
  ) {
    this.modelId = modelId || DEFAULT_AUTOCOMPLETE_MODEL.id

    this.completionProvider = new CompletionProvider(
      () => this.buildLlm(),
      (e) => this.log(`[error] ${e instanceof Error ? e.message : String(e)}`),
      DEFAULT_AUTOCOMPLETE_OPTIONS,
      this.log,
    )

    this.acceptedCommand = vscode.commands.registerCommand(INLINE_COMPLETION_ACCEPTED_COMMAND, () => {
      if (this.lastOutcome) {
        this.completionProvider.accept(this.lastOutcome.completion, this.lastOutcome.filepath)
      }
      vscode.commands.executeCommand("setContext", "raccoon.autocomplete.hasSuggestions", false)
    })
  }

  public setModel(modelId: string): void {
    this.modelId = modelId
  }

  public resetBackoff(): void {
    this.backoff.reset()
    this.fatalNotified = false
  }

  public dispose(): void {
    this.acceptedCommand?.dispose()
    this.acceptedCommand = null
  }

  private buildLlm(): RaccoonFimLlm {
    return new RaccoonFimLlm(this.connectionService, this.workspacePath, this.modelId, {
      onSuccess: () => {
        this.backoff.success()
        this.fatalNotified = false
      },
      onFailure: (error) => {
        const kind = this.backoff.failure(error)
        this.log(`[fetch] failure (${kind})`)
        if (kind === "fatal" && !this.fatalNotified) {
          this.fatalNotified = true
          this.onFatalError?.(this.backoff.getFatalStatus())
        }
      },
      log: this.log,
    })
  }

  private setHasSuggestions(value: boolean): void {
    vscode.commands.executeCommand("setContext", "raccoon.autocomplete.hasSuggestions", value)
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
    const settings = this.getSettings()
    if (!(settings?.enableAutoTrigger ?? false)) {
      return undefined
    }
    return this.provideInlineCompletionItems_Internal(document, position, context, token)
  }

  public async provideInlineCompletionItems_Internal(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
    if (token.isCancellationRequested) {
      return undefined
    }
    if (!hasValidCredentials(this.connectionService)) {
      this.log(`[skip] not connected (state=${this.connectionService.getConnectionState()})`)
      return undefined
    }
    if (this.backoff.blocked()) {
      this.log(`[skip] backoff blocked (fatalStatus=${this.backoff.getFatalStatus()})`)
      return undefined
    }
    if (document.uri.scheme === "vscode-scm") {
      return undefined
    }
    // Don't autocomplete with multi-cursor.
    const editor = vscode.window.activeTextEditor
    if (editor && editor.selections.length > 1) {
      return undefined
    }

    const selectedCompletionInfo = context.selectedCompletionInfo
    if (selectedCompletionInfo) {
      const { text, range } = selectedCompletionInfo
      const typedText = document.getText(range)
      const typedLength = range.end.character - range.start.character
      if (typedLength < 4) return undefined
      if (!text.startsWith(typedText)) return undefined
    }

    const abortController = new AbortController()
    const signal = abortController.signal
    token.onCancellationRequested(() => abortController.abort())

    const input: AutocompleteInput = {
      completionId: `${++completionIdCounter}`,
      filepath: document.uri.fsPath,
      languageId: document.languageId,
      pos: { line: position.line, character: position.character },
      fileContents: document.getText(),
      selectedCompletionInfo,
      isUntitledFile: document.isUntitled,
    }

    this.onActivity?.(true)
    let outcome: AutocompleteOutcome | undefined
    try {
      outcome = await this.completionProvider.provideInlineCompletionItems(input, signal)
    } finally {
      this.onActivity?.(false)
    }

    if (signal.aborted || !outcome || !outcome.completion) {
      this.setHasSuggestions(false)
      return undefined
    }
    this.lastOutcome = outcome

    const startPos = selectedCompletionInfo?.range.start ?? position
    // Replace from the completion start to the end of the current line (matching
    // continue-rac). The FIM model already accounts for the suffix, so replacing
    // the rest of the line absorbs editor-inserted leftovers — e.g. the `)` that
    // auto-close-brackets adds after `for(` — instead of leaving them dangling
    // after the completion.
    const range = new vscode.Range(startPos, document.lineAt(startPos.line).range.end)
    const item = new vscode.InlineCompletionItem(outcome.completion, range, {
      command: INLINE_COMPLETION_ACCEPTED_COMMAND,
      title: "Autocomplete Accepted",
    })
    // Matches continue-rac: let VSCode auto-close brackets the completion leaves
    // open. Safe now that `range` replaces to end of line (editor-inserted
    // closers are overwritten rather than left dangling after the completion).
    ;(item as unknown as { completeBracketPairs: boolean }).completeBracketPairs = true

    this.setHasSuggestions(true)
    this.log(`[fetch] done, len=${outcome.completion.length} (cacheHit=${outcome.cacheHit}) -> SHOW`)
    return [item]
  }
}
