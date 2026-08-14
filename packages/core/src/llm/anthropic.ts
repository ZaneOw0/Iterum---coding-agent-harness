import Anthropic from "@anthropic-ai/sdk"
import type { ChatRequest, LLMEvent, LLMProvider } from "./types"
import { resolveEffort, type EffortLevel, type VendorDef } from "./vendors"

type StreamEvent = {
  type: string
  index?: number
  content_block?: { type: string; name?: string }
  delta?: { type?: string; text?: string; thinking?: string; partial_json?: string }
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic
  constructor(private opts: { apiKey: string; model?: string; baseURL?: string; vendor?: VendorDef; fetchImpl?: typeof fetch }) {
    this.client = new Anthropic({
      apiKey: opts.apiKey, baseURL: opts.baseURL ?? opts.vendor?.baseURL,
      ...(opts.fetchImpl ? { fetch: opts.fetchImpl } : {}),
    })
  }
  async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
    const args: Record<string, unknown> = {
      model: this.opts.model ?? req.model,
      system: req.system,
      max_tokens: req.maxTokens ?? 8192,
      messages: req.messages,
    }
    if (req.tools && req.tools.length > 0) {
      args.tools = req.tools.map(f => ({
        name: f.function.name,
        description: f.function.description ?? "",
        input_schema: f.function.parameters ?? { type: "object", properties: {} },
      }))
    }
    const ep = resolveEffort(this.opts.vendor, this.opts.model ?? req.model, req.effort as EffortLevel | undefined)
    if (ep?.kind === "thinking") args.thinking = { type: "enabled", budget_tokens: ep.budget }
    const stream = await this.client.messages.stream(args as never)
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
