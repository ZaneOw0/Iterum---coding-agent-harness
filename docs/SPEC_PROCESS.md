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

## 5. 实现轮次的流程偏离与裁决

> 来源：SDD ledger（`.superpowers/sdd/PLAN.md/*`：progress.md、各 task-*-brief/report/review-package.md，git-ignored 过程记录）。实现阶段（T1–T22 + fix-11）在 subagent-driven-development（每 task 新鲜 implementer + 两阶段评审）下的偏离与裁决如下。
>
> 出处注：第 2 条（subagent 派发连续失败）来自会话交接记录，ledger 无书面原始条目。

1. **环境限制与替代**：task 工具无 model 参数，SDD Model Selection 的分级选模型无法执行——统一使用 general 子代理（ledger 前置记录）；SDD 的 POSIX 脚本在本机以 PowerShell 等价操作替代（brief 抽取、diff 打包），行为等价并记录于 ledger。Windows 本机无 make，各 task 以 `bun test`（Makefile `test` 目标本体）验证。
2. **subagent 派发中断与恢复**：上会话末段 subagent 派发连续失败，会话中断；新会话恢复后重试成功。期间 controller 本地完成评审并记 ledger 偏离（评审路径以 controller 本地执行为替代）。
3. **裁决记录**：
   - T22 argv 路由缺陷（controller 确认，评审未报）：修复中实测 Bun 1.3.14 编译产物 `argv=["bun", 可执行文件, ...参数]`（脚本模式为 `[bun路径, 脚本路径, ...参数]`），`appArgs` 以 `argv.indexOf(mainPath)` 定位参数起点，三形状探针全绿。
   - T19 提交信息英文（brief 原文 verbatim）与"提交全中文"约定冲突 → 约定优先，fix round 中 amend 为全中文（分支未推送，历史改写安全）。
   - SPEC R8"截图归档" → 以 GitHub Actions run 永久链接归档（GitLab 无实例；R8 允许"记录链接"）。
   - `.gitlab-ci.yml` 静态满足 R7：无 GitLab 实例无法动态执行，逐字静态核对 + 由 GitHub Actions 等效覆盖（同一 make test/make demo 命令集）。
   - T9 brief 内部矛盾（render 透传 `tool` 与 T8 formatFeedback 模板、brief 自身测试 3 冲突）→ 以 SPEC §5.3.2 为准只透传 exitCode（一处必要偏离）。
   - T15 react ^19 与 ink 5 运行时崩溃 → 降级 react 18.3.1 并补 core 的 `types`/`exports`（B.1 D20 登记）。
   - fix-11：Windows autocrlf 下 SKILL.md frontmatter 解析失效 → 独立修复分支（PR #11）先行合并，CRLF 回归测试入 memory.test.ts。
   - T18：T14 合入的 main.ts 缺入口调用（T14 评审漏网）→ 编译产物实测为 no-op（exit 0 零输出），+2 行入口调用修复。
   - T12：brief Content-Length 帧协议与 SDK 1.30.0 NDJSON 冲突 → fixture 双协议兼容，以安装版本为准。
   - 并行组 B1 合并时 index.ts 导出区冲突 → controller 逐分支 rebase 解决（无业务改动）。
4. **评审统计**：T19 评审 3 Important（README 虚假真实 provider 命令、--from-stdin 双重错误、不存在的 ITERUM_FEEDBACK_THRESHOLD）+ 6 minor；T22 评审 2 Important + 1 controller 确认缺陷（argv 路由）；各 1 轮 fix round 全绿（合并后全量 64/64）；T20 评审无 Critical/Important。
5. **"逐字 brief"的边界**：多个 brief 存在逐字不可编译或内部自相矛盾（测试 helper 语法错误、缺 import、掩码期望位数矛盾、编码损毁等），各 task 统一按"最小修正 + 报告中披露"处理，测试主体逐字保留。

---

## 6. 冷启动试运行（§4.5 自我验证）

