import net from "node:net"
import tls from "node:tls"
import type { Duplex } from "node:stream"

export interface ProxyTarget { host: string; port: number }

type BodyState =
  | { kind: "headers"; buf: Buffer }
  | { kind: "chunk-size"; buf: Buffer }
  | { kind: "chunk-data"; remaining: number }
  | { kind: "content-length"; remaining: number }
  | { kind: "close" }
  | { kind: "done" }

async function bodyToBuffer(body: BodyInit | null | undefined): Promise<Buffer> {
  if (body === null || body === undefined) return Buffer.alloc(0)
  if (typeof body === "string") return Buffer.from(body, "utf8")
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer())
  return Buffer.from(String(body), "utf8")
}

function collectRequest(input: RequestInfo | URL, init?: RequestInit): { url: URL; method: string; headers: Record<string, string>; body: BodyInit | null | undefined } {
  const src = typeof input === "string" || input instanceof URL ? null : (input as Request)
  const url = new URL(src ? src.url : String(input))
  const headers: Record<string, string> = {}
  const push = (h: HeadersInit | undefined) => {
    if (!h) return
    const rec = h instanceof Headers ? Object.fromEntries(h.entries()) : Array.isArray(h) ? Object.fromEntries(h) : h
    for (const [k, v] of Object.entries(rec)) headers[k.toLowerCase()] = v
  }
  push(src?.headers)
  push(init?.headers)
  return { url, method: init?.method ?? src?.method ?? "GET", headers, body: init?.body ?? src?.body }
}

