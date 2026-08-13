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

---

## 实现阶段（占位：随 PLAN 任务执行追加）

| Task | 技能 | 关键 prompt/context | subagent 输出/commit | 人工干预 | 教训 |
|---|---|---|---|---|---|
| T1 | using-git-worktrees + TDD | ... | ... | ... | ... |
| ... | ... | ... | ... | ... | ... |

## CI/CD 执行记录（占位）

| 时间 | 平台 | job | 状态 | 链接/证据 |
|---|---|---|---|---|
| ... | GitLab | unit-test | ... | ... |
| ... | GitHub Actions | unit-test / build | ... | ... |

> 要求：最后一次 CI/CD 执行必须为 pass。
