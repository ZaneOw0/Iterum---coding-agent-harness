# SPEC.md — Iterum: coding agent harness 设计规格

> 状态：v1.0（brainstorming 完成后产出，待用户审阅）
> 上游输入：`../业务总览.md`（项目要求）、`../opencode-tui-design-spec.md`（TUI 设计基线；两文件仅本地保留、不纳入 git）
> 本文件是 `docs/PLAN.md` 的唯一上游设计依据。

---

## 1. 问题陈述

### 1.1 要解决的问题

现有 coding agent（Claude Code / opencode）是完整的商业/开源产品。开发者如果想要一个**自己掌控 harness 核心机制**的 CLI coding agent——尤其是**可验证的自我修正闭环**（测试失败自动回灌驱动修复）、**可见的思维链与上下文窗口状态**、**自定义 skills 与 MCP 接入**——没有轻量的参考实现可以拆解、学习与改造。

Iterum 要解决的是：**一个 CLI-only 的 coding agent harness，把"agent 如何被客观信号驱动自我修正"这件事做成可观察、可断言、可演示的机制**，而不是又一个"终端聊天窗口"。

### 1.2 目标用户

1. **希望理解/教学 agent 机制的工程师**：能看见思考链、工具调用、反馈回灌的完整因果。
2. **接入自定义模型网关的开发者**：openai/anthropic 协议 + 自定义 baseURL。
3. **日常 CLI 工作者**：习惯键盘优先、状态常在的 TUI，不离开终端完成 coding 任务。
4. **评审者/课程验收者**：需要机制演示（确定性、可重复运行）证明 harness 核心成立。

### 1.3 为什么值得做

- coding agent 的正确性最终由**客观信号**（测试/lint/类型检查）判定，把这一反馈闭环做成架构级一等公民，是 harness 区别于普通 chatbot 的本质。
- CLI-only + 状态化 session UI（而非 REPL）是一个明确的、可验收的产品边界。
- 机制演示三件套（护栏拦截 / 失败回灌 / 阈值停手）可直接复用于教学与评估。

---

## 2. 用户故事（INVEST）

| # | 用户故事 | 验收标准（Testable） | 规模（Small） |
|---|---|---|---|
| US1 | 开发者打开项目后立即看到当前路径与 session，输入任务，agent 在同一 transcript 中持续工作 | 启动后进入 session 工作区；composer 常驻；user/assistant/tool/reasoning 同一消息流；agent 运行期间有明确运行态 | M |
| US2 | 高级用户希望知道 agent 在想什么、调用了什么工具、思考耗时多久，但不想被日志墙淹没 | reasoning 有独立低权重视觉层级（thinkingOpacity≈0.6）；Thought 行含 title+duration，可展开/收起；tool 完成默认收缩 | S |
| US3 | 用户要快速判断上下文用了多少、是否接近限制、本次 session 花了多少 | composer 显示 tokens/百分比/cost（muted 样式）；不打断 transcript | S |
| US4 | 用户希望会话内切换 model/provider（含自定义 baseURL） | model/provider 是会话级交互状态；有模型选择 dialog；composer 显示当前 model | S |
| US5 | agent 执行危险操作时暂停，TUI 明确请求授权，键盘允许/拒绝 | 危险动作触发阻塞式 Permission Prompt（composer 禁用）；允许/拒绝/本会话始终允许；决策回流 transcript | M |
| US6 | 用户希望看到 agent 因测试失败自动自我修正的完整过程（重点维度） | 每次验证失败生成 FeedbackPart 可见；连续失败计数可见；达到阈值（3）停手并求助 | M |
| US7 | 首次运行用户安全录入 key，后续可查看/更新/清除 | 隐藏输入引导录入；查看仅显示掩码与来源；更新覆盖；清除删除；全程无明文回显 | S |
| US8 | 用户挂载自定义 skill 与 MCP server | SKILL.md 的 description 自动注入、正文按需读取；stdio MCP 工具可被 agent 调用且结果进入 transcript | M |

（Independent：各故事可独立开发独立交付；Negotiable：细节由设计呈现阶段协商确定；Valuable：均对应业务总览或 TUI 基线要求；Estimable：均有明确验收标准。）

---

## 3. 功能规约（按模块）

