export type LLMEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "done" }

export interface ChatMessage { role: "user" | "assistant"; content: string }

// OpenAI function 工具格式；anthropic 格式由 anthropic.ts 内部转换
export interface OpenAITool {
  type: "function"
  function: { name: string; description?: string; parameters?: Record<string, unknown> }
}

export interface ChatRequest { model: string; system: string; messages: ChatMessage[]; maxTokens?: number; effort?: string; tools?: OpenAITool[] }
export interface LLMProvider { complete(req: ChatRequest): AsyncIterable<LLMEvent> }

export type MockStep =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> }
