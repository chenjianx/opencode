/**
 * In-memory LRU cache keyed by pruned prefix. continue-rac persists this in
 * SQLite; for the vscode extension a bounded Map (insertion-order = recency) is
 * sufficient and avoids a disk dependency.
 */
const DEFAULT_CAPACITY = 1000

export class AutocompleteLruCache {
  private cache = new Map<string, string>()

  constructor(private readonly capacity: number = DEFAULT_CAPACITY) {}

  get(prefix: string): string | undefined {
    const value = this.cache.get(prefix)
    if (value === undefined) return undefined
    // Refresh recency.
    this.cache.delete(prefix)
    this.cache.set(prefix, value)
    return value
  }

  put(prefix: string, completion: string): void {
    if (this.cache.has(prefix)) {
      this.cache.delete(prefix)
    }
    this.cache.set(prefix, completion)
    while (this.cache.size > this.capacity) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }
}