// 经 HTTP 代理（CONNECT 隧道）发起 https 请求，返回标准 fetch Response。
// Bun 的 fetch 不遵守代理环境变量，且 undici 在 Bun 下被整体替换为 bun:fetch（实测
// ProxyAgent dispatcher 被忽略、请求仍走直连失败），故用 node:net + node:tls 手写隧道：
// CONNECT 握手 → TLS 包裹 → HTTP/1.1 请求；响应体支持 chunked / content-length /
// close 结尾三种成帧，SSE 对话流可用。
export function createProxiedFetch(proxy: ProxyTarget, options?: { rejectUnauthorized?: boolean }): typeof fetch {
  const proxiedFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => new Promise<Response>((resolve, reject) => {
    const { url, method, headers, body } = collectRequest(input, init)

    const socket = net.connect({ host: proxy.host, port: proxy.port })
    socket.setNoDelay(true)
    socket.setTimeout(0)

    let settled = false
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    let state: BodyState = { kind: "headers", buf: Buffer.alloc(0) }
    let tsock: Duplex | null = null

    const finish = (err?: Error) => {
      if (state.kind === "done") return
      if (err) { state = { kind: "done" }; controller?.error(err); socket.destroy(); return }
      state = { kind: "done" }
      controller?.close()
      socket.destroy()
    }

    const fail = (err: Error) => {
      socket.destroy()
      if (!settled) { settled = true; reject(err) }
      else finish(err)
    }

    socket.on("error", fail)
    socket.on("close", () => {
      if (!settled) { settled = true; reject(new Error("proxy closed connection")) }
      else finish(state.kind === "close" || state.kind === "done" ? undefined : new Error("connection closed before response complete"))
    })

    const onAbort = () => { socket.destroy(); if (!settled) { settled = true; reject(new Error("request aborted")) } else finish(new Error("request aborted")) }
    const handshakeTimer = setTimeout(onAbort, 60000)
    const signal = init?.signal
    if (signal) signal.addEventListener("abort", onAbort, { once: true })

    let handshake = ""
    socket.on("data", function onHandshake(d: Buffer) {
      handshake += d.toString("latin1")
      const idx = handshake.indexOf("\r\n\r\n")
      if (idx < 0) return
      socket.removeListener("data", onHandshake)
      socket.removeListener("error", fail)
      const statusLine = handshake.slice(0, idx).split("\r\n")[0] ?? ""
      const leftover = Buffer.from(handshake.slice(idx + 4), "latin1")
      if (!/^HTTP\/1\.[01] 2\d\d/.test(statusLine)) return fail(new Error(`proxy CONNECT failed: ${statusLine}`))

      let sock: Duplex
      try {
        sock = tls.connect({
          socket: socket as unknown as Duplex,
          servername: /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ? undefined : url.hostname,
          rejectUnauthorized: options?.rejectUnauthorized ?? true,
        })
      } catch (e) { return fail(e instanceof Error ? e : new Error(String(e))) }
      tsock = sock
      sock.on("error", fail)

      const enqueue = (chunk: Uint8Array) => { if (controller && state.kind !== "done") controller.enqueue(chunk) }

      const parseHeaders = (buf: Buffer): Buffer | undefined => {
        const s = buf.toString("latin1")
        const idx = s.indexOf("\r\n\r\n")
        if (idx < 0) { state = { kind: "headers", buf }; return undefined }
        const lines = s.slice(0, idx).split("\r\n")
        const code = Number((lines[0] ?? "").match(/^HTTP\/1\.[01] (\d{3})/)?.[1] ?? 0)
        const respHeaders = new Headers()
        let contentLength: number | undefined
        let chunked = false
        for (const line of lines.slice(1)) {
          const ci = line.indexOf(":")
          if (ci < 0) continue
          const k = line.slice(0, ci).trim().toLowerCase()
          const v = line.slice(ci + 1).trim()
          respHeaders.append(k, v)
          if (k === "content-length") contentLength = Number(v)
          if (k === "transfer-encoding" && v.toLowerCase().includes("chunked")) chunked = true
        }
        const noBody = (method === "HEAD" || code === 204 || code === 304) && !chunked && contentLength === undefined
        state = noBody
          ? { kind: "done" }
          : chunked ? { kind: "chunk-size", buf: Buffer.alloc(0) }
          : contentLength !== undefined && Number.isFinite(contentLength) ? { kind: "content-length", remaining: contentLength }
          : { kind: "close" }

        const bodyStream = new ReadableStream<Uint8Array>({
          start(c) { controller = c },
          cancel() { if (state.kind !== "done") finish() },
        })
        settled = true
        clearTimeout(handshakeTimer)
        resolve(new Response(state.kind === "done" ? null : bodyStream, { status: code || 200, headers: respHeaders }))
        return buf.subarray(idx + 4)
      }

      const feedBody = (chunk: Buffer) => {
        if (chunk.length === 0 || state.kind === "done") return
        if (state.kind === "close") { enqueue(chunk); return }
        if (state.kind === "content-length") {
          const take = Math.min(state.remaining, chunk.length)
          if (take > 0) enqueue(chunk.subarray(0, take))
          state.remaining -= take
          if (state.remaining <= 0) finish()
          return
        }
        // chunked：先解析 16 进制长度行，再按块消费；剩余字节在循环内继续
        let buf = state.kind === "chunk-size" ? Buffer.concat([state.buf, chunk]) : chunk
        let remaining = state.kind === "chunk-data" ? state.remaining : 0
        for (;;) {
          if (remaining === 0) {
            const idx = buf.indexOf("\r\n")
            if (idx < 0) { state = { kind: "chunk-size", buf }; return }
            const hex = buf.subarray(0, idx).toString("latin1").split(";")[0]?.trim() ?? ""
            const size = parseInt(hex, 16)
            buf = buf.subarray(idx + 2)
            if (!Number.isFinite(size) || size === 0) {
              // 终止块：丢弃 trailer（若有），正文到此为止
              finish()
              return
            }
            remaining = size
          }
          if (buf.length < remaining + 2) {
            state = { kind: "chunk-data", remaining: remaining - buf.length }
            if (buf.length > 0) enqueue(buf)
            return
          }
          enqueue(buf.subarray(0, remaining))
          buf = buf.subarray(remaining + 2)
          remaining = 0
        }
      }

      const feed = (chunk: Buffer) => {
        if (state.kind === "headers") {
          const rest = parseHeaders(Buffer.concat([state.buf, chunk]))
          if (rest === undefined) return
          feedBody(rest)
          return
        }
        feedBody(chunk)
      }

      sock.on("data", feed)
      if (leftover.length > 0) socket.unshift(leftover)

      void (async () => {
        try {
          const bodyBuf = await bodyToBuffer(body)
          if (sock.destroyed) return
          if (bodyBuf.length > 0 && headers["content-length"] === undefined) headers["content-length"] = String(bodyBuf.length)
          headers["host"] = url.host
          headers["connection"] = "close"
          delete headers["transfer-encoding"]
          const headerLines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")
          const head = `${method} ${url.pathname}${url.search} HTTP/1.1\r\n${headerLines}\r\n\r\n`
          sock.write(head)
          if (bodyBuf.length > 0) sock.write(bodyBuf)
        } catch (e) { fail(e instanceof Error ? e : new Error(String(e))) }
      })()
    })

    socket.write(`CONNECT ${url.hostname}:${url.port || 443} HTTP/1.1\r\nHost: ${url.hostname}:${url.port || 443}\r\nProxy-Connection: keep-alive\r\n\r\n`)
  })
  Object.assign(proxiedFetch, { preconnect: (_url: string) => {} })
  return proxiedFetch as typeof fetch
}
