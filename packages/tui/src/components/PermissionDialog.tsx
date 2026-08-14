import React from "react"
import { Text } from "ink"
import { DialogHost } from "./DialogHost"
import type { PermissionRequest } from "@iterum/core/transcript/types"

export function PermissionDialog({ request, onDecision }: { request: PermissionRequest; onDecision: (d: "allow" | "deny" | "always") => void }) {
  return (
    <DialogHost title={`Permission required — ${request.tool}`} hint="[a] allow  [d] deny  [s] always allow this session">
      <Text color="yellow">{request.reason} (risk: {request.riskLevel})</Text>
      <Text dimColor>{JSON.stringify(request.args)}</Text>
    </DialogHost>
  )
}
