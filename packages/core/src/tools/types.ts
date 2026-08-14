import type { ToolResult } from "../transcript/types"
export interface ToolCall { name: string; args: Record<string, unknown> }
export interface Tool {
  name: string; description: string
  execute(call: ToolCall): Promise<ToolResult>
}
export type CommandRunner = (cmd: string, cwd: string) => Promise<{ exitCode: number; output: string }>
