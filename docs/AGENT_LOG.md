# AGENT_LOG.md — 实现过程日志（过程证据）

> 按时间顺序记录关键节点。格式：task 编号 / 触发技能 / 关键 prompt 或 context / subagent 输出关键片段或 commit / 人工干预 / 教训。
> 规划阶段条目用 `P-n` 编号；实现阶段用 `docs/PLAN.md` 的 Task 编号。

---

## 2026-08-14

### P-1：仓库初始化
- **Task**：P-1
- **技能**：无（基础工具链）
- **关键操作**：`git init -b main`；`git remote add origin https://github.com/ZaneOw0/Iterum---coding-agent-harness.git`
- **结果**：main 分支就绪，remote 指向目标仓库。
- **人工干预**：无。

### P-2：Superpowers 插件安装
- **Task**：P-2
- **技能**：using-superpowers（安装目标）
- **关键 prompt**："请你先安装 superpowers插件，安装好之后再回复会话进行 brainstorming"
- **过程**：按官方 INSTALL.md 首次写入 git+https 规范；随后主动采用官方 Windows 兜底路径：`npm install superpowers@git+https://github.com/obra/superpowers.git --prefix %USERPROFILE%\.config\opencode`，并在全局 opencode.jsonc 引用本地路径 `~/.config/opencode/node_modules/superpowers`。
- **验证**：用户重启 opencode 后，新进程 `skill` 列表出现 brainstorming/using-superpowers/writing-skills 等 → 生效（superpowers v6.3.0）。
- **偏离记录（业务总览允许并需解释）**：安装前会话内的 skill 工具仅有 customize-opencode，重启前 AI 曾直接读取磁盘上的 SKILL.md 执行方法论文本——该做法在重启后已切换为官方 skill 工具调用。**偏离理由**：插件需重启才热加载；为保证流程不中断，AI 手动执行了技能文本内容，行为与技能定义一致。重启后已按官方方式调用。
- **教训**：安装类操作以"新进程实际发现技能"为验收标准，而非配置文件写入成功。

### P-3：Brainstorming（10 题追问）
- **Task**：P-3
- **技能**：superpowers:brainstorming（Architectural 路径）
- **关键 prompt**：AI 分类声明后逐题追问。
- **人工干预**：① 用户 dismiss 了早期一次性 4 题轰炸 → AI 修正为一次一题；② 用户中途要求"先安装插件再 brainstorming"→ 流程插入 P-2。
- **决策产出（用户全部选择推荐项）**：TS+Bun / 反馈闭环重点维度 / 二进制+Docker / 双官方 SDK+baseURL / 钥匙串+.env / SKILL.md 兼容 / MCP stdio / 核心优先 / 会话级审批记忆 / 自动回灌+阈值停手。
- **教训**：一次一题显著提升作答率与讨论质量；多项选择题必须给"推荐项+理由"，但不能批量抛出。

### P-4：方案对比与分节设计
- **Task**：P-4
- **技能**：superpowers:brainstorming（Exploring approaches / Present design）
- **产出**：方案 A（单进程分层 core/tui/cli）胜出；设计 5 节（架构与组件 / agent loop+反馈闭环 / 数据模型 / 错误处理+凭据+分发CI / 测试+验收）逐节获"对"。
- **人工干预**：无异议。

### P-5：SPEC.md 成文与自审
- **Task**：P-5
- **技能**：superpowers:brainstorming（Write design doc + Spec Self-Review）
- **关键 context**：业务总览 §repo 文档交付物规定 SPEC/PLAN 等为交付物；经用户指示置于 `docs/` 目录（覆盖技能默认路径 docs/superpowers/specs/）。
- **自审修正**：① §3.5 阈值表述与 R5 配置项对齐；② /status 移除首版不存在的 LSP 或标注 M2 占位。
- **用户审批**："确认"。
- **产出**：`docs/SPEC.md`（11 章节 + 四类机制 + 附录 A MUST 自查清单）。

### P-6：PLAN.md 成文
- **Task**：P-6
- **技能**：superpowers:writing-plans
- **关键 context**：业务总览要求 task 含目标/涉及文件/实现要点/验证步骤（失败测试）、显式依赖与并行标注、单 subagent 单会话可完成。
- **产出**：`docs/PLAN.md`：20 个任务（T1 脚手架 → T20 CI），每任务 5 步 TDD（失败测试代码 / RED / 最小实现 / GREEN / commit），依赖图 + 3 个并行组 + 自审记录（spec 覆盖 / 占位符 / 类型一致性）。
- **人工干预**：无。