### 6.1 实验设置

- **第二智能体**：opencode subagent（`general` 类型，与主开发 agent `build` 不同），全新会话、零对话历史、零记忆导入。
- **输入**：仅 `docs/SPEC.md` + `docs/PLAN.md`（worktree 副本），无任何口头补充。
- **指令**：自主选择 1-2 个 task 做实施预演（不写代码），遇到不确定之处暂停提问、禁止猜测。
- **约束**：只读，不写文件，不执行命令。

### 6.2 它选择了什么

T3（transcript 数据契约——全项目共享契约，源头偏差会被放大）与 T9（AgentLoop——消费五个接口的整合任务，spec 最模糊的行为全部在此显形）。选择理由本身即是对计划结构的有效确认。

### 6.3 它在哪里暂停并提问（20 个暂停点摘要）

| 级别 | 编号 | 问题 |
|---|---|---|
| 阻塞 | P1 | T9 反馈测试 flat 脚本与循环语义矛盾：断言 `feedbackFailures===1` 实际必为 3，按字面永远 RED |
| 阻塞 | P2 | demo1 断言 `requests===1`，但 deny 后循环继续，实际 5 次请求 |
| 阻塞 | P3 | T10 `.env` fixture 路径错误（`envDir:"."`），测试必红 |
| 阻塞 | P4 | T19 依赖不进 git 的基线文档，冷启动 agent 只能靠附录 A 转述 |
| 重要 | P5 | SPEC 状态"待用户审阅"与 PLAN 已排期矛盾（流程合规性疑问） |
| 重要 | P6 | SPEC 首版工具含 run_test/lint/typecheck，PLAN 只实现 3 个 |
| 重要 | P7 | skills 注入与 read_skill 在 PLAN 中无 task 落地 |
| 重要 | P8 | feedbackFailures 重置逻辑缺失 |
| 重要 | P9 | interrupt/aborted 全计划零覆盖 |
| 重要 | P10 | ProviderError 退避体系零实现 |
| 重要 | P11 | Redacted 包装类型从未定义 |
| 重要 | P12 | Session.createdAt/updatedAt 字段 SPEC/PLAN 不一致（T13 用 as any 兜底） |
| 重要 | P13 | permission 理由硬编码 "policy"，命中规则丢失 |
| 重要 | P14 | headless "安全默认"语义歧义（默认 allow 与 deny 安全后果相反） |
| 重要 | P15 | 并行组 B "十者互不依赖"与 Interfaces 依赖声明矛盾 |
| 轻微 | P16 | 事件携带 partId 但 Part 无 id 字段 |
| 轻微 | P17 | Ink 无 opacity prop，TS strict 下 JSX 报错 |
| 轻微 | P18 | T14 bash runner 用 stdout 真值判断 exitCode，丢弃真实退出码 |
| 轻微 | P19 | Thought title 全链路无数据源 |
| 轻微 | P20 | new/list/resume、--model/--provider 无实现 task |

### 6.4 暴露的 spec 缺陷（分类）

- **缺失信息**：skills 注入悬空、interrupt 无覆盖、错误处理体系缺失、ContextUsage 无更新点、工程配置（tsconfig/jsx/workspace 依赖）内容未规定等 10 项。
- **内部矛盾**：计划自审"无缺口"与事实矛盾、并行组声明矛盾、T9 测试 3/实现矛盾、T17 demo1 与循环语义矛盾、不可变性承诺与原地 push 矛盾等 10 项。
- **歧义**：headless 安全默认、ChatRequest 类型、签名键序、验证命令"检测"、PermissionPart.decision 写入时机等 6 项。
- **过度/不足规定**：性能条款无豁免声明、T16 仅 prose、demo2/3 仅"同构"等 7 项。

### 6.5 与主 agent 原意的解读差异（是 spec 写错还是它读错？）

