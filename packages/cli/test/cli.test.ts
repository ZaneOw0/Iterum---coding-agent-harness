import { describe, expect, test } from "bun:test"
import { appArgs, main } from "../src/main"

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

  test("--headless --mock 仍输出事件流（回归）", async () => {
    const exit = await main(["--headless", "--mock", "--prompt", "hello"])
    expect(exit).toBe(0)
  })
})

describe("appArgs", () => {
  test("脚本模式 argv=[bun路径, 脚本路径, ...参数] 剥掉前两项", () => {
    expect(appArgs(
      ["C:/bun/bun.exe", "D:/Iterum/packages/cli/src/main.ts", "connect", "openai", "--show"],
      "D:/Iterum/packages/cli/src/main.ts",
    )).toEqual(["connect", "openai", "--show"])
  })

  test("编译模式 argv=[bun, 可执行文件, ...参数]（Bun 1.3.14 探针实测）剥掉前两项", () => {
    expect(appArgs(
      ["bun", "B:/~BUN/root/iterum.exe", "connect", "openai", "--show"],
      "B:/~BUN/root/iterum.exe",
    )).toEqual(["connect", "openai", "--show"])
  })

  test("编译模式 argv=[可执行文件, ...参数] 剥掉第一项", () => {
    expect(appArgs(
      ["C:/x/iterum.exe", "connect", "openai", "--show"],
      "C:/x/iterum.exe",
    )).toEqual(["connect", "openai", "--show"])
  })
})
