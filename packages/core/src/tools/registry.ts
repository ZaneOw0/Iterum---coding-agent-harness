import type { Tool } from "./types"
export class ToolRegistry {
  private tools = new Map<string, Tool>()
  register(t: Tool) { this.tools.set(t.name, t) }
  get(name: string) { return this.tools.get(name) }
  list() { return [...this.tools.values()] }
}
