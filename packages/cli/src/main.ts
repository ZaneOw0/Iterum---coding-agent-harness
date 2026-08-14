import { join } from "node:path"
import { homedir } from "node:os"
import { MockProvider } from "@iterum/core/llm/mock"
import { OpenAIProvider } from "@iterum/core/llm/openai"
import { AnthropicProvider } from "@iterum/core/llm/anthropic"
import type { LLMProvider } from "@iterum/core/llm/types"
import { getVendor, type EffortLevel } from "@iterum/core/llm/vendors"
import { CredentialStore } from "@iterum/core/credentials/store"
import { AgentLoop } from "@iterum/core/agent/loop"
import { ToolRegistry } from "@iterum/core/tools/registry"
import { BashTool } from "@iterum/core/tools/bash"
import { ReadFileTool, WriteFileTool } from "@iterum/core/tools/fs"
import { PermissionGateway } from "@iterum/core/permission/gateway"
import { VerifyRunner } from "@iterum/core/feedback/verify"
import { SkillCatalog, ReadSkillTool, type Skill } from "@iterum/core/memory/skills"
import { createSession } from "@iterum/core/transcript/session"
import type { Session } from "@iterum/core/transcript/types"
import { readConfig, writeConfig, type AgentConfig } from "./config"
import { runConnect } from "./connect"
import { runTui } from "./tui"
import { detectProxy } from "./proxy-config"
import { createProxiedFetch } from "@iterum/core/llm/proxy"
import { fetchModels } from "@iterum/core/llm/models"

// 从 Bun 进程 argv 剥离出用户参数：
// 脚本模式 argv=[bun路径, 脚本路径, ...参数]；编译模式（Bun 1.3.14 实测）argv=["bun", 可执行文件, ...参数]，
// 亦有 argv=[可执行文件, ...参数] 形态——以 mainPath 在 argv 中的位置为准，找不到时按脚本模式兜底。
export function appArgs(argv: string[], mainPath: string): string[] {
  const i = argv.indexOf(mainPath)
  return i >= 0 ? argv.slice(i + 1) : argv.slice(2)
}

export interface Runtime {
  session: Session
  connected: boolean
  providerName: string
  model: string
  effort?: string
  fetchImpl?: typeof fetch
  loop: AgentLoop
  tools: ToolRegistry
  skills: Skill[]
  verify: VerifyRunner
  permissions: PermissionGateway
  rebuild: (patch: { providerName?: string; model?: string; effort?: string }) => Promise<number>
}

interface ResolvedState {
  provider: LLMProvider
  providerName: string
  model: string
  effort?: string
  connected: boolean
  fetchImpl?: typeof fetch
}

function mockHint(text: string): MockProvider {
  return new MockProvider([{ type: "text", text }])
}

async function resolveState(mock: boolean, config: AgentConfig, store: CredentialStore): Promise<ResolvedState> {
  if (mock) {
    return { provider: new MockProvider([{ type: "text", text: "hello from iterum" }]), providerName: "mock", model: "mock", connected: false }
  }
  const proxy = detectProxy(config)
  const fetchImpl = proxy ? createProxiedFetch(proxy) : undefined
  if (config.provider) {
    const vendor = getVendor(config.provider)
    const cred = vendor ? await store.get(vendor.id) : undefined
    const model = config.model ?? vendor?.defaultModel ?? ""
    if (vendor && cred) {
      const provider = vendor.flavor === "openai"
        ? new OpenAIProvider({ apiKey: cred.key, model, vendor, fetchImpl })
        : new AnthropicProvider({ apiKey: cred.key, model, vendor, fetchImpl })
      return { provider, providerName: vendor.id, model, effort: config.effort, connected: true, fetchImpl }
    }
    // 配置了厂商但钥匙串无 key：mock 提示态，不报错（与既有无凭据 TUI 行为一致）
    return {
      provider: mockHint(`No ${config.provider} API key found. Run /connect to add a key — replying in mock mode until then.`),
      providerName: config.provider, model, effort: config.effort, connected: false,
    }
  }
  // 无 config：维持既有探测逻辑
  const openai = await store.get("openai")
  if (openai) return { provider: new OpenAIProvider({ apiKey: openai.key, vendor: getVendor("openai"), fetchImpl }), providerName: "openai", model: getVendor("openai")?.defaultModel ?? "gpt-4o-mini", connected: true, fetchImpl }
  const anthropic = await store.get("anthropic")
  if (anthropic) return { provider: new AnthropicProvider({ apiKey: anthropic.key, vendor: getVendor("anthropic"), fetchImpl }), providerName: "anthropic", model: getVendor("anthropic")?.defaultModel ?? "claude-sonnet-4-5", connected: true, fetchImpl }
  return {
    provider: mockHint("No provider credentials found. Run /connect to add a key — replying in mock mode until then."),
    providerName: "mock", model: "mock", connected: false,
  }
}

