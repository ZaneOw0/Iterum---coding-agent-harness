import { describe, expect, test } from "bun:test"
import { reduceSession } from "../src/tui"
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
