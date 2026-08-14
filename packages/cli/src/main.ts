import { join } from "node:path"
import { homedir } from "node:os"
import { MockProvider } from "@iterum/core/llm/mock"
import { AgentLoop } from "@iterum/core/agent/loop"
import { ToolRegistry } from "@iterum/core/tools/registry"
import { BashTool } from "@iterum/core/tools/bash"
import { ReadFileTool, WriteFileTool } from "@iterum/core/tools/fs"
import { PermissionGateway } from "@iterum/core/permission/gateway"
import { VerifyRunner } from "@iterum/core/feedback/verify"
import { SkillCatalog, ReadSkillTool } from "@iterum/core/memory/skills"
import { createSession } from "@iterum/core/transcript/session"

export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help")) { console.log("Usage: iterum [--headless] [--mock] [--allow] [--prompt <text>]"); return 0 }
  for (const a of argv) if (a.startsWith("-") && !["--headless", "--mock", "--prompt", "--allow"].includes(a)) return 2

  const headless = argv.includes("--headless")
  const promptIdx = argv.indexOf("--prompt")
  const prompt = promptIdx >= 0 ? argv[promptIdx + 1] : ""
  const mock = argv.includes("--mock")
  const allowDanger = argv.includes("--allow")

  if (!headless) {
    console.log("TUI not yet wired (Task 16); use --headless")
    return 0
  }

  const provider = mock ? new MockProvider([{ type: "text", text: "hello from iterum" }]) : null
  if (!provider) { console.error("real provider requires credentials; /connect coming in TUI task"); return 1 }

  const tools = new ToolRegistry()
  tools.register(new ReadFileTool()); tools.register(new WriteFileTool())
  tools.register(new BashTool(async (cmd, cwd) => {
    const r = Bun.spawnSync({ cmd: ["cmd", "/c", cmd], cwd, stdout: "pipe", stderr: "pipe" })
    return { exitCode: r.exitCode ?? 1, output: r.stdout.toString() + r.stderr.toString() }
  }))
  const skills = SkillCatalog.discover(
    join(homedir(), ".iterum", "skills"),
    join(process.cwd(), ".iterum", "skills"),
  )
  tools.register(new ReadSkillTool(skills))

  const verify = new VerifyRunner(process.env.ITERUM_TEST_CMD ?? "bun test", async (cmd, cwd) => {
    const r = Bun.spawnSync({ cmd: cmd.split(" "), cwd, stdout: "pipe", stderr: "pipe" })
    return { exitCode: r.exitCode ?? 1, output: r.stdout.toString() + r.stderr.toString() }
  })
  // headless 默认 deny（安全默认，SPEC §3.4）；--allow 显式放行
  const loop = new AgentLoop({
    provider, tools, permissions: new PermissionGateway(), verify, skills,
    resolvePermission: async () => allowDanger ? "allow" : "deny",
  })
  const session = createSession({ cwd: process.cwd(), title: "headless", provider: "mock", model: "mock" })
  for await (const ev of loop.run(session, prompt)) console.log(JSON.stringify(ev))
  return 0
}
