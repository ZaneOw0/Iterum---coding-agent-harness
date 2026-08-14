import React, { useState } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"

export interface Usage { tokens: number; percent: number; costUsd: number }

export function Composer({ onSubmit, usage, model }: { onSubmit: (text: string) => void; usage: Usage; model?: string }) {
  const [text, setText] = useState("")
  useInput((input, key) => {
    if (key.ctrl && input === "\r") { onSubmit(text); setText(""); return }
    if (key.return) { setText(t => t + "\n"); return }
    if (key.backspace || key.delete) { setText(t => t.slice(0, -1)); return }
    setText(t => t + input)
  })
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>❯ {text}</Text>
      <Text dimColor>{model ?? "model"}  {usage.tokens.toLocaleString()} ({usage.percent}%) · ${usage.costUsd.toFixed(2)}</Text>
    </Box>
  )
}