| 差异 | 判定 |
|---|---|
| deny 后循环继续（P2） | **spec/plan 写错**——SPEC §5.2 明言"拒绝不作为失败回灌"，但未规定"拒绝后终止循环"，PLAN 实现与 demo 断言自相矛盾 |
| 反馈测试 flat 脚本（P1） | **plan 写错**——MockProvider 的 flat/嵌套语义未被计划作者自己走查 |
| 并行组依赖（P15） | **plan 写错**——依赖图与 Interfaces 区块两套说法 |
| skills 注入悬空（P7） | **plan 漏写**——SPEC §3.6 有完整条款 |
| headless 默认（P14） | **spec 歧义**——两种解读都说得通，安全后果相反 |
| ChatRequest 类型（C2） | **spec 与 plan 都有理，缺声明**——PLAN 的 ChatMessage[] 是合理设计，但 SPEC 未同步 |

判定结论：**约六成问题是 spec/plan 写错或漏写，而非智能体读错**——这正是冷启动验证的价值。

### 6.6 产出与预期差距

主观评估：陌生 agent 字面推进上限约 **60%**。11 个 task 可机械执行；4 个可推进但有不确定性；4 个会卡住（T9/T10/T15/T17 的计划内矛盾）；T19 无法独立完成（外部文档依赖）。

### 6.7 据此对 SPEC / PLAN 的修订（关键 diff）

**SPEC.md（v1.0 → v1.1）**：
- 状态行：`待用户审阅` → `已批准（含冷启动验证修订 v1.1）`
- §3.1：`messages: Part[]` → `messages: ChatMessage[]`（+转换职责说明）
- §3.3：工具清单收敛为 read/write/bash（run_* 归 VerifyRunner，消除与 §3.5 的重叠）
- §3.4：新增 headless 默认 deny + 稳定键序签名两条边界条件
- §3.5：验证命令 `ITERUM_TEST_CMD`/默认 `bun test`（消除"检测"歧义）
- 新增 **附录 B：SPEC↔PLAN 差异登记表**（B.1 十九项 M1 已修订 + B.2 十八项 M2 后置清单）

**PLAN.md（v1.0 → v1.1）**（19 处修订，全部对应附录 B.1）：
- T1 补 tsconfig（react-jsx）、tui/cli package.json、@types/bun、commit 清单
- T3 Session 补 createdAt/updatedAt（T13 去 as any）
- T7 gateway 返回 `{decision, rule}` + 稳定键序签名 + 新增测试
- T8 Feedback 补 tool 字段（formatFeedback 同步）
- T9：测试 3 改嵌套脚本、deny 后 break、run() 开头清零计数、PermissionPart.decision 回填、求助消息含失败摘要、systemPrompt 接入 skills、feedback 带工具名、新增"重置"测试、render 内联单文件
- T10：envDir 改 fixtures 路径
- T11：新增 buildSkillSection + ReadSkillTool 及测试（D12）
- T13：SessionSummary 替代强转
- T14：headless 默认 deny + `--allow`、bash runner 真实 exitCode、ITERUM_TEST_CMD、SkillCatalog/ReadSkillTool 组装
- T15：opacity prop → dimColor
- T16：Step 3 prose → 完整代码
- T17：demo2/demo3 补完整断言脚本
- 依赖图与并行组重排（B1/B2 两波）
- 自审记录重写：诚实声明初版"无缺口"被推翻，改为"已知缺口全部登记"

### 6.8 业主裁决记录

- P14 → **headless 默认 deny**（业主选 Recommended）
- P7 → **M1 补齐** skills 注入与 read_skill（业主选 Recommended）
- 其余差异 → **批准整体登记表方案**（M1 修订 + M2 后置清单，业主选 Recommended）

---

## 7. 对 brainstorming 技能的反思（人工填写区）

> 以下由项目所有者补充（业务总览要求）：
> - 技能做得好的地方：
> - 让你不满的地方：
> - 追问质量（是否问到了你没想过的问题）：
> - 一次一题 vs 批量提问的实际感受：
