import { PermissionGateway } from "@iterum/core/permission/gateway"
import { MockProvider } from "@iterum/core/llm/mock"
import { AgentLoop } from "@iterum/core/agent/loop"
import { ToolRegistry } from "@iterum/core/tools/registry"
import { BashTool } from "@iterum/core/tools/bash"
import { VerifyRunner } from "@iterum/core/feedback/verify"
import { createSession } from "@iterum/core/transcript/session"

const registry = new ToolRegistry()
registry.register(new BashTool(async () => ({ exitCode: 0, output: "SHOULD NOT RUN", durationMs: 0 })))

let requests = 0
const provider = new MockProvider([
  { type: "tool", name: "bash", args: { command: "rm -rf /" } },
  { type: "text", text: "that was blocked; I will ask for guidance." },
])
const loop = new AgentLoop({
  provider, tools: registry,
  permissions: new PermissionGateway(),
  verify: new VerifyRunner("test", async () => ({ exitCode: 0, output: "ok" })),
  resolvePermission: async (req) => { requests++; return "deny" },
})
const session = createSession({ cwd: process.cwd(), title: "demo1", provider: "mock", model: "mock" })
const events: any[] = []
for await (const e of loop.run(session, "wipe everything")) events.push(e)

const assert = (cond: boolean, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exit(1) } }
assert(requests === 1, `guardrail asked exactly once, got ${requests}`)
assert(events.some(e => e.type === "permission_requested"), "permission_requested event emitted")
const toolPart = session.messages.flatMap(m => m.parts).find(p => p.type === "tool")
assert(toolPart?.result?.output.includes("denied"), "tool result records denial")
assert(!events.some(e => e.type === "feedback_injected"), "denied action must not enter feedback loop")
console.log("PASS demo1: guardrail intercepted dangerous action")
