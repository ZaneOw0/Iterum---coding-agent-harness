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
export type { LLMEvent, ChatMessage, ChatRequest, LLMProvider, MockStep } from "./llm/types"
export { MockProvider } from "./llm/mock"

export type { Tool, ToolCall, CommandRunner } from "./tools/types"
export { ToolRegistry } from "./tools/registry"
export { ReadFileTool, WriteFileTool } from "./tools/fs"
export { BashTool } from "./tools/bash"
