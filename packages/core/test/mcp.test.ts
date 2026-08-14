import { describe, expect, test } from "bun:test"
import { MCPClient } from "../src/mcp/client"
import { join } from "node:path"

describe("MCPClient", () => {
  test("connects to fake stdio server and bridges echo tool", async () => {
    const client = new MCPClient()
    await client.start({ command: "bun", args: [join(import.meta.dir, "fixtures", "fake-mcp-server.ts")] })
    const tools = client.tools()
    expect(tools.some(t => t.name === "echo")).toBe(true)
    const result = await client.callTool("echo", { message: "ping" })
    expect(result.ok).toBe(true)
    expect(result.output).toContain("ping")
    await client.stop()
  }, 15000)
})
