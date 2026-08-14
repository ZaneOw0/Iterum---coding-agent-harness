import { describe, expect, test, mock } from "bun:test"
import { render } from "ink-testing-library"
import React from "react"
import { Composer } from "../src/components/Composer"

const usage = { tokens: 12400, percent: 24, costUsd: 0.03 }
const tick = () => new Promise(r => setTimeout(r, 0))

describe("Composer", () => {
  test("shows context usage as muted status", () => {
    const { lastFrame } = render(<Composer onSubmit={() => {}} usage={usage} />)
    expect(lastFrame()).toContain("12,400 (24%)")
    expect(lastFrame()).toContain("$0.03")
  })

  test("Enter 提交文本并清空", async () => {
    const onSubmit = mock()
    const { lastFrame, stdin } = render(<Composer onSubmit={onSubmit} usage={usage} />)
    await tick()
    stdin.write("h")
    await tick()
    stdin.write("i")
    await tick()
    stdin.write("\r")
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith("hi")
    expect(lastFrame()).not.toContain("❯ hi")
  })

  test("Ctrl+J 插入换行而不是提交", async () => {
    const onSubmit = mock()
    const { lastFrame, stdin } = render(<Composer onSubmit={onSubmit} usage={usage} />)
    await tick()
    const baseLines = lastFrame()!.split("\n").length
    stdin.write("h")
    await tick()
    stdin.write("i")
    await tick()
    stdin.write("\n")
    expect(onSubmit).not.toHaveBeenCalled()
    expect(lastFrame()).toContain("❯ hi")
    expect(lastFrame()!.split("\n").length).toBe(baseLines + 1)
  })
})
