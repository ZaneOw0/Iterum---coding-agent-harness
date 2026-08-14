import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "../src/tools/registry"
import { ReadFileTool, WriteFileTool } from "../src/tools/fs"
import { BashTool } from "../src/tools/bash"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("tools", () => {
  test("registry registers and looks up", () => {
    const r = new ToolRegistry()
    r.register(new ReadFileTool())
    expect(r.get("read_file")).toBeDefined()
    expect(r.get("nope")).toBeUndefined()
  })

  test("write then read round-trips content", async () => {
    const dir = mkdtempSync(join(tmpdir(), "iterum-"))
    await new WriteFileTool().execute({ name: "write_file", args: { path: join(dir, "a.txt"), content: "hello" } })
    const res = await new ReadFileTool().execute({ name: "read_file", args: { path: join(dir, "a.txt") } })
    expect(res.ok).toBe(true)
    expect(res.output).toContain("hello")
  })

  test("write_file with bare filename skips mkdir('.') (Bun/Windows EEXIST)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "iterum-"))
    const prev = process.cwd()
    process.chdir(dir)
    try {
      const res = await new WriteFileTool().execute({ name: "write_file", args: { path: "bare.txt", content: "x" } })
      expect(res.ok).toBe(true)
      expect(readFileSync("bare.txt", "utf8")).toBe("x")
    } finally {
      process.chdir(prev)
    }
  })

  test("bash uses injected runner, never real shell", async () => {
    const runner = async (_cmd: string, _cwd: string) => ({ exitCode: 0, output: "ran" })
    const b = new BashTool(runner)
    const res = await b.execute({ name: "bash", args: { command: "echo hi" } })
    expect(res.output).toBe("ran")
    expect(res.exitCode).toBe(0)
  })

  test("bash non-zero exit is ok:false (feedback source, not crash)", async () => {
    const runner = async () => ({ exitCode: 1, output: "boom" })
    const res = await new BashTool(runner).execute({ name: "bash", args: { command: "false" } })
    expect(res.ok).toBe(false)
  })
})
