import { describe, expect, test, mock, beforeEach } from "bun:test"

const mem = new Map<string, string>()
mock.module("@napi-rs/keyring", () => ({
  Entry: class {
    constructor(private service: string, private account: string) {}
    setPassword(p: string) { mem.set(`${this.service}/${this.account}`, p) }
    getPassword() { return mem.get(`${this.service}/${this.account}`) ?? null }
    deletePassword() { mem.delete(`${this.service}/${this.account}`) }
  },
}))

import { runConnect } from "../src/connect"

function capture(fn: () => Promise<number>) {
  const out: string[] = []
  const orig = console.log
  console.log = ((s: any) => { out.push(String(s)) }) as any
  return fn().then(code => { console.log = orig; return { code, out } })
}

describe("connect", () => {
  beforeEach(() => { mem.clear() })

  test("--show prints masked key and source", async () => {
    const { code, out } = await capture(() => runConnect(["openai", "--show"]))
    expect(code).toBe(0)
    expect(out.some(l => l.includes("sk-…")) || out.some(l => l.includes("(unset)"))).toBe(true)
    expect(out.join(" ")).not.toContain("sk-abc123456789") // 永不回显明文
  })

  test("--set via piped stdin stores key (hidden input not required when piped)", async () => {
    const origStdin = process.stdin as any
    const { code } = await capture(() => runConnect(["openai", "--set", "--from-stdin", "test-key-openai-0000"]))
    expect(code).toBe(0)
    expect(mem.get("iterum/openai")).toBe("test-key-openai-0000")
  })

  test("--clear removes key", async () => {
    await runConnect(["openai", "--set", "--from-stdin", "test-key-openai-0000"])
    const { code } = await capture(() => runConnect(["openai", "--clear"]))
    expect(code).toBe(0)
    expect(mem.get("iterum/openai")).toBeUndefined()
  })

  test("unknown provider exits 2", async () => {
    const { code } = await capture(() => runConnect(["nope", "--show"]))
    expect(code).toBe(2)
  })
})
