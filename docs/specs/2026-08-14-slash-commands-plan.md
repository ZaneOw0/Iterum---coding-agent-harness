# Slash 指令（/connect /model /effort）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 iterum TUI 内实现 `/connect`（选厂商→输 key→拉取模型列表→选模型）、`/model`（切换模型）、`/effort`（四档思考强度）三条 slash 指令，支持 8 家厂商，配置持久化并立即生效。

**Architecture:** 数据驱动厂商注册表（8 家，7 家 OpenAI 兼容 + anthropic 原生）+ 纯 fetch 模型列表模块 + `~/.iterum/config.json` 持久化 + tui 包纯展示对话框 + cli 层 slash 路由与业务状态机。

**Tech Stack:** Bun 1.3.14、TypeScript strict、Ink 5（React 18.3.1）、openai SDK、@anthropic-ai/sdk、bun:test。

**Spec:** `docs/specs/2026-08-14-slash-commands-design.md`（本计划从该 spec 展开；实现者两文都要读）

## Global Constraints

- Bun >= 1.2（本机 1.3.14）；TypeScript strict（改动文件不得新增 tsc 错误，packages/core 既有错误除外）
- `bun test` 是唯一测试入口；TDD 硬性：先写失败测试（RED）再实现（GREEN）
- 测试零网络（mock fetch / mock SDK module）、零真实 API key
- 现有 67 个测试必须保持全绿（回归）
- 每个 task 单 commit，提交信息全中文：`feat(scope): 标题` + 空行 + `- ` 要点列表
- 开发只在 worktree（`.worktrees/task-NN-*`）分支 `task/NN-*`；禁止 main 直接开发；push/PR/merge 须用户审批
- 环境 Windows + PowerShell 5.1；本机无 make；`bun add` 后检查 bun.lock 无 npmmirror URL
- 分发验证：win-x64 编译产物冒烟（`bun build --compile --target=bun-windows-x64 packages/cli/src/main.ts --outfile dist/iterum-win-x64.exe`）

---

### Task 25: 厂商注册表 + 模型列表拉取（core 纯数据/纯函数）

**Files:**
- Create: `packages/core/src/llm/vendors.ts`、`packages/core/src/llm/models.ts`
- Modify: `packages/core/src/credentials/store.ts`（provider id 类型放宽为 string）
- Test: `packages/core/test/vendors.test.ts`、`packages/core/test/models.test.ts`

**Interfaces:**
- Consumes: 无（新模块）
- Produces:
  - `vendors.ts`: `export type EffortLevel = "low" | "medium" | "high" | "max"`；`export interface VendorEffort { kind: "reasoning_effort" | "thinking_budget" | "enable_thinking"; values: Record<EffortLevel, string | number | boolean>; modelAllowlist?: string[] }`；`export interface VendorDef { id: string; name: string; flavor: "openai" | "anthropic"; baseURL?: string; modelsUrl?: string; allowPrefixes: string[]; denyPrefixes: string[]; effort?: VendorEffort }`；`export const VENDORS: Record<string, VendorDef>`（8 家）；`export function getVendor(id: string): VendorDef | undefined`；`export type EffortParam = { kind: "reasoning_effort"; value: string } | { kind: "thinking"; budget: number } | { kind: "enable_thinking"; budget: number }`；`export function resolveEffort(vendor: VendorDef | undefined, model: string | undefined, effort: EffortLevel | undefined): EffortParam | undefined`
  - `models.ts`: `export async function fetchModels(vendor: VendorDef, apiKey: string): Promise<string[]>`
  - T26 使用 resolveEffort；T27 使用 getVendor/VENDORS；T29 使用 fetchModels。

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/vendors.test.ts
import { describe, expect, test } from "bun:test"
import { VENDORS, getVendor, resolveEffort } from "../src/llm/vendors"

const IDS = ["openai", "anthropic", "gemini", "grok", "moonshot", "deepseek", "zhipu", "qwen"]

describe("VENDORS registry", () => {
  test("8 家厂商齐全且 id 唯一", () => {
    expect(Object.keys(VENDORS).sort()).toEqual([...IDS].sort())
  })
  test("每条目字段完整", () => {
    for (const id of IDS) {
      const v = getVendor(id)!
      expect(v.name).toBeTruthy()
      expect(["openai", "anthropic"]).toContain(v.flavor)
      expect(Array.isArray(v.allowPrefixes)).toBe(true)
      expect(Array.isArray(v.denyPrefixes)).toBe(true)
      if (id === "openai" || id === "grok") expect(v.baseURL).toBeTruthy()
      if (id === "anthropic") expect(v.baseURL).toBeUndefined()
    }
  })
  test("openai 走 OpenAI 兼容（flavor=openai），anthropic 走原生", () => {
    expect(getVendor("openai")!.flavor).toBe("openai")
    expect(getVendor("anthropic")!.flavor).toBe("anthropic")
    expect(getVendor("deepseek")!.flavor).toBe("openai")
  })
  test("getVendor 未知 id 返回 undefined", () => {
    expect(getVendor("nope")).toBeUndefined()
  })
})

