# Iterum — coding agent harness

Iterum 是一个 **CLI-only** 的 coding agent（类 Claude Code / opencode）：连接 OpenAI/Anthropic 协议 API、支持自定义 skills（SKILL.md）、连接 MCP server、在终端 TUI 中展示**思维链（可折叠 Thought + 耗时）与当前上下文窗口状态**（token 用量 / 百分比 / 成本）。

其核心机制是**可观察、可断言、可演示的客观反馈闭环**：agent 每次工具动作后自动运行验证（M1 为测试命令，`ITERUM_TEST_CMD` 可配；lint/类型检查验证集为 M2），失败结果归一化回灌进下一轮决策驱动自我修正，连续失败达到阈值后停下向用户求助。

> 状态：**M1 已实现**（core 全模块 / TUI 渲染层组件 / cli `--headless` + `connect` / demos 三件套 / 三平台二进制与 Docker 分发）。设计文档见 `docs/SPEC.md`，实现计划见 `docs/PLAN.md`，过程记录见 `docs/SPEC_PROCESS.md` / `docs/AGENT_LOG.md`，TUI 基线自查见 `docs/tui-must-checklist.md`，安全边界见 `docs/security.md`。交互式 TUI 接线（`<App>` 挂载）为后续任务，见"已知限制"。

---

## 特性

- **Structured transcript**：assistant 消息由 text / reasoning / tool / permission / feedback parts 组成（设计基线 `opencode-tui-design-spec.md`）
- **反馈闭环（重点维度）**：验证失败自动回灌 + 连续失败阈值（默认 3，`AgentLoop` 构造参数 `feedbackThreshold` 可配）停手求助
- **治理护栏**：危险命令黑名单（rm -rf / force push / DROP TABLE 等，可配置）+ 会话级审批记忆，TUI 阻塞式 Permission Prompt
- **凭据安全**：OS 钥匙串主存储（Windows 凭据管理器 / macOS Keychain / Linux Secret Service）+ `.env` 回退 + 首录引导（隐藏输入、掩码查看）
- **自定义 skills**：SKILL.md 双级发现（全局 `~/.iterum/skills` / 项目 `.iterum/skills`），description 常驻注入、正文按需读取
- **MCP**：stdio transport 客户端（HTTP/SSE 为实验项），工具结果统一回灌 transcript
- **上下文状态**：composer 低权重展示 token 用量/百分比/成本
- **机制演示**：`make demo` 在 mock LLM 下确定性复现护栏拦截、失败回灌、阈值停手（无网络依赖）

---

## 安装

### 二进制（推荐）

发布产物由 CI 构建，下载对应平台单文件即可：

| 平台 | 产物 |
|---|---|
| Windows x64 | `iterum-win-x64.exe`（未签名，SmartScreen 首次拦截需"仍要运行"） |
| macOS arm64 | `iterum-macos-arm64`（首次运行 `xattr -dr com.apple.quarantine iterum-macos-arm64`） |
| Linux x64 | `iterum-linux-x64` |

### Docker

```bash
docker build -t iterum:latest .
docker run -it -w /app -v $PWD/.env:/app/.env -v $PWD:/workspace iterum:latest
```

> 容器内无 OS 钥匙串：key 只能经 `.env` 挂载注入（明文风险见下）；`-w /app` 将容器 cwd 对齐挂载点——程序从 cwd 加载 `.env`。

### 源码

```bash
git clone https://github.com/ZaneOw0/Iterum---coding-agent-harness.git
cd Iterum---coding-agent-harness
bun install
make test
```

---

## 运行

```bash
iterum --headless --mock --prompt "..."   # 无头模式，事件流 JSON 行输出（CI/脚本/机制演示）
# 真实 provider 未接线：不加 --mock 会报错退出（exit 1），配置凭据也不会启用——为后续任务（见"已知限制"）
iterum --allow ...                        # headless 默认拒绝危险动作（安全默认），--allow 显式放行
iterum connect openai --set               # 凭据录入（隐藏输入）/ --show 掩码查看 / --clear 清除
```

- TUI：渲染层组件已就绪（Transcript / Composer / Footer / DialogHost / PermissionDialog / Sidebar，`packages/tui/`），但 M1 的 cli 入口尚未挂载 `<App>`，当前非 `--headless` 启动会提示使用 headless。交互式 TUI 接线为后续任务。
- slash 命令（`/status` `/model` `/skills` `/mcp`）为 M2（SPEC 附录 B E9）；M1 的凭据交互通道为 `iterum connect` 子命令（等价于 `/connect` 的四操作）。

### Key 如何安全配置（目标机器）

