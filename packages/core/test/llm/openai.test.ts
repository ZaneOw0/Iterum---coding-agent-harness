import { describe, expect, test, mock } from "bun:test"

mock.module("openai", () => {
  const shared = { completions: { create: mock(async () => new ReadableStream<unknown>()) } }
  return {
    default: class {
      static chat = shared
      chat = shared
    },
  }
})

import { OpenAIProvider } from "../../src/llm/openai"

type CreateBody = { model: string; stream: boolean; messages: { role: string; content: string }[] }
type CreateMock = (body: CreateBody) => Promise<ReadableStream<unknown>>

describe("OpenAIProvider", () => {
  test("maps text deltas to LLMEvent stream", async () => {
    const fake = () => {
      const encoder = new TextEncoder()
      return new ReadableStream({
        start(c) {
          c.enqueue({ choices: [{ delta: { content: "he" } }] })
          c.enqueue({ choices: [{ delta: { content: "llo" } }] })
          c.close()
        },
      })
    }
    const OpenAIMod = await import("openai")
    ;(OpenAIMod.default as any).chat.completions.create = mock(async () => fake())
    const p = new OpenAIProvider({ apiKey: "test-key-openai-0000" })
    const events = []
    for await (const e of p.complete({ model: "gpt-4o", system: "", messages: [{ role: "user", content: "hi" }] })) events.push(e)
    expect(events.map(e => e.type)).toEqual(["text_delta", "text_delta", "done"])
  })

  test("sends system prompt as leading system message and passes model", async () => {
    const fake = () => {
      return new ReadableStream({
        start(c) {
          c.enqueue({ choices: [{ delta: { content: "ok" } }] })
          c.close()
        },
      })
    }
    const OpenAIMod = await import("openai")
    const create = mock<CreateMock>(async () => fake())
    ;(OpenAIMod.default as any).chat.completions.create = create
    const p = new OpenAIProvider({ apiKey: "test-key-openai-0001" })
    const events = []
    for await (const e of p.complete({
      model: "gpt-4o",
      system: "be brief",
      messages: [{ role: "user", content: "hi" }],
    })) events.push(e)
    expect(events.map(e => e.type)).toEqual(["text_delta", "done"])
    const args = create.mock.calls[0]![0]
    expect(args.model).toBe("gpt-4o")
    expect(args.stream).toBe(true)
    expect(args.messages).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ])
  })

  test("falls back to provider model option when request has no model", async () => {
    const fake = () => {
      return new ReadableStream({
        start(c) {
          c.close()
        },
      })
    }
    const OpenAIMod = await import("openai")
    const create = mock<CreateMock>(async () => fake())
    ;(OpenAIMod.default as any).chat.completions.create = create
    const p = new OpenAIProvider({ apiKey: "test-key-openai-0002", model: "gpt-4o-mini" })
    const events = []
    for await (const e of p.complete({ model: "gpt-4o-mini", system: "", messages: [] })) events.push(e)
    expect(events.map(e => e.type)).toEqual(["done"])
    expect(create.mock.calls[0]![0].model).toBe("gpt-4o-mini")
  })
})