### P-7：repo 框架脚手架（本轮收尾，待审批）
- **Task**：P-7
- **技能**：无（交付物文档更新）
- **产出**：docs/SPEC_PROCESS.md、docs/AGENT_LOG.md（本文件）、docs/REFLECTION.md（仅大纲）、README.md、.gitignore、LICENSE、Makefile、.gitlab-ci.yml、.github/workflows/ci.yml、Dockerfile。
- **人工干预**：① 用户指示两份输入文档（业务总览.md、opencode-tui-design-spec.md）**不纳入 git 追踪**，仅本地保留（已加入 .gitignore）；② 用户指示 5 份交付物文档（SPEC/PLAN/SPEC_PROCESS/AGENT_LOG/REFLECTION）移入 `docs/` 目录（已移动并更新全部交叉引用）。**待用户审批后执行 commit/push**（业务总览：AI 完成每阶段工作后不得擅自提交/推送）。
- **待办**：实现轮次启动后，按 PLAN 顺序执行 using-git-worktrees → subagent-driven-development → test-driven-development → requesting-code-review → finishing-a-development-branch；CI 执行记录（GitLab unit-test job 与 GitHub Actions）与最后一次 pass 证据归档于此。
- **状态更新**：上述待办已于实现轮次完成——T1–T22 全部按 PLAN 执行并合入 main（PR #2–#24，含 fix-11 的 PR #11；收尾时点 main 60e478a）；CI/CD 执行证据与最后一次 pass 见下文"CI/CD 执行记录"节。

---

## 2026-08-14（续）

### P-9：开发阶段工作流约定（业主指示）
- **Task**：P-9
- **人工干预**：业主明确指示——**开发一律从 main 拉新 worktree，按 PLAN 依赖图/并行组的并行度自动创建 worktree 开发；禁止直接在 main 分支上开发**。每个 task 一个分支（`task/NN-xxx`），完成后经 PR 合入 main；并行组（B1/B2 等）同时开多个 worktree。冷启动验证 worktree（`verify/00-cold-start`）在完成使命后清理。
- **提交/推送边界**（沿用业务总览）：worktree 内的任务级 commit（TDD 红绿证据，PLAN 强制"每 task 单提交"）由 subagent 本地执行；**push / PR 创建 / merge 均须业主审批**后执行。
- **执行模式**：superpowers:subagent-driven-development（每 task 派新鲜 implementer + 两阶段评审 + ledger 记账）。

### P-8：§4.5 冷启动试运行验证
- **Task**：P-8（对应业务总览 §4.5 自我验证要求）
- **技能**：无（subagent 派发；方法为 Superpowers 冷启动验证模式）
- **关键 context**：worktree `.worktrees/verify-00-cold-start`（分支 `verify/00-cold-start`）；subagent 类型 `general`（与主 agent `build` 不同）；仅提供 docs/SPEC.md + docs/PLAN.md，零对话历史、零口头解释；要求"遇不确定暂停提问、禁止猜测、不写代码"。
- **subagent 输出关键片段**：20 个暂停点（P1-P20，其中阻塞级 4：T9 反馈测试矛盾 / demo1 请求数矛盾 / T10 fixture 路径 / T19 外部文档依赖）；spec 缺陷四分类 33 项；总评"字面推进上限约 60%，上限卡在计划内矛盾而非理解力"。
- **人工干预**：① 业主裁决 P14（headless 默认 deny）；② 业主裁决 P7（skills 注入 M1 补齐）；③ 业主批准整体差异登记表方案。④ 业主早前指示：两份输入文档不进 git、五份交付物移入 docs/。
- **修订产出**：SPEC v1.1（附录 B 差异登记表：B.1 十九项 M1 修订 + B.2 十八项 M2 后置）；PLAN v1.1（19 处修订：T1/T3/T7/T8/T9/T10/T11/T13/T14/T15/T16/T17 + 依赖图重排 + 自审重写）。
- **教训**：① 计划示例代码必须做"测试×实现走查"——4 个阻塞级矛盾全部源于计划作者未亲自推演 mock 语义与循环语义；② 自审结论"无缺口"不可信，必须改为"已知缺口全部登记"；③ 冷启动 agent 的暂停点与主 agent 的隐性上下文成反比，是最便宜的同侪评审。

## 实现阶段

> 数据提炼自 SDD ledger（`.superpowers/sdd/PLAN.md/*`：progress.md、各 task-*-brief/report/review-package.md，git-ignored 过程记录）。commit 列给出合入 main 的 commit；TDD 红绿证据与 fix round 细节见 ledger 对应 report。

