import { describe, expect, test, mock } from "bun:test"

let captured: Record<string, unknown> | undefined

async function* fakeStream() {
  yield { choices: [{ delta: { reasoning_content: "thinking hard" } }] }
  yield { choices: [{ delta: { content: "hello" } }] }
  yield { choices: [{ delta: {} }] }
}

mock.module("openai", () => ({
  default: class {
    chat = { completions: { create: async (args: Record<string, unknown>) => { captured = args; return fakeStream() } } }
  },
}))

import { OpenAIProvider } from "../src/llm/openai"
import { getVendor } from "../src/llm/vendors"

describe("OpenAIProvider", () => {
  test("effort 映射为 reasoning_effort 透传", async () => {
    const p = new OpenAIProvider({ apiKey: "sk-t", vendor: getVendor("openai"), model: "o4-mini" })
    const evs = []
    for await (const ev of p.complete({ model: "o4-mini", system: "s", messages: [], effort: "high" })) evs.push(ev)
    expect(captured!.reasoning_effort).toBe("medium")
  })
  test("reasoning_content 解析为 reasoning_delta，content 为 text_delta", async () => {
    const p = new OpenAIProvider({ apiKey: "sk-t", vendor: getVendor("openai") })
    const evs = []
    for await (const ev of p.complete({ model: "o4-mini", system: "s", messages: [] })) evs.push(ev)
    expect(evs).toContainEqual({ type: "reasoning_delta", text: "thinking hard" })
    expect(evs).toContainEqual({ type: "text_delta", text: "hello" })
    expect(evs.at(-1)).toEqual({ type: "done" })
  })
  test("模型未命中白名单时省略 effort 参数", async () => {
    const p = new OpenAIProvider({ apiKey: "sk-t", vendor: getVendor("openai"), model: "gpt-4o-mini" })
    for await (const _ of p.complete({ model: "gpt-4o-mini", system: "s", messages: [], effort: "high" })) {}
    expect("reasoning_effort" in captured!).toBe(false)
  })
})
