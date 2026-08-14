import React, { useState } from "react"
import { Box, Text } from "ink"
import type { Message, Part } from "@iterum/core/transcript/types"

function PartView({ part }: { part: Part }) {
  if (part.type === "text") return <Text>{part.text}</Text>
  if (part.type === "reasoning") {
    const dur = ((part.time.end - part.time.start) / 1000).toFixed(1)
    const [open, setOpen] = useState(false)
    return (
      <Box flexDirection="column">
        <Text dimColor>{open ? "-" : "+"} Thought: {part.title ?? ""} · {dur}s</Text>
        {open ? <Text dimColor>{part.markdown}</Text> : null}
      </Box>
    )
  }
  if (part.type === "tool") {
    return (
      <Box flexDirection="column">
        <Text color="cyan">{part.tool} {JSON.stringify(part.args)}</Text>
        {part.result ? <Text dimColor>  └─ {part.result.output.split("\n")[0]}</Text> : null}
      </Box>
    )
  }
  if (part.type === "feedback") return <Text color={part.status === "fail" ? "red" : "green"}>[feedback] {part.verifier}: {part.summary.split("\n")[0]}</Text>
  if (part.type === "permission") return <Text color="yellow">[permission] {part.request.tool} — {part.decision ?? "pending"}</Text>
  return null
}

export function MessageView({ message }: { message: Message }) {
  return (
    <Box flexDirection="column" marginY={message.role === "user" ? 1 : 0}>
      {message.role === "user" ? <Text bold>❯ {message.parts.map(p => p.type === "text" ? p.text : "").join("")}</Text> : null}
      {message.role === "assistant" ? message.parts.map((p, i) => <PartView key={i} part={p} />) : null}
    </Box>
  )
}
