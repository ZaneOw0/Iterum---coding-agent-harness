import { describe, expect, test, beforeEach } from "bun:test"
import { SessionStore } from "../src/session/store"
import { createSession } from "../src/transcript/session"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("SessionStore", () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "iterum-sess-")) })

  test("save and load round-trips messages and decisions", () => {
    const store = new SessionStore(dir)
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "openai", model: "gpt-4o" })
    s.messages = [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], time: { start: 0, end: 0 } }]
    s.permissionDecisions.set("bash:{}", "allow")
    store.save(s)
    const loaded = store.load(s.id)!
    expect(loaded.messages[0].parts[0]).toMatchObject({ type: "text", text: "hi" })
    expect(loaded.permissionDecisions.get("bash:{}")).toBe("allow")
  })

  test("corrupt json is skipped without throwing", () => {
    const store = new SessionStore(dir)
    const bad = join(dir, "bad.json")
    Bun.write(bad, "{corrupt")
    expect(() => store.load("bad")).not.toThrow()
    expect(store.load("bad")).toBeUndefined()
  })
})
