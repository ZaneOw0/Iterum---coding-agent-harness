# tui-must-checklist.md — TUI 基线 10 条 MUST 逐条自查

> 对应验收标准 10（`docs/SPEC.md` §10）与 SPEC 附录 A。
> **基线文档说明**：`opencode-tui-design-spec.md`（§17 MUST/SHOULD/SHOULD NOT）为上游输入文档，**仅作者本机保留、不纳入 git**（已在 `.gitignore` 排除）。本清单的 MUST 条目以 `docs/SPEC.md` 附录 A 的转述为准；本次已在作者本机人工核对原文 §17，**10 条转述与原文无出入**（原文额外含 SHOULD/SHOULD NOT 各 7/7 条，非验收强制项，其中 SHOULD-4「context usage + cost 用 muted style」已由 Composer 满足）。
>
> 核对方式：读源码（`packages/tui/src/**`、`packages/core/src/**`）+ 运行 `bun test`（54 pass / 0 fail，2026-08-14）+ 对照组件测试断言。
> 注：TUI 渲染层组件全部实现并有测试，但 M1 cli 入口未挂载 `<App>`（见 README 已知限制）；因此下列"通过"指**组件/数据模型层面满足基线要求**，交互接线层面已在 MUST-6 等条目如实标注。

| # | 基线 MUST（§17 原文） | 附录 A | 实现位置 | 测试证据 | 状态 |
|---|---|---|---|---|---|
| 1 | TUI 以 **session transcript** 为主界面 | ✅ | `packages/tui/src/App.tsx`：主列 `flexGrow={1}` 挂 `Transcript`（Composer/Footer 附属）；`packages/tui/src/components/Transcript.tsx` 逐消息渲染 `MessageView` | `packages/tui/test/transcript.test.tsx`：以 Session 渲染，断言消息流内容（Thought 行、tool 结果、正文） | ✅ |
| 2 | assistant 消息可拆 **text/tool/reasoning parts** | ✅ | `packages/tui/src/components/MessageView.tsx` `PartView`：按 `part.type` 分支渲染 text / reasoning / tool / feedback / permission；数据模型 `packages/core/src/transcript/types.ts`（`Part` 联合类型，SPEC §7） | `transcript.test.tsx`：assistant 消息含 reasoning + tool + text 三 parts，分别断言各自渲染（"Thought…"、"read_file"、"done"） | ✅ |
| 3 | reasoning 支持 **collapsed/minimal** presentation | ✅ | `MessageView.tsx:7-15`：默认收起——仅一行 `+ Thought: {title} · {dur}s`（`dimColor` 低权重）；`open` 才展开 markdown。视觉权重以 `dimColor` 近似 thinkingOpacity≈0.6（SPEC 附录 B D5：Ink 无 opacity prop） | `transcript.test.tsx`："renders thought line with title and duration" | ✅ |
| 4 | reasoning 显示 **duration** | ✅ | `MessageView.tsx:8`：`(part.time.end - part.time.start) / 1000` 秒数；时间数据来自 `ReasoningPart.time`（`transcript/types.ts:3`，SPEC §7 "Thought duration 唯一来源"） | `transcript.test.tsx`：断言渲染含 `"1.2s"`（time 0→1200ms） | ✅ |
| 5 | tool output 支持 **collapse/hide** | ✅ | `MessageView.tsx:17-24`：ToolPart 默认收缩——命令 + 结果首行摘要（`output.split("\n")[0]`），禁止原始 stdout 刷屏（SPEC §3.3/基线 SHOULD NOT-2） | `transcript.test.tsx`："renders collapsed tool with result summary"（断言 "312 lines" 首行而非全文） | ✅ |
| 6 | permission/question 为 **modal/blocked** 状态 | ✅ | 渲染：`packages/tui/src/components/PermissionDialog.tsx` + `DialogHost.tsx`（double border 独立 dialog、`[a] allow [d] deny [s] always` 三级决策）；core：`packages/core/src/permission/gateway.ts` `check → ask` + 命中规则，`packages/core/src/agent/loop.ts:71` 产生 `permission_requested` 事件；headless 默认 deny（`packages/cli/src/main.ts`） | `packages/core/test/permission.test.ts`（危险命令 ask + 规则暴露 + 会话记忆 + 签名键序）；`demos/demo1-guardrail.ts`（PASS） | ⚠️ 部分：组件与 core 状态已实现；`<App>` 尚未挂载 DialogHost/禁用 composer（接线为后续任务） |
| 7 | composer 为 **multiline first-class** input | ✅ | `packages/tui/src/components/Composer.tsx:9-14`：`useInput` 中 Enter 插入 `\n`（多行）、Ctrl+Enter 提交、backspace 删除；常驻 composer（SPEC §3.11） | `packages/tui/test/composer.test.tsx`（渲染断言）；multiline 按键行为走 `useInput` 无独立断言，见疑虑① | ✅ |
| 8 | wide terminal 才默认展示 **sidebar** | ✅ | `packages/tui/src/App.tsx:10-15`：`const wide = (stdout?.columns ?? 80) > 120` 才渲染 `<Sidebar>`（width 42，与基线"content width 预留 42 列"一致）；窄终端不渲染（SPEC §3.11） | 代码行为直接可读；无专门测试（`useStdout` 依赖终端上下文），见疑虑① | ✅ |
| 9 | theme 使用 **semantic color tokens** | ✅ | `packages/tui/src/theme.ts` `semanticTheme`：text/textMuted/accent/info/success/warning/error/background/border/borderSubtle/thinkingOpacity；组件无硬编码 hex（基线 SHOULD NOT-5） | 源码核对：`MessageView`/`Footer`/`Composer` 均用 `dimColor` 或 semantic 名 | ✅（dark/light/system 主题切换为 M2） |
| 10 | footer 保持**低视觉权重** | ✅ | `packages/tui/src/components/Footer.tsx`：cwd、permission/MCP 计数、`/status` 提示全部 `dimColor`；无凭据时 `yellow "Get started /connect"`（SPEC §3.10 边界条件） | `packages/tui/test/footer.test.tsx`：2 项（cwd + /status 提示；无凭据 connect 提示） | ✅ |

## 附加核对（基线 SHOULD 中已满足项）

- **SHOULD-4**：显示 context usage + cost，muted style → `Composer.tsx` 第二行 `dimColor`（`12,400 (24%) · $0.03`），证据 `composer.test.tsx`（对应 SPEC 验收标准 6）。
- **SHOULD-3 / SHOULD NOT-2/3**：reasoning 与 answer 不同视觉权重、tool 事件不刷屏 → MUST-3/5 同一实现。

## 核对方法与结论

- `bun test`：54 pass / 0 fail（124 expect 调用），2026-08-14 于 task-19 worktree（`bun install` 后复跑确认）。
- 附录 A 与原文 §17 无出入，**无需回填**。
- 结论：10 条 MUST 全部在组件/数据模型层满足；MUST-6 的 App 级接线（DialogHost 挂载 + composer 阻塞）为 M1 已知缺口（TUI 交互接线整体为后续任务，README 已如实声明）。

## 疑虑

① MUST-7 的 multiline 按键行为、MUST-8 的 >120 列判断无独立自动化测试（分别依赖 `useInput` 交互与 `useStdout` 终端宽度，ink-testing-library 未覆盖）；M2 接线后建议补 `App` 级渲染测试（含 wide/narrow 两种宽度）。
② MUST-3 的 `title` 字段 M1 置空（SPEC 附录 B E11：ReasoningPart.title 数据源 M2），duration 显示不受影响。