describe("resolveEffort", () => {
  test("无 vendor 或无 effort 返回 undefined", () => {
    expect(resolveEffort(undefined, "gpt-4o-mini", "low")).toBeUndefined()
    expect(resolveEffort(getVendor("openai"), "gpt-4o-mini", undefined)).toBeUndefined()
  })
  test("openai 四档映射 reasoning_effort 字符串", () => {
    expect(resolveEffort(getVendor("openai"), "o4-mini", "low")).toEqual({ kind: "reasoning_effort", value: "minimal" })
    expect(resolveEffort(getVendor("openai"), "o4-mini", "medium")).toEqual({ kind: "reasoning_effort", value: "low" })
    expect(resolveEffort(getVendor("openai"), "o4-mini", "high")).toEqual({ kind: "reasoning_effort", value: "medium" })
    expect(resolveEffort(getVendor("openai"), "o4-mini", "max")).toEqual({ kind: "reasoning_effort", value: "high" })
  })
  test("模型未命中 allowlist 返回 undefined", () => {
    expect(resolveEffort(getVendor("openai"), "gpt-4o-mini", "high")).toBeUndefined()
  })
  test("anthropic 映射 thinking 预算", () => {
    expect(resolveEffort(getVendor("anthropic"), "claude-sonnet-4", "low")).toEqual({ kind: "thinking", budget: 8192 })
    expect(resolveEffort(getVendor("anthropic"), "claude-sonnet-4", "max")).toEqual({ kind: "thinking", budget: 32768 })
  })
  test("qwen 映射 enable_thinking 预算", () => {
    expect(resolveEffort(getVendor("qwen"), "qwen3-coder", "medium")).toEqual({ kind: "enable_thinking", budget: 4096 })
  })
  test("不支持 effort 的厂商返回 undefined", () => {
    expect(resolveEffort(getVendor("deepseek"), "deepseek-chat", "low")).toBeUndefined()
    expect(resolveEffort(getVendor("moonshot"), "kimi-k2", "high")).toBeUndefined()
    expect(getVendor("deepseek")!.effort).toBeUndefined()
  })
})
```

```ts
// packages/core/test/models.test.ts
import { describe, expect, test, afterEach } from "bun:test"
import { fetchModels } from "../src/llm/models"
import { getVendor } from "../src/llm/vendors"

const origFetch = globalThis.fetch

afterEach(() => { globalThis.fetch = origFetch })

