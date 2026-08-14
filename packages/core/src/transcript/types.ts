export type Part = TextPart | ReasoningPart | ToolPart | PermissionPart | FeedbackPart
export interface TextPart { type: "text"; text: string }
export interface ReasoningPart { type: "reasoning"; title?: string; markdown: string; time: { start: number; end: number } }
export interface ToolResult { ok: boolean; output: string; exitCode?: number; durationMs: number }
export interface ToolPart {
  type: "tool"; tool: string; args: Record<string, unknown>
  state: "pending" | "running" | "completed" | "error"
  result?: ToolResult; time: { start: number; end: number }
}
export interface PermissionRequest { id: string; tool: string; args: Record<string, unknown>; reason: string; riskLevel: "low" | "high" }
export interface PermissionPart { type: "permission"; request: PermissionRequest; decision?: "allow" | "deny" }
export interface FeedbackPart { type: "feedback"; verifier: string; status: "pass" | "fail"; summary: string; failureIndex?: number; exitCode?: number; tool?: string }
export interface Message { id: string; role: "user" | "assistant"; parts: Part[]; time: { start: number; end: number } }
export interface ContextUsage { inputTokens: number; outputTokens: number; reasoningTokens: number; costUsd: number; contextPercent: number }
export interface Session {
  id: string; cwd: string; title: string; provider: string; model: string
  createdAt: Date; updatedAt: Date
  messages: Message[]; contextUsage: ContextUsage
  permissionDecisions: Map<string, "allow" | "deny">
  feedbackFailures: number
}
