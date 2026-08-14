export type PermissionDecision = "allow" | "deny" | "ask"
export interface PermissionRule { pattern: RegExp; reason: string; riskLevel: "low" | "high" }
export interface PermissionCheckResult { decision: PermissionDecision; rule?: PermissionRule }
