import type { Message, Part, Session } from "./types"

export function createSession(opts: { cwd: string; title: string; provider: string; model: string }): Session {
  return {
    id: crypto.randomUUID(), ...opts, createdAt: new Date(), updatedAt: new Date(),
    messages: [],
    contextUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, costUsd: 0, contextPercent: 0 },
    permissionDecisions: new Map(), feedbackFailures: 0,
  }
}

export function appendPart(message: Message, part: Part): Message {
  return { ...message, parts: [...message.parts, part] }
}
