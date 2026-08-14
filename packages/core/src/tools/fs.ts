import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { Tool, ToolCall } from "./types"

export class ReadFileTool implements Tool {
  name = "read_file"; description = "Read a file from the workspace"
  async execute(call: ToolCall) {
    const { path } = call.args as { path: string }
    const t = Date.now()
    if (!existsSync(path)) return { ok: false, output: `File not found: ${path}`, durationMs: Date.now() - t }
    return { ok: true, output: readFileSync(path, "utf8"), durationMs: Date.now() - t }
  }
}

export class WriteFileTool implements Tool {
  name = "write_file"; description = "Write content to a file (creating dirs as needed)"
  async execute(call: ToolCall) {
    const { path, content } = call.args as { path: string; content: string }
    const t = Date.now()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    return { ok: true, output: `Wrote ${path}`, durationMs: Date.now() - t }
  }
}
