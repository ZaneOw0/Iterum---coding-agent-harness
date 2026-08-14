import { describe, expect, test } from "bun:test"
import { createBodyDecoder } from "../src/llm/proxy"

function collect(framing: Parameters<typeof createBodyDecoder>[0]) {
  const chunks: string[] = []
  let done = false
  const decoder = createBodyDecoder(framing, (c: Uint8Array) => chunks.push(Buffer.from(c).toString("utf8")), () => { done = true })
  return { decoder, get text() { return chunks.join("") }, get done() { return done } }
}

const FULL_STREAM = "5\r\nhello\r\n3\r\nabc\r\n0\r\n\r\n"

describe("createBodyDecoder (chunked)", () => {
  test("单个 chunk 一次到达", () => {
    const c = collect({ kind: "chunked" })
    c.decoder.feed(Buffer.from(FULL_STREAM))
    expect(c.text).toBe("helloabc")
    expect(c.done).toBe(true)
  })

  test("逐字节喂入（CRLF 任意分裂）", () => {
    const c = collect({ kind: "chunked" })
    for (const b of Buffer.from(FULL_STREAM)) c.decoder.feed(Buffer.from([b]))
    expect(c.text).toBe("helloabc")
    expect(c.done).toBe(true)
  })

  test("chunk 数据与 CRLF 跨数据块分裂", () => {
    const c = collect({ kind: "chunked" })
    c.decoder.feed(Buffer.from("5\r\nhel"))
    c.decoder.feed(Buffer.from("lo\r"))
    c.decoder.feed(Buffer.from("\n3\r\nabc"))
    c.decoder.feed(Buffer.from("\r\n0\r\n\r\n"))
    expect(c.text).toBe("helloabc")
    expect(c.done).toBe(true)
  })

  test("0 终止块带 trailer", () => {
    const c = collect({ kind: "chunked" })
    c.decoder.feed(Buffer.from("5\r\nhello\r\n0\r\nX-Trailer: 1\r\n\r\n"))
    expect(c.text).toBe("hello")
    expect(c.done).toBe(true)
  })

  test("长度行带扩展", () => {
    const c = collect({ kind: "chunked" })
    c.decoder.feed(Buffer.from("5;ext=1\r\nhello\r\n0\r\n\r\n"))
    expect(c.text).toBe("hello")
    expect(c.done).toBe(true)
  })
})

describe("createBodyDecoder (content-length)", () => {
  test("一次到达", () => {
    const c = collect({ kind: "content-length", remaining: 11 })
    c.decoder.feed(Buffer.from("hello world"))
    expect(c.text).toBe("hello world")
    expect(c.done).toBe(true)
  })

  test("跨块分裂", () => {
    const c = collect({ kind: "content-length", remaining: 11 })
    c.decoder.feed(Buffer.from("hello"))
    c.decoder.feed(Buffer.from(" wor"))
    c.decoder.feed(Buffer.from("ld"))
    expect(c.text).toBe("hello world")
    expect(c.done).toBe(true)
  })
})

describe("createBodyDecoder (close)", () => {
  test("数据直通，finish 收尾", () => {
    const c = collect({ kind: "close" })
    c.decoder.feed(Buffer.from("part1"))
    c.decoder.feed(Buffer.from("part2"))
    c.decoder.finish()
    expect(c.text).toBe("part1part2")
    expect(c.done).toBe(true)
  })
})
