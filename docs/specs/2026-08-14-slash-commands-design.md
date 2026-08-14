# Slash 指令：/connect /model /effort —— 设计文档

**日期**：2026-08-14
**状态**：已实现（T25-T29 合入 main；/connect /model /effort 可用，8 家厂商）。后续扩展（2026-08-14）：新增 `/` 触发指令浮窗（↑/↓ 选择、Tab 补全、实时过滤）与 `/help` `/exit` 两条指令。
**背景**：M1 已交付（main @ 300eab7）。用户在 TUI 内输入 slash 指令切换厂商/模型/思考强度的能力被列为加急需求，从 M2 提前实现。

## 1. 目标

在 iterum TUI 内提供三条 slash 指令（类似 opencode）：

- `/connect`：向导式连接厂商——弹窗选择厂商 → 掩码输入 API key → 验证并实时拉取该厂商模型列表 → 选择默认模型 → 完成并立即生效。
- `/model`：切换当前厂商旗下的模型（优先展示上次拉取的缓存列表，可刷新重拉，可手动输入兜底）。
- `/effort`：切换思考强度，UI 统一四档（低/中/高/极高），按厂商官方机制映射；不支持的厂商/模型显示"不支持"。

支持厂商（8 家）：openai、anthropic、gemini、grok、moonshot、deepseek、zhipu（智谱）、qwen（阿里通义）。

## 2. 架构方案（已确认）

**方案 A：数据驱动厂商注册表 + OpenAI 兼容通用路径。**

- 8 家中 7 家走 OpenAI 兼容协议（含 gemini 官方 OpenAI 兼容端点），共用一套 OpenAIProvider（baseURL 已支持）；anthropic 走现有原生 provider。
- 厂商差异（baseURL、模型列表端点、模型过滤、effort 机制与映射）全部收敛为注册表数据；新增厂商 = 加一条记录，零新 SDK。
- 模型列表用纯 fetch 模块实现（不进 SDK）；拉取失败 → 手动输入兜底。
- 配置持久化 `~/.iterum/config.json`（key 仍只进 OS 钥匙串）；切换立即生效。

## 3. 数据模型

### 3.1 厂商注册表 `packages/core/src/llm/vendors.ts`（纯数据 + 类型）

```ts
export type EffortLevel = "low" | "medium" | "high" | "max"

export interface VendorEffort {
  kind: "reasoning_effort" | "thinking_budget" | "enable_thinking"
  // reasoning_effort → 档位字符串；thinking_budget → 令牌数；enable_thinking → 布尔
  values: Record<EffortLevel, string | number | boolean>
  modelAllowlist?: string[]   // 仅这些前缀的模型支持 effort；缺省=全部透传
}

export interface VendorDef {
  id: string
  name: string
  flavor: "openai" | "anthropic"
  baseURL?: string            // 缺省用 SDK 默认端点
  modelsUrl?: string          // 缺省 {baseURL}/models
  allowPrefixes: string[]     // 模型过滤白名单（空 = 不过滤）
  denyPrefixes: string[]      // 黑名单前缀
  effort?: VendorEffort
}

export const VENDORS: Record<string, VendorDef>
export function getVendor(id: string): VendorDef | undefined
```

注册表内容（实现时按各厂商官方文档核对端点与参数）：

