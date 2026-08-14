// 极简 MCP stdio JSON-RPC server：initialize / tools/list / tools/call
// 支持两种帧协议：SDK 新版 NDJSON（行分隔）与经典 Content-Length 头 + 空行 + JSON body
const MAX_FRAME_BYTES = 10 * 1024 * 1024
let pending = Buffer.alloc(0)

type FrameFormat = "ndjson" | "content-length"

function nextFrame(): { format: FrameFormat; message: unknown } | null {
  const sep = pending.indexOf("\r\n\r\n")
  if (sep !== -1) {
    const headerText = pending.subarray(0, sep).toString("utf8")
    const m = /Content-Length:\s*(\d+)/i.exec(headerText)
    if (m) {
      const bodyLen = Number(m[1])
      const bodyStart = sep + 4
      if (pending.length >= bodyStart + bodyLen) {
        const body = JSON.parse(pending.subarray(bodyStart, bodyStart + bodyLen).toString("utf8"))
        pending = pending.subarray(bodyStart + bodyLen)
        return { format: "content-length", message: body }
      }
      return null
    }
  }
  const nl = pending.indexOf("\n")
  if (nl !== -1) {
    const line = pending.subarray(0, nl).toString("utf8").replace(/\r$/, "")
    pending = pending.subarray(nl + 1)
    if (line.trim() === "") return nextFrame()
    return { format: "ndjson", message: JSON.parse(line) }
  }
  return null
}

function respond(msg: unknown, format: FrameFormat): void {
  const body = JSON.stringify(msg)
  process.stdout.write(
    format === "ndjson" ? `${body}\n` : `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
  )
}

interface RpcRequest {
  jsonrpc?: string
  id?: number | string | null
  method: string
  params?: Record<string, unknown>
}

function handle(req: RpcRequest, format: FrameFormat): void {
  switch (req.method) {
    case "initialize":
      respond(
        {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            protocolVersion: req.params?.protocolVersion ?? "2025-06-18",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "fake-mcp-server", version: "0.0.1" },
          },
        },
        format
      )
      break
    case "notifications/initialized":
      break
    case "ping":
      respond({ jsonrpc: "2.0", id: req.id, result: {} }, format)
      break
    case "tools/list":
      respond(
        {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            tools: [
              {
                name: "echo",
                description: "Echoes the provided arguments back",
                inputSchema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            ],
          },
        },
        format
      )
      break
    case "tools/call":
      respond(
        {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            content: [
              {
                type: "text",
                text: `echo: ${JSON.stringify(req.params?.arguments ?? {})}`,
              },
            ],
            isError: false,
          },
        },
        format
      )
      break
    default:
      respond(
        {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32601, message: `unknown method ${req.method}` },
        },
        format
      )
  }
}

async function main(): Promise<void> {
  for await (const chunk of process.stdin) {
    pending = Buffer.concat([pending, Buffer.from(chunk as Uint8Array)])
    let frame: { format: FrameFormat; message: unknown } | null
    while ((frame = nextFrame()) !== null) handle(frame.message as RpcRequest, frame.format)
    if (pending.length > MAX_FRAME_BYTES) throw new Error("frame too large")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
