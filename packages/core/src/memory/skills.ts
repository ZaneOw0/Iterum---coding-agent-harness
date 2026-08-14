import { readdirSync, readFileSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"
import type { Tool, ToolCall } from "../tools/types"
import type { ToolResult } from "../transcript/types"

export interface Skill { name: string; description: string; body: string; source: "global" | "project" }

export class SkillCatalog {
  static discover(globalDir: string, projectDir: string): Skill[] {
    const byName = new Map<string, Skill>()
    for (const s of SkillCatalog.scan(globalDir, "global")) byName.set(s.name, s)
    for (const s of SkillCatalog.scan(projectDir, "project")) byName.set(s.name, s)
    return [...byName.values()]
  }
  private static scan(dir: string, source: "global" | "project"): Skill[] {
    if (!existsSync(dir)) return []
    const out: Skill[] = []
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (!statSync(p).isDirectory()) continue
      const skillFile = join(p, "SKILL.md")
      if (!existsSync(skillFile)) continue
      const raw = readFileSync(skillFile, "utf8")
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
      if (!fm) continue
      const meta: Record<string, string> = {}
      for (const line of fm[1]!.split(/\r?\n/)) {
        const m = line.match(/^([a-zA-Z_]+):\s*(.*?)\r?$/)
        if (m && m[1]) meta[m[1]] = m[2] ?? ""
      }
      if (!meta.name) continue
      out.push({ name: meta.name, description: meta.description ?? "", body: fm[2]!, source })
    }
    return out
  }
}

export function buildSkillSection(skills: Skill[]): string {
  if (skills.length === 0) return ""
  return "## Skills\n" + skills.map(s => `- ${s.name}: ${s.description}`).join("\n")
}

export class ReadSkillTool implements Tool {
  name = "read_skill"
  description = "Read the full body of a registered skill by name"
  parameters = { type: "object", properties: { name: { type: "string" } }, required: ["name"] }
  constructor(private skills: Skill[]) {}
  async execute(call: ToolCall): Promise<ToolResult> {
    const { name } = call.args as { name: string }
    const t = Date.now()
    const skill = this.skills.find(s => s.name === name)
    if (!skill) return { ok: false, output: `unknown skill: ${name}`, durationMs: Date.now() - t }
    return { ok: true, output: skill.body, durationMs: Date.now() - t }
  }
}
