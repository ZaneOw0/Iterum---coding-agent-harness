import React from "react"
import { Box, Text } from "ink"

export function DialogHost({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <Box flexDirection="column" borderStyle="double" paddingX={1}>
      <Text bold>{title}</Text>
      {children}
      <Text dimColor>{hint ?? "[Esc] cancel  [Enter] confirm"}</Text>
    </Box>
  )
}
