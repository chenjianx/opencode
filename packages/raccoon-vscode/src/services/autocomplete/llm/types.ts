/**
 * Minimal LLM abstraction the autocomplete generation pipeline depends on,
 * mirroring the subset of continue-rac's ILLM that CompletionStreamer uses. The
 * raccoon backend only does FIM, so `streamComplete` is not needed.
 */
export interface ILLM {
  readonly model: string

  streamFim(
    prefix: string,
    suffix: string,
    languageId: string,
    signal: AbortSignal,
  ): AsyncGenerator<string>
}