describe("fetchModels", () => {
  test("OpenAI 兼容：Authorization Bearer + 前缀过滤 + 排序", async () => {
    let url = ""; let headers: Headers | undefined
    globalThis.fetch = (async (u: any, init: any) => {
      url = String(u); headers = init?.headers as Headers
      return new Response(JSON.stringify({ data: [{ id: "whisper-1" }, { id: "gpt-4o-mini" }, { id: "gpt-4.1" }] }), { status: 200 })
    }) as typeof fetch
    const models = await fetchModels(getVendor("openai")!, "sk-test")
    expect(url).toBe("https://api.openai.com/v1/models")
    expect(headers?.get("Authorization")).toBe("Bearer sk-test")
    expect(models).toEqual(["gpt-4.1", "gpt-4o-mini"])
  })
  test("anthropic：x-api-key + anthropic-version + claude- 过滤", async () => {
    let headers: Headers | undefined
    globalThis.fetch = (async (u: any, init: any) => {
      headers = init?.headers as Headers
      return new Response(JSON.stringify({ data: [{ id: "claude-sonnet-4" }, { id: "other-model" }] }), { status: 200 })
    }) as typeof fetch
    const models = await fetchModels(getVendor("anthropic")!, "sk-ant-test")
    expect(headers?.get("x-api-key")).toBe("sk-ant-test")
    expect(headers?.get("anthropic-version")).toBe("2023-06-01")
    expect(models).toEqual(["claude-sonnet-4"])
  })
  test("HTTP 错误抛出带状态码", async () => {
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch
    await expect(fetchModels(getVendor("openai")!, "bad")).rejects.toThrow("401")
  })
  test("gemini 使用兼容端点 /models", async () => {
    let url = ""
    globalThis.fetch = (async (u: any) => { url = String(u); return new Response(JSON.stringify({ data: [{ id: "gemini-3-pro" }] }), { status: 200 }) }) as typeof fetch
    const models = await fetchModels(getVendor("gemini")!, "k")
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/models")
    expect(models).toEqual(["gemini-3-pro"])
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/vendors.test.ts packages/core/test/models.test.ts`
Expected: FAIL（模块不存在 Cannot find module）

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/llm/vendors.ts
export type EffortLevel = "low" | "medium" | "high" | "max"

export interface VendorEffort {
  kind: "reasoning_effort" | "thinking_budget" | "enable_thinking"
  values: Record<EffortLevel, string | number | boolean>
  modelAllowlist?: string[]
}

export interface VendorDef {
  id: string
  name: string
  flavor: "openai" | "anthropic"
  baseURL?: string
  modelsUrl?: string
  allowPrefixes: string[]
  denyPrefixes: string[]
  effort?: VendorEffort
}

const OE = { kind: "reasoning_effort" as const, values: { low: "minimal", medium: "low", high: "medium", max: "high" } }

export const VENDORS: Record<string, VendorDef> = {
  openai: { id: "openai", name: "OpenAI", flavor: "openai", baseURL: "https://api.openai.com/v1", allowPrefixes: [], denyPrefixes: ["whisper-", "tts-", "dall-e-", "text-embedding-", "gpt-4o-audio-", "omni-moderation"], effort: { ...OE, modelAllowlist: ["o1-", "o3-", "o4-", "gpt-5"] } },
  anthropic: { id: "anthropic", name: "Anthropic", flavor: "anthropic", allowPrefixes: ["claude-"], denyPrefixes: [], effort: { kind: "thinking_budget", values: { low: 8192, medium: 16384, high: 24576, max: 32768 }, modelAllowlist: ["claude-3-7-", "claude-sonnet-4", "claude-opus-4"] } },
  gemini: { id: "gemini", name: "Google Gemini", flavor: "openai", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", allowPrefixes: ["gemini-"], denyPrefixes: [], effort: { ...OE, modelAllowlist: ["gemini-3"] } },
  grok: { id: "grok", name: "xAI Grok", flavor: "openai", baseURL: "https://api.x.ai/v1", allowPrefixes: ["grok-"], denyPrefixes: [], effort: { ...OE, modelAllowlist: ["grok-4", "grok-3"] } },
  moonshot: { id: "moonshot", name: "Moonshot Kimi", flavor: "openai", baseURL: "https://api.moonshot.cn/v1", allowPrefixes: ["kimi-", "moonshot-v1-"], denyPrefixes: [] },
  deepseek: { id: "deepseek", name: "DeepSeek", flavor: "openai", baseURL: "https://api.deepseek.com", allowPrefixes: ["deepseek-"], denyPrefixes: [] },
  zhipu: { id: "zhipu", name: "智谱 GLM", flavor: "openai", baseURL: "https://open.bigmodel.cn/api/paas/v4", allowPrefixes: ["glm-"], denyPrefixes: [] },
  qwen: { id: "qwen", name: "阿里通义千问", flavor: "openai", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", allowPrefixes: ["qwen-"], denyPrefixes: [], effort: { kind: "enable_thinking", values: { low: 1024, medium: 4096, high: 16384, max: 32768 }, modelAllowlist: ["qwen3"] } },
}

export function getVendor(id: string): VendorDef | undefined {
  return VENDORS[id]
}

export type EffortParam =
  | { kind: "reasoning_effort"; value: string }
  | { kind: "thinking"; budget: number }
  | { kind: "enable_thinking"; budget: number }

export function resolveEffort(vendor: VendorDef | undefined, model: string | undefined, effort: EffortLevel | undefined): EffortParam | undefined {
  if (!vendor?.effort || !effort) return undefined
  if (vendor.effort.modelAllowlist && !(model && vendor.effort.modelAllowlist.some(p => model.startsWith(p)))) return undefined
  const value = vendor.effort.values[effort]
  if (value === undefined) return undefined
  if (vendor.effort.kind === "reasoning_effort") return { kind: "reasoning_effort", value: String(value) }
  if (vendor.effort.kind === "thinking_budget") return { kind: "thinking", budget: Number(value) }
  return { kind: "enable_thinking", budget: Number(value) }
}
```

```ts
// packages/core/src/llm/models.ts
import type { VendorDef } from "./vendors"

const OPENAI_DEFAULT = "https://api.openai.com/v1"
const ANTHROPIC_MODELS = "https://api.anthropic.com/v1/models"

export async function fetchModels(vendor: VendorDef, apiKey: string): Promise<string[]> {
  const base = vendor.modelsUrl ?? (vendor.flavor === "anthropic" ? ANTHROPIC_MODELS : `${vendor.baseURL ?? OPENAI_DEFAULT}/models`)
  const headers = vendor.flavor === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { Authorization: `Bearer ${apiKey}` }
  const res = await fetch(base, { headers })
  if (!res.ok) throw new Error(`model list request failed: ${res.status}`)
  const json = await res.json() as { data?: { id?: string }[] }
  const ids = (json?.data ?? []).map(m => m.id).filter((x): x is string => typeof x === "string")
  const filtered = ids.filter(id =>
    (vendor.allowPrefixes.length === 0 || vendor.allowPrefixes.some(p => id.startsWith(p))) &&
    !vendor.denyPrefixes.some(p => id.startsWith(p)))
  return filtered.sort()
}
```

```ts
// packages/core/src/credentials/store.ts —— 仅类型放宽：provider 参数从 "openai"|"anthropic" 改为 string
// 找到 provider 参数类型处（如 get(provider: Provider)），把 Provider 类型放宽为 string，其余实现不动
```

- [ ] **Step 4: Run 确认通过**

Run: `bun test packages/core/test/vendors.test.ts packages/core/test/models.test.ts`
Expected: PASS；再跑全量 `bun test` 确认 67 个既有测试全绿。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/llm/vendors.ts packages/core/src/llm/models.ts packages/core/src/credentials/store.ts packages/core/test/vendors.test.ts packages/core/test/models.test.ts
git commit -m "feat(core): 厂商注册表与模型列表拉取

- 8 家厂商注册表（7 家 OpenAI 兼容 + anthropic 原生），effort 四档映射与模型白名单
- fetchModels 纯 fetch 双风格解析 + 前缀过滤
- CredentialStore provider 类型放宽为 string"
```

---

### Task 26: provider effort 透传 + reasoning_content 解析（core）

**Files:**
- Modify: `packages/core/src/llm/types.ts`、`packages/core/src/llm/openai.ts`、`packages/core/src/llm/anthropic.ts`、`packages/core/src/agent/loop.ts`
- Test: `packages/core/test/openai.test.ts`、`packages/core/test/anthropic.test.ts`、`packages/core/test/agent.test.ts`（追加）

**Interfaces:**
- Consumes: T25 的 `resolveEffort`、`VendorDef`、`EffortLevel`
- Produces:
  - `types.ts`: `ChatRequest` 增加 `effort?: string`
  - `OpenAIProvider`/`AnthropicProvider` 构造参数增加 `vendor?: VendorDef`
  - `AgentLoop`（`AgentDeps`）增加 `effort?: EffortLevel`，每轮请求 req 透传 `effort`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/openai.test.ts
import { describe, expect, test, mock } from "bun:test"

let captured: Record<string, unknown> | undefined

mock.module("openai", () => ({
  default: class {
    chat = { completions = { create: async (args: Record<string, unknown>) => { captured = args; return fakeStream() } } }
  },
}))

async function* fakeStream() {
  yield { choices: [{ delta: { reasoning_content: "thinking hard" } }] }
  yield { choices: [{ delta: { content: "hello" } }] }
  yield { choices: [{ delta: {} }] }
}

import { OpenAIProvider } from "../src/llm/openai"
import { getVendor } from "../src/llm/vendors"

describe("OpenAIProvider", () => {
  test("effort 映射为 reasoning_effort 透传", async () => {
    const p = new OpenAIProvider({ apiKey: "sk-t", vendor: getVendor("openai"), model: "o4-mini" })
    const evs = []
    for await (const ev of p.complete({ model: "o4-mini", system: "s", messages: [], effort: "high" })) evs.push(ev)
    expect(captured!.reasoning_effort).toBe("medium")
  })
  test("reasoning_content 解析为 reasoning_delta，content 为 text_delta", async () => {
    const p = new OpenAIProvider({ apiKey: "sk-t", vendor: getVendor("openai") })
    const evs = []
    for await (const ev of p.complete({ model: "o4-mini", system: "s", messages: [] })) evs.push(ev)
    expect(evs).toContainEqual({ type: "reasoning_delta", text: "thinking hard" })
    expect(evs).toContainEqual({ type: "text_delta", text: "hello" })
    expect(evs.at(-1)).toEqual({ type: "done" })
  })
  test("模型未命中白名单时省略 effort 参数", async () => {
    const p = new OpenAIProvider({ apiKey: "sk-t", vendor: getVendor("openai"), model: "gpt-4o-mini" })
    for await (const _ of p.complete({ model: "gpt-4o-mini", system: "s", messages: [], effort: "high" })) {}
    expect("reasoning_effort" in captured!).toBe(false)
  })
})
```

```ts
// packages/core/test/anthropic.test.ts
import { describe, expect, test, mock } from "bun:test"

let captured: Record<string, unknown> | undefined

mock.module("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: async (args: Record<string, unknown>) => { captured = args; return fakeStream() } }
  },
}))

async function* fakeStream() {
  yield { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } }
}

import { AnthropicProvider } from "../src/llm/anthropic"
import { getVendor } from "../src/llm/vendors"

describe("AnthropicProvider", () => {
  test("effort 映射为 thinking 预算透传", async () => {
    const p = new AnthropicProvider({ apiKey: "sk-ant-t", vendor: getVendor("anthropic"), model: "claude-sonnet-4" })
    const evs = []
    for await (const ev of p.complete({ model: "claude-sonnet-4", system: "s", messages: [], effort: "high" })) evs.push(ev)
    expect(captured!.thinking).toEqual({ type: "enabled", budget_tokens: 24576 })
    expect(evs).toContainEqual({ type: "text_delta", text: "hi" })
  })
})
```

```ts
// packages/core/test/agent.test.ts 追加（文件内已有 describe 块，新增一个 test）
test("loop 把 effort 透传进请求", async () => {
  let gotEffort: string | undefined
  const provider = {
    async *complete(req: { model: string; system: string; messages: unknown[]; effort?: string }) {
      gotEffort = req.effort
      yield { type: "done" as const }
    },
  }
  const loop = new AgentLoop({ provider, tools: new ToolRegistry(), permissions: new PermissionGateway(), verify: new VerifyRunner("bun test", async () => ({ exitCode: 0, output: "" })), resolvePermission: async () => "deny" as const, effort: "max" })
  const session = createSession({ cwd: "C:/p", title: "t", provider: "mock", model: "m" })
  for await (const _ of loop.run(session, "hi")) {}
  expect(gotEffort).toBe("max")
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/openai.test.ts packages/core/test/anthropic.test.ts packages/core/test/agent.test.ts`
Expected: FAIL（effort 未透传 / reasoning_delta 缺失 / AgentDeps 无 effort）

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/llm/types.ts —— ChatRequest 增加一行
export interface ChatRequest { model: string; system: string; messages: ChatMessage[]; maxTokens?: number; effort?: string }
```

```ts
// packages/core/src/llm/openai.ts —— 整体替换为：
import OpenAI from "openai"
import type { ChatRequest, LLMEvent, LLMProvider } from "./types"
import { resolveEffort, type EffortLevel, type VendorDef } from "./vendors"

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  constructor(private opts: { apiKey: string; model?: string; baseURL?: string; vendor?: VendorDef }) {
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL ?? opts.vendor?.baseURL })
  }
  async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
    const create: Record<string, unknown> = {
      model: this.opts.model ?? req.model, stream: true,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    }
    const ep = resolveEffort(this.opts.vendor, this.opts.model ?? req.model, req.effort as EffortLevel | undefined)
    if (ep?.kind === "reasoning_effort") create.reasoning_effort = ep.value
    if (ep?.kind === "enable_thinking") create.extra_body = { enable_thinking: true, thinking_budget: ep.budget }
    const stream = await this.client.chat.completions.create(create as never)
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as { content?: string; reasoning_content?: string }
      if (delta?.reasoning_content) yield { type: "reasoning_delta", text: delta.reasoning_content }
      if (delta?.content) yield { type: "text_delta", text: delta.content }
    }
    yield { type: "done" }
  }
}
```

```ts
// packages/core/src/llm/anthropic.ts —— complete() 开头插入 effort 处理（其余流解析不动）：
import { resolveEffort, type EffortLevel, type VendorDef } from "./vendors"
// 构造参数增加 vendor?: VendorDef
constructor(private opts: { apiKey: string; model?: string; baseURL?: string; vendor?: VendorDef }) { ... }
async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
  const args: Record<string, unknown> = {
    model: this.opts.model ?? req.model, system: req.system,
    max_tokens: req.maxTokens ?? 4096, messages: req.messages,
  }
  const ep = resolveEffort(this.opts.vendor, this.opts.model ?? req.model, req.effort as EffortLevel | undefined)
  if (ep?.kind === "thinking") args.thinking = { type: "enabled", budget_tokens: ep.budget }
  const stream = await this.client.messages.stream(args as never)
  // …既有 toolBlocks 流解析逻辑不变
}
```

```ts
// packages/core/src/agent/loop.ts：
// import 增加：import type { EffortLevel } from "../llm/vendors"
// AgentDeps 增加：effort?: EffortLevel
// run() 内 req 构造增加一行：effort: this.deps.effort,
```

- [ ] **Step 4: Run 确认通过**

Run: `bun test packages/core/test/openai.test.ts packages/core/test/anthropic.test.ts packages/core/test/agent.test.ts`
Expected: PASS；全量 `bun test` 既有 67 + 新增全绿。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/llm/types.ts packages/core/src/llm/openai.ts packages/core/src/llm/anthropic.ts packages/core/src/agent/loop.ts packages/core/test/openai.test.ts packages/core/test/anthropic.test.ts packages/core/test/agent.test.ts
git commit -m "feat(core): provider effort 透传与 reasoning_content 解析

- ChatRequest 增加 effort，AgentLoop 逐轮透传
- OpenAI 兼容路径：reasoning_effort / enable_thinking 映射 + reasoning_content 流解析
- Anthropic：thinking 预算透传"
```

