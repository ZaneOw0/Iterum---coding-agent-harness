# security.md — 凭据威胁模型与对策

> 规格出处：`docs/SPEC.md` §4.2（凭据威胁模型）+ §8.1（key 存储方案与流程）。
> 本文档将威胁模型表落成可核对的实现对照：每条威胁 → 对策 → M1 实现位置 → 测试/证据 → 剩余边界（M2 项）。

## 威胁模型与对策对照表

| # | 威胁 | 对策（SPEC） | M1 实现位置 | 证据 |
|---|---|---|---|---|
| T1 | key 泄露进日志 / 终端 history / 错误信息 | key 只经 `Redacted` 包装类型流动；日志过滤规则；错误信息不含 key | `packages/core/src/credentials/redacted.ts`（`maskKey`：`sk-…ab12`，长度 ≤7 显示 `***`）；`packages/cli/src/connect.ts` 存储确认与 `--show` 只打印掩码，绝不回显明文 | `packages/cli/test/connect.test.ts`："永不回显明文" 断言（输出不得包含完整 key） |
| T2 | key 提交进 git | `.gitignore` 排除 `.env`、`~/.iterum/sessions`；git hooks 预检（高熵字符串扫描） | `.gitignore`（排除 `.env`、`~/.iterum/`）；hooks 高熵扫描为 M2（SPEC 附录 B E6） | 仓库 `.gitignore`；`git status` 确认 `.env` 不入库 |
| T3 | 明文落盘 | 主存储 OS 钥匙串（由 OS 加密）；`.env` 明文风险在 UI 与 README 明示 | `packages/core/src/credentials/store.ts`：`@napi-rs/keyring` 的 `Entry("iterum", provider)` 读写 Windows 凭据管理器 / macOS Keychain / Linux Secret Service；`.env` 仅作回退且来源标记 `env` | `packages/core/test/credentials.test.ts`（mock keyring）；`README.md` "Key 如何安全配置" 与本文档明文风险说明 |
| T4 | 进程环境可见（env 来源） | `.env` 文件加载（非 shell export），README 说明进程环境可读风险 | `store.ts` `loadEnv()` 直接读文件解析（`readFileSync`），不经 shell；README 明确"不要 export"（进入 history） | `store.ts` 源码；README 安全配置章节 |
| T5 | 屏幕回显 | 录入隐藏输入；查看仅掩码 | `packages/cli/src/connect.ts` `hiddenPrompt()`：`setRawMode` + 手动回显 `*`（非 TTY 时拒绝并要求 `--from-stdin`）；`--show` 仅掩码 + 来源 | `connect.test.ts`（`--set`/`--show`/`--clear` 四操作）；本机实测掩码输出 |
| T6 | 会话文件含敏感输出 | 会话 JSON 仅存 transcript，不含 key；目录权限 0700 | 会话序列化只含 Session 数据模型（transcript/审批记忆/用量），key 不出 credentials 模块（`packages/core/src/transcript/types.ts` 约束）；目录 0700 为 M2（SPEC 附录 B E6） | `packages/core/test/session-store.test.ts`；`SPEC.md` §7 约束："key 字符串仅存在于 credentials 模块内部，禁止流入 transcript/日志/事件流" |
| T7 | 危险动作误执行 | 权限门黑名单 + 会话级审批记忆（§3.4） | `packages/core/src/permission/gateway.ts`：内置黑名单（`rm -rf`、`git push --force`、`DROP TABLE`、`chmod -R 777`、`del /s /q`）+ 稳定键序签名会话记忆；`packages/core/src/agent/loop.ts` 产生 `permission_requested` 事件；cli headless 默认 deny，`--allow` 显式放行 | `packages/core/test/permission.test.ts`（5 项：危险命令 ask + 命中规则、安全放行、会话记忆、签名键序稳定）；`packages/cli/test/cli.test.ts`；`demos/demo1-guardrail.ts`（PASS） |

## 存储方案与流程（SPEC §8.1 落实现状）

1. **主存储**：OS 钥匙串（`@napi-rs/keyring`，替代已废弃的 keytar）。
2. **回退来源**：`.env`（`ITERUM_OPENAI_API_KEY` / `ITERUM_ANTHROPIC_API_KEY`），由 `CredentialStore.loadEnv()` 读文件加载；`--show` 输出标注 `source: env`。
3. **录入**：`iterum connect <provider> --set`（交互终端隐藏输入，回显 `*`）；脚本/CI 用 `--from-stdin <key>`。
4. **查看**：`--show`（默认）仅掩码 + 来源；**更新**：重新 `--set` 覆盖；**清除**：`--clear` 删除钥匙串条目。
5. **容器内**：无 OS 钥匙串 → 仅 `.env`（`docker run -v $PWD/.env:/app/.env`），README 已写明限制。

## M1 纪律边界与 M2 补强项（如实声明）

- **M1 以纪律约束替代 `Redacted` 包装类型**（SPEC 附录 B E3）：key 字符串仅在 `credentials` 模块与 `connect` 子命令内流动，代码层用 `maskKey` 保证任何面向用户/文件的输出都是掩码；类型级 `Redacted` 为 M2。
- **M2 补强**：git hooks 高熵扫描、session 目录 0700（附录 B E6）；结构化日志（`~/.iterum/logs/`，附录 B E5）——M1 无日志文件落盘，规避 key 进日志的暴露面。
- **已知残余风险**：`.env` 为明文文件（README/本文档已明示）；同机其他进程可读环境变量；headless 容器仅有明文路径可选。
