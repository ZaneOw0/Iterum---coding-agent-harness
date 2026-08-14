import type { ToolResult } from "../transcript/types"
export interface ToolCall { name: string; args: Record<string, unknown> }
export interface Tool {
  name: string; description: string
  // OpenAI function 格式参数 schema（供 LLM 工具调用）
  parameters?: Record<string, unknown>
  execute(call: ToolCall): Promise<ToolResult>
}
export type CommandRunner = (cmd: string, cwd: string) => Promise<{ exitCode: number; output: string }>
