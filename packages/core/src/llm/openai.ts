import OpenAI from "openai"
import type { ChatRequest, LLMEvent, LLMProvider } from "./types"
import { resolveEffort, type EffortLevel, type VendorDef } from "./vendors"

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  constructor(private opts: { apiKey: string; model?: string; baseURL?: string; vendor?: VendorDef; fetchImpl?: typeof fetch }) {
    this.client = new OpenAI({
      apiKey: opts.apiKey, baseURL: opts.baseURL ?? opts.vendor?.baseURL,
      ...(opts.fetchImpl ? { fetch: opts.fetchImpl } : {}),
    })
  }
  async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
    const create: Record<string, unknown> = {
      model: this.opts.model ?? req.model, stream: true,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    }
    if (req.tools && req.tools.length > 0) create.tools = req.tools
    const ep = resolveEffort(this.opts.vendor, this.opts.model ?? req.model, req.effort as EffortLevel | undefined)
    if (ep?.kind === "reasoning_effort") create.reasoning_effort = ep.value
    if (ep?.kind === "enable_thinking") create.extra_body = { enable_thinking: true, thinking_budget: ep.budget }
    const stream = (await this.client.chat.completions.create(create as never)) as unknown as AsyncIterable<{
      choices?: { delta?: { content?: string; reasoning_content?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[]
    }>
    const toolAcc = new Map<number, { id: string; name: string; argsJson: string }>()
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta
      if (delta?.reasoning_content) yield { type: "reasoning_delta", text: delta.reasoning_content }
      if (delta?.content) yield { type: "text_delta", text: delta.content }
      for (const tc of delta?.tool_calls ?? []) {
        const idx = tc.index ?? 0
        const acc = toolAcc.get(idx) ?? { id: "", name: "", argsJson: "" }
        if (tc.id) acc.id = tc.id
        if (tc.function?.name) acc.name = tc.function.name
        if (tc.function?.arguments) acc.argsJson += tc.function.arguments
        toolAcc.set(idx, acc)
      }
    }
    for (const [, acc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(acc.argsJson) } catch {}
      yield { type: "tool_call", name: acc.name, args }
    }
    yield { type: "done" }
  }
}
