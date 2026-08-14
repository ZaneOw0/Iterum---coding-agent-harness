import { describe, expect, test } from "bun:test"
import { driveSession, reduceSession, routeSlash, statusFor } from "../src/tui"
import { createSession } from "@iterum/core/transcript/session"
import type { SessionEvent } from "@iterum/core/transcript/events"
import type { Session } from "@iterum/core/transcript/types"
import { AgentLoop } from "@iterum/core/agent/loop"
import { MockProvider } from "@iterum/core/llm/mock"
import { ToolRegistry } from "@iterum/core/tools/registry"
import { PermissionGateway } from "@iterum/core/permission/gateway"
import { VerifyRunner } from "@iterum/core/feedback/verify"

const s0 = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })

describe("reduceSession", () => {
  test("text_delta appends assistant text part", () => {
    // run() 开头已 push user message + assistant message（assistant 为最后一条）
    const s1 = reduceSession(s0, { type: "assistant_started", messageId: "m2" })
    const s2 = reduceSession(s1, { type: "text_delta", messageId: "m2", partId: "", text: "hel" })
    const s3 = reduceSession(s2, { type: "text_delta", messageId: "m2", partId: "", text: "lo" })
    const last = s3.messages.at(-1)!
    expect(last.role).toBe("assistant")
    expect(last.parts.at(-1)).toMatchObject({ type: "text", text: "hello" })
  })

  test("session_idle is a no-op reducer", () => {
    const s1 = reduceSession(s0, { type: "session_idle" })
    expect(s1).toBe(s0)
  })

  test("TuiApp event loop: real AgentLoop stream reduces to merged text exactly once", async () => {
    const loop = new AgentLoop({
      provider: new MockProvider([{ type: "text", text: "hello from iterum" }]),
      tools: new ToolRegistry(),
      permissions: new PermissionGateway(),
      verify: new VerifyRunner("bun test", async () => ({ exitCode: 0, output: "" })),
      resolvePermission: async () => "deny",
    })
    // TuiApp 的做法：给 run() 一份浅拷贝，事件经 reduceSession 归约为状态
    let cur: Session = { ...s0, messages: [...s0.messages] }
    for await (const ev of loop.run(cur, "hi")) cur = reduceSession(cur, ev)
    const last = cur.messages.at(-1)!
    expect(last.role).toBe("assistant")
    expect(last.parts.at(-1)).toMatchObject({ type: "text", text: "hello from iterum" })
  })
})

describe("driveSession", () => {
  test("run() 抛错时不重抛，错误以字符串返回，且不更新状态", async () => {
    const boom = {
      run: async function* (_s: Session, _t: string): AsyncIterable<SessionEvent> {
        throw new Error("auth failed")
      },
    }
    const updates: Session[] = []
    const error = await driveSession(boom, s0, "hi", s => updates.push(s))
    expect(error).toBe("auth failed")
    expect(updates).toEqual([])
  })

  test("run() 抛非 Error 值时也能转成错误字符串", async () => {
    const boom = {
      run: async function* (_s: Session, _t: string): AsyncIterable<SessionEvent> {
        throw "rate limited"
      },
    }
    const error = await driveSession(boom, s0, "hi", () => {})
    expect(error).toBe("rate limited")
  })

  test("正常事件流归约进状态并回调", async () => {
    const fake = {
      run: async function* (_s: Session, _t: string): AsyncIterable<SessionEvent> {
        yield { type: "assistant_started", messageId: "m1" }
        yield { type: "text_delta", messageId: "m1", partId: "", text: "ok" }
      },
    }
    const updates: Session[] = []
    const error = await driveSession(fake, s0, "hi", s => updates.push(s))
    expect(error).toBeNull()
    const last = updates.at(-1)!
    expect(last.messages.at(-1)).toMatchObject({ role: "assistant", parts: [{ type: "text", text: "ok" }] })
  })

  test("tool_started/tool_completed 归约出 state/result 正确的 tool part", async () => {
    const fake = {
      run: async function* (_s: Session, _t: string): AsyncIterable<SessionEvent> {
        yield { type: "assistant_started", messageId: "m1" }
        yield { type: "tool_started", messageId: "m1", partId: "", tool: "bash", args: { command: "bun test" } }
        yield { type: "tool_completed", messageId: "m1", partId: "", result: { ok: true, output: "64 pass", durationMs: 632 } }
      },
    }
    const updates: Session[] = []
    const error = await driveSession(fake, s0, "run tests", s => updates.push(s))
    expect(error).toBeNull()
    const runningPart = updates[1]!.messages.at(-1)!.parts.at(-1)!
    expect(runningPart).toMatchObject({ type: "tool", tool: "bash", args: { command: "bun test" }, state: "running" })
    const runningTime = (runningPart as { time: { start: number; end: number } }).time
    expect(runningTime.start).toBeGreaterThan(0)
    expect(runningTime.end).toBe(0)
    const donePart = updates[2]!.messages.at(-1)!.parts.at(-1)!
    expect(donePart).toMatchObject({
      type: "tool", tool: "bash", state: "completed",
      result: { ok: true, output: "64 pass", durationMs: 632 },
    })
    const doneTime = (donePart as { time: { start: number; end: number } }).time
    expect(doneTime.end).toBeGreaterThanOrEqual(doneTime.start)
    expect(doneTime.end).toBeGreaterThan(0)
  })

  test("permission_requested/feedback_injected 归约出 permission 与 feedback part", async () => {
    const fake = {
      run: async function* (_s: Session, _t: string): AsyncIterable<SessionEvent> {
        yield { type: "assistant_started", messageId: "m1" }
        yield { type: "permission_requested", partId: "", request: { id: "r1", tool: "bash", args: { command: "rm -rf dist" }, reason: "dangerous command", riskLevel: "high" } }
        yield { type: "feedback_injected", partId: "", verifier: "bun test", status: "fail", summary: "1 failed: auth", failureIndex: 2 }
      },
    }
    const updates: Session[] = []
    const error = await driveSession(fake, s0, "hi", s => updates.push(s))
    expect(error).toBeNull()
    const permPart = updates[1]!.messages.at(-1)!.parts.at(-1)!
    expect(permPart).toMatchObject({
      type: "permission",
      request: { id: "r1", tool: "bash", args: { command: "rm -rf dist" }, reason: "dangerous command", riskLevel: "high" },
    })
    const fbPart = updates[2]!.messages.at(-1)!.parts.at(-1)!
    expect(fbPart).toMatchObject({
      type: "feedback", verifier: "bun test", status: "fail", summary: "1 failed: auth", failureIndex: 2,
    })
  })
})