---

### Task 27: 配置存储 + cli 组装改造（cli）

**Files:**
- Create: `packages/cli/src/config.ts`
- Modify: `packages/cli/src/main.ts`（resolveProvider 读 config、抽出 buildLoop/createRuntime、runTui 调用点适配）、`packages/cli/src/connect.ts`（PROVIDERS 扩为 8 家）
- Test: `packages/cli/test/config.test.ts`、`packages/cli/test/cli.test.ts`（追加）

**Interfaces:**
- Consumes: T25 的 `VENDORS/getVendor`、T26 的 provider 构造参数
- Produces:
  - `config.ts`: `export interface AgentConfig { provider?: string; model?: string; effort?: string; modelCache?: Record<string, string[]> }`；`export function configPath(home?: string): string`；`export function readConfig(home?: string): AgentConfig`；`export function writeConfig(cfg: AgentConfig, home?: string): void`
  - `main.ts`: `export interface Runtime { session: Session; connected: boolean; providerName: string; model: string; effort?: string; loop: AgentLoop; tools: ToolRegistry; skills: SkillCatalog; verify: VerifyRunner; permissions: PermissionGateway; rebuild: (patch: { providerName?: string; model?: string; effort?: string }) => Promise<number> }`；`export async function createRuntime(opts: { mock: boolean; allowDanger: boolean; config: AgentConfig; store?: CredentialStore }): Promise<Runtime>`；`main(argv)` 行为不变
  - T29 使用 createRuntime 与 config 模块。