export async function createRuntime(opts: { mock: boolean; allowDanger: boolean; config: AgentConfig; store?: CredentialStore; home?: string }): Promise<Runtime> {
  const store = opts.store ?? new CredentialStore()
  const home = opts.home ?? homedir()
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

  const permissions = new PermissionGateway()
  const verify = new VerifyRunner(process.env.ITERUM_TEST_CMD ?? "bun test", async (cmd, cwd) => {
    const r = Bun.spawnSync({ cmd: cmd.split(" "), cwd, stdout: "pipe", stderr: "pipe" })
    return { exitCode: r.exitCode ?? 1, output: r.stdout.toString() + r.stderr.toString() }
  })

  let state = await resolveState(opts.mock, opts.config, store)

  // headless 默认 deny（安全默认，SPEC §3.4）；--allow 显式放行
  function buildLoop(provider: LLMProvider, effort?: string) {
    return new AgentLoop({
      provider, tools, permissions, verify, skills,
      resolvePermission: async () => opts.allowDanger ? "allow" as const : "deny" as const,
      effort: effort as EffortLevel | undefined,
    })
  }

  let loop = buildLoop(state.provider, state.effort)
  let session = createSession({ cwd: process.cwd(), title: "iterum", provider: state.providerName, model: state.model })

  async function rebuild(patch: { providerName?: string; model?: string; effort?: string }): Promise<number> {
    const providerName = patch.providerName ?? state.providerName
    const model = patch.model ?? state.model
    const effort = patch.effort !== undefined ? patch.effort : state.effort
    const next = await resolveState(opts.mock, { provider: providerName, model, effort, proxy: opts.config.proxy }, store)
    // 无 key 且厂商真正切换：拒绝，保持现状；同厂商的 model/effort 调整允许（mock 提示态继续）
    if (!next.connected && !opts.mock && next.providerName !== state.providerName) return 1
    state = next
    loop = buildLoop(state.provider, state.effort)
    session.model = state.model
    // 读-合并-写：保留 modelCache 等既有字段（如 /model 拉取写入的缓存）
    writeConfig({ ...readConfig(home), provider: state.providerName, model: state.model, effort: state.effort }, home)
    return 0
  }

  return {
    session,
    get connected() { return state.connected },
    get providerName() { return state.providerName },
    get model() { return state.model },
    get effort() { return state.effort },
    get fetchImpl() { return state.fetchImpl },
    loop, tools, skills, verify, permissions, rebuild,
  }
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === "connect") return runConnect(argv.slice(1))
  if (argv.includes("--help")) {
    console.log("Usage: iterum [--headless] [--mock] [--allow] [--prompt <text>]")
    console.log("       iterum connect <厂商> --set|--show|--clear [--from-stdin <key>]")
    console.log("       厂商: openai|anthropic|gemini|grok|moonshot|deepseek|zhipu|qwen")
    return 0
  }
  for (const a of argv) if (a.startsWith("-") && !["--headless", "--mock", "--prompt", "--allow"].includes(a)) return 2

  const headless = argv.includes("--headless")
  const promptIdx = argv.indexOf("--prompt")
  const prompt = promptIdx >= 0 ? argv[promptIdx + 1] ?? "" : ""
  const mock = argv.includes("--mock")
  const allowDanger = argv.includes("--allow")

  if (!headless && !process.stdin.isTTY) { console.log("interactive TUI requires a terminal; use --headless"); return 0 }

  const store = new CredentialStore()
  const runtime = await createRuntime({ mock, allowDanger, config: readConfig(), store })

  if (!headless) {
    const fetchImpl = runtime.fetchImpl
    const proxiedFetcher = fetchImpl
      ? (vendor: Parameters<typeof fetchModels>[0], key: string) => fetchModels(vendor, key, fetchImpl)
      : fetchModels
    runTui({ session: runtime.session, loop: runtime.loop, connected: runtime.connected, runtime, store, fetcher: proxiedFetcher })
    return 0
  }
  if (!runtime.connected && !mock) {
    console.error("real provider requires credentials; run iterum connect --set")
    return 1
  }
  for await (const ev of runtime.loop.run(runtime.session, prompt)) console.log(JSON.stringify(ev))
  return 0
}

if (import.meta.main) process.exitCode = await main(appArgs(Bun.argv, Bun.main))
