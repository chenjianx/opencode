import { randomBytes } from "node:crypto"

export function ascendingID(prefix: "msg" | "prt") {
  const sortable = (BigInt(Date.now()) * BigInt(0x1000)).toString(16).slice(-12).padStart(12, "0")
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  const bytes = randomBytes(14)
  return `${prefix}_${sortable}${Array.from(bytes, (byte) => chars[byte % 62]).join("")}`
}
