import { describe, expect, test, mock } from "bun:test"
import { render } from "ink-testing-library"
import React from "react"
import { Composer } from "../src/components/Composer"

const usage = { tokens: 12400, percent: 24, costUsd: 0.03 }
const tick = () => new Promise(r => setTimeout(r, 0))

const SLASH = [
  { name: "/help", description: "显示全部指令说明" },
  { name: "/connect", description: "连接厂商：选厂商 → 输 API key → 选模型" },
  { name: "/model", description: "切换当前厂商的模型" },
  { name: "/effort", description: "切换思考强度（低/中/高/极高）" },
  { name: "/exit", description: "退出 iterum" },
]

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

  test("/ 打开浮窗列出全部指令，输入后过滤", async () => {
    const { lastFrame, stdin } = render(<Composer onSubmit={() => {}} usage={usage} commands={SLASH} />)
    await tick()
    stdin.write("/")
    await tick()
    const frame = lastFrame()!
    expect(frame).toContain("Slash 指令")
    for (const c of SLASH) expect(frame).toContain(c.name)
    stdin.write("co")
    await tick()
    const filtered = lastFrame()!
    expect(filtered).toContain("/connect")
    expect(filtered).not.toContain("/exit")
    expect(filtered).not.toContain("/help")
  })

  test("Tab 补全默认选中第一条指令", async () => {
    const { lastFrame, stdin } = render(<Composer onSubmit={() => {}} usage={usage} commands={SLASH} />)
    await tick()
    stdin.write("/")
    await tick()
    stdin.write("\t")
    await tick()
    expect(lastFrame()).toContain("❯ /help")
  })
})
