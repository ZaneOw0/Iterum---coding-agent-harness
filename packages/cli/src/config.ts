import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"

export interface AgentConfig {
  provider?: string
  model?: string
  effort?: string
  modelCache?: Record<string, string[]>
}

export function configPath(home: string = homedir()): string {
  return join(home, ".iterum", "config.json")
}

export function readConfig(home: string = homedir()): AgentConfig {
  try {
    const p = configPath(home)
    if (!existsSync(p)) return {}
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return {}
  }
}

export function writeConfig(cfg: AgentConfig, home: string = homedir()): void {
  const dir = join(home, ".iterum")
  mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(home), JSON.stringify(cfg, null, 2))
}
