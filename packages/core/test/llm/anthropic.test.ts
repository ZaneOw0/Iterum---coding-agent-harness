import { describe, expect, test, mock } from "bun:test"

mock.module("@anthropic-ai/sdk", () => {
  const shared = { stream: mock(async () => (async function* () {})()) }
  return {
    default: class {
      static messages = shared
      messages = shared
    },
  }
})

import { AnthropicProvider } from "../../src/llm/anthropic"

type StreamBody = { model: string; system: string; max_tokens: number; messages: { role: string; content: string }[] }
type StreamMock = (body: StreamBody) => Promise<AsyncIterable<{ type: string; [k: string]: unknown }>>

describe("AnthropicProvider", () => {
  test("maps content_block_delta to LLMEvent stream (text, thinking, tool_use)", async () => {
    const fakeStream = async function* () {
      yield { type: "message_start", message: { id: "msg_1", content: [] } }
      yield { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }
      yield { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } }
      yield { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "..." } }
      yield { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }
      yield { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "hi" } }
      yield { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "!" } }
      yield { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "tu_1", name: "read_file" } }
      yield { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"pa' } }
      yield { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: 'th":"a.ts"}' } }
      yield { type: "message_delta", delta: { stop_reason: "tool_use" } }
      yield { type: "message_stop" }
    }
    const AnthropicMod = await import("@anthropic-ai/sdk")
    ;(AnthropicMod.default as any).messages.stream = mock<StreamMock>(async () => fakeStream())
    const p = new AnthropicProvider({ apiKey: "test-key-anthropic-0000" })
    const events = []
    for await (const e of p.complete({ model: "claude-3-7-sonnet-latest", system: "", messages: [{ role: "user", content: "read a.ts" }] })) events.push(e)
    expect(events.map(e => e.type)).toEqual(["reasoning_delta", "reasoning_delta", "text_delta", "text_delta", "tool_call", "done"])
    expect(events.filter(e => e.type === "reasoning_delta").map(e => (e as any).text)).toEqual(["hmm", "..."])
    expect(events.filter(e => e.type === "text_delta").map(e => (e as any).text)).toEqual(["hi", "!"])
    const tool = events.find(e => e.type === "tool_call") as any
    expect(tool).toEqual({ type: "tool_call", name: "read_file", args: { path: "a.ts" } })
  })

  test("sends system prompt, model, and messages to the SDK", async () => {
    const fakeStream = async function* () {
      yield { type: "message_start", message: { id: "msg_2", content: [] } }
      yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }
      yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }
      yield { type: "message_stop" }
    }
    const AnthropicMod = await import("@anthropic-ai/sdk")
    const stream = mock<StreamMock>(async () => fakeStream())
    ;(AnthropicMod.default as any).messages.stream = stream
    const p = new AnthropicProvider({ apiKey: "test-key-anthropic-0001" })
    const events = []
    for await (const e of p.complete({
      model: "claude-3-7-sonnet-latest",
      system: "be brief",
      messages: [{ role: "user", content: "hi" }],
    })) events.push(e)
    expect(events.map(e => e.type)).toEqual(["text_delta", "done"])
    const args = stream.mock.calls[0]![0]
    expect(args.model).toBe("claude-3-7-sonnet-latest")
    expect(args.system).toBe("be brief")
    expect(args.messages).toEqual([{ role: "user", content: "hi" }])
  })
})
