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
export { OpenAIProvider } from "./llm/openai"
export { AnthropicProvider } from "./llm/anthropic"

export { CredentialStore, maskKey } from "./credentials/store"
export type { ProviderCredential } from "./credentials/store"

export { SessionStore } from "./session/store"
export type { SessionSummary } from "./session/store"

export { VerifyRunner, formatFeedback } from "./feedback/verify"
export type { ChangedFile, Feedback } from "./feedback/types"

export { MCPClient } from "./mcp/client"
export type { MCPClientConfig } from "./mcp/client"
