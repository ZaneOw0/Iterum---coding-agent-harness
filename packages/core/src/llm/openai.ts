import OpenAI from "openai"
import type { ChatRequest, LLMEvent, LLMProvider } from "./types"

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  constructor(private opts: { apiKey: string; model?: string; baseURL?: string }) {
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL })
  }
  async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
    const stream = await this.client.chat.completions.create({
      model: this.opts.model ?? req.model, stream: true,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield { type: "text_delta", text: delta }
    }
    yield { type: "done" }
  }
}
