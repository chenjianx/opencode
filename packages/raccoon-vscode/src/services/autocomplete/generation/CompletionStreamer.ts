import { StreamTransformPipeline } from "../filtering/streamTransforms/StreamTransformPipeline.js"
import type { BracketMatchingService } from "../filtering/BracketMatchingService.js"
import type { ILLM } from "../llm/types.js"
import type { HelperVars } from "../util/HelperVars.js"
import { GeneratorReuseManager } from "./GeneratorReuseManager.js"

/**
 * Coordinates streaming generation: generator reuse + the stream transform
 * pipeline. Ported from continue-rac
 * (core/autocomplete/generation/CompletionStreamer.ts). The raccoon backend is
 * FIM-only, so the streamComplete fallback is dropped.
 */
export class CompletionStreamer {
  private streamTransformPipeline: StreamTransformPipeline
  private generatorReuseManager: GeneratorReuseManager

  constructor(bracketMatching: BracketMatchingService, onError: (err: unknown) => void) {
    this.streamTransformPipeline = new StreamTransformPipeline(bracketMatching)
    this.generatorReuseManager = new GeneratorReuseManager(onError)
  }

  async *streamCompletionWithFilters(
    token: AbortSignal,
    llm: ILLM,
    prefix: string,
    suffix: string,
    languageId: string,
    multiline: boolean,
    stopTokens: string[],
    helper: HelperVars,
  ): AsyncGenerator<string> {
    // Try to reuse pending requests if what the user typed matches start of completion
    const generator = this.generatorReuseManager.getGenerator(
      prefix,
      (abortSignal: AbortSignal) => llm.streamFim(prefix, suffix, languageId, abortSignal),
      multiline,
      token,
    )

    // Full stop means to stop the LLM's generation, instead of just truncating the displayed completion
    const fullStop = () => this.generatorReuseManager.currentGenerator?.cancel()

    const generatorWithCancellation = async function* () {
      for await (const update of generator) {
        if (token.aborted) {
          return
        }
        yield update
      }
    }

    const initialGenerator = generatorWithCancellation()
    const transformedGenerator = helper.options.transform
      ? this.streamTransformPipeline.transform(
          initialGenerator,
          prefix,
          suffix,
          multiline,
          stopTokens,
          fullStop,
          helper,
        )
      : initialGenerator

    for await (const update of transformedGenerator) {
      yield update
    }
  }
}
