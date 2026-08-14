# demos — 机制演示三件套

用 `MockProvider` 在无网络、无真实 LLM 的环境下确定性复现 SPEC §5.2 的同一闭环叙事：

1. **护栏拦截**（`demo1-guardrail.ts`）——危险命令 `rm -rf /` 触发 PermissionGateway 审批，用户拒绝后动作记录为 denied，且**不进入失败回灌**。
2. **失败回灌**（`demo2-feedback-loop.ts`）——编辑文件后验证失败，失败摘要（verifier/status/exitCode/失败详情）注入下一轮请求，驱动 agent 再次行动。
3. **阈值停手**（`demo3-threshold-stop.ts`）——连续 3 次验证失败达到阈值，agent 停止尝试并输出 help 求助，会话以 `session_idle` 收尾。

## 运行方式

```bash
# 单个运行
bun demos/demo1-guardrail.ts
bun demos/demo2-feedback-loop.ts
bun demos/demo3-threshold-stop.ts

# 或一次跑完（CI 同款入口）
make demo
```

## 预期输出

```
PASS demo1: guardrail intercepted dangerous action
PASS demo2: feedback loop drove the agent's next action
PASS demo3: threshold stop after 3 consecutive failures
```

每个脚本均为断言驱动：任何断言失败都会打印 `FAIL: <原因>` 并以退出码 1 结束（`make demo` 会因此中断）。
