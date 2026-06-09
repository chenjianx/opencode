/**
 * Trailing-edge debouncer ported from continue-rac
 * (core/autocomplete/util/AutocompleteDebouncer.ts). Each call starts a fresh
 * timer; if a newer call arrives before the delay elapses, the older one
 * resolves to `true` (should debounce / drop).
 */
export class AutocompleteDebouncer {
  private debounceTimeout: ReturnType<typeof setTimeout> | undefined
  private currentRequestId = 0

  async delayAndShouldDebounce(debounceDelay: number): Promise<boolean> {
    const requestId = ++this.currentRequestId

    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout)
    }

    return new Promise<boolean>((resolve) => {
      this.debounceTimeout = setTimeout(() => {
        const shouldDebounce = this.currentRequestId !== requestId
        resolve(shouldDebounce)
      }, debounceDelay)
    })
  }
}