- [ ] **Step 1: 写失败测试**

```ts
// packages/cli/test/config.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { readConfig, writeConfig, configPath } from "../src/config"

let home: string
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "iterum-config-")) })
afterEach(() => { rmSync(home, { recursive: true, force: true }) })

describe("config 存储", () => {
  test("读写往返", () => {
    writeConfig({ provider: "deepseek", model: "deepseek-chat", effort: "medium" }, home)
    expect(configPath(home)).toBe(join(home, ".iterum", "config.json"))
    expect(readConfig(home)).toEqual({ provider: "deepseek", model: "deepseek-chat", effort: "medium" })
  })
  test("不存在时返回空对象", () => {
    expect(readConfig(home)).toEqual({})
  })
  test("损坏 JSON 回退空对象不抛错", () => {
    const dir = join(home, ".iterum")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "config.json"), "{broken")
    expect(readConfig(home)).toEqual({})
  })
})
```

```ts
// packages/cli/test/cli.test.ts 追加：
test("--headless --mock 仍输出事件流（回归）", async () => {
  const exit = await main(["--headless", "--mock", "--prompt", "hello"])
  expect(exit).toBe(0)
})
```

```ts
// packages/cli/test/runtime.test.ts（新建，createRuntime 行为）
import { describe, expect, test } from "bun:test"
import { createRuntime } from "../src/main"
import { getVendor } from "@iterum/core/llm/vendors"

describe("createRuntime", () => {
  test("config 指定厂商+模型时按注册表组装", async () => {
    const rt = await createRuntime({ mock: false, allowDanger: false, config: { provider: "deepseek", model: "deepseek-chat" } })
    expect(rt.providerName).toBe("deepseek")
    expect(rt.model).toBe("deepseek-chat")
    expect(rt.session.model).toBe("deepseek-chat")
  })
  test("无 config 时回退探测：无凭据 mock 提示态", async () => {
    const rt = await createRuntime({ mock: false, allowDanger: false, config: {} })
    expect(rt.connected).toBe(false)
    expect(rt.providerName).toBe("mock")
  })
  test("rebuild 切换 model 立即更新 session.model", async () => {
    const rt = await createRuntime({ mock: false, allowDanger: false, config: { provider: "openai" } })
    const code = await rt.rebuild({ model: "gpt-4.1" })
    expect(code).toBe(0)
    expect(rt.session.model).toBe("gpt-4.1")
    expect(rt.model).toBe("gpt-4.1")
  })
})
```

注：以上测试依赖本机环境无真实 key（config 指定厂商但钥匙串无 key 时 connected=false 但不崩溃）；mock 模式不受 key 影响。若实现让 config 厂商无 key 时报错，测试需同步调整——**设计约定：无 key 时 provider 用 mock 提示态、connected=false，不报错**（与现有 TUI 无凭据行为一致）。

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/cli/test/config.test.ts packages/cli/test/runtime.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

```ts
// packages/cli/src/config.ts
import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"

export interface AgentConfig {
  provider?: string
  model?: string
  effort?: string
  modelCache?: Record<string, string[]>
}

export function configPath(home: string = homedir()): string {
  return join(home, ".iterum", "config.json")
}

export function readConfig(home: string = homedir()): AgentConfig {
  try {
    const p = configPath(home)
    if (!existsSync(p)) return {}
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return {}
  }
}

export function writeConfig(cfg: AgentConfig, home: string = homedir()): void {
  const dir = join(home, ".iterum")
  mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(home), JSON.stringify(cfg, null, 2))
}
```

```ts
// packages/cli/src/connect.ts —— PROVIDERS 扩展：
import { VENDORS } from "@iterum/core/llm/vendors"
const PROVIDERS = Object.keys(VENDORS)  // 替换原 ["openai","anthropic"]
// provider 校验行改为：const vendor = VENDORS[argv[0] as string]; if (!vendor) return 2
// 其余四操作逻辑（--set/--clear/--show/--from-stdin）不变
```

