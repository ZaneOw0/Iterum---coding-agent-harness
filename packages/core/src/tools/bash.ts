import type { CommandRunner, Tool, ToolCall } from "./types"

export class BashTool implements Tool {
  name = "bash"; description = "Run a shell command in the workspace"
  constructor(private runner: CommandRunner, private cwd: string = process.cwd()) {}
  async execute(call: ToolCall) {
    const { command } = call.args as { command: string }
    const t = Date.now()
    const { exitCode, output } = await this.runner(command, this.cwd)
    return { ok: exitCode === 0, output, exitCode, durationMs: Date.now() - t }
  }
}
