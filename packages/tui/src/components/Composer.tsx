import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"

export interface Usage { tokens: number; percent: number; costUsd: number }

export function Composer({ onSubmit, usage, model, disabled = false, status = "", commands = [] }: {
  onSubmit: (text: string) => void
  usage: Usage
  model?: string
  disabled?: boolean
  status?: string
  commands?: { name: string; description: string }[]
}) {
  const [text, setText] = useState("")
  const [selected, setSelected] = useState(0)
  const filtered = commands.filter(c => c.name.startsWith(text))
  const popupOpen = !disabled && text.startsWith("/")
  const sel = Math.max(0, Math.min(selected, filtered.length - 1))
  useEffect(() => { setSelected(0) }, [text])
  useInput((input, key) => {
    if (disabled) return
    if (key.tab) {
      if (filtered.length > 0) setText(filtered[sel]!.name)
      return
    }
    if (key.upArrow || key.downArrow) {
      if (popupOpen) {
        if (filtered.length > 0) {
          setSelected(s => key.upArrow ? (s - 1 + filtered.length) % filtered.length : (s + 1) % filtered.length)
        }
        return
      }
      // 弹窗未打开时不消费，维持既有行为
    }
    if (key.escape) { setText(""); return }
    if (key.return) { onSubmit(popupOpen && filtered.length > 0 ? filtered[sel]!.name : text); setText(""); return }
    if (input === "\n") { setText(t => t + "\n"); return }
    if (key.backspace || key.delete) { setText(t => t.slice(0, -1)); return }
    setText(t => t + input)
  })
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      {popupOpen && (
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>Slash 指令（↑/↓ 选择 · Tab 补全 · Enter 执行 · Esc 取消）</Text>
          {filtered.length === 0
            ? <Text dimColor>无匹配指令</Text>
            : filtered.map((c, i) => (
                <Text key={c.name} color={i === sel ? "cyan" : undefined}>{i === sel ? "▸ " : "  "}{c.name}  {c.description}</Text>
              ))}
        </Box>
      )}
      <Text>❯ {text}</Text>
      <Text dimColor>{status ? `${status}  ` : ""}{model ?? "model"}  {usage.tokens.toLocaleString()} ({usage.percent}%) · ${usage.costUsd.toFixed(2)} · Enter 发送 · Ctrl+J 换行</Text>
    </Box>
  )
}
