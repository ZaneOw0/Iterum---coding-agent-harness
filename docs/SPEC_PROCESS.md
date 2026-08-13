# SPEC_PROCESS.md — 与 Superpowers 协作生成 SPEC/PLAN 的过程记录

> 本文记录 `brainstorming → writing-plans` 阶段的真实协作过程。
> 主观反思部分（§4）由人工（项目所有者）填写。

---

## 1. 时间线与技能流转

| 时间 | 阶段 | Superpowers 技能 | 产出 |
|---|---|---|---|
| 2026-08-14 | 环境准备 | （无，工具链） | git init、remote、superpowers 插件安装 |
| 2026-08-14 | 需求理解 | using-superpowers → brainstorming | 分类声明（Architectural 路径） |
| 2026-08-14 | 澄清追问 | brainstorming（Ask clarifying questions） | 10 个选型决策 Q1-Q10 |
| 2026-08-14 | 方案对比 | brainstorming（Exploring approaches） | 方案 A/B/C，用户选定 A |
| 2026-08-14 | 设计呈现 | brainstorming（Present design） | 5 节设计逐节获批 |
| 2026-08-14 | 规格成文 | brainstorming（Write design doc + Self-Review） | docs/SPEC.md v1.0 |
| 2026-08-14 | 实现计划 | writing-plans | docs/PLAN.md（20 task + 依赖图 + 自审） |

---

## 2. Brainstorming 关键节点

### 2.1 智能体追问了哪些好问题？

以下 10 问直接决定了 SPEC 的核心结构（用户答案均为 AI 推荐项，括号内为关键理由）：

1. **语言与运行时** → TypeScript + Bun（与 opencode 同栈可借鉴；单二进制分发；钥匙串生态）。
2. **重点维度** → 客观反馈闭环（四类机制中唯一可被 mock LLM 确定性断言的一维）。
3. **分发形态** → 二进制为主 + Docker 为辅（TUI 交互体验 + 单条命令可运行兼顾）。
4. **LLM 供应商** → 双官方 SDK + baseURL（双协议硬要求 + 中转网关能力）。
5. **凭据存储** → OS 钥匙串 + .env 回退（安全主方案与容器场景兼容）。
6. **Skills 机制** → SKILL.md 兼容 + 按需注入（生态互通，正文不全量占上下文）。
7. **MCP 范围** → stdio 为主 + HTTP 可选（首版成本控制）。
8. **首版范围** → 核心优先，管理功能后置（timeline/fork/compact 列为 M2）。
9. **审批粒度** → 会话级记住 + 可配置清单（安全与"不过度打扰"平衡）。
10. **反馈自动化** → 自动回灌 + 阈值停手（连续失败 3 次停下求助）。

### 2.2 哪些问题修正了原设想？

- **Q8 迫使首版裁剪**：TUI 设计基线（opencode-tui-design-spec.md §11）列出的 session 管理全家桶（timeline/fork/rename/compact）原可能被理解为必做；经 Q8 确认后置为里程碑 2，SPEC §11 明确记录为未决项 R9/R10——防止首个实现里程碑被管理功能拖垮。
- **Q10 明确了闭环的"停止条件"**：原设想"失败自动重试"没有终止语义；追问后固化为"阈值 3 + 求助消息 + 用户回复重置"，这成为 SPEC §5.3 的确定性设计核心（`feedbackFailures` 进入 Session 数据模型）。

---

## 3. 三轮以上关键迭代（对话节选与处理决策）

### 迭代 1：提问方式失败 → 修正

**节选**（会话早期）：
> AI 一次性抛出 4 个问题（语言/重点维度/分发/供应商）并附完整推荐理由。
> **用户：dismissed this question。**

**处理决策**：提问被整体驳回。AI 重读 brainstorming 技能（"Only one question per message"），改为**一次一题**逐题追问，之后 10 题全部顺利作答。
**教训**：多项选择题密集轰炸违反技能约束且增加决策负担；逐题节奏让每题的"为什么"有时间被消化。

