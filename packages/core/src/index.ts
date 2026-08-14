export function coreVersion(): string {
  return "M1"
}

export type {
  Session,
  Message,
  Part,
  TextPart,
  ReasoningPart,
  ToolPart,
  PermissionPart,
  PermissionRequest,
  FeedbackPart,
  ToolResult,
  ContextUsage,
} from "./transcript/types"
export type { SessionEvent } from "./transcript/events"
export { createSession, appendPart } from "./transcript/session"
