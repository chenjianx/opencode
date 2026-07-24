/**
 * Trailing-edge debouncer ported from continue-rac
 * (core/autocomplete/util/AutocompleteDebouncer.ts). Each call starts a fresh
 * timer; if a newer call arrives before the delay elapses, the older one
 * resolves to `true` (should debounce / drop).
 */
export class AutocompleteDebouncer {
  private debounceTimeout: ReturnType<typeof setTimeout> | undefined
  private resolvePending: ((shouldDebounce: boolean) => void) | undefined

  async delayAndShouldDebounce(debounceDelay: number): Promise<boolean> {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout)
      this.resolvePending?.(true)
    }

    return new Promise<boolean>((resolve) => {
      this.resolvePending = resolve
      this.debounceTimeout = setTimeout(() => {
        this.debounceTimeout = undefined
        this.resolvePending = undefined
        resolve(false)
      }, debounceDelay)
    })
  }
}
