import { describe, expect, test } from "bun:test"
import { MockProvider } from "../src/llm/mock"
import { AgentLoop } from "../src/agent/loop"
import { ToolRegistry } from "../src/tools/registry"
import { PermissionGateway } from "../src/permission/gateway"
import { VerifyRunner, formatFeedback } from "../src/feedback/verify"
import { createSession } from "../src/transcript/session"
import type { Tool } from "../src/tools/types"
import type { LLMEvent, LLMProvider } from "../src/llm/types"

async function drain(loop: AgentLoop, session: any, input: string) {
  const events: any[] = []
  for await (const e of loop.run(session, input)) events.push(e)
  return events
}

const alwaysAllow = async () => "allow" as const
const passVerify = new VerifyRunner("test", async () => ({ exitCode: 0, output: "ok" }))

describe("AgentLoop", () => {
  test("plain text turn ends with assistant_completed and session_idle", async () => {
    const provider = new MockProvider([{ type: "text", text: "hello world" }])
    const loop = new AgentLoop({ provider, tools: new ToolRegistry(), permissions: new PermissionGateway(), verify: passVerify, resolvePermission: alwaysAllow })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "hi")
    expect(events.some(e => e.type === "assistant_completed")).toBe(true)
    expect(events.at(-1)?.type).toBe("session_idle")
    expect(s.messages[1].parts[0]).toMatchObject({ type: "text", text: "hello world" })
  })

  test("tool call executes and result goes to transcript", async () => {
    const fakeTool: Tool = {
      name: "fake", description: "fake",
      execute: async () => ({ ok: true, output: "result-1", durationMs: 1 }),
    }
    const reg = new ToolRegistry(); reg.register(fakeTool)
    const provider = new MockProvider([
      { type: "tool", name: "fake", args: { x: 1 } },
      { type: "text", text: "did it" },
    ])
    const loop = new AgentLoop({ provider, tools: reg, permissions: new PermissionGateway(), verify: passVerify, resolvePermission: alwaysAllow })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "do it")
    expect(events.some(e => e.type === "tool_completed" && e.result.output === "result-1")).toBe(true)
    expect(s.messages.flatMap(m => m.parts).some(p => p.type === "tool" && p.result?.output === "result-1")).toBe(true)
  })

  test("verify failure injects feedback into next request and emits feedback_injected", async () => {
    const fakeTool: Tool = {
      name: "fake", description: "fake",
      execute: async () => ({ ok: true, output: "edited", durationMs: 1 }),
    }
    const reg = new ToolRegistry(); reg.register(fakeTool)
    const failVerify = new VerifyRunner("test", async () => ({ exitCode: 1, output: "FAIL auth.test.ts\n1 failed" }))
    // 嵌套多轮脚本：第 1 轮 tool+text，第 2 轮空脚本 → 无工具调用即结束
    const provider = new MockProvider([
      [{ type: "tool", name: "fake", args: { path: "src/auth.ts" } }, { type: "text", text: "fixed" }],
    ])
    const loop = new AgentLoop({ provider, tools: reg, permissions: new PermissionGateway(), verify: failVerify, resolvePermission: alwaysAllow })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "fix it")
    expect(events.some(e => e.type === "feedback_injected" && e.status === "fail")).toBe(true)
    expect(s.feedbackFailures).toBe(1)
    const secondRequest = provider.requests[1]
    expect(secondRequest.messages.some(m => m.content.includes("[feedback] verifier=test status=fail"))).toBe(true)
    expect(s.messages.flatMap(m => m.parts).some(p => p.type === "feedback" && p.status === "fail")).toBe(true)
  })

  test("feedback failures reset on each new run (user reply resets counter)", async () => {
    const fakeTool: Tool = {
      name: "fake", description: "fake",
      execute: async () => ({ ok: true, output: "edited", durationMs: 1 }),
    }
    const reg = new ToolRegistry(); reg.register(fakeTool)
    const failVerify = new VerifyRunner("test", async () => ({ exitCode: 1, output: "FAIL" }))
    const mkLoop = () => new AgentLoop({
      provider: new MockProvider([[{ type: "tool", name: "fake", args: {} }, { type: "text", text: "t" }]]),
      tools: reg, permissions: new PermissionGateway(), verify: failVerify, resolvePermission: alwaysAllow,
    })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    await drain(mkLoop(), s, "try once")
    expect(s.feedbackFailures).toBe(1)
    await drain(mkLoop(), s, "try again")
    expect(s.feedbackFailures).toBe(1) // 第二次 run 开头清零后仅累计 1
  })

  test("three consecutive failures trigger threshold stop with help message", async () => {
    const fakeTool: Tool = {
      name: "fake", description: "fake",
      execute: async () => ({ ok: true, output: "edited", durationMs: 1 }),
    }
    const reg = new ToolRegistry(); reg.register(fakeTool)
    const failVerify = new VerifyRunner("test", async () => ({ exitCode: 1, output: "FAIL" }))
    const script = [
      [{ type: "tool", name: "fake", args: {} }, { type: "text", text: "try1" }],
      [{ type: "tool", name: "fake", args: {} }, { type: "text", text: "try2" }],
      [{ type: "tool", name: "fake", args: {} }, { type: "text", text: "try3" }],
    ]
    const provider = new MockProvider(script)
    const loop = new AgentLoop({ provider, tools: reg, permissions: new PermissionGateway(), verify: failVerify, resolvePermission: alwaysAllow })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "fix it")
    expect(s.feedbackFailures).toBe(3)
    expect(events.at(-1)?.type).toBe("session_idle")
    const lastMsg = s.messages.at(-1)!
    expect(lastMsg.parts.some(p => p.type === "text" && p.text.includes("help"))).toBe(true)
  })

  test("reasoning deltas keep the part duration advancing (time.end tracks the stream)", async () => {
    const slowReasoning: LLMProvider = {
      complete: async function* (): AsyncIterable<LLMEvent> {
        yield { type: "reasoning_delta", text: "step 1" }
        await Bun.sleep(15)
        yield { type: "reasoning_delta", text: "step 2" }
        await Bun.sleep(15)
        yield { type: "text_delta", text: "done" }
        yield { type: "done" }
      },
    }
    const loop = new AgentLoop({ provider: slowReasoning, tools: new ToolRegistry(), permissions: new PermissionGateway(), verify: passVerify, resolvePermission: alwaysAllow })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    await drain(loop, s, "hi")
    const reasoning = s.messages.flatMap(m => m.parts).find(p => p.type === "reasoning")
    if (!reasoning || reasoning.type !== "reasoning") throw new Error("no reasoning part")
    expect(reasoning.markdown).toBe("step 1step 2")
    expect(reasoning.time.end).toBeGreaterThanOrEqual(reasoning.time.start)
    expect(reasoning.time.end - reasoning.time.start).toBeGreaterThanOrEqual(15)
  })

  test("permission ask invokes resolvePermission; deny breaks loop and does NOT enter feedback retry", async () => {
    const fakeTool: Tool = {
      name: "bash", description: "bash",
      execute: async () => ({ ok: true, output: "never", durationMs: 1 }),
    }
    const reg = new ToolRegistry(); reg.register(fakeTool)
    let asked = false
    const resolvePermission = async (req: any) => { asked = true; return "deny" as const }
    const provider = new MockProvider([
      { type: "tool", name: "bash", args: { command: "rm -rf /" } },
      { type: "text", text: "cannot do that" },
    ])
    const loop = new AgentLoop({ provider, tools: reg, permissions: new PermissionGateway(), verify: passVerify, resolvePermission })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "delete it")
    expect(asked).toBe(true)
    expect(events.some(e => e.type === "permission_requested")).toBe(true)
    expect(provider.requests.length).toBe(1) // deny 后终止循环，不再请求 LLM
    const toolParts = s.messages.flatMap(m => m.parts).filter(p => p.type === "tool")
    expect(toolParts[0]).toMatchObject({ state: "error" })
    const permPart = s.messages.flatMap(m => m.parts).find(p => p.type === "permission")
    expect(permPart).toMatchObject({ decision: "deny" }) // decision 回填
    expect(events.some(e => e.type === "feedback_injected")).toBe(false)
  })
})