```ts
// packages/cli/src/main.ts —— 重构（保持 main(argv) 对外行为不变）：
// 新增导入：import { VENDORS, getVendor, type EffortLevel } from "@iterum/core/llm/vendors"
//          import { readConfig, writeConfig, type AgentConfig } from "./config"

export interface Runtime { ...见 Interfaces... }

export async function createRuntime(opts: { mock: boolean; allowDanger: boolean; config: AgentConfig; store?: CredentialStore }): Promise<Runtime> {
  const store = opts.store ?? new CredentialStore()
  const tools = new ToolRegistry()
  // …与现有 main() 相同的 tools/bash/skills/verify 组装（原样搬移）
  let state = await resolveState(opts.mock, opts.config, store)   // { provider, providerName, model, effort, connected }

  function buildLoop(provider: LLMProvider, effort?: string) {
    return new AgentLoop({ provider, tools, permissions, verify, skills, resolvePermission: async () => opts.allowDanger ? "allow" as const : "deny" as const, effort: effort as EffortLevel | undefined })
  }

  let loop = buildLoop(state.provider, state.effort)
  let session = createSession({ cwd: process.cwd(), title: "iterum", provider: state.providerName, model: state.model })

  async function rebuild(patch: { providerName?: string; model?: string; effort?: string }): Promise<number> {
    const providerName = patch.providerName ?? state.providerName
    const model = patch.model ?? state.model
    const effort = patch.effort !== undefined ? patch.effort : state.effort
    const next = await resolveState(opts.mock, { provider: providerName, model, effort }, store)
    if (!next.connected && !opts.mock) return 1   // 无 key：拒绝切换，保持现状
    state = next
    loop = buildLoop(state.provider, state.effort)
    session.model = state.model
    writeConfig({ provider: state.providerName, model: state.model, effort: state.effort })
    return 0
  }

  return { session, connected: state.connected, providerName: state.providerName, model: state.model, effort: state.effort, loop, tools, skills, verify, permissions, rebuild }
}

// resolveState(mock, config, store)：config.provider 有 → getVendor → store.get(id) 有 key → 真实 provider（flavor 选类，传 vendor/baseURL/model）；无 key → mock 提示态 connected=false；config 无 provider → 现有探测（openai→gpt-4o-mini / anthropic→claude-sonnet-4-5）
// main(argv)：逻辑不变——mock/headless/allow 解析后调 createRuntime，headless 分支：!connected 且非 mock → console.error + return 1（保持旧行为）；否则 loop.run 输出 JSON；TUI 分支 runTui({ session, runtime, store })
```

- [ ] **Step 4: Run 确认通过**

Run: `bun test packages/cli/test` 与全量 `bun test`
Expected: PASS（既有 cli.test.ts 断言全部保持；config/runtime 新增绿）。行为冒烟：`bun packages/cli/src/main.ts --headless --mock --prompt hello` 输出不变。

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/src/main.ts packages/cli/src/connect.ts packages/cli/test/config.test.ts packages/cli/test/runtime.test.ts packages/cli/test/cli.test.ts
git commit -m "feat(cli): 配置存储与运行时组装改造

- ~/.iterum/config.json 读写（损坏回退）
- createRuntime：注册表驱动组装 + rebuild 立即生效（model/effort 切换）
- connect PROVIDERS 扩为 8 家厂商"
```

---

### Task 28: TUI 对话框组件 + DialogHost 挂载（tui）

**Files:**
- Create: `packages/tui/src/components/ConnectWizard.tsx`、`packages/tui/src/components/ModelPicker.tsx`、`packages/tui/src/components/EffortPicker.tsx`
- Modify: `packages/tui/src/App.tsx`（挂载 DialogHost + 透传 props）、`packages/tui/src/components/Composer.tsx`（增加 `disabled?: boolean`，对话框打开时忽略输入）
- Test: `packages/tui/test/connect-wizard.test.tsx`、`packages/tui/test/effort-picker.test.tsx`

**Interfaces:**
- Consumes: T25 的 `EffortLevel`、`DialogHost`
- Produces（T29 消费）:
  - `ConnectWizard`：`{ vendors: { id: string; name: string }[]; current?: string; loading: boolean; error?: string; models: string[]; onPickVendor(id: string): void; onSubmitKey(key: string): void; onPickModel(model: string): void; onManualModel(model: string): void; onCancel(): void }`——组件自含步骤态（pick-vendor → enter-key → loading → pick-model）；enter-key 步骤逐字符收集、屏幕回显 `*`。
  - `ModelPicker`：`{ models: string[]; current?: string; loading: boolean; error?: string; onPick(m: string): void; onRefresh(): void; onManual(m: string): void; onCancel(): void }`（上下键选择 + 回车；`m` 键进入手动输入模式）
  - `EffortPicker`：`{ levels: { id: EffortLevel; label: string }[]; current?: EffortLevel; supported: boolean; onPick(e: EffortLevel): void; onCancel(): void }`
  - `App` 新 props：`dialog?: "connect" | "model" | "effort" | null` 与三个对话框所需的数据/回调 props（详见实现）

- [ ] **Step 1: 写失败测试**

```tsx
// packages/tui/test/connect-wizard.test.tsx
import React from "react"
import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import { ConnectWizard } from "../src/components/ConnectWizard"

describe("ConnectWizard", () => {
  test("第一步渲染厂商列表", () => {
    const { lastFrame } = render(<ConnectWizard vendors={[{ id: "openai", name: "OpenAI" }, { id: "deepseek", name: "DeepSeek" }]} loading={false} models={[]} onPickVendor={() => {}} onSubmitKey={() => {}} onPickModel={() => {}} onManualModel={() => {}} onCancel={() => {}} />)
    expect(lastFrame()).toContain("OpenAI")
    expect(lastFrame()).toContain("DeepSeek")
  })
  test("loading 状态显示拉取中", () => {
    const { lastFrame } = render(<ConnectWizard vendors={[{ id: "openai", name: "OpenAI" }]} loading={true} models={[]} onPickVendor={() => {}} onSubmitKey={() => {}} onPickModel={() => {}} onManualModel={() => {}} onCancel={() => {}} />)
    expect(lastFrame()).toContain("加载")
  })
  test("error 状态显示错误与手动输入提示", () => {
    const { lastFrame } = render(<ConnectWizard vendors={[{ id: "openai", name: "OpenAI" }]} loading={false} error="401" models={[]} onPickVendor={() => {}} onSubmitKey={() => {}} onPickModel={() => {}} onManualModel={() => {}} onCancel={() => {}} />)
    expect(lastFrame()).toContain("401")
    expect(lastFrame()).toContain("手动输入")
  })
})
```

```tsx
// packages/tui/test/effort-picker.test.tsx
import React from "react"
import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import { EffortPicker } from "../src/components/EffortPicker"

