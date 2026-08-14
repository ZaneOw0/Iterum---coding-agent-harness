import { join } from "node:path"
import { homedir } from "node:os"
import { MockProvider } from "@iterum/core/llm/mock"
import { OpenAIProvider } from "@iterum/core/llm/openai"
import { AnthropicProvider } from "@iterum/core/llm/anthropic"
import type { LLMProvider } from "@iterum/core/llm/types"
import { CredentialStore } from "@iterum/core/credentials/store"
import { AgentLoop } from "@iterum/core/agent/loop"
import { ToolRegistry } from "@iterum/core/tools/registry"
import { BashTool } from "@iterum/core/tools/bash"
import { ReadFileTool, WriteFileTool } from "@iterum/core/tools/fs"
import { PermissionGateway } from "@iterum/core/permission/gateway"
import { VerifyRunner } from "@iterum/core/feedback/verify"
import { SkillCatalog, ReadSkillTool } from "@iterum/core/memory/skills"
import { createSession } from "@iterum/core/transcript/session"
import { runConnect } from "./connect"
import { runTui } from "./tui"

// 从 Bun 进程 argv 剥离出用户参数：
// 脚本模式 argv=[bun路径, 脚本路径, ...参数]；编译模式（Bun 1.3.14 实测）argv=["bun", 可执行文件, ...参数]，
// 亦有 argv=[可执行文件, ...参数] 形态——以 mainPath 在 argv 中的位置为准，找不到时按脚本模式兜底。
export function appArgs(argv: string[], mainPath: string): string[] {
  const i = argv.indexOf(mainPath)
  return i >= 0 ? argv.slice(i + 1) : argv.slice(2)
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === "connect") return runConnect(argv.slice(1))
  if (argv.includes("--help")) { console.log("Usage: iterum [--headless] [--mock] [--allow] [--prompt <text>]"); return 0 }
  for (const a of argv) if (a.startsWith("-") && !["--headless", "--mock", "--prompt", "--allow"].includes(a)) return 2

  const headless = argv.includes("--headless")
  const promptIdx = argv.indexOf("--prompt")
  const prompt = promptIdx >= 0 ? argv[promptIdx + 1] ?? "" : ""
  const mock = argv.includes("--mock")
  const allowDanger = argv.includes("--allow")

  if (!headless && !process.stdin.isTTY) { console.log("interactive TUI requires a terminal; use --headless"); return 0 }

  let provider: LLMProvider
  let providerName: string
  let model: string
  let connected = false
  if (mock) {
    provider = new MockProvider([{ type: "text", text: "hello from iterum" }])
    providerName = "mock"; model = "mock"
  } else {
    const cred = await resolveProvider()
    if (cred) {
      provider = cred.provider
      providerName = cred.name
      model = cred.model
      connected = true
    } else if (headless) {
      console.error("real provider requires credentials; run iterum connect --set")
      return 1
    } else {
      // 凭据缺失提示态：mock 回复引导 /connect（footer 同时显示 Get started /connect）
      provider = new MockProvider([{ type: "text", text: "No provider credentials found. Run /connect to add a key — replying in mock mode until then." }])
      providerName = "mock"; model = "mock"
    }
  }

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
  const session = createSession({ cwd: process.cwd(), title: headless ? "headless" : "iterum", provider: providerName, model })

  if (!headless) {
    runTui({ session, loop, connected })
    return 0
  }

  for await (const ev of loop.run(session, prompt)) console.log(JSON.stringify(ev))
  return 0
}

async function resolveProvider(): Promise<{ provider: LLMProvider; name: string; model: string } | null> {
  const store = new CredentialStore()
  const openai = await store.get("openai")
  if (openai) return { provider: new OpenAIProvider({ apiKey: openai.key }), name: "openai", model: "gpt-4o-mini" }
  const anthropic = await store.get("anthropic")
  if (anthropic) return { provider: new AnthropicProvider({ apiKey: anthropic.key }), name: "anthropic", model: "claude-sonnet-4-5" }
  return null
}

if (import.meta.main) process.exitCode = await main(appArgs(Bun.argv, Bun.main))