每项按 **输入 / 行为 / 输出 / 边界条件 / 错误处理** 描述。

### 3.1 llm（Provider 层）

- 输入：`ChatRequest { model, messages: Part[], systemPrompt, maxTokens }`。
- 行为：`LLMProvider.complete(request) → AsyncIterable<LLMEvent>`（流式）。三个实现：
  - `OpenAIProvider`（官方 SDK，支持 `OPENAI_BASE_URL` 覆盖）
  - `AnthropicProvider`（官方 SDK，支持 `ANTHROPIC_BASE_URL` 覆盖）
  - `MockProvider`（脚本化响应序列：`MockProvider(script: MockStep[])`，测试/演示专用）
- 输出：事件流：`{ type: "text_delta" | "reasoning_delta" | "tool_call" | "done", ... }`。
- 边界条件：空 model 拒绝启动；provider 未配置凭据 → 返回结构化 `NoCredentialsError`。
- 错误处理：网络/限流错误映射为 `ProviderError{retryable, attempt, retryInMs}`，指数退避最大 3 次；API 返回错误体作为可展开诊断保留，不回显 key。

### 3.2 agent（AgentLoop 状态机）

- 输入：`run(session, userInput)`；依赖注入 `LLMProvider` / `ToolRegistry` / `PermissionGateway` / `VerifyRunner`。
- 行为：状态机 `IDLE → RUNNING → (PERMISSION_WAIT)? → IDLE`；每轮 LLM 输出解析 parts；tool call 先过权限门再执行；执行后触发 VerifyRunner。
- 输出：`AsyncIterable<SessionEvent>`（见 3.7）。
- 边界条件：单 session 单循环实例；interrupt（Ctrl+C）→ 停止流并回到 IDLE，保留已产生的 parts。
- 错误处理：见 §6（错误处理总表）。

### 3.3 tools（工具与执行）

- 首版工具：`read_file` / `write_file`（diff 化）/ `bash` / `run_test` / `run_lint` / `run_typecheck`；MCP 工具桥接注册（3.9）。
- 输入：JSON-Schema 校验的参数。
- 行为：执行前 `PermissionGateway.check(toolCall)`；执行中产生 `tool_started`（running 态）。
- 输出：`ToolResult { ok, output, exitCode?, durationMs }`（结构化，TUI 收缩显示，禁止原始 stdout 刷屏）。
- 边界条件：工作目录限定在 workspace 内（`..` 越界拒绝）；命令超时（默认 120s）强制终止。
- 错误处理：非零退出 → `ok:false` 但**不视为 agent 崩溃**，归一化为反馈回灌（见 3.5）。

### 3.4 permission（治理护栏）

- 输入：`ToolCall`。
- 行为：规则引擎两级判定：① 静态黑名单（默认内置：`rm -rf`、`git push --force`、`DROP TABLE`、`chmod -R 777`、`del /s`、删除 `.git` 等，用户可配置扩展）；② 会话级记忆（本会话已批准的同签名动作免问）。
- 输出：`PermissionDecision = allow | deny | ask`；`ask` 产生 `PermissionRequest{id, tool, reason, riskLevel}`，进入 `PERMISSION_WAIT`，composer 阻塞。
- 边界条件：headless 模式可配置 `--auto-deny`（CI/脚本安全默认）。
- 错误处理：用户拒绝 → 结果 `denied` 返回 agent，**不进入反馈自动重试闭环**。

### 3.5 feedback（重点维度：客观反馈闭环）

- 输入：一次完成的工具执行结果 + 关联验证配置（默认验证集：项目检测到的 test/lint/typecheck 命令）。
- 行为：`VerifyRunner.verify(changes)` 运行验证命令；失败时构造结构化 `Feedback`（工具名、退出码、失败断言摘录、受影响文件、完整 diff 引用）注入**下一轮** LLM 消息列表；`session.feedbackFailures++`。
- 输出：`FeedbackPart{verifier, status, summary, failureIndex}` 持久进 transcript；事件 `feedback_injected`。
- 边界条件：`feedbackFailures >= 阈值（默认 3，可用 ITERUM_FEEDBACK_THRESHOLD 配置）` → 停手：生成求助消息（已尝试动作清单 + 最后失败摘要）→ IDLE。用户回复后计数重置。
- 错误处理：验证命令不存在 → 跳过验证并提示配置缺失；验证命令本身崩溃 → 视为 fail 计入回灌（附崩溃摘要）。

