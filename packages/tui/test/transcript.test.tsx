import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import React from "react"
import { Transcript } from "../src/components/Transcript"
import type { Session } from "@iterum/core/transcript/types"

const session: Session = {
  id: "s1", cwd: "C:/proj", title: "t", provider: "mock", model: "mock",
  contextUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, costUsd: 0, contextPercent: 0 },
  permissionDecisions: new Map(), feedbackFailures: 0,
  createdAt: new Date(0), updatedAt: new Date(0),
  messages: [
    { id: "m1", role: "user", parts: [{ type: "text", text: "fix the test" }], time: { start: 0, end: 0 } },
    { id: "m2", role: "assistant", parts: [
      { type: "reasoning", title: "Inspect failing test", markdown: "look at the test", time: { start: 0, end: 1200 } },
      { type: "tool", tool: "read_file", args: { path: "a.ts" }, state: "completed", result: { ok: true, output: "312 lines", durationMs: 30 }, time: { start: 0, end: 30 } },
      { type: "text", text: "done" },
    ], time: { start: 0, end: 0 } },
  ],
}

describe("Transcript", () => {
  test("renders thought line with title and duration", () => {
    const { lastFrame } = render(<Transcript session={session} />)
    expect(lastFrame()).toContain("Thought: Inspect failing test")
    expect(lastFrame()).toContain("1.2s")
  })

  test("renders collapsed tool with result summary", () => {
    const { lastFrame } = render(<Transcript session={session} />)
    expect(lastFrame()).toContain("read_file")
    expect(lastFrame()).toContain("312 lines")
  })
})
