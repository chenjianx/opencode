import { describe, expect, test } from "bun:test"
import type { RaccoonPermissionConfig, RaccoonPermissionRule } from "../../protocol"
import {
  clearWildcardPatch,
  effectiveRuleLevel,
  inheritedWildcard,
  mergePermissionPatch,
  mostRestrictive,
  permissionExceptions,
  removeExceptionPatch,
  setExceptionPatch,
  setGroupedPatch,
  setWildcardPatch,
  wildcardAction,
} from "./permission-utils"

describe("effectiveRuleLevel", () => {
  const rules: RaccoonPermissionRule[] = [
    { permission: "*", pattern: "*", action: "allow" },
    { permission: "edit", pattern: "*", action: "deny" },
    { permission: "edit", pattern: "src/**", action: "allow" },
  ]
  test("last matching wildcard rule wins", () => {
    expect(effectiveRuleLevel(rules, "edit")).toBe("deny")
    expect(effectiveRuleLevel(rules, "read")).toBe("allow")
  })
  test("ignores non-wildcard patterns and falls back to ask", () => {
    expect(effectiveRuleLevel([], "bash")).toBe("ask")
    expect(effectiveRuleLevel(undefined, "bash")).toBe("ask")
  })
})

describe("wildcardAction / inheritedWildcard", () => {
  test("string rule", () => {
    expect(wildcardAction("deny", "ask")).toBe("deny")
    expect(inheritedWildcard("deny")).toBe(false)
  })
  test("missing rule inherits", () => {
    expect(wildcardAction(undefined, "ask")).toBe("ask")
    expect(inheritedWildcard(undefined)).toBe(true)
  })
  test("map without wildcard inherits the wildcard but is an explicit object", () => {
    expect(wildcardAction({ "src/**": "deny" }, "allow")).toBe("allow")
    expect(inheritedWildcard({ "src/**": "deny" })).toBe(true)
    expect(inheritedWildcard({ "*": "deny", "src/**": "allow" })).toBe(false)
  })
})

describe("mostRestrictive", () => {
  test("picks the strictest", () => {
    expect(mostRestrictive(["allow", "ask"])).toBe("ask")
    expect(mostRestrictive(["allow", "deny", "ask"])).toBe("deny")
    expect(mostRestrictive(["allow", "allow"])).toBe("allow")
  })
})

describe("permissionExceptions", () => {
  test("returns non-wildcard entries", () => {
    expect(permissionExceptions({ "*": "allow", "src/**": "deny", "test/**": "ask" })).toEqual([
      { pattern: "src/**", action: "deny" },
      { pattern: "test/**", action: "ask" },
    ])
    expect(permissionExceptions("allow")).toEqual([])
    expect(permissionExceptions(undefined)).toEqual([])
  })
})

describe("mergePermissionPatch", () => {
  test("sets a simple wildcard action", () => {
    expect(mergePermissionPatch({}, { bash: "deny" })).toEqual({ bash: "deny" })
  })
  test("null clears a tool key", () => {
    expect(mergePermissionPatch({ bash: "deny", read: "allow" }, { bash: null })).toEqual({ read: "allow" })
  })
  test("adds an exception, promoting a string rule to a map", () => {
    const next = mergePermissionPatch({ edit: "allow" }, setExceptionPatch("allow", "edit", "src/**", "deny"))
    expect(next).toEqual({ edit: { "*": "allow", "src/**": "deny" } })
  })
  test("removing the last exception collapses back to a string", () => {
    const start: RaccoonPermissionConfig = { edit: { "*": "allow", "src/**": "deny" } }
    const patch = removeExceptionPatch(start.edit, "edit", "src/**")
    expect(patch).toBeDefined()
    expect(mergePermissionPatch(start, patch!)).toEqual({ edit: "allow" })
  })
  test("empty map deletes the key", () => {
    const start: RaccoonPermissionConfig = { edit: { "src/**": "deny" } }
    const patch = removeExceptionPatch(start.edit, "edit", "src/**")
    expect(mergePermissionPatch(start, patch!)).toEqual({})
  })
  test("grouped set/clear", () => {
    expect(mergePermissionPatch({}, setGroupedPatch(["todoread", "todowrite"], "deny"))).toEqual({
      todoread: "deny",
      todowrite: "deny",
    })
  })
  test("clearWildcardPatch keeps exceptions but clears the wildcard", () => {
    const start: RaccoonPermissionConfig = { bash: { "*": "deny", "git push*": "ask" } }
    expect(mergePermissionPatch(start, clearWildcardPatch(start.bash, "bash"))).toEqual({ bash: { "git push*": "ask" } })
  })
  test("setWildcardPatch preserves exceptions", () => {
    const start: RaccoonPermissionConfig = { bash: { "*": "deny", "git push*": "ask" } }
    expect(mergePermissionPatch(start, setWildcardPatch(start.bash, "bash", "allow"))).toEqual({
      bash: { "*": "allow", "git push*": "ask" },
    })
  })
})
