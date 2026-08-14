import type { ToolCall } from "../tools/types"
import type { PermissionCheckResult, PermissionDecision, PermissionRule } from "./types"

export const defaultRules: PermissionRule[] = [
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*-rf\b/i, reason: "recursive force delete", riskLevel: "high" },
  { pattern: /git\s+push\s+.*--force/i, reason: "force push", riskLevel: "high" },
  { pattern: /drop\s+table/i, reason: "drop table", riskLevel: "high" },
  { pattern: /chmod\s+-R\s+777/i, reason: "world-writable permissions", riskLevel: "high" },
  { pattern: /del\s+\/s\s+\/q/i, reason: "recursive delete (windows)", riskLevel: "high" },
]

export class PermissionGateway {
  constructor(private rules: PermissionRule[] = defaultRules) {}
  signature(call: ToolCall): string {
    return `${call.name}:${stableStringify(call.args)}`
  }
  check(call: ToolCall, memory: Map<string, "allow" | "deny">): PermissionCheckResult {
    const remembered = memory.get(this.signature(call))
    if (remembered) return { decision: remembered }
    if (call.name === "bash") {
      const cmd = String(call.args.command ?? "")
      for (const rule of this.rules) if (rule.pattern.test(cmd)) return { decision: "ask", rule }
    }
    return { decision: "allow" }
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  return `{${Object.keys(value as object).sort().map(k => `${JSON.stringify(k)}:${stableStringify((value as any)[k])}`).join(",")}}`
}
