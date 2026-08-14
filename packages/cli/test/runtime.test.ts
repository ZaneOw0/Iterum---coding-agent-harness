import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const mem = new Map<string, string>()
mock.module("@napi-rs/keyring", () => ({
  Entry: class {
    constructor(private service: string, private account: string) {}
    setPassword(p: string) { mem.set(`${this.service}/${this.account}`, p) }
    getPassword() { return mem.get(`${this.service}/${this.account}`) ?? null }
    deletePassword() { mem.delete(`${this.service}/${this.account}`) }
  },
}))

import { createRuntime } from "../src/main"
import { readConfig } from "../src/config"

let home: string
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "iterum-runtime-")); mem.clear() })
afterEach(() => { rmSync(home, { recursive: true, force: true }) })

describe("createRuntime", () => {
  test("config 指定厂商+模型时按注册表组装", async () => {
    const rt = await createRuntime({ mock: false, allowDanger: false, config: { provider: "deepseek", model: "deepseek-chat" }, home })
    expect(rt.providerName).toBe("deepseek")
    expect(rt.model).toBe("deepseek-chat")
    expect(rt.session.model).toBe("deepseek-chat")
  })
  test("config 厂商有 key 时组装真实 provider 且 connected", async () => {
    mem.set("iterum/deepseek", "sk-test-deepseek-0000")
    const rt = await createRuntime({ mock: false, allowDanger: false, config: { provider: "deepseek", model: "deepseek-chat" }, home })
    expect(rt.connected).toBe(true)
    expect(rt.providerName).toBe("deepseek")
  })
  test("无 config 时回退探测：无凭据 mock 提示态", async () => {
    const rt = await createRuntime({ mock: false, allowDanger: false, config: {}, home })
    expect(rt.connected).toBe(false)
    expect(rt.providerName).toBe("mock")
  })
  test("mock 模式不读钥匙串直接 mock provider", async () => {
    const rt = await createRuntime({ mock: true, allowDanger: false, config: { provider: "deepseek" }, home })
    expect(rt.providerName).toBe("mock")
    expect(rt.model).toBe("mock")
    expect(rt.connected).toBe(false)
  })
  test("rebuild 切换 model 立即更新 session.model 并写配置", async () => {
    const rt = await createRuntime({ mock: false, allowDanger: false, config: { provider: "openai" }, home })
    const code = await rt.rebuild({ model: "gpt-4.1" })
    expect(code).toBe(0)
    expect(rt.session.model).toBe("gpt-4.1")
    expect(rt.model).toBe("gpt-4.1")
    expect(readConfig(home)).toEqual({ provider: "openai", model: "gpt-4.1" })
  })
  test("rebuild 无 key 切换厂商被拒绝返回 1 且保持现状", async () => {
    const rt = await createRuntime({ mock: false, allowDanger: false, config: { provider: "openai", model: "gpt-4o-mini" }, home })
    const code = await rt.rebuild({ providerName: "deepseek", model: "deepseek-chat" })
    expect(code).toBe(1)
    expect(rt.providerName).toBe("openai")
    expect(rt.model).toBe("gpt-4o-mini")
  })
})