| id | name | flavor | baseURL | 模型过滤 | effort |
|---|---|---|---|---|---|
| openai | OpenAI | openai | （默认） | deny: whisper-/tts-/dall-e-/text-embedding-/gpt-4o-audio-/omni-moderation | reasoning_effort: 低→minimal 中→low 高→medium 极高→high；allowlist: o1-/o3-/o4-/gpt-5 |
| anthropic | Anthropic | anthropic | （默认） | allow: claude- | thinking_budget: 低→8192 中→16384 高→24576 极高→32768；allowlist: claude-3-7/claude-4（前缀 claude-sonnet-4-/claude-opus-4-/claude-3-7-） |
| gemini | Google Gemini | openai | `https://generativelanguage.googleapis.com/v1beta/openai` | allow: gemini- | reasoning_effort 四档同 openai；allowlist: gemini-3 |
| grok | xAI Grok | openai | `https://api.x.ai/v1` | allow: grok- | reasoning_effort 四档同 openai；allowlist: grok-4/grok-3 |
| moonshot | Moonshot Kimi | openai | `https://api.moonshot.cn/v1` | allow: kimi-/moonshot-v1- | 无 |
| deepseek | DeepSeek | openai | `https://api.deepseek.com` | allow: deepseek- | 无 |
| zhipu | 智谱 GLM | openai | `https://open.bigmodel.cn/api/paas/v4` | allow: glm- | 无 |
| qwen | 阿里通义千问 | openai | `https://dashscope.aliyuncs.com/compatible-mode/v1` | allow: qwen- | enable_thinking: 低/中/高/极高 → thinking_budget 1024/4096/16384/32768；allowlist: qwen3 |

### 3.2 配置 `~/.iterum/config.json`

```json
{ "provider": "openai", "model": "gpt-4o-mini", "effort": "medium",
  "modelCache": { "openai": ["gpt-4o-mini", "o4-mini"] } }
```

- key **不**写入此文件（仍只进 OS 钥匙串 / `.env`）。
- `modelCache` 保存各厂商上次成功拉取的模型列表（截断至前 200 条）。

### 3.3 现有类型的最小扩展

- `ChatRequest`（core/llm/types.ts）+ `effort?: string`（归一化档位名）。
- `AgentLoop` 构造参数 + `effort?: EffortLevel`；构建请求时透传。
- `Session` 类型**不动**；`/model` 切换只更新 `session.model`（loop 每轮从 session 读 model，无需重建 loop）。
- `CredentialStore` 的 provider id 从 `"openai"|"anthropic"` 放宽为 `string`；`connect.ts` 的 PROVIDERS 数组扩充为 8 家（CLI `iterum connect` 子命令自然支持新厂商，仅凭据四操作，不加 --model/--effort）。

## 4. core 变更

1. `llm/types.ts`：`ChatRequest` 增加可选 `effort`。
2. `llm/openai.ts`：
   - 构造参数增加 `vendor?: VendorDef`；`complete()` 按注册表 effort 映射透传 `reasoning_effort`（openai/grok/gemini）或 `extra_body.enable_thinking/thinking_budget`（qwen）。
   - **补解析 `delta.reasoning_content`** → `reasoning_delta` 事件（deepseek/glm/qwen/gemini 思维链目前不显示；不补则 effort 调了也看不到思考过程）。
3. `llm/anthropic.ts`：effort 存在且模型命中 allowlist 时传 `thinking: { type: "enabled", budget_tokens }`。
4. 新增 `llm/models.ts`：`fetchModels(vendor: VendorDef, apiKey: string): Promise<string[]>`——纯 fetch，OpenAI 风格解析 `{data:[{id}]}`、Anthropic 风格解析 `{data:[{id,display_name}]}`，按 allow/deny 前缀过滤，排序，错误抛出（含 HTTP 状态与消息）。零 SDK 依赖。
5. `credentials/store.ts`：provider id 放宽为 string。

## 5. cli 变更

1. 新增 `cli/src/config.ts`：`readConfig()/writeConfig(cfg)`（~/.iterum/config.json），含损坏 JSON 时回退默认空配置（不崩溃）。
2. `main.ts`：
   - 启动组装改为：读 config → 有 `config.provider/model` 则按注册表构建 provider（flavor 决定 Provider 类）并组装 loop（effort 传入）；无 config → 维持现有探测逻辑（openai→gpt-4o-mini / anthropic→claude-sonnet-4-5）。
   - 抽 `buildLoop(providerName, model, effort)` 供启动与运行时重建复用。
