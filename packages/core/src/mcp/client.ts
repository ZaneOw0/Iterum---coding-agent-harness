import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import type { Tool } from "../tools/types"
import type { ToolResult } from "../transcript/types"

export interface MCPClientConfig {
  command: string
  args: string[]
}

export class MCPClient {
  private client?: Client
  private transport?: StdioClientTransport
  private tools_: Tool[] = []

  async start(config: MCPClientConfig): Promise<void> {
    this.transport = new StdioClientTransport({ command: config.command, args: config.args })
    this.client = new Client({ name: "iterum", version: "0.1.0" })
    await this.client.connect(this.transport)
    const { tools } = await this.client.listTools()
    this.tools_ = tools.map(t => ({
      name: t.name,
      description: t.description ?? "",
      execute: (call) => this.callTool(call.name, call.args),
    }))
  }

  tools(): Tool[] {
    return [...this.tools_]
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.client) throw new Error("MCP client not started")
    const t = Date.now()
    const res = await this.client.callTool({ name, arguments: args })
    const text = (Array.isArray(res.content) ? res.content : [])
      .filter((c): c is { type: "text"; text: string } => (c as { type?: string }).type === "text")
      .map(c => c.text)
      .join("\n")
    return { ok: res.isError !== true, output: text, durationMs: Date.now() - t }
  }

  async stop(): Promise<void> {
    await this.client?.close()
    this.client = undefined
    this.transport = undefined
    this.tools_ = []
  }
}
