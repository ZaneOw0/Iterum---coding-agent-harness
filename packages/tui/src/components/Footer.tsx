import React from "react"
import { Box, Text } from "ink"

export function Footer({ cwd, permissionCount, mcpCount, connected = true }: { cwd: string; permissionCount: number; mcpCount: number; connected?: boolean }) {
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text dimColor>{cwd}</Text>
      {connected
        ? <Text dimColor>△ {permissionCount} Permission  •  {mcpCount} MCP  /status</Text>
        : <Text color="yellow">Get started /connect</Text>}
    </Box>
  )
}
