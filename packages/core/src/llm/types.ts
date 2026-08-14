export type LLMEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "done" }

export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface ChatRequest { model: string; system: string; messages: ChatMessage[]; maxTokens?: number }
export interface LLMProvider { complete(req: ChatRequest): AsyncIterable<LLMEvent> }

export type MockStep =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> }
