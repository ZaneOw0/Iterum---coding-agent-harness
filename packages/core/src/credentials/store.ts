import { Entry } from "@napi-rs/keyring"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export interface ProviderCredential { key: string; source: "keychain" | "env" }
const SERVICE = "iterum"

export class CredentialStore {
  constructor(private opts: { envDir?: string; envFile?: string } = {}) {}
  private entry(provider: string) { return new Entry(SERVICE, provider) }

  async set(provider: "openai" | "anthropic", key: string): Promise<void> {
    this.entry(provider).setPassword(key)
  }
  async remove(provider: "openai" | "anthropic"): Promise<void> {
    this.entry(provider).deletePassword()
  }
  async get(provider: "openai" | "anthropic"): Promise<ProviderCredential | undefined> {
    const stored = this.entry(provider).getPassword()
    if (stored) return { key: stored, source: "keychain" }
    const env = this.loadEnv()
    const envKey = env[`ITERUM_${provider.toUpperCase()}_API_KEY`]
    if (envKey) return { key: envKey, source: "env" }
    return undefined
  }
  private loadEnv(): Record<string, string> {
    const path = this.opts.envDir
      ? join(this.opts.envDir, this.opts.envFile ?? ".env")
      : join(process.cwd(), ".env")
    if (!existsSync(path)) return {}
    const out: Record<string, string> = {}
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2]
    }
    return out
  }
}

export { maskKey } from "./redacted"
