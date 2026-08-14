import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import React from "react"
import { App } from "../src/App"
import type { Session } from "@iterum/core/transcript/types"

const session: Session = {
  id: "s1", cwd: "C:/proj", title: "t", provider: "mock", model: "mock",
  contextUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, costUsd: 0, contextPercent: 0 },
  permissionDecisions: new Map(), feedbackFailures: 0,
  createdAt: new Date(0), updatedAt: new Date(0),
  messages: [],
}

describe("App", () => {
  test("shows /connect hint when not connected", () => {
    const { lastFrame } = render(<App session={session} connected={false} />)
    expect(lastFrame()).toContain("Get started /connect")
  })
})
