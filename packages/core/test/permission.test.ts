import { describe, expect, test } from "bun:test"
import { PermissionGateway, defaultRules } from "../src/permission/gateway"

const gw = () => new PermissionGateway(defaultRules)

describe("PermissionGateway", () => {
  test("dangerous bash commands ask and expose the matched rule", () => {
    for (const cmd of ["rm -rf /", "git push --force origin main", "DROP TABLE users", "chmod -R 777 ."]) {
      const res = gw().check({ name: "bash", args: { command: cmd } }, new Map())
      expect(res.decision).toBe("ask")
      expect(res.rule).toBeDefined()
    }
  })

  test("safe operations allow by default", () => {
    expect(gw().check({ name: "read_file", args: { path: "a.ts" } }, new Map()).decision).toBe("allow")
    expect(gw().check({ name: "bash", args: { command: "bun test" } }, new Map()).decision).toBe("allow")
  })

  test("session memory: previously allowed signature skips ask", () => {
    const call = { name: "bash", args: { command: "rm -rf build" } }
    const g = gw()
    expect(g.check(call, new Map()).decision).toBe("ask")
    const mem = new Map<string, "allow" | "deny">()
    mem.set(g.signature(call), "allow")
    expect(g.check(call, mem).decision).toBe("allow")
  })

  test("denied in memory returns deny", () => {
    const call = { name: "bash", args: { command: "rm -rf build" } }
    const g = gw()
    const mem = new Map<string, "allow" | "deny">()
    mem.set(g.signature(call), "deny")
    expect(g.check(call, mem).decision).toBe("deny")
  })

  test("signature is stable regardless of key order", () => {
    const g = gw()
    expect(g.signature({ name: "bash", args: { a: 1, b: 2 } }))
      .toBe(g.signature({ name: "bash", args: { b: 2, a: 1 } }))
  })
})