| Task | 技能 | 关键 prompt/context | subagent 输出/commit | 人工干预 | 教训 |
|---|---|---|---|---|---|
| T1 | using-git-worktrees + TDD | Bun workspace 脚手架 + 5 步 TDD；Windows 无 make，以 mingw32-make 验证 | `a8d3f87`（amend 自 912f2ae）+ `684a7b9`（评审 Ruling 记入 PLAN）；PR #2 | fix round：bun.lock 渗入 npmmirror URL → 新建 bunfig.toml 声明官方源并重生成 lock | 本机 `~/.npmrc` registry 实测优先于 repo bunfig.toml；后续 bun add 需显式 `--registry` |
| T2 | TDD（spike） | R2 去险：验证 `bun build --compile` 打包 @napi-rs/keyring | `be7db5c`；PR #3 | 无 | 可行（exe 检出 `napi_register_module_v1` 符号）；产物 95.7 MiB 偏大，优化留待后续 |
| T3 | TDD | transcript 数据模型与事件总线（跨任务共享契约） | `4361587` + `7b3ce46`（PLAN 修正 T9 骨架导入路径）；PR #4 | 评审 Important 属 PLAN 缺陷，非 T3 返工 | `text_delta` 不在 SPEC §3.7 清单但 brief/PLAN 均引用——按"brief 为跨任务契约"保留并报告 |
| T4 | TDD | LLM 事件模型 + 脚本化 MockProvider（嵌套脚本语义为 T9/T17 契约） | `215f4a4`；PR #5 | 无 | M2 能力（重试/超时）按 YAGNI 正确留空 |
| T5 | TDD | openai/anthropic provider 适配（真实 SDK 全 mock.module 替换） | `3f048de`；PR #12 | 无 | 暴露 main 既有 memory.test.ts CRLF 失败（E21）→ 催生 fix-11 |
| T6 | TDD | 工具接口/注册表/fs/bash | `969d795`；PR #6 | 无 | brief 缺 `ToolCall` import，最小补 import 后逐字 |
| T7 | TDD | 权限网关：危险命令黑名单 + 会话级审批记忆 | `f47bc5e`；PR #13 | 无 | 稳定键序签名断言 `{a,b}` vs `{b,a}` 相等——真实行为 |
| T8 | TDD | VerifyRunner 验证失败归一化 | `2e609b0`；PR #14 | 无 | `formatFeedback` 确定性模板被 T9 测试 3 与 demo2 下游锁定 |
| T9 | TDD | AgentLoop 状态机组装完整闭环 | `cd44b0a`；PR #16 | brief 内部矛盾：render 透传 `tool` 会破坏 T8 模板与自身测试 → 以 SPEC §5.3.2 为准只透传 exitCode | brief 的"实现逐字 + 测试逐字"可自相矛盾；冲突以上游 SPEC 为准并披露 |
| T10 | TDD | 钥匙串 + .env 回退凭据存储 | `e8a8a64`；PR #8 | fix round：掩码分隔符 `??`→`…`（SPEC §3.10/§8.1 示例） | brief 编码损毁 3 处（掩码位数/省略号/缺 `$`），按 SPEC 最小修正 |
| T11 | TDD | skills 双级发现 + 注入 + read_skill | `2b2d551`；PR #7 | 无 | 派发上下文称 T6 已合并但 main 无 tools/types.ts——逐字引入 T6 分支文件，保证任一顺序合入无冲突 |
| T12 | TDD | stdio MCP 客户端与工具桥 | `69a5f42`；PR #15 | 无 | brief Content-Length 帧协议与 SDK 1.30.0 NDJSON 冲突 → fixture 双协议兼容，以安装版本为准 |
| T13 | TDD | session 持久化与损坏文件容错 | `2ab0c77`；PR #9 | 无 | corrupt JSON 返回 undefined 不崩溃——容错优先 |
| T14 | TDD | cli 入口组装 + headless JSON 事件流 | `1b7bf49`；PR #17 | 无 | 入口调用留给 T18——评审漏网致产物 no-op（T18 验证暴露） |
| T15 | TDD | ink 渲染骨架 + 语义主题 | `5a4e7fb`；PR #10 | react ^19 降级 18.3.1（PLAN 级依赖矩阵缺陷，B.1 D20） | ink 5 读 `React.__SECRET_INTERNALS`，react 19 运行时必崩；唯一可运行组合 18.3.1 |
| T16 | TDD | composer/footer/dialogs/sidebar | `ac7be29`；PR #19 | 无 | 组件 onSubmit 为 no-op 等按 brief 逐字保留，接线归 T22 |
| T17 | TDD | demos 三件套（护栏拦截/失败回灌/阈值停手） | `922bce5`；PR #18 | 无 | 负向验证（deny→allow 即 FAIL）证明断言真实守卫行为 |
| T18 | TDD（验证为主） | 单文件二进制 + Docker 分发 | `5c9a7e4`；PR #21 | 无 | **入口 no-op 是最大发现**：T14 测试只直调 `main()` 故 CI 全绿，只能靠产物实跑暴露 |
| T19 | 文档核对（无单测） | README 全量核对 + TUI MUST 自查 + 安全边界 | `5a39c96`（amend 自 08bc855）+ `28da3e3`；PR #22 | 评审 3 Important（虚假真实 provider 命令、--from-stdin 双重错误、不存在的 ITERUM_FEEDBACK_THRESHOLD）1 轮 fix round 全绿 | 文档超前声明须逐条以源码为准；提交信息英文与"全中文"约定冲突 → amend |
| T20 | 事实核对（无单测） | GitLab CI 补齐 artifacts 块 + Actions 证据归档 | `98955c9`；PR #24 | 无 | 无 Critical/Important；R8 截图归档以 run 永久链接替代（GitLab 无实例，R8 允许"记录链接"） |
| T21 | TDD | /connect 凭据交互四路径（set/show/clear/未知名）+ TTY 隐藏输入 | `460569b`；PR #20 | 无 | brief 测试 helper 语法错误最小修复（箭头函数加括号），用例本体逐字 |
| T22 | TDD | TUI 接线——事件流驱动 transcript 渲染（验收标准 1 闭环） | `8ab088d` + `5d3bd65`；PR #23 | **controller 确认 argv 路由缺陷（评审未报）** → fix round F3 | **双写修复**：`assistant_started` 解耦 + `run()` 入口浅拷贝（集成测试先红后绿）；Bun 1.3.14 编译产物 argv=["bun", exe, ...args]，appArgs 以 `indexOf(mainPath)` 定位，三形状探针全绿 |

