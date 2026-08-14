import type { ChatRequest, LLMEvent, LLMProvider, MockStep } from "./types"

export class MockProvider implements LLMProvider {
  public requests: ChatRequest[] = []
  private cursor = 0
  constructor(private script: MockStep[] | MockStep[][]) {}

  async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
    this.requests.push(req)
    const steps = Array.isArray(this.script[0]) ? (this.script as MockStep[][])[this.cursor++] ?? [] : (this.script as MockStep[])
    for (const s of steps) {
      if (s.type === "text") yield { type: "text_delta", text: s.text }
      else if (s.type === "reasoning") yield { type: "reasoning_delta", text: s.text }
      else yield { type: "tool_call", name: s.name, args: s.args }
    }
    yield { type: "done" }
  }
}
