import { shouldCompleteMultiline } from "./classification/shouldCompleteMultiline.js"
import { BracketMatchingService } from "./filtering/BracketMatchingService.js"
import { CompletionStreamer } from "./generation/CompletionStreamer.js"
import type { ILLM } from "./llm/types.js"
import { postprocessCompletion } from "./postprocessing/index.js"
import { shouldPrefilter } from "./prefiltering/index.js"
import { AutocompleteDebouncer } from "./util/AutocompleteDebouncer.js"
import { AutocompleteLruCache } from "./util/AutocompleteLruCache.js"
import { HelperVars } from "./util/HelperVars.js"
import {
  DEFAULT_AUTOCOMPLETE_OPTIONS,
  type AutocompleteInput,
  type AutocompleteOptions,
  type AutocompleteOutcome,
} from "./util/types.js"

/**
 * Core autocomplete orchestrator, ported from continue-rac
 * (core/autocomplete/completionProvider.ts). IDE/AST/snippet retrieval and
 * client-side templating are omitted: the raccoon backend does FIM templating,
 * so this pipeline runs on the pruned prefix/suffix only.
 */
export class CompletionProvider {
  private debouncer = new AutocompleteDebouncer()
  private cache = new AutocompleteLruCache()
  private bracketMatching = new BracketMatchingService()
  private completionStreamer: CompletionStreamer

  constructor(
    private readonly getLlm: () => ILLM | undefined,
    private readonly onError: (e: unknown) => void,
    private readonly options: AutocompleteOptions = DEFAULT_AUTOCOMPLETE_OPTIONS,
    private readonly log: (msg: string) => void = () => {},
  ) {
    this.completionStreamer = new CompletionStreamer(this.bracketMatching, this.onError)
  }

  /** Record an accepted completion so bracket matching can track open brackets. */
  accept(completion: string, filepath: string): void {
    this.bracketMatching.handleAcceptedCompletion(completion, filepath)
  }

  async provideInlineCompletionItems(
    input: AutocompleteInput,
    token: AbortSignal,
  ): Promise<AutocompleteOutcome | undefined> {
    try {
      const startTime = Date.now()

      // Debounce
      if (await this.debouncer.delayAndShouldDebounce(this.options.debounceDelay)) {
        return undefined
      }

      const llm = this.getLlm()
      if (!llm) {
        return undefined
      }

      const helper = new HelperVars(input, this.options, llm.model)

      if (shouldPrefilter(helper)) {
        this.log(`[skip] prefiltered`)
        return undefined
      }

      const prefix = helper.prunedPrefix
      const suffix = helper.prunedSuffix

      // Cache lookup
      let completion: string | undefined = ""
      let cacheHit = false
      const cached = this.options.useCache ? this.cache.get(prefix) : undefined
      if (cached !== undefined) {
        cacheHit = true
        completion = cached
        this.log(`[cache] hit, len=${completion.length}`)
      } else {
        const multiline = !this.options.transform || shouldCompleteMultiline(helper)

        const completionStream = this.completionStreamer.streamCompletionWithFilters(
          token,
          llm,
          prefix,
          suffix,
          input.languageId,
          multiline,
          [],
          helper,
        )

        for await (const update of completionStream) {
          completion += update
        }

        if (token.aborted) {
          return undefined
        }

        // Final post-processing (blank/whitespace/repetition + dangling guards).
        completion =
          postprocessCompletion({ completion, model: llm.model, prefix, suffix }) ?? undefined
        this.log(`[completion] post-filtered (len=${completion?.length ?? 0}):\n${completion ?? "<dropped>"}\n[/completion]`)
      }

      if (!completion) {
        return undefined
      }

      if (!cacheHit && this.options.useCache) {
        this.cache.put(prefix, completion)
      }

      return {
        completion,
        prefix,
        suffix,
        modelName: llm.model,
        cacheHit,
        time: Date.now() - startTime,
        numLines: completion.split("\n").length,
        completionId: input.completionId,
        filepath: input.filepath,
      }
    } catch (e) {
      this.onError(e)
      return undefined
    }
  }
}
