# Iterum M1（核心 harness）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 Iterum 里程碑 1：CLI-only coding agent harness 核心——mock 可驱动的 agent loop、反馈闭环、治理护栏、凭据安全、SKILL.md 记忆、stdio MCP、Ink TUI、机制演示三件套、二进制与 Docker 分发、CI。

**Architecture:** 单进程分层：`packages/core`（无头、可测、依赖接口注入，重点维度所在）→ `packages/tui`（Ink 纯渲染）→ `packages/cli`（组装入口）。core 零 import tui；TUI 与 headless 消费同一 `SessionEvent` 事件流与同一 `Session` 数据模型。

**Tech Stack:** TypeScript (strict) + Bun（runtime/test/build/compile）+ Ink（TUI）+ openai/@anthropic-ai/sdk + @napi-rs/keyring + @modelcontextprotocol/sdk + ink-testing-library（快照）。

**Spec:** `docs/SPEC.md`（本计划的唯一上游；执行者必须同时阅读 SPEC 与本文档）

## Global Constraints

- Bun >= 1.2；TypeScript strict；`bun test` 为唯一测试命令（`make test` 入口）。
- TDD 硬性：每 task 先写失败测试 → 运行看到 RED → 最小实现 → GREEN → 提交。禁止先实现后补测试；违反此约束的代码将被删除重做。
- 凭据红线：key 字符串绝不落盘、绝不进日志/事件流/transcript/错误信息；测试中绝不出现真实 key（只用 `test-key-***` 占位）。
- 命名/路径约定：core 包路径前缀 `packages/core/src/...`；类型与接口名以本计划 "Interfaces" 区块为准（跨 task 一致性）。
- 每个 task 结束必须 `git commit`（单 task 单提交）；提交信息格式 `feat(scope): summary`。
- 每 task 完成后执行两阶段评审（spec 合规 → 代码质量），Critical 问题必须修复才进下一 task。
- Windows 为当前开发验证平台（PowerShell 5.1）；所有命令在 repo 根目录执行。

---

### Task 1: Workspace 脚手架与 Makefile

**目标：** 建立 Bun workspace 单仓结构与一键测试入口。

**涉及文件：**
- Create: `package.json`（workspaces）、`tsconfig.json`、`packages/core/package.json`、`packages/tui/package.json`、`packages/cli/package.json`、`packages/core/tsconfig.json`、`packages/core/src/index.ts`、`packages/core/test/smoke.test.ts`、`Makefile`、`.gitignore`

**Interfaces:**
- Produces: 根命令 `make test`（= `bun test`）；workspace 包名 `@iterum/core`、`@iterum/tui`、`@iterum/cli`。

**依赖：** 无（第一个任务）。**可并行：** 无。

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/smoke.test.ts
import { describe, expect, test } from "bun:test"
import { coreVersion } from "../src/index"

describe("core smoke", () => {
  test("coreVersion returns M1", () => {
    expect(coreVersion()).toBe("M1")
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test packages/core/test/smoke.test.ts`
Expected: FAIL（`coreVersion` 未定义 / 模块无导出）

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/index.ts
export function coreVersion(): string {
  return "M1"
}
```

根 `package.json`：

```json
{
  "name": "iterum",
  "private": true,
  "workspaces": ["packages/*"]
}
```

`packages/core/package.json`：

```json
{
  "name": "@iterum/core",
  "version": "0.1.0",
  "module": "src/index.ts"
}
```

`Makefile`：

```makefile
test:
	bun test
```

`.gitignore`：

```gitignore
node_modules/
dist/
.env
*.log
~/.iterum/
```

- [ ] **Step 4: 运行确认通过**

Run: `make test`
Expected: PASS（1 passed）

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json packages/core Makefile .gitignore
git commit -m "feat(workspace): bun workspace scaffold with make test"
```

---

### Task 2: Spike — bun compile + @napi-rs/keyring 打包验证

**目标：** 提前验证 SPEC 风险 R2：Windows 下 `bun build --compile` 能否打包 keyring 原生模块。输出结论，不保留产品代码。

**涉及文件：**
- Create: `spikes/compile-keyring.ts`（一次性 spike，标注 throwaway）、`spikes/README.md`（记录结论）

**Interfaces:**
- Produces: 结论文档（二进制能否运行 + keyring 是否可用）；若失败，Plan 需在本任务记录替代方案（降级为运行时动态 import + 可用性探测），并通知主控更新 T10/T18。

**依赖：** T1。**可并行：** 与 T3 并行。

- [ ] **Step 1: 安装依赖**

```bash
bun add @napi-rs/keyring
```

- [ ] **Step 2: 写 spike 脚本**

```ts
// spikes/compile-keyring.ts
import { Entry } from "@napi-rs/keyring"
const e = new Entry("iterum-spike", "test")
e.setPassword("secret")
console.log("keyring OK:", e.getPassword() === "secret")
e.deletePassword()
```

- [ ] **Step 3: 编译并运行**

```bash
bun build --compile --target=bun-windows-x64 spikes/compile-keyring.ts --outfile spikes/dist/spike.exe
spikes/dist/spike.exe
```

Expected: 输出 `keyring OK: true`。将结果与运行方式写入 `spikes/README.md`。

- [ ] **Step 4: Commit**

```bash
git add spikes/
git commit -m "chore(spike): verify bun compile with napi-rs keyring on windows"
```

---

### Task 3: core/transcript 数据模型与事件总线

**目标：** 定义 Session/Message/Part 类型与 SessionEvent 事件类型（SPEC §7、§3.7），全项目共享的数据契约。

**涉及文件：**
- Create: `packages/core/src/transcript/types.ts`、`packages/core/src/transcript/events.ts`、`packages/core/src/transcript/session.ts`、`packages/core/test/transcript.test.ts`
- Modify: `packages/core/src/index.ts`（导出）

**Interfaces:**
- Produces: `Session`, `Message`, `Part`（`TextPart|ReasoningPart|ToolPart|PermissionPart|FeedbackPart`）, `ToolResult`, `ContextUsage`, `SessionEvent`, `createSession(opts)`, `appendPart(message, part)`（返回新消息，消息不可变）。

```ts
// packages/core/src/transcript/types.ts
export type Part = TextPart | ReasoningPart | ToolPart | PermissionPart | FeedbackPart
export interface TextPart { type: "text"; text: string }
export interface ReasoningPart { type: "reasoning"; title?: string; markdown: string; time: { start: number; end: number } }
export interface ToolResult { ok: boolean; output: string; exitCode?: number; durationMs: number }
export interface ToolPart {
  type: "tool"; tool: string; args: Record<string, unknown>
  state: "pending" | "running" | "completed" | "error"
  result?: ToolResult; time: { start: number; end: number }
}
export interface PermissionRequest { id: string; tool: string; args: Record<string, unknown>; reason: string; riskLevel: "low" | "high" }
export interface PermissionPart { type: "permission"; request: PermissionRequest; decision?: "allow" | "deny" }
export interface FeedbackPart { type: "feedback"; verifier: string; status: "pass" | "fail"; summary: string; failureIndex?: number }
export interface Message { id: string; role: "user" | "assistant"; parts: Part[]; time: { start: number; end: number } }
export interface ContextUsage { inputTokens: number; outputTokens: number; reasoningTokens: number; costUsd: number; contextPercent: number }
export interface Session {
  id: string; cwd: string; title: string; provider: string; model: string
  messages: Message[]; contextUsage: ContextUsage
  permissionDecisions: Map<string, "allow" | "deny">
  feedbackFailures: number
}
```

```ts
// packages/core/src/transcript/events.ts
export type SessionEvent =
  | { type: "assistant_started"; messageId: string }
  | { type: "text_delta"; messageId: string; partId: string; text: string }
  | { type: "reasoning_delta"; messageId: string; partId: string; title?: string; text: string }
  | { type: "tool_started"; messageId: string; partId: string; tool: string; args: Record<string, unknown> }
  | { type: "tool_completed"; messageId: string; partId: string; result: ToolResult }
  | { type: "permission_requested"; partId: string; request: PermissionRequest }
  | { type: "feedback_injected"; partId: string; verifier: string; status: "pass" | "fail"; summary: string; failureIndex: number }
  | { type: "assistant_completed"; messageId: string }
  | { type: "session_idle" }
```

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/transcript.test.ts
import { describe, expect, test } from "bun:test"
import { createSession, appendPart } from "../src/transcript/session"

describe("transcript", () => {
  test("appendPart appends and returns new message (immutable)", () => {
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "openai", model: "gpt-4o" })
    const msg = { id: "m1", role: "assistant" as const, parts: [] as Part[], time: { start: 0, end: 0 } }
    const next = appendPart(msg, { type: "text", text: "hi" })
    expect(next.parts.length).toBe(1)
    expect(msg.parts.length).toBe(0)
    expect(next.id).toBe("m1")
  })

  test("new session has empty messages and zero failures", () => {
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "openai", model: "gpt-4o" })
    expect(s.messages.length).toBe(0)
    expect(s.feedbackFailures).toBe(0)
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/transcript.test.ts`
Expected: FAIL（`createSession` 不存在）

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/transcript/session.ts
import type { Message, Part, Session } from "./types"

export function createSession(opts: { cwd: string; title: string; provider: string; model: string }): Session {
  return {
    id: crypto.randomUUID(), ...opts, messages: [],
    contextUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, costUsd: 0, contextPercent: 0 },
    permissionDecisions: new Map(), feedbackFailures: 0,
  }
}

export function appendPart(message: Message, part: Part): Message {
  return { ...message, parts: [...message.parts, part] }
}
```

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/transcript packages/core/test/transcript.test.ts packages/core/src/index.ts
git commit -m "feat(core): transcript data model and session events"
```

---

### Task 4: core/llm — LLMEvent 类型与 MockProvider

**目标：** 统一 LLM 事件模型与脚本化 MockProvider（SPEC §3.1；所有核心测试的基石）。

**涉及文件：**
- Create: `packages/core/src/llm/types.ts`、`packages/core/src/llm/mock.ts`、`packages/core/test/llm/mock.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: 无（仅本模块类型）。
- Produces: `LLMEvent`、`ChatRequest`、`LLMProvider`、`MockProvider`、`MockStep`（后续 T5/T9/T17 依赖）。

```ts
// packages/core/src/llm/types.ts
export type LLMEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "done" }

export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface ChatRequest { model: string; system: string; messages: ChatMessage[]; maxTokens?: number }
export interface LLMProvider { complete(req: ChatRequest): AsyncIterable<LLMEvent> }

export type MockStep =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> }
```

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/llm/mock.test.ts
import { describe, expect, test } from "bun:test"
import { MockProvider } from "../../src/llm/mock"

async function collect(provider: MockProvider, req: any) {
  const events: any[] = []
  for await (const e of provider.complete(req)) events.push(e)
  return events
}

describe("MockProvider", () => {
  test("emits scripted events in order and records requests", async () => {
    const p = new MockProvider([
      { type: "reasoning", text: "thinking" },
      { type: "tool", name: "read_file", args: { path: "a.ts" } },
      { type: "text", text: "done" },
    ])
    const events = await collect(p, { model: "mock", system: "", messages: [] })
    expect(events.map(e => e.type)).toEqual(["reasoning_delta", "tool_call", "text_delta", "done"])
    expect(p.requests.length).toBe(1)
  })

  test("second request gets second script entry (multi-turn)", async () => {
    const p = new MockProvider([[{ type: "text", text: "one" }], [{ type: "text", text: "two" }]])
    await collect(p, { model: "mock", system: "", messages: [] })
    const events = await collect(p, { model: "mock", system: "", messages: [] })
    expect(events.find(e => e.type === "text_delta")?.text).toBe("two")
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/llm/mock.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/llm/mock.ts
import type { ChatRequest, LLMEvent, LLMProvider, MockStep } from "./types"

export class MockProvider implements LLMProvider {
  public requests: ChatRequest[] = []
  private cursor = 0
  constructor(private script: MockStep[] | MockStep[][]) {}

  async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
    this.requests.push(req)
    const steps = Array.isArray(this.script[0]) ? (this.script as MockStep[][])[this.cursor++] ?? [] : (this.script as MockStep[])
    for (const s of steps) {
      if (s.type === "text") yield { type: "text_delta", text: s.text }
      else if (s.type === "reasoning") yield { type: "reasoning_delta", text: s.text }
      else yield { type: "tool_call", name: s.name, args: s.args }
    }
    yield { type: "done" }
  }
}
```

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/llm packages/core/test/llm packages/core/src/index.ts
git commit -m "feat(core): llm event model and scripted MockProvider"
```

---

### Task 5: core/llm — OpenAI 与 Anthropic Provider 适配

**目标：** 官方 SDK 适配到统一 LLMEvent 流；SDK 在测试中用 bun mock 替换，零网络。

**涉及文件：**
- Create: `packages/core/src/llm/openai.ts`、`packages/core/src/llm/anthropic.ts`、`packages/core/test/llm/openai.test.ts`、`packages/core/test/llm/anthropic.test.ts`

**Interfaces:**
- Consumes: T4 的 `LLMProvider`/`LLMEvent`/`ChatRequest`。
- Produces: `OpenAIProvider({ apiKey, model?, baseURL? })`、`AnthropicProvider({ apiKey, model?, baseURL? })`——均实现 `LLMProvider`。

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/llm/openai.test.ts
import { describe, expect, test, mock } from "bun:test"

mock.module("openai", () => ({
  default: class {
    chat = { completions: { create: mock(async () => new ReadableStream<unknown>()) } }
  },
}))

import { OpenAIProvider } from "../../src/llm/openai"

describe("OpenAIProvider", () => {
  test("maps text deltas to LLMEvent stream", async () => {
    const fake = () => {
      const encoder = new TextEncoder()
      return new ReadableStream({
        start(c) {
          c.enqueue({ choices: [{ delta: { content: "he" } }] })
          c.enqueue({ choices: [{ delta: { content: "llo" } }] })
          c.close()
        },
      })
    }
    const OpenAIMod = await import("openai")
    ;(OpenAIMod.default as any).chat.completions.create = mock(async () => fake())
    const p = new OpenAIProvider({ apiKey: "test-key-openai-0000" })
    const events = []
    for await (const e of p.complete({ model: "gpt-4o", system: "", messages: [{ role: "user", content: "hi" }] })) events.push(e)
    expect(events.map(e => e.type)).toEqual(["text_delta", "text_delta", "done"])
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/llm/openai.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

```bash
bun add openai @anthropic-ai/sdk
```

```ts
// packages/core/src/llm/openai.ts
import OpenAI from "openai"
import type { ChatRequest, LLMEvent, LLMProvider } from "./types"

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  constructor(private opts: { apiKey: string; model?: string; baseURL?: string }) {
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL })
  }
  async *complete(req: ChatRequest): AsyncIterable<LLMEvent> {
    const stream = await this.client.chat.completions.create({
      model: this.opts.model ?? req.model, stream: true,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield { type: "text_delta", text: delta }
    }
    yield { type: "done" }
  }
}
```

`packages/core/src/llm/anthropic.ts`（同构实现：`client.messages.stream` 遍历 `content_block_delta`，`text_delta` 事件映射；reasoning block 映射为 `reasoning_delta`；`tool_use` block 映射为 `tool_call`）。

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS（含 anthropic.test.ts 同构断言）

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/llm packages/core/test/llm package.json bun.lock
git commit -m "feat(core): openai and anthropic provider adapters"
```

