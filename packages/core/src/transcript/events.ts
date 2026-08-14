import type { PermissionRequest, ToolResult } from "./types"

export type SessionEvent =
  | { type: "assistant_started"; messageId: string }
  | { type: "text_delta"; messageId: string; partId: string; text: string }
  | { type: "reasoning_delta"; messageId: string; partId: string; title?: string; text: string }
  | { type: "tool_started"; messageId: string; partId: string; tool: string; args: Record<string, unknown> }
  | { type: "tool_completed"; messageId: string; partId: string; result: ToolResult }
  | { type: "permission_requested"; partId: string; request: PermissionRequest }
  | { type: "feedback_injected"; partId: string; verifier: string; status: "pass" | "fail"; summary: string; failureIndex: number }
  | { type: "assistant_completed"; messageId: string }
  | { type: "session_idle" }
