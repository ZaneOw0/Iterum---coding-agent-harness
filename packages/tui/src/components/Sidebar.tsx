import React from "react"
import { Box, Text } from "ink"
import type { Session } from "@iterum/core/transcript/types"

export function Sidebar({ session }: { session: Session }) {
  return (
    <Box flexDirection="column" width={42} borderStyle="single">
      <Text bold>Session</Text>
      <Text dimColor>{session.title}</Text>
      <Text dimColor>{session.cwd}</Text>
      <Text dimColor>{session.provider} / {session.model}</Text>
    </Box>
  )
}