### 3.6 memory（skills）

- 输入：`~/.iterum/skills/**/SKILL.md` 与 `<project>/.iterum/skills/**/SKILL.md`。
- 行为：启动时发现并解析（YAML frontmatter：name/description；正文 markdown）；**description 常量注入 system prompt**；正文在 agent 判断需要时通过内置 `read_skill` 工具按需读取（不全量载入上下文）。
- 输出：`SkillCatalog { skills: Skill[] }`。
- 边界条件：frontmatter 缺失/非法 → 跳过该 skill 并告警（不中断启动）；重名冲突 → 项目级覆盖全局级。
- 错误处理：读取失败 → tool error，可重试一次。

### 3.7 transcript（事件与消息模型）

- 输入：AgentLoop 产生的所有状态变化。
- 行为：Session 维护 append-only `Message[]`；`Part = TextPart | ReasoningPart | ToolPart | PermissionPart | FeedbackPart`；每 part 记录 `time.start/end`（Thought duration 唯一来源）。
- 输出：`SessionEvent` 流：`assistant_started / reasoning_delta / tool_started / tool_completed / permission_requested / feedback_injected / assistant_completed / session_idle`；TUI 与 headless 消费同一事件模型。
- 边界条件：interrupt 后未完成 part 标记 aborted；消息不可变（修正 = 追加新消息）。
- 错误处理：事件消费者崩溃不影响 core 循环（事件为广播式，弱引用）。

### 3.8 session（持久化）

- 输入：Session 状态。
- 行为：`~/.iterum/sessions/<id>.json` 保存（含 `permissionDecisions` 与会话级配置）；启动恢复最近 session；提供 `new / list / resume` 命令。
- 边界条件：JSON 损坏 → 跳过该文件并告警，不崩溃。
- 错误处理：写入失败（磁盘满/权限）→ 内存态继续，footer 警告。

### 3.9 mcp（连接）

- 输入：配置的 MCP server 列表（stdio 为主；HTTP/SSE 实验项）。
- 行为：`MCPClient` 启动子进程（stdio transport），协商能力，工具注册进 ToolRegistry；resources/prompts 暴露为只读能力。
- 输出：MCP 工具与本地工具同协议，结果统一回灌 transcript。
- 边界条件：server 启动失败 → footer 标记 ⊙ 状态为 error，不阻塞主流程；连接数上限 8。
- 错误处理：server 崩溃 → 工具调用返回 error result；重连退避 2 次。

### 3.10 credentials（凭据）

- 输入：用户交互或环境。
- 行为：主存储 OS 钥匙串（Win 凭据管理器 / macOS 钥匙串 / Linux Secret Service，经 `@napi-rs/keyring`）；`.env` 作为回退来源（`ITERUM_OPENAI_API_KEY` / `ITERUM_ANTHROPIC_API_KEY`），加载时 UI 标记明文风险；首录引导隐藏输入；`/connect` 命令查看（掩码+来源）/更新/清除。
- 边界条件：钥匙串不可用（headless 容器）→ 仅 `.env`；两者皆无 → 不崩溃，footer 显示 `Get started /connect`。
- 错误处理：读取失败重试一次后报 `NoCredentialsError`（不含 key 内容）。

### 3.11 tui（渲染层）

- 输入：Session 数据模型 + SessionEvent 流。
- 行为：Ink 渲染五层：SessionHeader / Transcript（part renderer 可组合）/ Composer（multiline、历史、autocomplete）/ Footer（cwd | 权限 | MCP | /status）/ DialogHost；宽度 >120 列显示 sidebar（~42 列）。
- 输出：纯渲染，无业务逻辑。
- 边界条件：窄终端 sidebar 收起可快捷键切换；permission 时 composer 禁用。
- 错误处理：渲染异常兜底为纯文本降级，不崩溃。
- **合规约束**：必须通过 `opencode-tui-design-spec.md` §17 的 10 条 MUST（附录 A 为逐条自查清单）；语义化 theme token（§13），主题支持 dark/light/system。

### 3.12 cli（入口）