### 迭代 2：插件安装路径失败 → 兜底

**节选**：
> AI 按官方 INSTALL.md 在全局 opencode.jsonc 写入 `"plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]`。
> 随后按 Windows 排障章节预判风险，改用 `npm install superpowers@git+... --prefix ~/.config/opencode` + 本地路径 `"~/.config/opencode/node_modules/superpowers"`。
> 用户要求重启 opencode 后验证：新进程成功列出 `brainstorming` 等技能 → 生效。

**处理决策**：不信任 git-backed 插件规范的 Windows 缓存行为，主动走官方文档的 Windows 兜底路径并**实测验证**（`opencode run` 冒烟 + 技能列表检查）后才宣布完成。
**教训**：安装类操作"声称成功"没有意义，必须以新进程实际发现技能为证据。

### 迭代 3：架构方案选择 → A

**节选**：
> AI 呈现 3 个方案：A 单进程分层（core 无头可测 + TUI 消费层，推荐）、B 单包紧耦合（否决：违背 mock LLM 确定性测试硬要求）、C 双进程 client/server（否决：YAGNI，与 CLI-only 定位冲突）。
> **用户：A**

**处理决策**：采纳 A。SPEC §6 组件图与 PLAN 的 workspace 结构（packages/core|tui|cli）均由此决定。

### 迭代 4：设计分节呈现 → 五节全过

**节选**：
> AI 分 5 节呈现设计（架构与组件 / agent loop 状态机与反馈闭环 / 数据模型 / 错误处理+凭据+分发 CI / 测试策略+验收标准），每节末尾征询。
> **用户：对 / 对 / 对 / 对 / 对**

**处理决策**：五节全部按呈现内容落地进 SPEC。分节获批模式避免了"整篇 SPEC 一次读不完"的问题。

### 迭代 5：SPEC 自审修正

**节选**（AI 内部）：
> 自审发现两处内部不一致：§3.5 阈值"固定 3"与 §11 R5"阈值可配置"矛盾；§4.4 /status 列出 LSP 但 R9 明确 LSP 不进首版。

**处理决策**：将 §3.5 改为"阈值（默认 3，可用 ITERUM_FEEDBACK_THRESHOLD 配置）"；/status 中 LSP 标注为 M2 占位。修正后提交用户审阅，用户回复"确认"。

---

## 4. AI 建议的采纳与推翻

| AI 建议 | 结果 | 说明 |
|---|---|---|
| 10 个选型问题的推荐项（全部） | ✅ 采纳 | 用户逐一选择 Recommended 项 |
| 方案 A（core 分层） | ✅ 采纳 | 用户选 A |
| 设计呈现 5 节内容 | ✅ 采纳 | 五节全部确认 |
| Windows 兜底安装路径（npm + 本地引用替代 git 规范） | ✅ 采纳 | 用户要求重启验证后通过 |
| 早期一次性多题轰炸 | ❌ 被推翻 | 用户 dismiss，改为逐题 |
| SPEC 自审发现的 2 处修正 | ✅ 采纳 | 用户"确认" |
| 默认 spec 路径 docs/superpowers/specs/ | ❌ 被业务要求覆盖 | 业务总览指定 SPEC.md/PLAN.md 为交付物；经用户指示统一置于 `docs/` 目录 |

**AI 提出而被用户推翻的实质性建议**：目前仅"一次性多题"这一交互方式问题；10 个推荐项无一被推翻。这可能意味着推荐项过于保守（全部沿最短路径），或用户与 AI 的判断高度一致——两者都值得在反思中讨论。

---

## 5. 对 brainstorming 技能的反思（人工填写区）

> 以下由项目所有者补充（业务总览要求）：
> - 技能做得好的地方：
> - 让你不满的地方：
> - 追问质量（是否问到了你没想过的问题）：
> - 一次一题 vs 批量提问的实际感受：
