import type { VendorDef } from "./vendors"

const OPENAI_DEFAULT = "https://api.openai.com/v1"
const ANTHROPIC_MODELS = "https://api.anthropic.com/v1/models"

export async function fetchModels(vendor: VendorDef, apiKey: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<string[]> {
  const base = vendor.modelsUrl ?? (vendor.flavor === "anthropic" ? ANTHROPIC_MODELS : `${vendor.baseURL ?? OPENAI_DEFAULT}/models`)
  const headers = new Headers(vendor.flavor === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { Authorization: `Bearer ${apiKey}` })
  const res = await fetchImpl(base, { headers })
  if (!res.ok) throw new Error(`model list request failed: ${res.status}`)
  const json = await res.json() as { data?: { id?: string }[] }
  const ids = (json?.data ?? []).map(m => m.id).filter((x): x is string => typeof x === "string")
  const filtered = ids.filter(id =>
    (vendor.allowPrefixes.length === 0 || vendor.allowPrefixes.some(p => id.startsWith(p))) &&
    !vendor.denyPrefixes.some(p => id.startsWith(p)))
  return filtered.sort()
}
