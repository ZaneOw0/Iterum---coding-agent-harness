import OpenAI from "openai"
import type { ChatRequest, LLMEvent, LLMProvider } from "./types"
import { resolveEffort, type EffortLevel, type VendorDef } from "./vendors"

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  constructor(private opts: { apiKey: string; model?: string; baseURL?: string; vendor?: VendorDef }) {
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL ?? opts.vendor?.baseURL })
  }
  async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
    const create: Record<string, unknown> = {
      model: this.opts.model ?? req.model, stream: true,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    }
    const ep = resolveEffort(this.opts.vendor, this.opts.model ?? req.model, req.effort as EffortLevel | undefined)
    if (ep?.kind === "reasoning_effort") create.reasoning_effort = ep.value
    if (ep?.kind === "enable_thinking") create.extra_body = { enable_thinking: true, thinking_budget: ep.budget }
    const stream = (await this.client.chat.completions.create(create as never)) as unknown as AsyncIterable<{ choices?: { delta?: { content?: string; reasoning_content?: string } }[] }>
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta
      if (delta?.reasoning_content) yield { type: "reasoning_delta", text: delta.reasoning_content }
      if (delta?.content) yield { type: "text_delta", text: delta.content }
    }
    yield { type: "done" }
  }
}