- 输入：`iterum [--headless] [--model x] [--provider x] [--auto-deny] [command]`。
- 行为：组装 core + tui；`--headless` 供 CI/脚本/机制演示。
- 输出：TUI 或纯文本事件流。
- 错误处理：未知参数报错退出码 2；`--help` 完整命令文档。

---

## 4. 非功能性需求

### 4.1 性能
- TUI 事件到渲染 <16ms（60fps 目标）；1000+ part transcript 滚动不卡顿（虚拟化/惰性渲染）。
- 流式响应首 token 感知延迟 = provider 延迟（无自增缓冲）。
- 启动时间 <1s（不含 provider 连接）。

### 4.2 安全（凭据威胁模型）

| 威胁 | 对策 |
|---|---|
| key 泄露进日志/终端 history/错误信息 | key 只经 `Redacted` 包装类型流动；日志过滤规则；错误信息不含 key |
| key 提交进 git | `.gitignore` 排除 `.env`、`~/.iterum/sessions`；git hooks 预检（`pre-commit` 扫描高熵字符串） |
| 明文落盘 | 主存储 OS 钥匙串（由 OS 加密）；`.env` 明文风险在 UI 与 README 明示 |
| 进程环境可见（env 来源） | `.env` 文件加载（非 shell export），README 说明进程环境可读风险 |
| 屏幕回显 | 录入隐藏输入；查看仅掩码（`sk-...ab12`） |
| 会话文件含敏感输出 | 会话 JSON 仅存 transcript，不含 key；目录权限 0700 |
| 危险动作误执行 | 权限门黑名单 + 会话级审批记忆（§3.4） |

### 4.3 可用性
- 键盘优先：全部高频操作有 keybinding；slash 命令（/status /connect /model /skills /mcp）。
- 错误信息人话化：带 retry state、attempt、剩余延迟（基线 §15）。
- 视觉噪声克制：timestamps/scrollbar/原始工具输出默认关（基线 §12 默认值表）。

### 4.4 可观测性
- 结构化日志（`~/.iterum/logs/`，DEBUG 级含 provider 往返元数据，不含 key）。
- `feedback_injected` 事件计数与失败摘要入 transcript（用户可见的闭环证据）。
- `/status` 汇总：provider/model/凭据状态/MCP/上下文用量（LSP 为里程碑 2 占位，见 R9）。

---

## 5. 领域与机制设计

### 5.1 四类机制

| 机制 | coding 领域的答案 | 编码实现 |
|---|---|---|
| **动作/工具** | 读写文件、执行 shell、运行构建与测试、MCP 工具 | `Tool` 接口 + `ToolRegistry`（3.3）；JSON-Schema 参数校验 |
| **客观反馈信号** | 测试 / lint / 类型检查：客观、确定、可回灌 | `VerifyRunner` + `Feedback` 归一化注入（3.5） |
| **危险动作** | 删除类 shell、force push、DB drop、对外发布 | `PermissionGateway` 黑名单规则引擎 + 会话级记忆（3.4） |
| **记忆** | 项目约定、历史决策、skills 指令 | SKILL.md description 常量注入 + 正文按需读取（3.6）；会话决策记忆（3.4） |

### 5.2 重点维度：客观反馈闭环（为什么）

- 其它三个机制均有成熟参照（opencode 的 permission、Claude 的 skills 注入）；而**"测试失败如何变成 agent 的下一步决策"是 harness 的核心价值**，且是唯一能被 mock LLM **确定性断言**的机制。
- 选择它意味着：架构上 Feedback 是一等数据（`FeedbackPart` 持久化、事件流可订阅、演示可复现），而非临时提示词拼接。
- 机制演示③与①、②构成同一闭环叙事：拦截危险动作 → 注入失败 → 回灌驱动修正 → 阈值停手。

### 5.3 反馈闭环的确定性设计

1. `VerifyRunner` 输出**规范化**（JSON 摘要），不依赖 LLM 自行解析原始 stdout。
2. 回灌内容固定模板：`{verifier, exitCode, failureSummary, affectedFiles}`。
3. `MockProvider` 的脚本可断言"第 N 轮请求消息列表包含第 N-1 轮反馈摘要"——闭环正确性 = 纯函数断言。
4. 阈值状态（`feedbackFailures`）在 Session 数据模型中，可被测试直接读写与断言。

