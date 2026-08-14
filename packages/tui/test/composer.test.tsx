import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import React from "react"
import { Composer } from "../src/components/Composer"

describe("Composer", () => {
  test("shows context usage as muted status", () => {
    const { lastFrame } = render(<Composer onSubmit={() => {}} usage={{ tokens: 12400, percent: 24, costUsd: 0.03 }} />)
    expect(lastFrame()).toContain("12,400 (24%)")
    expect(lastFrame()).toContain("$0.03")
  })
})