1. **推荐**：交互终端运行 `iterum connect openai --set`（或 `anthropic`），隐藏输入引导录入（回显 `*`）→ 写入 **OS 钥匙串**（Windows 凭据管理器 / macOS Keychain / Linux Secret Service）。`--show` 仅显示掩码（如 `sk-…ab12`）与来源；`--clear` 清除。脚本/CI 可用 `--from-stdin <key>` 参数注入（key 作为命令行参数传入，**会进入 shell history**，仅适合脚本/CI；交互场景请用 `--set` 隐藏录入）。
2. **回退**：项目目录 `.env` 文件写入 `ITERUM_OPENAI_API_KEY=...` / `ITERUM_ANTHROPIC_API_KEY=...`（由程序读文件加载，非 shell export）。**明文风险**：`.env` 为明文文件、且加载后对同机进程环境可见；`--show` 会标记来源为 `env`。
3. **不要**：命令行 `export`（会进入 shell history）；不要把 key 写进代码、配置文件提交到 git（仓库 `.gitignore` 已排除 `.env`）。

---

## 分发命令

```bash
make build-win     # bun build --compile → dist/iterum-win-x64.exe
make build-macos   # → dist/iterum-macos-arm64
make build-linux   # → dist/iterum-linux-x64
make docker-build  # → iterum:latest 镜像
```

---

## 测试

```bash
make test   # 全部单元/集成/快照测试（零网络，mock LLM 驱动）
make demo   # 机制演示三件套：护栏拦截 / 失败回灌 / 阈值停手
```

CI：`.gitlab-ci.yml`（`unit-test` job）+ `.github/workflows/ci.yml`（每次 push 自动测试 + 三平台产物构建）。

---

## 目录结构

```text
├── docs/
│   ├── SPEC.md                  # 设计规格（brainstorming 产出，含附录 A TUI MUST 清单）
│   ├── PLAN.md                  # 实现计划（writing-plans 产出，21 task）
│   ├── SPEC_PROCESS.md          # 过程文档（追问/迭代/决策记录）
│   ├── AGENT_LOG.md             # 实现过程日志（过程证据）
│   ├── tui-must-checklist.md    # TUI 基线 10 条 MUST 逐条自查（实现位置 + 测试证据）
│   ├── security.md              # 凭据威胁模型与对策（SPEC §4.2 落文档）
│   └── REFLECTION.md            # 反思报告（大纲，人工撰写）
├── packages/
│   ├── core/                # 无头核心：agent loop / tools / permission / feedback /
│   │                        #   memory(skills) / transcript / session / credentials / mcp
│   ├── tui/                 # Ink 渲染层：transcript / composer / footer / dialogs / sidebar
│   └── cli/                 # 入口、--headless 与 connect 凭据交互
├── demos/                   # 机制演示脚本（mock LLM 确定性断言）
├── tests/                   # 跨包集成测试
├── Dockerfile
├── Makefile
├── .gitlab-ci.yml
└── .github/workflows/ci.yml
```

> 注：`业务总览.md` 与 `opencode-tui-design-spec.md` 为本项目输入文档，**仅本地保留、不纳入 git 追踪**（已在 .gitignore 排除）。

---

## 安全边界

- key **绝不**硬编码、绝不进 git（含历史）、绝不写日志 / 错误信息 / 事件流 / transcript；仅存在于 OS 钥匙串或 `.env`（明示风险）。代码层以 `maskKey` 掩码纪律约束（`packages/core/src/credentials/redacted.ts`），`--show`/存储确认只回显掩码。
- 会话文件（`~/.iterum/sessions/`）不含 key（只存 transcript 与审批记忆）；目录 0700 权限与 git hooks 高熵扫描为 M2 项（SPEC 附录 B E6），M1 以 `.gitignore` 排除 `.env` 兜底。
- 危险 shell 命令默认触发审批（黑名单规则引擎，可配置扩展）；会话级审批记忆；headless 默认拒绝，`--allow` 显式放行（无人值守安全默认）。
- 完整威胁模型、逐项对策与实现对照见 `docs/security.md`（规格出处 `docs/SPEC.md` §4.2）。

## 已知限制

- Windows 二进制未签名（SmartScreen 拦截）；容器内无 OS 钥匙串（key 只能经 `.env` 挂载注入）；仅 Windows Terminal/现代终端完整支持 TUI，旧 console 降级纯文本。
- M1 cli 入口未挂载 TUI（当前仅 `--headless`；`<App>` 渲染层组件已实现并有测试，接线为后续任务）。
- `--headless` 未接真实 provider：当前仅 `--mock` 可用，不加 `--mock` 即报错退出（exit 1，即使已配置凭据）；真实 provider 接线为后续任务。
- slash 命令（`/status` `/model` 等）、`new/list/resume` 会话管理、session timeline / fork / compact 为里程碑 2（SPEC 附录 B）。
- MCP HTTP/SSE transport 为实验项；lint/typecheck 验证集、结构化日志、ProviderError 重试体系为 M2。
