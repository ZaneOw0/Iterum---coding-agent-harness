import Anthropic from "@anthropic-ai/sdk"
import type { ChatRequest, LLMEvent, LLMProvider } from "./types"

type StreamEvent = {
  type: string
  index?: number
  content_block?: { type: string; name?: string }
  delta?: { type?: string; text?: string; thinking?: string; partial_json?: string }
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic
  constructor(private opts: { apiKey: string; model?: string; baseURL?: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL })
  }
  async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
    const stream = await this.client.messages.stream({
      model: this.opts.model ?? req.model,
      system: req.system,
      max_tokens: req.maxTokens ?? 4096,
      messages: req.messages,
    })
    const toolBlocks = new Map<number, { name: string; json: string }>()
    for await (const event of stream as AsyncIterable<StreamEvent>) {
      if (event.type === "content_block_delta") {
        const delta = event.delta
        if (delta?.type === "text_delta" && delta.text) yield { type: "text_delta", text: delta.text }
        else if (delta?.type === "thinking_delta" && delta.thinking) yield { type: "reasoning_delta", text: delta.thinking }
        else if (delta?.type === "input_json_delta" && event.index !== undefined) {
          const block = toolBlocks.get(event.index) ?? { name: "", json: "" }
          block.json += delta.partial_json ?? ""
          toolBlocks.set(event.index, block)
        }
      } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use" && event.index !== undefined) {
        toolBlocks.set(event.index, { name: event.content_block.name ?? "", json: "" })
      }
    }
    for (const block of toolBlocks.values()) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(block.json) } catch {}
      yield { type: "tool_call", name: block.name, args }
    }
    yield { type: "done" }
  }
}
