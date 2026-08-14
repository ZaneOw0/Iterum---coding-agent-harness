import { describe, expect, test } from "bun:test"
import { MockProvider } from "../../src/llm/mock"

async function collect(provider: MockProvider, req: any) {
  const events: any[] = []
  for await (const e of provider.complete(req)) events.push(e)
  return events
}

describe("MockProvider", () => {
  test("emits scripted events in order and records requests", async () => {
    const p = new MockProvider([
      { type: "reasoning", text: "thinking" },
      { type: "tool", name: "read_file", args: { path: "a.ts" } },
      { type: "text", text: "done" },
    ])
    const events = await collect(p, { model: "mock", system: "", messages: [] })
    expect(events.map(e => e.type)).toEqual(["reasoning_delta", "tool_call", "text_delta", "done"])
    expect(p.requests.length).toBe(1)
  })

  test("second request gets second script entry (multi-turn)", async () => {
    const p = new MockProvider([[{ type: "text", text: "one" }], [{ type: "text", text: "two" }]])
    await collect(p, { model: "mock", system: "", messages: [] })
    const events = await collect(p, { model: "mock", system: "", messages: [] })
    expect(events.find(e => e.type === "text_delta")?.text).toBe("two")
  })
})
