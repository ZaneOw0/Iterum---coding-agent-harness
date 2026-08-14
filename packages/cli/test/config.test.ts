import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { readConfig, writeConfig, configPath } from "../src/config"

let home: string
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "iterum-config-")) })
afterEach(() => { rmSync(home, { recursive: true, force: true }) })

describe("config 存储", () => {
  test("读写往返", () => {
    writeConfig({ provider: "deepseek", model: "deepseek-chat", effort: "medium" }, home)
    expect(configPath(home)).toBe(join(home, ".iterum", "config.json"))
    expect(readConfig(home)).toEqual({ provider: "deepseek", model: "deepseek-chat", effort: "medium" })
  })
  test("不存在时返回空对象", () => {
    expect(readConfig(home)).toEqual({})
  })
  test("损坏 JSON 回退空对象不抛错", () => {
    const dir = join(home, ".iterum")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "config.json"), "{broken")
    expect(readConfig(home)).toEqual({})
  })
})
