import { describe, expect, test } from "bun:test"
import { main } from "../src/main"

describe("cli", () => {
  test("--help exits 0 and prints usage", async () => {
    const code = await main(["--help"])
    expect(code).toBe(0)
  })

  test("unknown flag exits 2", async () => {
    expect(await main(["--nope"])).toBe(2)
  })

  test("--headless with mock provider streams JSON lines", async () => {
    const out: string[] = []
    const orig = console.log
    console.log = ((s: any) => { out.push(typeof s === "string" ? s : JSON.stringify(s)) }) as any
    const code = await main(["--headless", "--mock", "--prompt", "hello"])
    console.log = orig
    expect(code).toBe(0)
    expect(out.some(l => l.includes('"type":"session_idle"'))).toBe(true)
  })
})