3. `tui.tsx`（TuiApp）：
   - **slash 路由**：`onSubmit` 拦截以 `/` 开头的输入 → `/connect /model /effort` 路由表 → 打开对应对话框；未知 slash 以助手消息提示可用指令；其余输入走既有 `driveSession`。
   - **对话框状态机**（cli 层持有状态，业务动作全部在此可测层）：
     - `/connect` 完成回调：存 key 到钥匙串 → `fetchModels` → 用户选模型 → `writeConfig` → `buildLoop` 重建 → 更新 `session.model` → `connected=true`。
     - `/model` 回调：写 config + 更新 `session.model`（不重建 loop）。
     - `/effort` 回调：写 config + `buildLoop` 重建。
   - 拉取失败 → 对话框显示错误 + "手动输入模型名"兜底。

## 6. TUI 变更（packages/tui）

1. `App.tsx`：挂载既有 `DialogHost` 模态机制；新增 props 透传对话框状态与回调。
2. 新增三个纯展示对话框（props 驱动，回调上抛，状态机在 cli）：
   - `ConnectWizard`：步骤态——选厂商（8 家列表）→ 掩码输 key（ink `TextInput` mask）→ 拉取中状态 → 模型列表选择（可搜索过滤、滚动）→ 完成。
   - `ModelPicker`：缓存列表优先 + "刷新"重拉 + 手动输入兜底。
   - `EffortPicker`：四档选择；当前厂商无 effort 机制、或当前模型未命中 effort allowlist 时显示"当前厂商/模型不支持思考强度"。
3. Composer/Footer 展示当前 `provider/model/effort`（Composer 已有 model prop，扩展 effort 显示）。
4. 既有 `PermissionDialog`/`DialogHost` 组件不动（除非挂载需要最小适配）。

## 7. 测试与验收

### 硬约束（不变）

- 测试零网络（mock fetch）、零真实 key；`bun test` 唯一入口；TDD 红绿；提交全中文单 commit/任务。

### 自动化测试

- 注册表完整性：8 家条目字段校验、effort values 覆盖四档。
- `fetchModels`：mock fetch——OpenAI/Anthropic 两种响应解析、前缀过滤、HTTP 错误抛出。
- config 读写：临时目录、损坏 JSON 回退。
- provider effort 透传：mock SDK/fetch 断言请求体（openai reasoning_effort、anthropic thinking、qwen enable_thinking）。
- reasoning_content 解析：mock 流式 chunk → reasoning_delta 事件。
- TUI：三个对话框渲染与回调（ink-testing-library）；slash 路由（/connect、未知 slash 提示）。
- 回归：既有 67 测试全绿；`--mock`、headless、`iterum connect` CLI 行为不变。

### 手动真机验收（用户执行，网络真调）

1. `/connect` 走通至少 openai、deepseek、anthropic 三家：key → 模型列表 → 选模型 → 立即对话。
2. `/model` 切换后下一轮对话用新模型（可让模型自报身份验证）。
3. `/effort` 在 openai 推理模型上切换后观察思考过程输出变化。
4. 不支持 effort 的厂商（deepseek/moonshot）`/effort` 显示"不支持"。
5. ink TextInput 掩码输入在 Windows Terminal 可用（风险项）。

## 8. 非目标（YAGNI）

- 不做其它 slash（/status /skills /mcp 等，M2 内）；路由骨架可扩展。
- CLI `iterum connect` 不加 --model/--effort；不做每家原生 SDK；不做多 key 并存；不做代理设置 UI。

## 9. 风险

| 风险 | 缓解 |
|---|---|
| gemini OpenAI 兼容端点的 reasoning_effort 支持随版本变化 | allowlist 白名单 + 透传，API 报错用户可见 |
| 各厂商 /models 响应差异 | 按 flavor 双格式解析；失败手动输入兜底 |
| ink TextInput 掩码在 Windows 终端可用性 | 真机验收项；不可用时降级为明文输入 + 回车后不显示 |
| 非推理模型透传 reasoning_effort 报错 | 注册表 allowlist 收敛；未命中时省略参数 |