describe("routeSlash", () => {
  test("识别三条指令（容忍首尾空白）", () => {
    expect(routeSlash("/connect")).toBe("connect")
    expect(routeSlash("  /model ")).toBe("model")
    expect(routeSlash("/effort")).toBe("effort")
  })

  test("识别 /help 与 /exit（容忍首尾空白）", () => {
    expect(routeSlash("/help")).toBe("help")
    expect(routeSlash("  /exit ")).toBe("exit")
  })

  test("未知 slash 与普通文本返回 null", () => {
    expect(routeSlash("/status")).toBeNull()
    expect(routeSlash("hello world")).toBeNull()
    expect(routeSlash("")).toBeNull()
  })
})

describe("statusFor", () => {
  test("事件类型映射为过程状态文案", () => {
    expect(statusFor({ type: "assistant_started", messageId: "m1" })).toBe("连接中…")
    expect(statusFor({ type: "reasoning_delta", messageId: "m1", partId: "", text: "x" })).toBe("思考中…")
    expect(statusFor({ type: "tool_started", messageId: "m1", partId: "", tool: "bash", args: {} })).toBe("执行工具 bash…")
    expect(statusFor({ type: "text_delta", messageId: "m1", partId: "", text: "hi" })).toBe("回复中…")
    expect(statusFor({ type: "tool_completed", messageId: "m1", partId: "", result: { ok: true, output: "", durationMs: 0 } })).toBe("回复中…")
  })

  test("结束事件与其他事件清空状态", () => {
    expect(statusFor({ type: "assistant_completed", messageId: "m1" })).toBe("")
    expect(statusFor({ type: "session_idle" })).toBe("")
    expect(statusFor({ type: "permission_requested", partId: "", request: { id: "r1", tool: "bash", args: {}, reason: "x", riskLevel: "low" } })).toBe("")
  })
})

describe("driveSession onEvent", () => {
  test("每个事件透出给 onEvent 回调", async () => {
    const fake = {
      run: async function* (_s: Session, _t: string): AsyncIterable<SessionEvent> {
        yield { type: "assistant_started", messageId: "m1" }
        yield { type: "text_delta", messageId: "m1", partId: "", text: "ok" }
        yield { type: "session_idle" }
      },
    }
    const seen: string[] = []
    const error = await driveSession(fake, s0, "hi", () => {}, ev => { seen.push(ev.type) })
    expect(error).toBeNull()
    expect(seen).toEqual(["assistant_started", "text_delta", "session_idle"])
  })
})