describe("EffortPicker", () => {
  test("支持时渲染四档", () => {
    const { lastFrame } = render(<EffortPicker levels={[{ id: "low", label: "低" }, { id: "medium", label: "中" }, { id: "high", label: "高" }, { id: "max", label: "极高" }]} current="medium" supported={true} onPick={() => {}} onCancel={() => {}} />)
    const frame = lastFrame()
    expect(frame).toContain("低")
    expect(frame).toContain("极高")
  })
  test("不支持时显示提示", () => {
    const { lastFrame } = render(<EffortPicker levels={[]} supported={false} onPick={() => {}} onCancel={() => {}} />)
    expect(lastFrame()).toContain("不支持")
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/tui/test/connect-wizard.test.tsx packages/tui/test/effort-picker.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 最小实现**

```tsx
// packages/tui/src/components/ConnectWizard.tsx
// 状态机：step: "pick-vendor" | "enter-key" | "loading" | "pick-model"
// pick-vendor：useInput 上下键移动高亮（▸ 前缀）、回车 onPickVendor(selected) → step enter-key
// enter-key：逐字符收集（backspace 删除、回车提交 onSubmitKey(key)、Esc onCancel），屏幕回显 "*"×len
// loading：显示"加载模型列表…"
// pick-model：models 列表上下键选择 + 回车 onPickModel；"m" 进入手动输入（回车 onManualModel）
// error 非空时：显示 error + "拉取失败，按 m 手动输入模型名，Esc 取消"
// 外壳：<DialogHost title="/connect 连接厂商">
// 外部状态（loading/models/error/current）由 props 驱动覆盖内部步骤
```

```tsx
// packages/tui/src/components/ModelPicker.tsx
// 上下键选择 + 回车 onPick；"r" onRefresh（loading 时显示"刷新中…"）；"m" 手动输入模式（回车 onManual）
// 外壳：<DialogHost title="/model 切换模型">
```

```tsx
// packages/tui/src/components/EffortPicker.tsx
// supported=false：<DialogHost title="/effort 思考强度"><Text>当前厂商/模型不支持思考强度</Text></DialogHost>
// supported=true：上下键四档（低/中/高/极高，当前档标 ▸）+ 回车 onPick；Esc onCancel
// 外壳：<DialogHost title="/effort 思考强度">
```

```tsx
// packages/tui/src/App.tsx —— 增加 dialog 渲染区（Footer 上方）：
// props 增加：dialog?: "connect" | "model" | "effort" | null
//   connectProps?: ConnectWizard 所需数据+回调；modelProps?: ModelPicker…；effortProps?: EffortPicker…
// 渲染：{dialog === "connect" && connectProps ? <ConnectWizard {...connectProps} /> : dialog === "model" && modelProps ? <ModelPicker {...modelProps} /> : dialog === "effort" && effortProps ? <EffortPicker {...effortProps} /> : null}
// Composer 增加 disabled={dialog != null} 透传
```

```tsx
// packages/tui/src/components/Composer.tsx —— useInput 首行增加：
if (disabled) return
// props 增加 disabled?: boolean
```

- [ ] **Step 4: Run 确认通过**

Run: `bun test packages/tui/test`
Expected: PASS（新增绿；既有 app/composer/transcript 等测试全绿——disabled 默认 false 不影响既有断言）

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/components/ConnectWizard.tsx packages/tui/src/components/ModelPicker.tsx packages/tui/src/components/EffortPicker.tsx packages/tui/src/App.tsx packages/tui/src/components/Composer.tsx packages/tui/test/connect-wizard.test.tsx packages/tui/test/effort-picker.test.tsx
git commit -m "feat(tui): /connect /model /effort 对话框组件与 DialogHost 挂载

- ConnectWizard 四步向导（选厂商/掩码输 key/拉取/选模型）
- ModelPicker 缓存列表 + 刷新 + 手动兜底；EffortPicker 四档/不支持提示
- App 挂载 DialogHost，Composer 增加 disabled"
```

---

### Task 29: cli slash 路由与状态机（cli）

**Files:**
- Modify: `packages/cli/src/tui.tsx`（routeSlash、TuiApp 对话框状态机、业务回调）、`packages/cli/src/main.ts`（runTui 调用点传 runtime/store）
- Test: `packages/cli/test/tui.test.ts`（追加）

**Interfaces:**
- Consumes: T25 `fetchModels/getVendor/EffortLevel`、T27 `createRuntime/config`、T28 三个对话框 props 契约
- Produces:
  - `routeSlash(text: string): "connect" | "model" | "effort" | null`
  - `runTui(opts: { session: Session; loop: AgentLoop; connected?: boolean; runtime: Runtime; store?: CredentialStore; fetcher?: typeof fetchModels }): void`

- [ ] **Step 1: 写失败测试**

```ts
// packages/cli/test/tui.test.ts 追加：
import { routeSlash } from "../src/tui"

describe("routeSlash", () => {
  test("识别三条指令（容忍首尾空白）", () => {
    expect(routeSlash("/connect")).toBe("connect")
    expect(routeSlash("  /model ")).toBe("model")
    expect(routeSlash("/effort")).toBe("effort")
  })
  test("未知 slash 与普通文本返回 null", () => {
    expect(routeSlash("/status")).toBeNull()
    expect(routeSlash("hello world")).toBeNull()
    expect(routeSlash("")).toBeNull()
  })
})
```

注：未知 slash 与普通文本都由 routeSlash 返回 null，二者在 onSubmit 中以 `text.trim().startsWith("/")` 区分（未知 slash → 助手提示，普通文本 → driveSession），该分支逻辑在 Step 3 实现中一并落地。

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/cli/test/tui.test.ts`
Expected: FAIL（routeSlash 未导出）

- [ ] **Step 3: 最小实现**

```ts
// packages/cli/src/tui.tsx —— 增加：
export function routeSlash(text: string): "connect" | "model" | "effort" | null {
  const t = text.trim()
  if (t === "/connect") return "connect"
  if (t === "/model") return "model"
  if (t === "/effort") return "effort"
  return null
}

// TuiApp 改造：
// props 增加 runtime: Runtime、store: CredentialStore、fetcher: typeof fetchModels（默认 fetchModels 本身）
// state 增加：dialog: "connect" | "model" | "effort" | null；models: string[]；loading: boolean；error?: string
// onSubmit 改造：busy 守卫不变；const cmd = routeSlash(text)
//   cmd === null 且 text.trim().startsWith("/") → 追加助手消息"未知指令：可用 /connect /model /effort"，不进 driveSession
//   cmd === null 且非 slash → 走既有 driveSession 流程
//   cmd 非 null → 打开对话框：
//     "model"/"effort" 且 !runtime.connected → 追加助手消息"请先 /connect 配置凭据"，不开对话框
//     "model" → 优先 config.modelCache[runtime.providerName] 展示；无缓存 → 触发刷新拉取
//     "effort" → EffortPicker（supported = getVendor(providerName)?.effort 且 resolveEffort(vendor, runtime.model, "low") !== undefined）
// 业务回调（全部在 cli 层，可测）：
//   onPickVendor(id) / onSubmitKey(key) → store.set(id, key) → fetcher(vendor, key) → setModels(list.slice(0, 200)) → writeConfig({provider:id, modelCache:{[id]:models}}) → 打开 model 选择步骤（loading/error 状态流转）
//   onPickModel(model) → runtime.rebuild({ providerName: vendorId, model }) → 成功：dialog=null + 助手消息"已切换 <provider>/<model>"；失败(1)：error 显示
//   onManualModel(model) → 同上 onPickModel
//   onRefresh() → 重新 fetcher（runtime.providerName + store.get 的 key）
//   onPickEffort(e) → runtime.rebuild({ effort: e }) → dialog=null + 助手消息"思考强度已切换：<label>"
//   onCancel() → dialog=null
// Composer 展示：渲染 App 时 model 显示值拼为 `${runtime.providerName}/${runtime.model}${runtime.effort ? " · " + effortLabel(runtime.effort) : ""}`（effortLabel: low=低/medium=中/high=高/max=极高），沿用 Composer 既有 model prop，不改 Composer 组件
// 渲染：<App session={s} onSubmit={onSubmit} connected={runtime.connected} dialog={dialog}
//   connectProps={...} modelProps={...} effortProps={...} />
// App 的 dialog 组件 props 组装在此处（TuiApp 是状态机宿主）
```

```ts
// packages/cli/src/main.ts —— TUI 分支改为：
runTui({ session: runtime.session, loop: runtime.loop, connected: runtime.connected, runtime, store })
// runTui 签名同步扩展（见 Interfaces）
```

- [ ] **Step 4: Run 确认通过**

Run: `bun test packages/cli/test` 与全量 `bun test`
Expected: PASS（routeSlash 绿；既有 tui.test 与全量回归全绿）。行为冒烟：`bun packages/cli/src/main.ts --headless --mock --prompt hello` 输出不变；`tsc --noEmit` cli/tui 零新增错误。

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/tui.tsx packages/cli/src/main.ts packages/cli/test/tui.test.ts
git commit -m "feat(cli): slash 路由与对话框状态机接线

- routeSlash 识别 /connect /model /effort
- TuiApp 状态机：向导式连接、模型切换、effort 切换立即生效
- 业务回调存 key/拉模型/写配置/重建 loop"
```

---

### Task 30: 文档同步与分发验证（docs）

**Files:**
- Modify: `README.md`（slash 指令章节 + 8 厂商表 + 安装说明补 config 位置）、`docs/SPEC.md`（附录 B.2 E9 更新：slash 提前实现，保留 new/list/resume 与 --model/--provider 为 M2）、`docs/AGENT_LOG.md`（T25-T29 条目）、`docs/specs/2026-08-14-slash-commands-design.md`（状态行：已实现——本 task 内更新）
- 验证: win-x64 重编译冒烟 + `iterum.exe` 重装到 `C:\Users\Zeto\.local\bin`

**Interfaces:**
- Consumes: 无（收尾）
- Produces: 无

- [ ] **Step 1: README 更新**

在 README"运行"节后新增"## Slash 指令"小节：三条指令用途与快捷键（/connect 向导、/model 切换、/effort 四档），8 家厂商名称列表（含 7 家 OpenAI 兼容、gemini 走官方兼容端点），配置持久化位置 `~/.iterum/config.json`（key 仍在钥匙串）说明；"已知限制"更新：slash 已实现（从 M2 提前），`new/list/resume` 会话管理与 `--model/--provider` CLI 参数仍为 M2。

- [ ] **Step 2: SPEC 附录 B.2 E9 更新**

E9 原登记"slash 命令（/status /model /skills /mcp）"——更新为：`/connect /model /effort` 已提前实现（2026-08-14，见 docs/specs/2026-08-14-slash-commands-design.md）；仍为 M2 的仅 `/status /skills /mcp` 与 `--model/--provider` CLI 参数、`new/list/resume`。

- [ ] **Step 3: AGENT_LOG 与设计文档状态行**

AGENT_LOG 实现阶段表追加 T25-T29 五行（commit/关键点）；设计文档状态行改"已实现（T25-T29，2026-08-14）"。

- [ ] **Step 4: 分发验证**

```bash
bun build --compile --target=bun-windows-x64 packages/cli/src/main.ts --outfile dist/iterum-win-x64.exe
dist\iterum-win-x64.exe --headless --mock --prompt hello   # 期望 4 行 JSON exit 0
Copy-Item dist\iterum-win-x64.exe C:\Users\Zeto\.local\bin\iterum.exe -Force
```

Expected: 编译成功、冒烟输出不变、iterum.exe 更新。

- [ ] **Step 5: Commit**

```bash
git add README.md docs/SPEC.md docs/AGENT_LOG.md docs/specs/2026-08-14-slash-commands-design.md
git commit -m "docs: slash 指令文档同步与分发更新

- README 增加 Slash 指令章节与 8 厂商表
- SPEC B.2 E9 更新（/connect /model /effort 提前实现）
- AGENT_LOG 补 T25-T29；win-x64 重编译并重装 iterum.exe"
```

---

## 依赖与执行顺序

T25 → T26 → T27；T28 依赖 T25（类型）可与 T27 并行；T29 依赖 T27+T28（最后）；T30 收尾。串行主链：T25 → T26 → (T27 ∥ T28) → T29 → T30。

## 验收映射

- /connect 全流程（厂商→key→列表→模型）→ T25+T28+T29
- /model 切换 → T27+T28+T29
- /effort 四档 → T25+T26+T28+T29
- 配置持久化与立即生效 → T27+T29
- 真机验收清单（spec §7 手动项）→ T30 后由用户执行
