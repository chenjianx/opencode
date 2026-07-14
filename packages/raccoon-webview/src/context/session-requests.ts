import type { RaccoonMessage, RaccoonPermissionRequest, RaccoonSession, RaccoonSubSession } from "../protocol"

function taskSessionID(part: { tool?: string; metadata?: Record<string, unknown> }) {
  if (part.tool !== "task") return undefined
  const sessionID = part.metadata?.sessionId
  if (typeof sessionID === "string" && sessionID.length > 0) return sessionID
  return undefined
}

export function sessionFamily(input: {
  sessionID?: string
  messages: RaccoonMessage[]
  sessions: RaccoonSession[]
  subSessions?: Record<string, RaccoonSubSession>
}) {
  if (!input.sessionID) return new Set<string>()

  const children = input.sessions.reduce((map, session) => {
    if (!session.parentID) return map
    const list = map.get(session.parentID)
    if (list) list.push(session.id)
    if (!list) map.set(session.parentID, [session.id])
    return map
  }, new Map<string, string[]>())

  const seen = new Set<string>([input.sessionID])
  const queue = [input.sessionID]

  const add = (sessionID: string | undefined) => {
    if (!sessionID || seen.has(sessionID)) return
    seen.add(sessionID)
    queue.push(sessionID)
  }

  input.messages.flatMap((message) => message.parts).map(taskSessionID).forEach(add)

  for (const sessionID of queue) {
    children.get(sessionID)?.forEach(add)
    input.subSessions?.[sessionID]?.tools.map((tool) => tool.sessionID).forEach(add)
  }

  return seen
}

export function sessionTreePermissions(input: {
  sessions: RaccoonSession[]
  messages: RaccoonMessage[]
  permissions: RaccoonPermissionRequest[]
  sessionID?: string
  subSessions?: Record<string, RaccoonSubSession>
}) {
  const family = sessionFamily(input)
  return [
    ...input.permissions.filter((permission) => permission.sessionID === input.sessionID),
    ...input.permissions.filter((permission) => permission.sessionID !== input.sessionID && family.has(permission.sessionID)),
  ]
}

export function sessionPermissionRequest(input: {
  sessions: RaccoonSession[]
  messages: RaccoonMessage[]
  permissions: RaccoonPermissionRequest[]
  sessionID?: string
  subSessions?: Record<string, RaccoonSubSession>
}) {
  return sessionTreePermissions(input)[0]
}
