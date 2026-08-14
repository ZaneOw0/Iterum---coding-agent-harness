import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import React from "react"
import { Footer } from "../src/components/Footer"

describe("Footer", () => {
  test("shows cwd and slash command hint", () => {
    const { lastFrame } = render(<Footer cwd="C:/proj" permissionCount={1} mcpCount={3} />)
    expect(lastFrame()).toContain("C:/proj")
    expect(lastFrame()).toContain("/status")
  })
  test("shows connect hint when no credentials", () => {
    const { lastFrame } = render(<Footer cwd="C:/proj" permissionCount={0} mcpCount={0} connected={false} />)
    expect(lastFrame()).toContain("Get started /connect")
  })
})
