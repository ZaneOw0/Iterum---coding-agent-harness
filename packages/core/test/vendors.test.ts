import { describe, expect, test } from "bun:test"
import { VENDORS, getVendor, resolveEffort } from "../src/llm/vendors"

const IDS = ["openai", "anthropic", "gemini", "grok", "moonshot", "deepseek", "zhipu", "qwen"]

describe("VENDORS registry", () => {
  test("8 家厂商齐全且 id 唯一", () => {
    expect(Object.keys(VENDORS).sort()).toEqual([...IDS].sort())
  })
  test("每条目字段完整", () => {
    for (const id of IDS) {
      const v = getVendor(id)!
      expect(v.name).toBeTruthy()
      expect(["openai", "anthropic"]).toContain(v.flavor)
      expect(Array.isArray(v.allowPrefixes)).toBe(true)
      expect(Array.isArray(v.denyPrefixes)).toBe(true)
      if (id === "openai" || id === "grok") expect(v.baseURL).toBeTruthy()
      if (id === "anthropic") expect(v.baseURL).toBeUndefined()
    }
  })
  test("openai 走 OpenAI 兼容（flavor=openai），anthropic 走原生", () => {
    expect(getVendor("openai")!.flavor).toBe("openai")
    expect(getVendor("anthropic")!.flavor).toBe("anthropic")
    expect(getVendor("deepseek")!.flavor).toBe("openai")
  })
  test("getVendor 未知 id 返回 undefined", () => {
    expect(getVendor("nope")).toBeUndefined()
  })
})

describe("resolveEffort", () => {
  test("无 vendor 或无 effort 返回 undefined", () => {
    expect(resolveEffort(undefined, "gpt-4o-mini", "low")).toBeUndefined()
    expect(resolveEffort(getVendor("openai"), "gpt-4o-mini", undefined)).toBeUndefined()
  })
  test("openai 四档映射 reasoning_effort 字符串", () => {
    expect(resolveEffort(getVendor("openai"), "o4-mini", "low")).toEqual({ kind: "reasoning_effort", value: "minimal" })
    expect(resolveEffort(getVendor("openai"), "o4-mini", "medium")).toEqual({ kind: "reasoning_effort", value: "low" })
    expect(resolveEffort(getVendor("openai"), "o4-mini", "high")).toEqual({ kind: "reasoning_effort", value: "medium" })
    expect(resolveEffort(getVendor("openai"), "o4-mini", "max")).toEqual({ kind: "reasoning_effort", value: "high" })
  })
  test("模型未命中 allowlist 返回 undefined", () => {
    expect(resolveEffort(getVendor("openai"), "gpt-4o-mini", "high")).toBeUndefined()
  })
  test("anthropic 映射 thinking 预算", () => {
    expect(resolveEffort(getVendor("anthropic"), "claude-sonnet-4", "low")).toEqual({ kind: "thinking", budget: 8192 })
    expect(resolveEffort(getVendor("anthropic"), "claude-sonnet-4", "max")).toEqual({ kind: "thinking", budget: 32768 })
  })
  test("qwen 映射 enable_thinking 预算", () => {
    expect(resolveEffort(getVendor("qwen"), "qwen3-coder", "medium")).toEqual({ kind: "enable_thinking", budget: 4096 })
  })
  test("不支持 effort 的厂商返回 undefined", () => {
    expect(resolveEffort(getVendor("deepseek"), "deepseek-chat", "low")).toBeUndefined()
    expect(resolveEffort(getVendor("moonshot"), "kimi-k2", "high")).toBeUndefined()
    expect(getVendor("deepseek")!.effort).toBeUndefined()
  })
})