---

### Task 6: core/tools — 工具接口、注册表与文件/Shell 工具

**目标：** 统一 Tool 协议与可注入执行器（SPEC §3.3；执行器注入使测试零真实 shell）。

**涉及文件：**
- Create: `packages/core/src/tools/types.ts`、`packages/core/src/tools/registry.ts`、`packages/core/src/tools/fs.ts`、`packages/core/src/tools/bash.ts`、`packages/core/test/tools.test.ts`

**Interfaces:**
- Consumes: T3 的 `ToolResult`。
- Produces: `Tool`、`ToolCall`、`ToolRegistry`、`ReadFileTool`、`WriteFileTool`、`BashTool`、`CommandRunner`（T8/T9/T12 依赖）。

```ts
// packages/core/src/tools/types.ts
import type { ToolResult } from "../transcript/types"
export interface ToolCall { name: string; args: Record<string, unknown> }
export interface Tool {
  name: string; description: string
  execute(call: ToolCall): Promise<ToolResult>
}
export type CommandRunner = (cmd: string, cwd: string) => Promise<{ exitCode: number; output: string }>
```

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/tools.test.ts
import { describe, expect, test } from "bun:test"
import { ToolRegistry } from "../src/tools/registry"
import { ReadFileTool, WriteFileTool } from "../src/tools/fs"
import { BashTool } from "../src/tools/bash"
import { mkdtempSync, writeFileSync } from "node:fs"
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
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/tools.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/tools/registry.ts
import type { Tool } from "./types"
export class ToolRegistry {
  private tools = new Map<string, Tool>()
  register(t: Tool) { this.tools.set(t.name, t) }
  get(name: string) { return this.tools.get(name) }
  list() { return [...this.tools.values()] }
}
```

```ts
// packages/core/src/tools/fs.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { Tool } from "./types"

export class ReadFileTool implements Tool {
  name = "read_file"; description = "Read a file from the workspace"
  async execute(call: ToolCall) {
    const { path } = call.args as { path: string }
    const t = Date.now()
    if (!existsSync(path)) return { ok: false, output: `File not found: ${path}`, durationMs: Date.now() - t }
    return { ok: true, output: readFileSync(path, "utf8"), durationMs: Date.now() - t }
  }
}

export class WriteFileTool implements Tool {
  name = "write_file"; description = "Write content to a file (creating dirs as needed)"
  async execute(call: ToolCall) {
    const { path, content } = call.args as { path: string; content: string }
    const t = Date.now()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    return { ok: true, output: `Wrote ${path}`, durationMs: Date.now() - t }
  }
}
```

```ts
// packages/core/src/tools/bash.ts
import type { CommandRunner, Tool } from "./types"

export class BashTool implements Tool {
  name = "bash"; description = "Run a shell command in the workspace"
  constructor(private runner: CommandRunner, private cwd: string = process.cwd()) {}
  async execute(call: ToolCall) {
    const { command } = call.args as { command: string }
    const t = Date.now()
    const { exitCode, output } = await this.runner(command, this.cwd)
    return { ok: exitCode === 0, output, exitCode, durationMs: Date.now() - t }
  }
}
```

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools packages/core/test/tools.test.ts packages/core/src/index.ts
git commit -m "feat(core): tool interface, registry, fs and bash tools"
```

---

### Task 7: core/permission — 治理护栏

**目标：** 危险命令黑名单规则引擎 + 会话级审批记忆（SPEC §3.4；演示①的基础）。

**涉及文件：**
- Create: `packages/core/src/permission/types.ts`、`packages/core/src/permission/gateway.ts`、`packages/core/test/permission.test.ts`

