import type { LLMProvider } from "../llm/types"
import type { ToolRegistry } from "../tools/types"
import { PermissionGateway } from "../permission/gateway"
import { VerifyRunner, formatFeedback } from "../feedback/verify"
import { buildSkillSection, type Skill } from "../memory/skills"
import type { Message, PermissionRequest, Session, ToolPart } from "../transcript/types"
import type { SessionEvent } from "../transcript/events"

export interface AgentDeps {
  provider: LLMProvider
  tools: ToolRegistry
  permissions: PermissionGateway
  verify: VerifyRunner
  resolvePermission: (req: PermissionRequest) => Promise<"allow" | "deny">
  skills?: Skill[]
  maxTurns?: number
  feedbackThreshold?: number
}

export class AgentLoop {
  private maxTurns: number
  private threshold: number
  constructor(private deps: AgentDeps) {
    this.maxTurns = deps.maxTurns ?? 5
    this.threshold = deps.feedbackThreshold ?? 3
  }

  async *run(session: Session, userInput: string): AsyncIterable<SessionEvent> {
    session.feedbackFailures = 0 // 用户回复即重置计数（SPEC §3.5）
    session.messages = [...session.messages, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: userInput }], time: { start: 0, end: 0 } }]

    for (let turn = 0; turn < this.maxTurns; turn++) {
      const assistant: Message = { id: crypto.randomUUID(), role: "assistant", parts: [], time: { start: Date.now(), end: 0 } }
      session.messages = [...session.messages, assistant]
      yield { type: "assistant_started", messageId: assistant.id }

      const req = {
        model: session.model, system: this.systemPrompt(session),
        messages: session.messages.slice(0, -1).map(m => ({ role: m.role, content: this.render(m) })),
      }

      let hadToolCall = false
      let deniedThisTurn = false
      let lastToolName: string | undefined
      let lastFailedSummary = ""
      for await (const ev of this.deps.provider.complete(req)) {
        if (ev.type === "text_delta") {
          const last = assistant.parts.at(-1)
          if (last?.type === "text") last.text += ev.text
          else assistant.parts.push({ type: "text", text: ev.text })
          yield { type: "text_delta", messageId: assistant.id, partId: "", text: ev.text }
        } else if (ev.type === "reasoning_delta") {
          const last = assistant.parts.at(-1)
          if (last?.type === "reasoning") { last.markdown += ev.text; last.time.end = Date.now() }
          else assistant.parts.push({ type: "reasoning", markdown: ev.text, time: { start: Date.now(), end: Date.now() } })
          yield { type: "reasoning_delta", messageId: assistant.id, partId: "", text: ev.text }
        } else if (ev.type === "tool_call") {
          hadToolCall = true
          lastToolName = ev.name
          const part: ToolPart = { type: "tool", tool: ev.name, args: ev.args, state: "running", time: { start: Date.now(), end: 0 } }
          assistant.parts.push(part)
          yield { type: "tool_started", messageId: assistant.id, partId: "", tool: ev.name, args: ev.args }

          const check = this.deps.permissions.check({ name: ev.name, args: ev.args }, session.permissionDecisions)
          if (check.decision === "ask") {
            const request: PermissionRequest = {
              id: crypto.randomUUID(), tool: ev.name, args: ev.args,
              reason: check.rule?.reason ?? "policy", riskLevel: check.rule?.riskLevel ?? "high",
            }
            assistant.parts.push({ type: "permission", request })
            yield { type: "permission_requested", partId: "", request }
            const answer = await this.deps.resolvePermission(request)
            session.permissionDecisions.set(this.deps.permissions.signature({ name: ev.name, args: ev.args }), answer)
            const permPart = assistant.parts.find(p => p.type === "permission")
            if (permPart?.type === "permission") permPart.decision = answer
            if (answer === "deny") {
              part.state = "error"; part.result = { ok: false, output: "denied by user", durationMs: 0 }
              deniedThisTurn = true
              break // 拒绝后终止本轮循环：不重试、不进入反馈闭环（SPEC §3.4/§5.2）
            }
          } else if (check.decision === "deny") {
            part.state = "error"; part.result = { ok: false, output: "denied by policy", durationMs: 0 }
            deniedThisTurn = true
            break
          }

          const tool = this.deps.tools.get(ev.name)
          if (!tool) { part.state = "error"; part.result = { ok: false, output: `unknown tool: ${ev.name}`, durationMs: 0 }; continue }
          part.result = await tool.execute({ name: ev.name, args: ev.args })
          part.state = part.result.ok ? "completed" : "error"
          part.time.end = Date.now()
          yield { type: "tool_completed", messageId: assistant.id, partId: "", result: part.result }
        }
      }
      assistant.time.end = Date.now()

      if (deniedThisTurn) break // 拒绝后的轮次不做验证回灌

      const changed = assistant.parts.filter(p => p.type === "tool" && p.result?.ok).map(p => ({
        path: String((p.args as any).path ?? ""), action: "write" as const,
      }))
      if (changed.length > 0) {
        const feedback = { ...(await this.deps.verify.verify(changed)), tool: lastToolName }
        if (feedback.status === "fail") {
          session.feedbackFailures += 1
          lastFailedSummary = feedback.summary
          assistant.parts.push({ type: "feedback", verifier: feedback.verifier, status: "fail", summary: feedback.summary, failureIndex: session.feedbackFailures, exitCode: feedback.exitCode, tool: feedback.tool })
          yield { type: "feedback_injected", partId: "", verifier: feedback.verifier, status: "fail", summary: feedback.summary, failureIndex: session.feedbackFailures }
          if (session.feedbackFailures >= this.threshold) {
            assistant.parts.push({ type: "text", text: `I've failed verification ${session.feedbackFailures} times in a row. help — please review my attempts:\n${assistant.parts.filter(p => p.type === "tool").map(p => `${(p as ToolPart).tool} ${JSON.stringify((p as ToolPart).args)}`).join("\n")}\nlast failure: ${lastFailedSummary}` })
            break
          }
          continue
        }
      }
      if (!hadToolCall) break
    }
    yield { type: "assistant_completed", messageId: session.messages.at(-1)!.id }
    yield { type: "session_idle" }
  }

  private systemPrompt(session: Session): string {
    return `You are Iterum, a coding agent. cwd: ${session.cwd}. Use tools to act; verification results will be fed back to you.${this.deps.skills?.length ? `\n${buildSkillSection(this.deps.skills)}` : ""}`
  }

  private render(m: Message): string {
    return m.parts.map(p => {
      if (p.type === "text" || p.type === "reasoning") return p.text ?? p.markdown
      if (p.type === "tool") return `[tool:${p.tool}] ${JSON.stringify(p.args)}\n[result] ${p.result?.output ?? "pending"}`
      // SPEC §5.3.2 固定模板 {verifier, exitCode, failureSummary, affectedFiles}；tool 不进入回灌文本（demo2/T9 断言依赖）
      if (p.type === "feedback") return formatFeedback({ verifier: p.verifier, status: p.status, summary: p.summary, affectedFiles: [], exitCode: p.exitCode })
      if (p.type === "permission") return `[permission] ${p.request.tool} ${p.decision ?? "pending"}`
      return ""
    }).join("\n")
  }
}
