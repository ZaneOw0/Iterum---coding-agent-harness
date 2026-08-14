import React from "react"
import { Box, useStdout } from "ink"
import type { Session } from "@iterum/core/transcript/types"
import { Transcript } from "./components/Transcript"
import { Composer } from "./components/Composer"
import { Footer } from "./components/Footer"
import { Sidebar } from "./components/Sidebar"

export function App({ session, onSubmit = () => {}, connected = true }: { session: Session; onSubmit?: (text: string) => void; connected?: boolean }) {
  const { stdout } = useStdout()
  const wide = (stdout?.columns ?? 80) > 120
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {wide ? <Sidebar session={session} /> : null}
        <Box flexDirection="column" flexGrow={1}>
          <Transcript session={session} />
          <Composer onSubmit={onSubmit} usage={{ tokens: session.contextUsage.inputTokens, percent: session.contextUsage.contextPercent, costUsd: session.contextUsage.costUsd }} model={session.model} />
        </Box>
      </Box>
      <Footer cwd={session.cwd} permissionCount={0} mcpCount={0} connected={connected} />
    </Box>
  )
}