---

## 6. 系统架构

### 6.1 组件图

```text
┌──────────────────────────────────────────────────────────────┐
│  cli (入口: 参数解析 / 组装 / --headless)                       │
└───────────────┬──────────────────────────┬───────────────────┘
                ▼                          ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│  tui (Ink 渲染层, 无逻辑)   │   │  headless (纯事件流输出)        │
│  Header/Transcript/        │   │  (CI / demos / 脚本)          │
│  Composer/Footer/Dialogs   │   │                              │
└───────────────┬───────────┘   └───────────────┬──────────────┘
                │  订阅 SessionEvent              │
                ▼                                ▼
┌──────────────────────────────────────────────────────────────┐
│  core (无头、可测、依赖接口注入)                                  │
│                                                              │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │AgentLoop│─▶│ToolRegistry│─▶│Permission│  │ VerifyRunner  │  │
│  │状态机    │  │(本地+MCP) │  │ Gateway  │  │ 测试/lint/检查 │  │
│  └────┬────┘  └──────────┘  └────┬─────┘  └───────┬───────┘  │
│       │                          │  ask            │ 验证结果  │
│       ▼                          ▼                ▼          │
│  ┌─────────┐             ┌────────────┐   ┌─────────────┐    │
│  │LLMProvider│◀──────────│ Feedback    │───│ transcript  │    │
│  │OpenAI/   │  注入下一轮 │ 归一化回灌  │   │ Session/Part│    │
│  │Anthropic/│            └────────────┘   │ + 事件总线    │    │
│  │Mock      │                             └─────────────┘    │
│  └─────────┘                                                  │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ credentials  │  │ memory     │  │ session 持久化         │  │
│  │ 钥匙串/.env   │  │ SKILL.md   │  │ ~/.iterum/sessions    │  │
│  └──────────────┘  └────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 数据流（一轮交互）

```
user input → AgentLoop(RUNNING) → LLMProvider 流式 parts
  → tool call? → PermissionGateway → [ask→PERMISSION_WAIT→用户裁决] → 执行
  → VerifyRunner → 失败 → Feedback 归一化 → 注入下一轮请求 → LLM 再决策
  → 阈值(3) → 求助消息 → IDLE
  → 全程 SessionEvent → transcript 持久化 + TUI 增量渲染
```

### 6.3 外部依赖

| 依赖 | 用途 |
|---|---|
| OpenAI / Anthropic 官方 SDK | LLM 流式调用（含 reasoning blocks） |
| 自定义 baseURL 网关 | 中转/自建模型接入 |
| MCP servers（stdio 子进程） | 扩展工具生态 |
| OS 钥匙串 | 凭据安全存储 |
| Bun（runtime/test/bundler/compile） | 运行、测试、单二进制分发 |

---

## 7. 数据模型

（与设计呈现 3/5 一致，含实体、字段、关系、约束，此处为规格基准。）

```
Session
├── id: string (uuid)            ├── cwd: string
├── title: string                ├── createdAt / updatedAt: DateTime
├── provider / model: string     ├── messages: Message[]           # 1:N, 有序, append-only
├── contextUsage: ContextUsage   ├── permissionDecisions: Map<string, "allow"|"deny">  # 会话级审批记忆
└── feedbackFailures: int        # 连续失败计数（阈值状态）

Message { id, role: "user"|"assistant", parts: Part[], time: {start,end} }
Part = TextPart | ReasoningPart | ToolPart | PermissionPart | FeedbackPart
  TextPart { text }
  ReasoningPart { title?, markdown, time }          # duration = time.end - time.start
  ToolPart { tool, args, state: pending|running|completed|error, result?, time }
  PermissionPart { request, decision? }
  FeedbackPart { verifier, status: pass|fail, summary, failureIndex? }

