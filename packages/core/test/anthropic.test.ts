import { describe, expect, test, mock } from "bun:test"

let captured: Record<string, unknown> | undefined

async function* fakeStream() {
  yield { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } }
}

mock.module("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: async (args: Record<string, unknown>) => { captured = args; return fakeStream() } }
  },
}))

import { AnthropicProvider } from "../src/llm/anthropic"
import { getVendor } from "../src/llm/vendors"

describe("AnthropicProvider", () => {
  test("effort 映射为 thinking 预算透传", async () => {
    const p = new AnthropicProvider({ apiKey: "sk-ant-t", vendor: getVendor("anthropic"), model: "claude-sonnet-4" })
    const evs = []
    for await (const ev of p.complete({ model: "claude-sonnet-4", system: "s", messages: [], effort: "high" })) evs.push(ev)
    expect(captured!.thinking).toEqual({ type: "enabled", budget_tokens: 24576 })
    expect(evs).toContainEqual({ type: "text_delta", text: "hi" })
  })
})
