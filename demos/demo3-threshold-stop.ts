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

// flat 脚本：每轮都编辑→验证失败，直到阈值 3 停手
const provider = new MockProvider([
  { type: "tool", name: "edit_file", args: { path: "src/a.ts" } },
  { type: "text", text: "attempt" },
])
const alwaysFail = new VerifyRunner("test", async () => ({ exitCode: 1, output: "FAIL a.test.ts" }))
const loop = new AgentLoop({
  provider, tools: registry, permissions: new PermissionGateway(), verify: alwaysFail,
  resolvePermission: async () => "allow",
})
const session = createSession({ cwd: process.cwd(), title: "demo3", provider: "mock", model: "mock" })
const events: any[] = []
for await (const e of loop.run(session, "make it pass")) events.push(e)

const assert = (cond: boolean, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exit(1) } }
assert(session.feedbackFailures === 3, `threshold reached at 3, got ${session.feedbackFailures}`)
const lastMsg = session.messages.at(-1)!
assert(lastMsg.parts.some(p => p.type === "text" && p.text.includes("help")), "help request emitted on threshold stop")
assert(events.at(-1)?.type === "session_idle", "ends with session_idle")
console.log("PASS demo3: threshold stop after 3 consecutive failures")
