export class ActionTokenStore {
  private globalToken = 0
  private readonly tokens = new Map<string, number>()

  issue(key?: string) {
    if (!key) return ++this.globalToken
    const token = (this.tokens.get(key) ?? 0) + 1
    this.tokens.set(key, token)
    return token
  }

  isCurrent(key: string | undefined, token: number) {
    return key ? (this.tokens.get(key) ?? 0) === token : this.globalToken === token
  }

  cancel(key?: string) {
    if (!key) {
      this.globalToken++
      return
    }
    this.tokens.set(key, (this.tokens.get(key) ?? 0) + 1)
  }

  keys() {
    return [...this.tokens.keys()]
  }
}
