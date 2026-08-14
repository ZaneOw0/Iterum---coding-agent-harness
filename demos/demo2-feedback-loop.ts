import { PermissionGateway } from "@iterum/core/permission/gateway"
import { MockProvider } from "@iterum/core/llm/mock"
import { AgentLoop } from "@iterum/core/agent/loop"
import { ToolRegistry } from "@iterum/core/tools/registry"
import { VerifyRunner } from "@iterum/core/feedback/verify"
import { createSession } from "@iterum/core/transcript/session"
import type { Tool } from "@iterum/core/tools/types"

const editTool: Tool = {
  name: "edit_file", description: "edit",
  execute: async () => ({ ok: true, output: "edited", durationMs: 1 }),
}
const registry = new ToolRegistry()
registry.register(editTool)

// 第 1 轮：编辑文件（触发验证失败）；第 2 轮：读到失败反馈后调用修复工具
const provider = new MockProvider([
  [{ type: "tool", name: "edit_file", args: { path: "src/auth.ts" } }, { type: "text", text: "edited" }],
  [{ type: "tool", name: "edit_file", args: { path: "src/auth.ts" } }, { type: "text", text: "fixed for real" }],
])
const failOnce = new VerifyRunner("test", async () => ({ exitCode: 1, output: "FAIL auth.test.ts: expected 1, got 2" }))
const loop = new AgentLoop({
  provider, tools: registry, permissions: new PermissionGateway(), verify: failOnce,
  resolvePermission: async () => "allow",
})
const session = createSession({ cwd: process.cwd(), title: "demo2", provider: "mock", model: "mock" })
const events: any[] = []
for await (const e of loop.run(session, "fix the test")) events.push(e)

const assert = (cond: boolean, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exit(1) } }
const secondRequest = provider.requests[1]
assert(secondRequest !== undefined, "agent made a second request")
assert(secondRequest.messages.some(m => m.content.includes("[feedback] verifier=test status=fail exitCode=1")), "feedback summary injected into next request")
assert(secondRequest.messages.some(m => m.content.includes("FAIL auth.test.ts")), "failure detail visible in feedback")
assert(events.some(e => e.type === "feedback_injected"), "feedback_injected event emitted")
const toolCalls = session.messages.flatMap(m => m.parts).filter(p => p.type === "tool")
assert(toolCalls.length === 2, `agent acted twice (edit, then fix), got ${toolCalls.length}`)
console.log("PASS demo2: feedback loop drove the agent's next action")
