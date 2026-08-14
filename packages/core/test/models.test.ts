import { describe, expect, test, afterEach } from "bun:test"
import { fetchModels } from "../src/llm/models"
import { getVendor } from "../src/llm/vendors"

const origFetch = globalThis.fetch

afterEach(() => { globalThis.fetch = origFetch })

describe("fetchModels", () => {
  test("OpenAI 兼容：Authorization Bearer + 前缀过滤 + 排序", async () => {
    let url = ""; let headers: Headers | undefined
    globalThis.fetch = (async (u: any, init: any) => {
      url = String(u); headers = init?.headers as Headers
      return new Response(JSON.stringify({ data: [{ id: "whisper-1" }, { id: "gpt-4o-mini" }, { id: "gpt-4.1" }] }), { status: 200 })
    }) as typeof fetch
    const models = await fetchModels(getVendor("openai")!, "sk-test")
    expect(url).toBe("https://api.openai.com/v1/models")
    expect(headers?.get("Authorization")).toBe("Bearer sk-test")
    expect(models).toEqual(["gpt-4.1", "gpt-4o-mini"])
  })
  test("anthropic：x-api-key + anthropic-version + claude- 过滤", async () => {
    let headers: Headers | undefined
    globalThis.fetch = (async (u: any, init: any) => {
      headers = init?.headers as Headers
      return new Response(JSON.stringify({ data: [{ id: "claude-sonnet-4" }, { id: "other-model" }] }), { status: 200 })
    }) as typeof fetch
    const models = await fetchModels(getVendor("anthropic")!, "sk-ant-test")
    expect(headers?.get("x-api-key")).toBe("sk-ant-test")
    expect(headers?.get("anthropic-version")).toBe("2023-06-01")
    expect(models).toEqual(["claude-sonnet-4"])
  })
  test("HTTP 错误抛出带状态码", async () => {
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch
    await expect(fetchModels(getVendor("openai")!, "bad")).rejects.toThrow("401")
  })
  test("gemini 使用兼容端点 /models", async () => {
    let url = ""
    globalThis.fetch = (async (u: any) => { url = String(u); return new Response(JSON.stringify({ data: [{ id: "gemini-3-pro" }] }), { status: 200 }) }) as typeof fetch
    const models = await fetchModels(getVendor("gemini")!, "k")
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/models")
    expect(models).toEqual(["gemini-3-pro"])
  })
  test("注入的 fetchImpl 优先于全局 fetch", async () => {
    let used = ""
    const injected = (async (u: any) => { used = String(u); return new Response(JSON.stringify({ data: [{ id: "gpt-4o" }] }), { status: 200 }) }) as typeof fetch
    const models = await fetchModels(getVendor("openai")!, "sk-test", injected)
    expect(used).toBe("https://api.openai.com/v1/models")
    expect(models).toEqual(["gpt-4o"])
  })
})
