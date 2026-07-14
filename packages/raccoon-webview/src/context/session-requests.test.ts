import { describe, expect, test } from "bun:test"
import type { RaccoonMessage, RaccoonPermissionRequest, RaccoonSession, RaccoonSubSession } from "../protocol"
import { sessionFamily, sessionPermissionRequest, sessionTreePermissions } from "./session-requests"

const session = (input: { id: string; parentID?: string }) =>
  ({
    id: input.id,
    parentID: input.parentID,
    title: input.id,
    updatedAt: 1,
  }) satisfies RaccoonSession

const message = (id: string, sessionIDs: string[] = []) =>
  ({
    id,
    role: "assistant",
    text: "",
    createdAt: 1,
    parts: sessionIDs.map((sessionID, index) => ({
      id: `${id}-part-${index}`,
      type: "tool",
      tool: "task",
      metadata: { sessionId: sessionID },
    })),
  }) satisfies RaccoonMessage

const permission = (id: string, sessionID: string) =>
  ({
    id,
    sessionID,
    permission: "external_directory",
    patterns: ["*"],
    metadata: {},
    always: ["*"],
  }) satisfies RaccoonPermissionRequest

describe("sessionFamily", () => {
  test("includes current session and task child sessions from messages", () => {
    expect(
      [...sessionFamily({ sessionID: "root", sessions: [session({ id: "root" })], messages: [message("msg", ["child"])] })],
    ).toEqual(["root", "child"])
  })

  test("includes nested task sessions from sub-session tools", () => {
    const subSessions: Record<string, RaccoonSubSession> = {
      child: {
        sessionID: "child",
        status: "running",
        toolcalls: 1,
        tools: [{ id: "tool-grand", tool: "task", sessionID: "grand" }],
      },
    }

    expect(
      [...sessionFamily({ sessionID: "root", sessions: [session({ id: "root" })], messages: [message("msg", ["child"])], subSessions })],
    ).toEqual(["root", "child", "grand"])
  })
})

describe("sessionPermissionRequest", () => {
  test("prefers the current session permission", () => {
    const permissions = [permission("perm-child", "child"), permission("perm-root", "root")]

    expect(
      sessionPermissionRequest({
        sessions: [session({ id: "root" })],
        messages: [message("msg", ["child"])],
        permissions,
        sessionID: "root",
      })?.id,
    ).toBe("perm-root")
  })

  test("returns a task child permission when the child is not in the session list", () => {
    expect(
      sessionPermissionRequest({
        sessions: [session({ id: "root" })],
        messages: [message("msg", ["child"])],
        permissions: [permission("perm-child", "child")],
        sessionID: "root",
      })?.id,
    ).toBe("perm-child")
  })

  test("returns a parentID child permission as a fallback", () => {
    expect(
      sessionPermissionRequest({
        sessions: [session({ id: "root" }), session({ id: "child", parentID: "root" })],
        messages: [],
        permissions: [permission("perm-child", "child")],
        sessionID: "root",
      })?.id,
    ).toBe("perm-child")
  })

  test("returns undefined without a matching family permission", () => {
    expect(
      sessionPermissionRequest({
        sessions: [session({ id: "root" })],
        messages: [],
        permissions: [permission("perm-other", "other")],
        sessionID: "root",
      }),
    ).toBeUndefined()
  })
})

describe("sessionTreePermissions", () => {
  test("returns current-session permissions before child permissions", () => {
    const permissions = [permission("perm-other", "other"), permission("perm-child", "child"), permission("perm-root", "root")]

    expect(
      sessionTreePermissions({
        sessions: [session({ id: "root" })],
        messages: [message("msg", ["child"])],
        permissions,
        sessionID: "root",
      }).map((item) => item.id),
    ).toEqual(["perm-root", "perm-child"])
  })
})