## CI/CD 执行记录

> 数据来源：`gh run list` / `gh run view` / `gh api .../actions/artifacts`（2026-08-14 查询，前两行查询时 HEAD 3423cc2；T20 run 行查询时 HEAD 60e478a）。
> 证据归档方式：以 GitHub Actions run 永久链接为归档（SPEC 附录 B 差异表 R8：允许"记录链接"），截图以链接为准。

| 日期 | 平台 | workflow | job 与结论 | 链接/证据 |
|---|---|---|---|---|
| 2026-08-14 | GitLab | `.gitlab-ci.yml` | unit-test：定义正确（`bun install --frozen-lockfile` → `make test` → `make demo`，含 `artifacts: when: always`）——静态满足业务要求；无 GitLab 实例，未实际执行，由 GitHub Actions 等效覆盖（同一 make test/make demo 命令集，SPEC 差异表 R7） | 仓库根目录 `.gitlab-ci.yml` |
| 2026-08-14 | GitHub Actions | ci（main push） | unit-test: success；build (ubuntu-latest, bun-linux-x64): success；build (macos-latest, bun-darwin-arm64): success；build (windows-latest, bun-windows-x64): success；耗时 58s | https://github.com/ZaneOw0/Iterum---coding-agent-harness/actions/runs/31803854521 |
| 2026-08-14 | GitHub Actions | ci（main push） | 同前，4 job 全 success（上一次 main 合并，1m7s） | https://github.com/ZaneOw0/Iterum---coding-agent-harness/actions/runs/31803844198 |
| 2026-08-14 | GitHub Actions | ci（main push） | unit-test: success；build (ubuntu-latest, bun-linux-x64): success；build (macos-latest, bun-darwin-arm64): success；build (windows-latest, bun-windows-x64): success；耗时 52s（T20 合并 run，headSha 60e478a） | https://github.com/ZaneOw0/Iterum---coding-agent-harness/actions/runs/31804736043 |

产物（run 31803854521，headSha 3423cc2，均未过期）：iterum-win-x64.exe（40,589,103 B）、iterum-macos-arm64（25,391,605 B）、iterum-linux-x64（39,872,975 B）。

> 要求：最后一次 CI/CD 执行必须为 pass。——当前满足：核验时点最新 run 为 31806677023（PR #25 合并 T23 文档分支，headSha df884e0，unit-test + 三平台 build 4 job 全 success，50s，2026-08-14）：https://github.com/ZaneOw0/Iterum---coding-agent-harness/actions/runs/31806677023 。本 T24 分支合并后还会触发一个新 run，其后续持续绿色可由该链接的 run 历史可见。
