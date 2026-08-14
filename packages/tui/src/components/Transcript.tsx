import React from "react"
import { Box } from "ink"
import type { Session } from "@iterum/core/transcript/types"
import { MessageView } from "./MessageView"

export function Transcript({ session }: { session: Session }) {
  return <Box flexDirection="column">{session.messages.map(m => <MessageView key={m.id} message={m} />)}</Box>
}
