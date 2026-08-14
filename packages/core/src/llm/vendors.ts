export type EffortLevel = "low" | "medium" | "high" | "max"

export interface VendorEffort {
  kind: "reasoning_effort" | "thinking_budget" | "enable_thinking"
  values: Record<EffortLevel, string | number | boolean>
  modelAllowlist?: string[]
}

export interface VendorDef {
  id: string
  name: string
  flavor: "openai" | "anthropic"
  baseURL?: string
  modelsUrl?: string
  allowPrefixes: string[]
  denyPrefixes: string[]
  effort?: VendorEffort
}

const OE = { kind: "reasoning_effort" as const, values: { low: "minimal", medium: "low", high: "medium", max: "high" } }

export const VENDORS: Record<string, VendorDef> = {
  openai: { id: "openai", name: "OpenAI", flavor: "openai", baseURL: "https://api.openai.com/v1", allowPrefixes: [], denyPrefixes: ["whisper-", "tts-", "dall-e-", "text-embedding-", "gpt-4o-audio-", "omni-moderation"], effort: { ...OE, modelAllowlist: ["o1-", "o3-", "o4-", "gpt-5"] } },
  anthropic: { id: "anthropic", name: "Anthropic", flavor: "anthropic", allowPrefixes: ["claude-"], denyPrefixes: [], effort: { kind: "thinking_budget", values: { low: 8192, medium: 16384, high: 24576, max: 32768 }, modelAllowlist: ["claude-3-7-", "claude-sonnet-4", "claude-opus-4"] } },
  gemini: { id: "gemini", name: "Google Gemini", flavor: "openai", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", allowPrefixes: ["gemini-"], denyPrefixes: [], effort: { ...OE, modelAllowlist: ["gemini-3"] } },
  grok: { id: "grok", name: "xAI Grok", flavor: "openai", baseURL: "https://api.x.ai/v1", allowPrefixes: ["grok-"], denyPrefixes: [], effort: { ...OE, modelAllowlist: ["grok-4", "grok-3"] } },
  moonshot: { id: "moonshot", name: "Moonshot Kimi", flavor: "openai", baseURL: "https://api.moonshot.cn/v1", allowPrefixes: ["kimi-", "moonshot-v1-"], denyPrefixes: [] },
  deepseek: { id: "deepseek", name: "DeepSeek", flavor: "openai", baseURL: "https://api.deepseek.com", allowPrefixes: ["deepseek-"], denyPrefixes: [] },
  zhipu: { id: "zhipu", name: "智谱 GLM", flavor: "openai", baseURL: "https://open.bigmodel.cn/api/paas/v4", allowPrefixes: ["glm-"], denyPrefixes: [] },
  qwen: { id: "qwen", name: "阿里通义千问", flavor: "openai", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", allowPrefixes: ["qwen-"], denyPrefixes: [], effort: { kind: "enable_thinking", values: { low: 1024, medium: 4096, high: 16384, max: 32768 }, modelAllowlist: ["qwen3"] } },
}

export function getVendor(id: string): VendorDef | undefined {
  return VENDORS[id]
}

export type EffortParam =
  | { kind: "reasoning_effort"; value: string }
  | { kind: "thinking"; budget: number }
  | { kind: "enable_thinking"; budget: number }

export function resolveEffort(vendor: VendorDef | undefined, model: string | undefined, effort: EffortLevel | undefined): EffortParam | undefined {
  if (!vendor?.effort || !effort) return undefined
  if (vendor.effort.modelAllowlist && !(model && vendor.effort.modelAllowlist.some(p => model.startsWith(p)))) return undefined
  const value = vendor.effort.values[effort]
  if (value === undefined) return undefined
  if (vendor.effort.kind === "reasoning_effort") return { kind: "reasoning_effort", value: String(value) }
  if (vendor.effort.kind === "thinking_budget") return { kind: "thinking", budget: Number(value) }
  return { kind: "enable_thinking", budget: Number(value) }
}
