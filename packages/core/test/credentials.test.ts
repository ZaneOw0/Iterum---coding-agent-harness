import { describe, expect, test, mock, beforeEach } from "bun:test"
import { join } from "node:path"

const mem = new Map<string, string>()
mock.module("@napi-rs/keyring", () => ({
  Entry: class {
    constructor(private service: string, private account: string) {}
    setPassword(p: string) { mem.set(`${this.service}/${this.account}`, p) }
    getPassword() { return mem.get(`${this.service}/${this.account}`) ?? null }
    deletePassword() { mem.delete(`${this.service}/${this.account}`) }
  },
}))

import { CredentialStore, maskKey } from "../src/credentials/store"

describe("CredentialStore", () => {
  beforeEach(() => { mem.clear() })

  test("set/get round-trips through keyring", async () => {
    const store = new CredentialStore()
    await store.set("openai", "test-key-openai-0000")
    const got = await store.get("openai")
    expect(got?.key).toBe("test-key-openai-0000")
    expect(got?.source).toBe("keychain")
  })

  test("remove deletes", async () => {
    const store = new CredentialStore()
    await store.set("anthropic", "test-key-anthropic-0000")
    await store.remove("anthropic")
    expect(await store.get("anthropic")).toBeUndefined()
  })

  test("env fallback loads .env and marks source", async () => {
    const store = new CredentialStore({ envDir: join(import.meta.dir, "fixtures"), envFile: "test.env" })
    const got = await store.get("openai")
    expect(got?.source).toBe("env")
    expect(got?.key).toBe("test-key-openai-env0000")
  })

  test("mask never returns full key", () => {
    expect(maskKey("sk-abcdef123456")).toBe("sk-…3456")
    expect(maskKey("sk-abcdef123456")).not.toContain("abcdef")
  })
})