ToolResult { ok, output, exitCode?, durationMs }
CredentialEntry { provider, source: "keychain"|"env", status: set|unset }  # 永不含明文
```

**约束**：key 字符串仅存在于 `credentials` 模块内部（`Redacted` 包装），禁止流入 transcript/日志/事件流；Session JSON 恢复时整体结构校验。

---

## 8. 凭据与分发设计

### 8.1 key 存储方案与流程

- **主存储**：OS 钥匙串（Windows Credential Manager / macOS Keychain / Linux Secret Service），经 `@napi-rs/keyring`（`@napi-rs/keyring` 维护活跃，替代已废弃的 keytar）。
- **回退来源**：`.env`（`ITERUM_OPENAI_API_KEY` / `ITERUM_ANTHROPIC_API_KEY`），由项目内 dotenv 加载，UI 显示来源标记与明文风险提示。
- **录入**：首次运行无凭据 → footer `Get started /connect` → `/connect` 命令 → 隐藏输入 → 写入钥匙串。
- **查看**：仅回显掩码（`sk-…ab12`）+ 来源；**更新**：重新隐藏输入覆盖；**清除**：删除钥匙串条目 + 可选清 `.env`。
- **容器内**：无 OS 钥匙串 → 仅 `.env`（`docker run -v $PWD/.env:/app/.env`），README 写清限制。

### 8.2 分发形态与目标平台

- **主形态：单文件二进制**。`bun build --compile` 产：
  - `iterum-windows-x64.exe` / `iterum-macos-arm64` / `iterum-linux-x64`（Windows 为当前开发验证平台，另两平台 CI 构建）。
  - 未签名 → Windows SmartScreen 首次拦截 → README 说明绕过步骤；macOS 需 `xattr -dr com.apple.quarantine`。
  - CI（GitHub Actions）每次 push 构建并上传产物。
- **辅形态：Docker**。`docker build` 单条构建；`docker run -it` 启动；key 经 volume 挂载 `.env` 注入。
- **key 在目标机安全配置**（README 章节）：`/connect` 引导 → OS 钥匙串（推荐）；或 `.env` 文件（说明明文风险）；绝不建议 shell `export`（进入 history）。

---

## 9. 技术选型与理由

| 项 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript (strict) | 与参考项目 opencode 同栈，可直接借鉴 transcript/part 模型与 TUI 设计；类型系统对 JSON-Schema/工具协议建模必要 |
| 运行时 | Bun | 内置 test/install/bundle/compile 一体；`bun build --compile` 原生三平台单文件；无 Node 构建链负担 |
| TUI | Ink（React 渲染终端） | 组件化匹配"part renderer 可组合"要求；opencode 同款，社区验证充分 |
| 设计系统 | opencode-tui-design-spec.md（语义 theme token 体系 §13） | 本项目无网页前端，Open Design 系列 skill 面向 web 设计系统不适用——TUI 采用基线文档的 semantic token + dark/light/system 主题作为"设计系统"，该决策已在 brainstorming 中说明并获确认 |
| LLM SDK | openai + @anthropic-ai/sdk 官方 | 双协议原生支持（Q4）；baseURL 可覆盖以接中转网关 |
| 凭据 | @napi-rs/keyring | 覆盖三平台 OS 钥匙串；Rust 实现安全；keytar 已弃维护 |
| MCP | @modelcontextprotocol/sdk | 官方 TS SDK，stdio transport 为主 |
| 测试 | bun test（+ TDD 红绿重构） | 零配置、快；mock 注入无网络依赖 |
| Lint | oxlint | 快；TS 生态标准 |
| CI | GitHub Actions + .gitlab-ci.yml 双配置 | 业务要求 `.gitlab-ci.yml` 含 `unit-test` job；实际远程仓库（GitHub）由 Actions 生效，二者并存并在 README 说明 |
| 版本控制工作流 | git worktrees + 每功能一 PR | 业务总览强制 Superpowers 七步工作流 |

---

## 10. 验收标准

（"完成"的客观判定；与设计呈现 5/5 一致。）

1. **CLI 启动**：`iterum` 在空目录启动显示 transcript+composer+footer；无凭据显示 `Get started /connect`；不崩溃。
2. **agent 对话**：一轮 user input → parts 流式呈现（reasoning 低权重、tool 可折叠）→ session idle。
3. **机制演示（demos/，CI 中执行，确定性通过）**：
   ① 护栏拦截危险命令（`rm -rf`）→ 生成 PermissionPart；
   ② 注入一次测试失败 → mock LLM 第 2 轮请求含失败摘要（脚本断言）；
   ③ 连续失败 3 次 → 阈值停手 + 求助消息（重点维度确定性行为）。
4. **权限门**：危险命令阻塞 composer；允许/拒绝/本会话始终允许三级回流正确。
5. **凭据四操作**：首录（隐藏输入）/查看（掩码）/更新/清除全部通过；断言钥匙串无明文落盘、日志无 key。
6. **上下文展示**：composer 显示 tokens/百分比/cost，muted 样式。
7. **skills/MCP**：SKILL.md description 注入 system prompt（断言）、正文按需读取；stdio MCP 工具可调用且结果入 transcript。
8. **分发**：`bun build --compile` 产物三平台可运行（至少 Windows 本机验证）；`docker build` + `docker run -it` 成功。
9. **CI**：`.gitlab-ci.yml` `unit-test` job 与 GitHub Actions 最后一次执行均为 pass。
10. **TUI 基线合规**：opencode-tui-design-spec.md §17 的 10 条 MUST 逐条自查全通过（附录 A 清单）。
11. **测试纪律**：`make test` 一键通过；harness 核心机制测试全部 mock/stub LLM、零网络；无"先实现后补测试"的提交历史（docs/AGENT_LOG.md 记录红色先行证据）。

---

## 11. 风险与未决问题

| # | 风险/未决 | 影响 | 缓解 |
|---|---|---|---|
| R1 | Ink 对 Windows 终端（ConPTY/旧 cmd）兼容性差 | TUI 渲染异常 | 预研：Windows Terminal 为主目标，检测降级为纯文本模式（cli 层兜底） |
| R2 | `bun build --compile` 对 `@napi-rs/keyring` 原生模块打包支持不确定 | 二进制运行崩溃 | PLAN 首个 task 即做打包 spike；备选：改用 `keytar`（deprecated）或打包外部 node 进程 |
| R3 | Anthropic SDK 与 OpenAI SDK 事件模型差异（reasoning blocks） | provider 抽象泄漏 | `LLMEvent` 统一中间模型（3.1）先行定义并用 mock 锁定 |
| R4 | VerifyRunner 对"关联验证"的判定（该跑哪些测试）启发式不准确 | 反馈噪声/漏报 | 首版：变更文件就近匹配 + 全量兜底；文档明确启发式边界 |
| R5 | 阈值 3 次对长任务过于死板 | 过早停手 | 阈值可配置（`ITERUM_FEEDBACK_THRESHOLD`）；用户回复即重置 |
| R6 | MCP server 生态对 stdio 实现的平台差异 | 工具注册失败 | 连接失败不阻塞主流程（3.9）；demo 用自带最小 MCP server |
| R7 | 两套 CI 配置维护成本与语义漂移 | 一边 pass 一边 fail | 两者仅做"运行测试"最小集；GitHub Actions 额外负责产物构建 |
| R8 | 业务总览要求 CI 记录"最后一次 pass"，而远程仓库是 GitHub | 验收证据归属 | 两份 CI 日志均截图归档；docs/AGENT_LOG.md 记录链接 |
| R9 | 未决：LSP 集成是否首版做 | 范围膨胀 | 业务总览未强制，footer 展示占位（TUI 基线含 LSP 状态），列为 M2 候选，不进 PLAN 首轮 |
| R10 | 未决：session timeline/fork/compact 等管理功能 | 同上 | 已按 Q8 决策后置为里程碑 2，SPEC 不覆盖其细节 |

---

## 附录 A：TUI 基线 MUST 自查清单（opencode-tui-design-spec.md §17）

1. ✅ TUI 以 session transcript 为主界面 → §3.11
2. ✅ assistant 消息可拆 text/tool/reasoning parts → §7 数据模型
3. ✅ reasoning 支持 collapsed/minimal → §3.11（thinkingMode）
4. ✅ reasoning 显示 duration → §7（time.start/end）
5. ✅ tool output 支持 collapse/hide → §3.3/§3.11
6. ✅ permission/question 为 modal/blocked 状态 → §3.4（composer 阻塞）
7. ✅ composer multiline first-class → §3.11
8. ✅ wide terminal（>120 列）才默认 sidebar → §3.11
9. ✅ theme 用 semantic color tokens → §9（设计系统）
10. ✅ footer 低视觉权重 → §3.11

（实现阶段每项附测试/截图证据。）
