import { describe, expect, test } from "bun:test"
import { createSession, appendPart } from "../src/transcript/session"
import type { Part } from "../src/transcript/types"

describe("transcript", () => {
  test("appendPart appends and returns new message (immutable)", () => {
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "openai", model: "gpt-4o" })
    const msg = { id: "m1", role: "assistant" as const, parts: [] as Part[], time: { start: 0, end: 0 } }
    const next = appendPart(msg, { type: "text", text: "hi" })
    expect(next.parts.length).toBe(1)
    expect(msg.parts.length).toBe(0)
    expect(next.id).toBe("m1")
  })

  test("new session has empty messages and zero failures", () => {
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "openai", model: "gpt-4o" })
    expect(s.messages.length).toBe(0)
    expect(s.feedbackFailures).toBe(0)
    expect(s.createdAt).toBeInstanceOf(Date)
    expect(s.updatedAt).toBeInstanceOf(Date)
  })
})
