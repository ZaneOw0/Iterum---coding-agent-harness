import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Session } from "../transcript/types"

export interface SessionSummary { id: string; title: string; updatedAt: Date }

export class SessionStore {
  constructor(private dir: string) { mkdirSync(dir, { recursive: true }) }
  private path(id: string) { return join(this.dir, `${id}.json`) }

  save(session: Session): void {
    session.updatedAt = new Date()
    writeFileSync(this.path(session.id), JSON.stringify({ ...session, permissionDecisions: [...session.permissionDecisions] }, null, 2))
  }
  load(id: string): Session | undefined {
    try {
      const raw = JSON.parse(readFileSync(this.path(id), "utf8"))
      raw.permissionDecisions = new Map(raw.permissionDecisions)
      raw.createdAt = new Date(raw.createdAt)
      raw.updatedAt = new Date(raw.updatedAt)
      return raw as Session
    } catch { return undefined }
  }
  list(): SessionSummary[] {
    if (!existsSync(this.dir)) return []
    const out: SessionSummary[] = []
    for (const f of readdirSync(this.dir).filter(f => f.endsWith(".json"))) {
      const s = this.load(f.slice(0, -5))
      if (s) out.push({ id: s.id, title: s.title, updatedAt: s.updatedAt })
    }
    return out
  }
}