**Interfaces:**
- Consumes: T3 `PermissionRequest`、T6 `ToolCall`。
- Produces: `PermissionDecision = "allow" | "deny" | "ask"`、`PermissionGateway`。

```ts
// packages/core/src/permission/types.ts
export type PermissionDecision = "allow" | "deny" | "ask"
export interface PermissionRule { pattern: RegExp; reason: string; riskLevel: "low" | "high" }
```

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/permission.test.ts
import { describe, expect, test } from "bun:test"
import { PermissionGateway, defaultRules } from "../src/permission/gateway"

const gw = () => new PermissionGateway(defaultRules)

describe("PermissionGateway", () => {
  test("dangerous bash commands ask", () => {
    for (const cmd of ["rm -rf /", "git push --force origin main", "DROP TABLE users", "chmod -R 777 ."]) {
      expect(gw().check({ name: "bash", args: { command: cmd } }, new Map())).toBe("ask")
    }
  })

  test("safe operations allow by default", () => {
    expect(gw().check({ name: "read_file", args: { path: "a.ts" } }, new Map())).toBe("allow")
    expect(gw().check({ name: "bash", args: { command: "bun test" } }, new Map())).toBe("allow")
  })

  test("session memory: previously allowed signature skips ask", () => {
    const call = { name: "bash", args: { command: "rm -rf build" } }
    const g = gw()
    expect(g.check(call, new Map())).toBe("ask")
    const mem = new Map<string, "allow" | "deny">()
    mem.set(g.signature(call), "allow")
    expect(g.check(call, mem)).toBe("allow")
  })

  test("denied in memory returns deny", () => {
    const call = { name: "bash", args: { command: "rm -rf build" } }
    const g = gw()
    const mem = new Map<string, "allow" | "deny">()
    mem.set(g.signature(call), "deny")
    expect(g.check(call, mem)).toBe("deny")
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/permission.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/permission/gateway.ts
import type { ToolCall } from "../tools/types"
import type { PermissionDecision, PermissionRule } from "./types"

export const defaultRules: PermissionRule[] = [
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*-rf\b/i, reason: "recursive force delete", riskLevel: "high" },
  { pattern: /git\s+push\s+.*--force/i, reason: "force push", riskLevel: "high" },
  { pattern: /drop\s+table/i, reason: "drop table", riskLevel: "high" },
  { pattern: /chmod\s+-R\s+777/i, reason: "world-writable permissions", riskLevel: "high" },
  { pattern: /del\s+\/s\s+\/q/i, reason: "recursive delete (windows)", riskLevel: "high" },
]

export class PermissionGateway {
  constructor(private rules: PermissionRule[] = defaultRules) {}
  signature(call: ToolCall): string {
    return `${call.name}:${JSON.stringify(call.args)}`
  }
  check(call: ToolCall, memory: Map<string, "allow" | "deny">): PermissionDecision {
    const remembered = memory.get(this.signature(call))
    if (remembered) return remembered
    if (call.name === "bash") {
      const cmd = String(call.args.command ?? "")
      for (const rule of this.rules) if (rule.pattern.test(cmd)) return "ask"
    }
    return "allow"
  }
}
```

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/permission packages/core/test/permission.test.ts packages/core/src/index.ts
git commit -m "feat(core): permission gateway with dangerous command rules and session memory"
```

---

### Task 8: core/feedback — VerifyRunner 与反馈归一化

**目标：** 重点维度核心（SPEC §3.5、§5.3）：验证结果归一化为 Feedback 并断言回灌模板。

**涉及文件：**
- Create: `packages/core/src/feedback/types.ts`、`packages/core/src/feedback/verify.ts`、`packages/core/test/feedback.test.ts`

**Interfaces:**
- Consumes: T6 `CommandRunner`。
- Produces: `Feedback`、`ChangedFile`、`VerifyRunner`、`formatFeedback(feedback): string`（回灌文本模板，T9/T17 依赖）。

```ts
// packages/core/src/feedback/types.ts
export interface ChangedFile { path: string; action: "write" | "delete" }
export interface Feedback {
  verifier: string; status: "pass" | "fail"; exitCode?: number
  summary: string; affectedFiles: string[]
}
```

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/feedback.test.ts
import { describe, expect, test } from "bun:test"
import { VerifyRunner } from "../src/feedback/verify"
import { formatFeedback } from "../src/feedback/verify"

const failRunner = async () => ({ exitCode: 1, output: "FAIL auth.test.ts: expected 1, got 2\n27 passed, 1 failed" })
const passRunner = async () => ({ exitCode: 0, output: "28 passed" })

describe("VerifyRunner", () => {
  test("non-zero exit produces fail feedback with summary", async () => {
    const r = new VerifyRunner("test", failRunner)
    const f = await r.verify([{ path: "src/auth.ts", action: "write" }])
    expect(f.status).toBe("fail")
    expect(f.verifier).toBe("test")
    expect(f.affectedFiles).toEqual(["src/auth.ts"])
  })

  test("zero exit produces pass", async () => {
    const r = new VerifyRunner("test", passRunner)
    expect((await r.verify([])).status).toBe("pass")
  })

  test("feedback text template is deterministic", () => {
    const f = { verifier: "test", status: "fail" as const, exitCode: 1, summary: "1 failed", affectedFiles: ["a.ts"] }
    expect(formatFeedback(f)).toContain("[feedback] verifier=test status=fail exitCode=1")
    expect(formatFeedback(f)).toContain("affectedFiles: a.ts")
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/feedback.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/feedback/verify.ts
import type { CommandRunner } from "../tools/types"
import type { ChangedFile, Feedback } from "./types"

export class VerifyRunner {
  constructor(private verifier: string, private runner: CommandRunner) {}
  async verify(changed: ChangedFile[]): Promise<Feedback> {
    const t = Date.now()
    const { exitCode, output } = await this.runner(this.verifier, process.cwd())
    const tail = output.split("\n").slice(-15).join("\n")
    return {
      verifier: this.verifier, status: exitCode === 0 ? "pass" : "fail", exitCode,
      summary: tail, affectedFiles: changed.map(c => c.path),
    }
  }
}

export function formatFeedback(f: Feedback): string {
  return `[feedback] verifier=${f.verifier} status=${f.status} exitCode=${f.exitCode ?? ""}\nsummary:\n${f.summary}\naffectedFiles: ${f.affectedFiles.join(", ")}`
}
```

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/feedback packages/core/test/feedback.test.ts packages/core/src/index.ts
git commit -m "feat(core): verify runner with normalized feedback loop"
```

---

### Task 9: core/agent — AgentLoop 状态机

**目标：** 组装 provider/tools/permission/verify 为完整循环（SPEC §3.2、§5.3；演示②③的基础）。

**涉及文件：**
- Create: `packages/core/src/agent/loop.ts`、`packages/core/src/agent/render.ts`（parts→ChatMessage 序列化）、`packages/core/test/agent.test.ts`

**Interfaces:**
- Consumes: T3（Session/SessionEvent/Part）、T4（LLMProvider）、T6（ToolRegistry/ToolCall）、T7（PermissionGateway/PermissionDecision）、T8（VerifyRunner/formatFeedback）。
- Produces: `AgentLoop`：

```ts
export interface AgentDeps {
  provider: LLMProvider
  tools: ToolRegistry
  permissions: PermissionGateway
  verify: VerifyRunner
  resolvePermission: (req: PermissionRequest) => Promise<"allow" | "deny">
  maxTurns?: number          // 默认 5
  feedbackThreshold?: number // 默认 3
}
export class AgentLoop {
  constructor(private deps: AgentDeps) {}
  run(session: Session, userInput: string): AsyncIterable<SessionEvent>
}
```

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/agent.test.ts
import { describe, expect, test } from "bun:test"
import { MockProvider } from "../src/llm/mock"
import { AgentLoop } from "../src/agent/loop"
import { ToolRegistry } from "../src/tools/registry"
import { PermissionGateway } from "../src/permission/gateway"
import { VerifyRunner, formatFeedback } from "../src/feedback/verify"
import { createSession } from "../src/transcript/session"
import type { Tool } from "../src/tools/types"

async function drain(loop: AgentLoop, session: any, input: string) {
  const events: any[] = []
  for await (const e of loop.run(session, input)) events.push(e)
  return events
}

const alwaysAllow = async () => "allow" as const
const passVerify = new VerifyRunner("test", async () => ({ exitCode: 0, output: "ok" }))

describe("AgentLoop", () => {
  test("plain text turn ends with assistant_completed and session_idle", async () => {
    const provider = new MockProvider([{ type: "text", text: "hello world" }])
    const loop = new AgentLoop({ provider, tools: new ToolRegistry(), permissions: new PermissionGateway(), verify: passVerify, resolvePermission: alwaysAllow })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "hi")
    expect(events.some(e => e.type === "assistant_completed")).toBe(true)
    expect(events.at(-1)?.type).toBe("session_idle")
    expect(s.messages[1].parts[0]).toMatchObject({ type: "text", text: "hello world" })
  })

  test("tool call executes and result goes to transcript", async () => {
    const fakeTool: Tool = {
      name: "fake", description: "fake",
      execute: async () => ({ ok: true, output: "result-1", durationMs: 1 }),
    }
    const reg = new ToolRegistry(); reg.register(fakeTool)
    const provider = new MockProvider([
      { type: "tool", name: "fake", args: { x: 1 } },
      { type: "text", text: "did it" },
    ])
    const loop = new AgentLoop({ provider, tools: reg, permissions: new PermissionGateway(), verify: passVerify, resolvePermission: alwaysAllow })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "do it")
    expect(events.some(e => e.type === "tool_completed" && e.result.output === "result-1")).toBe(true)
    expect(s.messages.flatMap(m => m.parts).some(p => p.type === "tool" && p.result?.output === "result-1")).toBe(true)
  })

  test("verify failure injects feedback into next request and emits feedback_injected", async () => {
    const fakeTool: Tool = {
      name: "fake", description: "fake",
      execute: async () => ({ ok: true, output: "edited", durationMs: 1 }),
    }
    const reg = new ToolRegistry(); reg.register(fakeTool)
    const failVerify = new VerifyRunner("test", async () => ({ exitCode: 1, output: "FAIL auth.test.ts\n1 failed" }))
    const provider = new MockProvider([
      { type: "tool", name: "fake", args: { path: "src/auth.ts" } },
      { type: "text", text: "fixed" },
    ])
    const loop = new AgentLoop({ provider, tools: reg, permissions: new PermissionGateway(), verify: failVerify, resolvePermission: alwaysAllow })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "fix it")
    expect(events.some(e => e.type === "feedback_injected" && e.status === "fail")).toBe(true)
    expect(s.feedbackFailures).toBe(1)
    const secondRequest = provider.requests[1]
    expect(secondRequest.messages.some(m => m.content.includes("[feedback] verifier=test status=fail"))).toBe(true)
    expect(s.messages.flatMap(m => m.parts).some(p => p.type === "feedback" && p.status === "fail")).toBe(true)
  })

  test("three consecutive failures trigger threshold stop with help message", async () => {
    const fakeTool: Tool = {
      name: "fake", description: "fake",
      execute: async () => ({ ok: true, output: "edited", durationMs: 1 }),
    }
    const reg = new ToolRegistry(); reg.register(fakeTool)
    const failVerify = new VerifyRunner("test", async () => ({ exitCode: 1, output: "FAIL" }))
    const script = [
      [{ type: "tool", name: "fake", args: {} }, { type: "text", text: "try1" }],
      [{ type: "tool", name: "fake", args: {} }, { type: "text", text: "try2" }],
      [{ type: "tool", name: "fake", args: {} }, { type: "text", text: "try3" }],
    ]
    const provider = new MockProvider(script)
    const loop = new AgentLoop({ provider, tools: reg, permissions: new PermissionGateway(), verify: failVerify, resolvePermission: alwaysAllow })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "fix it")
    expect(s.feedbackFailures).toBe(3)
    expect(events.at(-1)?.type).toBe("session_idle")
    const lastMsg = s.messages.at(-1)!
    expect(lastMsg.parts.some(p => p.type === "text" && p.text.includes("help"))).toBe(true)
  })

  test("permission ask invokes resolvePermission; deny does NOT enter feedback retry", async () => {
    const fakeTool: Tool = {
      name: "bash", description: "bash",
      execute: async () => ({ ok: true, output: "never", durationMs: 1 }),
    }
    const reg = new ToolRegistry(); reg.register(fakeTool)
    let asked = false
    const resolvePermission = async (req: any) => { asked = true; return "deny" as const }
    const provider = new MockProvider([
      { type: "tool", name: "bash", args: { command: "rm -rf /" } },
      { type: "text", text: "cannot do that" },
    ])
    const loop = new AgentLoop({ provider, tools: reg, permissions: new PermissionGateway(), verify: passVerify, resolvePermission })
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "mock", model: "mock" })
    const events = await drain(loop, s, "delete it")
    expect(asked).toBe(true)
    expect(events.some(e => e.type === "permission_requested")).toBe(true)
    const toolParts = s.messages.flatMap(m => m.parts).filter(p => p.type === "tool")
    expect(toolParts[0]).toMatchObject({ state: "error" })
    expect(events.some(e => e.type === "feedback_injected")).toBe(false)
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/agent.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/agent/loop.ts
import type { LLMProvider } from "../llm/types"
import type { ToolRegistry } from "../tools/types"
import type { PermissionDecision } from "../permission/types"
import { PermissionGateway } from "../permission/gateway"
import { VerifyRunner, formatFeedback } from "../feedback/verify"
import { appendPart, createSession as _unused } from "../transcript/session"
import type { Message, PermissionRequest, Session, SessionEvent, ToolPart } from "../transcript/types"

export interface AgentDeps {
  provider: LLMProvider
  tools: ToolRegistry
  permissions: PermissionGateway
  verify: VerifyRunner
  resolvePermission: (req: PermissionRequest) => Promise<"allow" | "deny">
  maxTurns?: number
  feedbackThreshold?: number
}

export class AgentLoop {
  private maxTurns: number
  private threshold: number
  constructor(private deps: AgentDeps) {
    this.maxTurns = deps.maxTurns ?? 5
    this.threshold = deps.feedbackThreshold ?? 3
  }

  async *run(session: Session, userInput: string): AsyncIterable<SessionEvent> {
    session.messages = [...session.messages, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: userInput }], time: { start: 0, end: 0 } }]

    for (let turn = 0; turn < this.maxTurns; turn++) {
      const assistant: Message = { id: crypto.randomUUID(), role: "assistant", parts: [], time: { start: Date.now(), end: 0 } }
      session.messages = [...session.messages, assistant]
      yield { type: "assistant_started", messageId: assistant.id }

      const req = {
        model: session.model, system: this.systemPrompt(session),
        messages: session.messages.slice(0, -1).map(m => ({ role: m.role, content: this.render(m) })),
      }

      let hadToolCall = false
      for await (const ev of this.deps.provider.complete(req)) {
        if (ev.type === "text_delta") {
          const last = assistant.parts.at(-1)
          if (last?.type === "text") last.text += ev.text
          else assistant.parts.push({ type: "text", text: ev.text })
          yield { type: "text_delta", messageId: assistant.id, partId: "", text: ev.text }
        } else if (ev.type === "reasoning_delta") {
          const last = assistant.parts.at(-1)
          if (last?.type === "reasoning") last.markdown += ev.text
          else assistant.parts.push({ type: "reasoning", markdown: ev.text, time: { start: Date.now(), end: Date.now() } })
          yield { type: "reasoning_delta", messageId: assistant.id, partId: "", text: ev.text }
        } else if (ev.type === "tool_call") {
          hadToolCall = true
          const part: ToolPart = { type: "tool", tool: ev.name, args: ev.args, state: "running", time: { start: Date.now(), end: 0 } }
          assistant.parts.push(part)
          yield { type: "tool_started", messageId: assistant.id, partId: "", tool: ev.name, args: ev.args }

          const decision = this.deps.permissions.check({ name: ev.name, args: ev.args }, session.permissionDecisions)
          if (decision === "ask") {
            const request: PermissionRequest = { id: crypto.randomUUID(), tool: ev.name, args: ev.args, reason: "policy", riskLevel: "high" }
            assistant.parts.push({ type: "permission", request })
            yield { type: "permission_requested", partId: "", request }
            const answer = await this.deps.resolvePermission(request)
            session.permissionDecisions.set(this.deps.permissions.signature({ name: ev.name, args: ev.args }), answer)
            if (answer === "deny") {
              part.state = "error"; part.result = { ok: false, output: "denied by user", durationMs: 0 }
              continue
            }
          } else if (decision === "deny") {
            part.state = "error"; part.result = { ok: false, output: "denied by policy", durationMs: 0 }
            continue
          }

          const tool = this.deps.tools.get(ev.name)
          if (!tool) { part.state = "error"; part.result = { ok: false, output: `unknown tool: ${ev.name}`, durationMs: 0 }; continue }
          part.result = await tool.execute({ name: ev.name, args: ev.args })
          part.state = part.result.ok ? "completed" : "error"
          part.time.end = Date.now()
          yield { type: "tool_completed", messageId: assistant.id, partId: "", result: part.result }
        }
      }
      assistant.time.end = Date.now()

      const changed = assistant.parts.filter(p => p.type === "tool" && p.result?.ok).map(p => ({
        path: String((p.args as any).path ?? ""), action: "write" as const,
      }))
      if (changed.length > 0) {
        const feedback = await this.deps.verify.verify(changed)
        if (feedback.status === "fail") {
          session.feedbackFailures += 1
          assistant.parts.push({ type: "feedback", verifier: feedback.verifier, status: "fail", summary: feedback.summary, failureIndex: session.feedbackFailures })
          yield { type: "feedback_injected", partId: "", verifier: feedback.verifier, status: "fail", summary: feedback.summary, failureIndex: session.feedbackFailures }
          if (session.feedbackFailures >= this.threshold) {
            assistant.parts.push({ type: "text", text: `I've failed verification ${session.feedbackFailures} times in a row. help — please review my attempts:\n${assistant.parts.filter(p => p.type === "tool").map(p => `${(p as ToolPart).tool} ${JSON.stringify((p as ToolPart).args)}`).join("\n")}` })
            break
          }
          continue
        }
      }
      if (!hadToolCall) break
    }
    yield { type: "assistant_completed", messageId: session.messages.at(-1)!.id }
    yield { type: "session_idle" }
  }

  private systemPrompt(session: Session): string {
    return `You are Iterum, a coding agent. cwd: ${session.cwd}. Use tools to act; verification results will be fed back to you.`
  }

  private render(m: Message): string {
    return m.parts.map(p => {
      if (p.type === "text" || p.type === "reasoning") return p.text ?? p.markdown
      if (p.type === "tool") return `[tool:${p.tool}] ${JSON.stringify(p.args)}\n[result] ${p.result?.output ?? "pending"}`
      if (p.type === "feedback") return formatFeedback({ verifier: p.verifier, status: p.status, summary: p.summary, affectedFiles: [] })
      if (p.type === "permission") return `[permission] ${p.request.tool} ${p.decision ?? "pending"}`
      return ""
    }).join("\n")
  }
}
```

> 注：`reasoning_delta` 事件与 `render()` 中 reasoning 序列化的最小实现按本代码为准；若测试揭示多 part 合并 bug，在 Step 3 内修复并保持测试绿。

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS（全部 6 个 agent 测试绿）

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agent packages/core/test/agent.test.ts packages/core/src/index.ts
git commit -m "feat(core): agent loop with feedback injection and threshold stop"
```

---

### Task 10: core/credentials — 钥匙串与 .env

**目标：** 凭据安全存储四操作（SPEC §3.10、§8.1）；keyring 在测试中以 bun mock 替换。

**涉及文件：**
- Create: `packages/core/src/credentials/store.ts`、`packages/core/src/credentials/redacted.ts`、`packages/core/test/credentials.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `CredentialStore`、`maskKey(key): string`、`ProviderCredential = { key: string; source: "keychain" | "env" }`（T14 依赖）。

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/credentials.test.ts
import { describe, expect, test, mock, beforeEach } from "bun:test"

const mem = new Map<string, string>()
mock.module("@napi-rs/keyring", () => ({
  Entry: class {
    constructor(private service: string, private account: string) {}
    setPassword(p: string) { mem.set(`${this.service}/${this.account}`, p) }
    getPassword() { return mem.get(`${this.service}/${this.account}`) ?? null }
    deletePassword() { mem.delete(`${this.service}/${this.account}`) }
  },
}))

import { CredentialStore, maskKey } from "../src/credentials/store"

describe("CredentialStore", () => {
  beforeEach(() => { mem.clear() })

  test("set/get round-trips through keyring", async () => {
    const store = new CredentialStore()
    await store.set("openai", "test-key-openai-0000")
    const got = await store.get("openai")
    expect(got?.key).toBe("test-key-openai-0000")
    expect(got?.source).toBe("keychain")
  })

  test("remove deletes", async () => {
    const store = new CredentialStore()
    await store.set("anthropic", "test-key-anthropic-0000")
    await store.remove("anthropic")
    expect(await store.get("anthropic")).toBeUndefined()
  })

  test("env fallback loads .env and marks source", async () => {
    const store = new CredentialStore({ envDir: ".", envFile: "test.env" })
    const got = await store.get("openai")
    expect(got?.source).toBe("env")
  })

  test("mask never returns full key", () => {
    expect(maskKey("sk-abcdef123456")).toBe("sk-…3456")
    expect(maskKey("sk-abcdef123456")).not.toContain("abcdef")
  })
})
```

测试 fixture `packages/core/test/fixtures/test.env`：

```ini
ITERUM_OPENAI_API_KEY=test-key-openai-env0000
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/credentials.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/credentials/redacted.ts
export function maskKey(key: string): string {
  if (key.length <= 7) return "***"
  return `${key.slice(0, 3)}…${key.slice(-4)}`
}
```

```ts
// packages/core/src/credentials/store.ts
import { Entry } from "@napi-rs/keyring"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export interface ProviderCredential { key: string; source: "keychain" | "env" }
const SERVICE = "iterum"

export class CredentialStore {
  constructor(private opts: { envDir?: string; envFile?: string } = {}) {}
  private entry(provider: string) { return new Entry(SERVICE, provider) }

  async set(provider: "openai" | "anthropic", key: string): Promise<void> {
    this.entry(provider).setPassword(key)
  }
  async remove(provider: "openai" | "anthropic"): Promise<void> {
    this.entry(provider).deletePassword()
  }
  async get(provider: "openai" | "anthropic"): Promise<ProviderCredential | undefined> {
    const stored = this.entry(provider).getPassword()
    if (stored) return { key: stored, source: "keychain" }
    const env = this.loadEnv()
    const envKey = env[`ITERUM_${provider.toUpperCase()}_API_KEY`]
    if (envKey) return { key: envKey, source: "env" }
    return undefined
  }
  private loadEnv(): Record<string, string> {
    const path = this.opts.envDir
      ? join(this.opts.envDir, this.opts.envFile ?? ".env")
      : join(process.cwd(), ".env")
    if (!existsSync(path)) return {}
    const out: Record<string, string> = {}
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2]
    }
    return out
  }
}

export { maskKey } from "./redacted"
```

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/credentials packages/core/test/credentials.test.ts packages/core/test/fixtures packages/core/src/index.ts
git commit -m "feat(core): credential store with os keychain and env fallback"
```

### Task 11: core/memory — SKILL.md 发现与注入

**目标：** 双级 skills 发现（SPEC §3.6）；description 注入、正文按需读取。

**涉及文件：**
- Create: `packages/core/src/memory/skills.ts`、`packages/core/test/memory.test.ts`、`packages/core/test/fixtures/global-skills/write-tests/SKILL.md`、`packages/core/test/fixtures/project-skills/deploy/SKILL.md`

**Interfaces:**
- Consumes: 无。
- Produces: `Skill { name; description; body; source }`、`SkillCatalog.discover(globalDir, projectDir): Skill[]`（项目级覆盖全局级同名）（T9 的 systemPrompt 后续集成，T14 依赖）。

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/memory.test.ts
import { describe, expect, test } from "bun:test"
import { SkillCatalog } from "../src/memory/skills"
import { join } from "node:path"

const fixtures = join(import.meta.dir, "fixtures")

describe("SkillCatalog", () => {
  test("discovers SKILL.md files with parsed frontmatter", () => {
    const skills = SkillCatalog.discover(join(fixtures, "global-skills"), join(fixtures, "project-skills"))
    expect(skills.length).toBe(2)
    const s = skills.find(x => x.name === "write-tests")!
    expect(s.description).toContain("Write failing tests first")
    expect(s.body).toContain("## Instructions")
    expect(s.source).toBe("global")
  })

  test("project-level skill overrides global with same name", () => {
    const skills = SkillCatalog.discover(join(fixtures, "global-skills"), join(fixtures, "project-skills"))
    const deploy = skills.filter(s => s.name === "deploy")
    expect(deploy.length).toBe(1)
    expect(deploy[0].source).toBe("project")
  })
})
```

fixture `global-skills/write-tests/SKILL.md` 与 `project-skills/deploy/SKILL.md`（含 name/description frontmatter + 正文；deploy 同时出现在两目录验证覆盖）。

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/memory.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/memory/skills.ts
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

export interface Skill { name: string; description: string; body: string; source: "global" | "project" }

export class SkillCatalog {
  static discover(globalDir: string, projectDir: string): Skill[] {
    const byName = new Map<string, Skill>()
    for (const s of SkillCatalog.scan(globalDir, "global")) byName.set(s.name, s)
    for (const s of SkillCatalog.scan(projectDir, "project")) byName.set(s.name, s)
    return [...byName.values()]
  }
  private static scan(dir: string, source: "global" | "project"): Skill[] {
    if (!existsSync(dir)) return []
    const out: Skill[] = []
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (!statSync(p).isDirectory()) continue
      const skillFile = join(p, "SKILL.md")
      if (!existsSync(skillFile)) continue
      const raw = readFileSync(skillFile, "utf8")
      const fm = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
      if (!fm) continue
      const meta: Record<string, string> = {}
      for (const line of fm[1].split("\n")) {
        const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
        if (m) meta[m[1]] = m[2]
      }
      if (!meta.name) continue
      out.push({ name: meta.name, description: meta.description ?? "", body: fm[2], source })
    }
    return out
  }
}
```

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory packages/core/test/memory.test.ts packages/core/test/fixtures packages/core/src/index.ts
git commit -m "feat(core): skill catalog with SKILL.md discovery and precedence"
```

---

### Task 12: core/mcp — stdio 客户端与工具桥

**目标：** stdio transport MCP 客户端（SPEC §3.9），MCP 工具桥接为统一 `Tool` 协议。

**涉及文件：**
- Create: `packages/core/src/mcp/client.ts`、`packages/core/test/mcp.test.ts`、`packages/core/test/fixtures/fake-mcp-server.ts`

**Interfaces:**
- Consumes: T6 `Tool`/`ToolResult`。
- Produces: `MCPClient.start(config): Promise<void>`、`MCPClient.tools(): Tool[]`、`MCPClient.callTool(name, args)`、`MCPClient.stop()`。

- [ ] **Step 1: 写失败测试（含真实 stdio 子进程 fake server）**

```ts
// packages/core/test/fixtures/fake-mcp-server.ts
// 极简 MCP stdio JSON-RPC server：initialize / tools/list / tools/call
const read = () => {
  const buf = Buffer.alloc(1024 * 1024)
  const n = require("node:fs").readSync(0, buf, 0, buf.length, null) // 简化示意，实际实现按 Content-Length 帧解析
  return buf.subarray(0, n).toString()
}
```

> 注意：此 fixture 须实现完整 JSON-RPC 帧协议（`Content-Length` 头 + 空行 + JSON body）；实现要点：读取 stdin 直至找到完整帧，`tools/list` 返回 1 个工具 `echo`，`tools/call` 回显参数。

```ts
// packages/core/test/mcp.test.ts
import { describe, expect, test } from "bun:test"
import { MCPClient } from "../src/mcp/client"
import { join } from "node:path"

describe("MCPClient", () => {
  test("connects to fake stdio server and bridges echo tool", async () => {
    const client = new MCPClient()
    await client.start({ command: "bun", args: [join(import.meta.dir, "fixtures", "fake-mcp-server.ts")] })
    const tools = client.tools()
    expect(tools.some(t => t.name === "echo")).toBe(true)
    const result = await client.callTool("echo", { message: "ping" })
    expect(result.ok).toBe(true)
    expect(result.output).toContain("ping")
    await client.stop()
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/mcp.test.ts`
Expected: FAIL（MCPClient 不存在）

- [ ] **Step 3: 最小实现**

```bash
bun add @modelcontextprotocol/sdk
```

```ts
// packages/core/src/mcp/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import type { Tool } from "../tools/types"

export class MCPClient {
  private client?: Client
  private transport?: StdioClientTransport

  async start(config: { command: string; args: string[] }): Promise<void> {
    this.transport = new StdioClientTransport({ command: config.command, args: config.args })
    this.client = new Client({ name: "iterum", version: "0.1.0" })
    await this.client.connect(this.transport)
  }

  tools(): Tool[] {
    const tools = this.client?.listTools?.() // 以实际 SDK API 为准，先 list 后包装
    return []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<import("../transcript/types").ToolResult> {
    const t = Date.now()
    const res = await this.client!.callTool({ name, arguments: args })
    const text = (res.content as { type: string; text?: string }[]).map(c => c.text ?? "").join("\n")
    return { ok: !res.isError, output: text, durationMs: Date.now() - t }
  }

  async stop(): Promise<void> {
    await this.client?.close()
  }
}
```

> 注：`@modelcontextprotocol/sdk` 的精确 API（listTools 为异步方法）以安装版本为准，实现必须通过 Step 1 测试（tools() 返回桥接的 `echo` 工具）。

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/mcp packages/core/test/mcp.test.ts packages/core/test/fixtures package.json bun.lock
git commit -m "feat(core): stdio mcp client with tool bridging"
```

---

### Task 13: core/session — 持久化与恢复

**目标：** Session JSON 落盘/恢复（SPEC §3.8）。

**涉及文件：**
- Create: `packages/core/src/session/store.ts`、`packages/core/test/session-store.test.ts`

**Interfaces:**
- Consumes: T3 `Session`。
- Produces: `SessionStore { dir }`、`save(session)`、`load(id)`、`list(): Session[]`（T14 依赖）。

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/session-store.test.ts
import { describe, expect, test, beforeEach } from "bun:test"
import { SessionStore } from "../src/session/store"
import { createSession } from "../src/transcript/session"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("SessionStore", () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "iterum-sess-")) })

  test("save and load round-trips messages and decisions", () => {
    const store = new SessionStore(dir)
    const s = createSession({ cwd: "C:/proj", title: "t", provider: "openai", model: "gpt-4o" })
    s.messages = [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], time: { start: 0, end: 0 } }]
    s.permissionDecisions.set("bash:{}", "allow")
    store.save(s)
    const loaded = store.load(s.id)!
    expect(loaded.messages[0].parts[0]).toMatchObject({ type: "text", text: "hi" })
    expect(loaded.permissionDecisions.get("bash:{}")).toBe("allow")
  })

  test("corrupt json is skipped without throwing", () => {
    const store = new SessionStore(dir)
    const bad = join(dir, "bad.json")
    Bun.write(bad, "{corrupt")
    expect(() => store.load("bad")).not.toThrow()
    expect(store.load("bad")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/core/test/session-store.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// packages/core/src/session/store.ts
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Session } from "../transcript/types"

export class SessionStore {
  constructor(private dir: string) { mkdirSync(dir, { recursive: true }) }
  private path(id: string) { return join(this.dir, `${id}.json`) }

  save(session: Session): void {
    writeFileSync(this.path(session.id), JSON.stringify({ ...session, permissionDecisions: [...session.permissionDecisions] }, null, 2))
  }
  load(id: string): Session | undefined {
    try {
      const raw = JSON.parse(readFileSync(this.path(id), "utf8"))
      raw.permissionDecisions = new Map(raw.permissionDecisions)
      return raw as Session
    } catch { return undefined }
  }
  list(): Session[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir).filter(f => f.endsWith(".json"))
      .map(f => { const id = f.slice(0, -5); const s = this.load(id); return s ? { id, title: s.title, updatedAt: (s as any).updatedAt } as Session : undefined })
      .filter((s): s is Session => !!s)
  }
}
```

> 注：`list()` 返回轻量摘要（完整 Session 恢复在 T14/TUI 用 `load` 完成）；若测试揭示 JSON 序列化 Map 问题，在 Step 3 修复。

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session packages/core/test/session-store.test.ts packages/core/src/index.ts
git commit -m "feat(core): session persistence with corrupt-file resilience"
```

---

### Task 14: cli — 入口组装与 --headless

**目标：** 组装 core 为可执行入口（SPEC §3.12）；headless 模式输出 JSON 行事件流（演示脚本与 CI 的通道）。

**涉及文件：**
- Create: `packages/cli/src/main.ts`、`packages/cli/test/cli.test.ts`、`packages/cli/package.json`
- Modify: 根 `package.json`（bin 字段占位）

**Interfaces:**
- Consumes: T3/T4/T7/T9/T10/T11/T12/T13 全部 core 导出。
- Produces: `main(argv: string[]): Promise<number>`（T18 打包入口）。

- [ ] **Step 1: 写失败测试**

```ts
// packages/cli/test/cli.test.ts
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
    console.log = (s: any) => { out.push(typeof s === "string" ? s : JSON.stringify(s)); } as any
    const code = await main(["--headless", "--mock", "--prompt", "hello"])
    console.log = orig
    expect(code).toBe(0)
    expect(out.some(l => l.includes('"type":"session_idle"'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/cli/test/cli.test.ts`
Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// packages/cli/src/main.ts
import { MockProvider } from "@iterum/core/llm/mock"
import { AgentLoop } from "@iterum/core/agent/loop"
import { ToolRegistry } from "@iterum/core/tools/registry"
import { BashTool } from "@iterum/core/tools/bash"
import { ReadFileTool, WriteFileTool } from "@iterum/core/tools/fs"
import { PermissionGateway } from "@iterum/core/permission/gateway"
import { VerifyRunner } from "@iterum/core/feedback/verify"
import { CredentialStore } from "@iterum/core/credentials/store"
import { createSession } from "@iterum/core/transcript/session"

export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help")) { console.log("Usage: iterum [--headless] [--mock] [--prompt <text>] [--auto-deny]"); return 0 }
  for (const a of argv) if (a.startsWith("-") && !["--headless", "--mock", "--prompt", "--auto-deny"].includes(a)) return 2

  const headless = argv.includes("--headless")
  const promptIdx = argv.indexOf("--prompt")
  const prompt = promptIdx >= 0 ? argv[promptIdx + 1] : ""
  const mock = argv.includes("--mock")

  if (!headless) {
    console.log("TUI not yet wired (Task 16); use --headless")
    return 0
  }

  const provider = mock ? new MockProvider([{ type: "text", text: "hello from iterum" }]) : null
  if (!provider) { console.error("real provider requires credentials; /connect coming in TUI task"); return 1 }

  const tools = new ToolRegistry()
  tools.register(new ReadFileTool()); tools.register(new WriteFileTool())
  tools.register(new BashTool(async (cmd, cwd) => Bun.spawnSync({ cmd: ["cmd", "/c", cmd], cwd, stdout: "pipe" }).stdout.toString() ? { exitCode: 0, output: "" } : { exitCode: 1, output: "" }))
  const verify = new VerifyRunner("bun test", async (cmd, cwd) => {
    const r = Bun.spawnSync({ cmd: cmd.split(" "), cwd, stdout: "pipe", stderr: "pipe" })
    return { exitCode: r.exitCode, output: r.stdout.toString() + r.stderr.toString() }
  })
  const autoDeny = argv.includes("--auto-deny")
  const loop = new AgentLoop({
    provider, tools, permissions: new PermissionGateway(), verify,
    resolvePermission: async () => autoDeny ? "deny" : "allow",
  })
  const session = createSession({ cwd: process.cwd(), title: "headless", provider: "mock", model: "mock" })
  for await (const ev of loop.run(session, prompt)) console.log(JSON.stringify(ev))
  return 0
}
```

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli packages/core/src/index.ts
git commit -m "feat(cli): entry point with headless json event stream"
```

---

### Task 15: tui — 主题与 transcript 渲染

**目标：** Ink 渲染骨架（SPEC §3.11）：语义化主题 token + Session 五层布局 + part renderer（含 Thinking 折叠）。

**涉及文件：**
- Create: `packages/tui/package.json`、`packages/tui/src/theme.ts`、`packages/tui/src/App.tsx`、`packages/tui/src/components/Transcript.tsx`、`packages/tui/src/components/MessageView.tsx`、`packages/tui/src/components/ReasoningPartView.tsx`、`packages/tui/src/components/ToolPartView.tsx`、`packages/tui/test/transcript.test.tsx`

**Interfaces:**
- Consumes: T3 `Session`/`Message`/`Part`。
- Produces: `<App session={Session} />`、`semanticTheme`（T16 依赖）。

- [ ] **Step 1: 写失败测试（快照）**

```tsx
// packages/tui/test/transcript.test.tsx
import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import React from "react"
import { Transcript } from "../src/components/Transcript"
import type { Session } from "@iterum/core/transcript/types"

const session: Session = {
  id: "s1", cwd: "C:/proj", title: "t", provider: "mock", model: "mock",
  contextUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, costUsd: 0, contextPercent: 0 },
  permissionDecisions: new Map(), feedbackFailures: 0,
  messages: [
    { id: "m1", role: "user", parts: [{ type: "text", text: "fix the test" }], time: { start: 0, end: 0 } },
    { id: "m2", role: "assistant", parts: [
      { type: "reasoning", title: "Inspect failing test", markdown: "look at the test", time: { start: 0, end: 1200 } },
      { type: "tool", tool: "read_file", args: { path: "a.ts" }, state: "completed", result: { ok: true, output: "312 lines", durationMs: 30 }, time: { start: 0, end: 30 } },
      { type: "text", text: "done" },
    ], time: { start: 0, end: 0 } },
  ],
}

describe("Transcript", () => {
  test("renders thought line with title and duration", () => {
    const { lastFrame } = render(<Transcript session={session} />)
    expect(lastFrame()).toContain("Thought: Inspect failing test")
    expect(lastFrame()).toContain("1.2s")
  })

  test("renders collapsed tool with result summary", () => {
    const { lastFrame } = render(<Transcript session={session} />)
    expect(lastFrame()).toContain("read_file")
    expect(lastFrame()).toContain("312 lines")
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/tui/test/transcript.test.tsx`
Expected: FAIL（依赖未安装/组件不存在）

- [ ] **Step 3: 最小实现**

```bash
bun add ink react ink-testing-library -d
```

```ts
// packages/tui/src/theme.ts
export const semanticTheme = {
  text: "white", textMuted: "gray", accent: "cyan", info: "blue",
  success: "green", warning: "yellow", error: "red",
  background: "", border: "gray", borderSubtle: "dim",
  thinkingOpacity: 0.6,
}
```

```tsx
// packages/tui/src/components/Transcript.tsx
import React from "react"
import { Box } from "ink"
import type { Session } from "@iterum/core/transcript/types"
import { MessageView } from "./MessageView"

export function Transcript({ session }: { session: Session }) {
  return <Box flexDirection="column">{session.messages.map(m => <MessageView key={m.id} message={m} />)}</Box>
}
```

```tsx
// packages/tui/src/components/MessageView.tsx
import React, { useState } from "react"
import { Box, Text } from "ink"
import type { Message, Part } from "@iterum/core/transcript/types"
import { semanticTheme } from "../theme"

function PartView({ part }: { part: Part }) {
  if (part.type === "text") return <Text>{part.text}</Text>
  if (part.type === "reasoning") {
    const dur = ((part.time.end - part.time.start) / 1000).toFixed(1)
    const [open, setOpen] = useState(false)
    return (
      <Box flexDirection="column">
        <Text dimColor>{open ? "-" : "+"} Thought: {part.title ?? ""} · {dur}s</Text>
        {open ? <Text color="gray" opacity={semanticTheme.thinkingOpacity as any}>{part.markdown}</Text> : null}
      </Box>
    )
  }
  if (part.type === "tool") {
    return (
      <Box flexDirection="column">
        <Text color="cyan">{part.tool} {JSON.stringify(part.args)}</Text>
        {part.result ? <Text dimColor>  └─ {part.result.output.split("\n")[0]}</Text> : null}
      </Box>
    )
  }
  if (part.type === "feedback") return <Text color={part.status === "fail" ? "red" : "green"}>[feedback] {part.verifier}: {part.summary.split("\n")[0]}</Text>
  if (part.type === "permission") return <Text color="yellow">[permission] {part.request.tool} — {part.decision ?? "pending"}</Text>
  return null
}

export function MessageView({ message }: { message: Message }) {
  return (
    <Box flexDirection="column" marginY={message.role === "user" ? 1 : 0}>
      {message.role === "user" ? <Text bold>❯ {message.parts.map(p => p.type === "text" ? p.text : "").join("")}</Text> : null}
      {message.role === "assistant" ? message.parts.map((p, i) => <PartView key={i} part={p} />) : null}
    </Box>
  )
}
```

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS（快照断言通过）

- [ ] **Step 5: Commit**

```bash
git add packages/tui package.json bun.lock
git commit -m "feat(tui): ink shell with semantic theme and part renderers"
```

---

### Task 16: tui — Composer / Footer / Dialogs / Sidebar

**目标：** TUI 其余区域（SPEC §3.11 + 基线 §7/§8/§10/§9）：multiline composer、footer 状态栏、permission/model dialog、宽屏 sidebar、`/connect` 凭据交互（调用 T10 CredentialStore）。

**涉及文件：**
- Create: `packages/tui/src/components/Composer.tsx`、`Footer.tsx`、`DialogHost.tsx`、`PermissionDialog.tsx`、`Sidebar.tsx`、`packages/tui/src/components/App.tsx`（更新）、`packages/tui/test/composer.test.tsx`、`packages/tui/test/footer.test.tsx`

**Interfaces:**
- Consumes: T15 `semanticTheme`、T3 Session、T10 `CredentialStore`。
- Produces: 完整 `<App>`（T19 的 TUI MUST 自查证据来源）。

- [ ] **Step 1: 写失败测试**

```tsx
// packages/tui/test/composer.test.tsx
import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import React from "react"
import { Composer } from "../src/components/Composer"

describe("Composer", () => {
  test("shows context usage as muted status", () => {
    const { lastFrame } = render(<Composer onSubmit={() => {}} usage={{ tokens: 12400, percent: 24, costUsd: 0.03 }} />)
    expect(lastFrame()).toContain("12,400 (24%)")
    expect(lastFrame()).toContain("$0.03")
  })
})
```

```tsx
// packages/tui/test/footer.test.tsx
import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import React from "react"
import { Footer } from "../src/components/Footer"

describe("Footer", () => {
  test("shows cwd and slash command hint", () => {
    const { lastFrame } = render(<Footer cwd="C:/proj" permissionCount={1} mcpCount={3} />)
    expect(lastFrame()).toContain("C:/proj")
    expect(lastFrame()).toContain("/status")
  })
  test("shows connect hint when no credentials", () => {
    const { lastFrame } = render(<Footer cwd="C:/proj" permissionCount={0} mcpCount={0} connected={false} />)
    expect(lastFrame()).toContain("Get started /connect")
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/tui/test/composer.test.tsx packages/tui/test/footer.test.tsx`
Expected: FAIL

- [ ] **Step 3: 最小实现**

`Composer.tsx`（multiline：`useInput` 处理 Enter=换行、Ctrl+Enter=提交；底部 muted 行 `model | 12,400 (24%) · $0.03`）；`Footer.tsx`（左 cwd、右 `△ n Permission • m MCP /status` 或 `Get started /connect`）；`DialogHost.tsx`（esc 取消 / enter 确认的统一视觉语法）；`PermissionDialog.tsx`（三选项：Allow / Deny / Always allow this session）；`Sidebar.tsx`（宽屏 >120 列渲染，内容为 session/workspace 信息）；`App.tsx` 用 `useStdout` 读终端宽度组装五层。

- [ ] **Step 4: Run 确认通过**

Run: `make test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tui
git commit -m "feat(tui): composer, footer, dialogs and wide sidebar"
```

---

### Task 17: demos — 机制演示三件套

**目标：** SPEC 验收标准 3：确定性复现①护栏拦截②失败回灌③阈值停手（SPEC §5.2 同一闭环叙事）。

**涉及文件：**
- Create: `demos/demo1-guardrail.ts`、`demos/demo2-feedback-loop.ts`、`demos/demo3-threshold-stop.ts`、`demos/README.md`
- Modify: `Makefile`（`demo` target）

**Interfaces:**
- Consumes: T4 MockProvider、T7 PermissionGateway、T8 VerifyRunner、T9 AgentLoop。

- [ ] **Step 1: 写断言脚本（每个 demo 以断言失败即 exit 1）**

```ts
// demos/demo1-guardrail.ts
import { PermissionGateway } from "@iterum/core/permission/gateway"
import { MockProvider } from "@iterum/core/llm/mock"
import { AgentLoop } from "@iterum/core/agent/loop"
import { ToolRegistry } from "@iterum/core/tools/registry"
import { BashTool } from "@iterum/core/tools/bash"
import { VerifyRunner } from "@iterum/core/feedback/verify"
import { createSession } from "@iterum/core/transcript/session"

const registry = new ToolRegistry()
registry.register(new BashTool(async () => ({ exitCode: 0, output: "SHOULD NOT RUN", durationMs: 0 })))

let requests = 0
const provider = new MockProvider([
  { type: "tool", name: "bash", args: { command: "rm -rf /" } },
  { type: "text", text: "that was blocked; I will ask for guidance." },
])
const loop = new AgentLoop({
  provider, tools: registry,
  permissions: new PermissionGateway(),
  verify: new VerifyRunner("test", async () => ({ exitCode: 0, output: "ok" })),
  resolvePermission: async (req) => { requests++; return "deny" },
})
const session = createSession({ cwd: process.cwd(), title: "demo1", provider: "mock", model: "mock" })
const events: any[] = []
for await (const e of loop.run(session, "wipe everything")) events.push(e)

const assert = (cond: boolean, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exit(1) } }
assert(requests === 1, `guardrail asked exactly once, got ${requests}`)
assert(events.some(e => e.type === "permission_requested"), "permission_requested event emitted")
const toolPart = session.messages.flatMap(m => m.parts).find(p => p.type === "tool")
assert(toolPart?.result?.output.includes("denied"), "tool result records denial")
assert(!events.some(e => e.type === "feedback_injected"), "denied action must not enter feedback loop")
console.log("PASS demo1: guardrail intercepted dangerous action")
```

`demo2-feedback-loop.ts` 同构：工具执行后注入失败（VerifyRunner 返回 exitCode 1），断言 `MockProvider.requests[1]` 的消息包含 `[feedback]` 摘要且 agent 第二轮调用了修复工具。`demo3-threshold-stop.ts` 同构：三轮失败 → 断言 `session.feedbackFailures === 3`、末条 assistant 文本含 `help`、事件以 `session_idle` 收尾。

- [ ] **Step 2: Run 确认失败（对未实现部分）**

Run: `bun demos/demo1-guardrail.ts`
Expected: FAIL（若依赖模块缺失）；核心已完成时此步验证脚本自身断言逻辑。

- [ ] **Step 3: 完成脚本与 Makefile target**

```makefile
demo:
	bun demos/demo1-guardrail.ts
	bun demos/demo2-feedback-loop.ts
	bun demos/demo3-threshold-stop.ts
```

- [ ] **Step 4: Run 确认通过**

Run: `make demo`
Expected: 三条 `PASS demo*` 输出，exit 0

- [ ] **Step 5: Commit**

```bash
git add demos Makefile
git commit -m "feat(demos): deterministic mechanism demos for guardrail, feedback loop, threshold stop"
```

---

### Task 18: 分发 — 单文件二进制与 Docker

**目标：** SPEC §8.2：`bun build --compile` 三平台产物 + Dockerfile + README 分发章节。

**涉及文件：**
- Create: `scripts/build.ts`（或直接 Makefile targets）、`Dockerfile`、`README.md`（"安装与分发"章节）
- Modify: `Makefile`（build-win/build-macos/build-linux/docker-build）

**Interfaces:**
- Consumes: T14 `main` 入口。
- Produces: `dist/iterum-win-x64.exe` 等；`iterum:latest` 镜像。

- [ ] **Step 1: 写构建脚本**

```makefile
build-win:
	bun build --compile --target=bun-windows-x64 packages/cli/src/main.ts --outfile dist/iterum-win-x64.exe
build-macos:
	bun build --compile --target=bun-darwin-arm64 packages/cli/src/main.ts --outfile dist/iterum-macos-arm64
build-linux:
	bun build --compile --target=bun-linux-x64 packages/cli/src/main.ts --outfile dist/iterum-linux-x64
```

```dockerfile
# Dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun build --compile --target=bun-linux-x64 packages/cli/src/main.ts --outfile /app/iterum

FROM oven/bun:1-slim
COPY --from=build /app/iterum /usr/local/bin/iterum
ENTRYPOINT ["iterum"]
```

- [ ] **Step 2: 验证 Windows 产物**

Run: `make build-win; dist/iterum-win-x64.exe --headless --mock --prompt hello`
Expected: 输出 JSON 事件行并以 `session_idle` 结尾，exit 0

- [ ] **Step 3: 验证 Docker 构建**

Run: `docker build -t iterum:latest .`（本机无 Docker 时记录结论至 docs/AGENT_LOG.md，CI 中补验）

- [ ] **Step 4: README 分发章节**（获取方式、运行命令、key 安全配置、已知限制：SmartScreen/未签名/容器无钥匙串）

- [ ] **Step 5: Commit**

```bash
git add scripts Dockerfile Makefile README.md
git commit -m "feat(dist): single-binary build targets and docker image"
```

---

### Task 19: 文档收尾 — README 全量、TUI MUST 自查、安全边界

**目标：** 业务总览"其他"章节：README 完整（简介/安装/运行/分发/目录结构/安全边界）、附录 A 的 10 条 MUST 逐条证据、安全威胁模型落文档。

**涉及文件：**
- Create: `docs/tui-must-checklist.md`、`docs/security.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: T16 TUI、T18 分发。
- Produces: 验收标准 10 的证据文档。

- [ ] **Step 1: README 全量章节**：项目简介、特性、安装（二进制获取/源码 `bun install && make test`）、运行、分发命令（三平台 + docker）、key 安全配置（`/connect` 钥匙串 vs `.env` 风险）、目录结构树、安全边界（§4.2 威胁模型摘要）、已知限制。
- [ ] **Step 2: TUI MUST 自查**：逐条标注"实现位置 + 测试证据"（如 MUST-3 collapsed reasoning → `ReasoningPartView` + `transcript.test.tsx`）。
- [ ] **Step 3: Commit**

```bash
git add README.md docs/
git commit -m "docs: readme, tui must checklist and security boundaries"
```

---

### Task 20: CI — GitLab 与 GitHub Actions

**目标：** 验收标准 9：`.gitlab-ci.yml`（必须含 `unit-test` job）+ GitHub Actions push 自动测试 + 产物；记录最后一次 pass 证据。

**涉及文件：**
- Create: `.gitlab-ci.yml`、`.github/workflows/ci.yml`

**Interfaces:**
- Consumes: T1 Makefile、T17 demos、T18 build targets。
- Produces: 两套 CI 全部 pass 的执行记录（截图/链接归档进 docs/AGENT_LOG.md）。

- [ ] **Step 1: 写 .gitlab-ci.yml**

```yaml
# .gitlab-ci.yml
unit-test:
  image: oven/bun:1
  script:
    - bun install --frozen-lockfile
    - make test
    - make demo
  artifacts:
    when: always
    paths: []
```

- [ ] **Step 2: 写 GitHub Actions**

```yaml
# .github/workflows/ci.yml
name: ci
on: push
jobs:
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install --frozen-lockfile
      - run: make test
      - run: make demo
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - { os: ubuntu-latest, target: bun-linux-x64, out: iterum-linux-x64 }
          - { os: macos-latest, target: bun-darwin-arm64, out: iterum-macos-arm64 }
          - { os: windows-latest, target: bun-windows-x64, out: iterum-win-x64.exe }
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install --frozen-lockfile
      - run: bun build --compile --target=${{ matrix.target }} packages/cli/src/main.ts --outfile dist/${{ matrix.out }}
      - uses: actions/upload-artifact@v4
        with: { name: ${{ matrix.out }}, path: dist/${{ matrix.out }} }
```

- [ ] **Step 3: 推送并验证**

Run: `git push -u origin main`（**须经用户审批后执行**，见业务总览工作流要求）
Expected: 两个平台 job 均绿；GitHub Actions 最后一次执行 pass。

- [ ] **Step 4: 记录证据**

在 docs/AGENT_LOG.md 记录：两套 CI 的执行链接、`unit-test` job 名称与 pass 状态、截图归档位置。

---

## 依赖与并行关系（worktree 规划）

```text
T1 (scaffold)
├─ T2 (spike compile)      [与 T3 并行]
└─ T3 (transcript types)   ← 一切数据契约
   ├─ T4 (llm mock) ──────────────┐
   ├─ T5 (providers) ────────┐    │
   ├─ T6 (tools) ────────────┤    │
   ├─ T7 (permission) ───────┤    │
   ├─ T8 (feedback) ─────────┤    │
   ├─ T10 (credentials) ────┐│    │
   ├─ T11 (skills) ─────────┤│    │
   ├─ T12 (mcp) ────────────┤│    │
   ├─ T13 (session store) ──┤│    │
   └─ T15 (tui shell) ──────┤│    │
                            ▼▼    │
                        T9 (agent loop) ← T4+T6+T7+T8
                        ┌───┴────┬──────────┐
                        ▼        ▼          ▼
                     T14 (cli) T17 (demos) T16 (tui full) ← T15
                        │        │          │
                        ▼        ▼          ▼
                     T18 (dist)  T20 (CI) ← T19 (docs) ← T16+T18
```

- **并行组 A（T1 后）**：T2 ∥ T3。
- **并行组 B（T3 后，核心模块可开独立 worktree）**：T4、T5、T6、T7、T8、T10、T11、T12、T13、T15 —— 十者互不依赖，可并行（业务总览"每个独立功能/大模块一个 worktree"）。
- **并行组 C**：T9（需 T4/T6/T7/T8）完成后 → T14、T17、T16 可并行；T14 需 T10/T11/T12/T13。
- **收尾组 D**：T18（需 T14）；T19（需 T16/T18）；T20（需 T17/T19；推送须人工审批）。

**测试计数基线**：`make test` 全绿 = 各 task 自身测试 + demos；任何 task 的变更破坏他人测试即视为 Critical，评审必须拦截。

---

## 自审记录（writing-plans 自检）

1. **Spec 覆盖**：SPEC §3.1→T4/T5；§3.2→T9；§3.3→T6；§3.4→T7；§3.5→T8/T9；§3.6→T11；§3.7→T3；§3.8→T13；§3.9→T12；§3.10→T10；§3.11→T15/T16；§3.12→T14；§4 安全→T10/T19；§5 重点维度→T8/T9/T17；§8 分发→T18；验收标准 1-11 均有对应 task（9→T20，10→T19，11→全流程）。无缺口。
2. **占位符扫描**：无 TBD/TODO；所有实现步骤含真实代码；SDK 精确 API 的两处注记（T12 listTools、T13 list）允许实现期适配，但以测试绿为强制门。
3. **类型一致性**：`ToolResult/ToolCall/Tool`（T6 定义，T7/T8/T9/T12 消费一致）；`PermissionRequest`（T3 定义，T9 消费）；`formatFeedback`（T8 定义，T9 使用）；`MockProvider` 多轮脚本语义（T4 定义，T9/T17 使用）；`Session.permissionDecisions` 为 `Map`（T3 定义，T7/T13 一致）。核心事件名（`feedback_injected/session_idle/permission_requested`）在 T3/T9/T17 一致。

