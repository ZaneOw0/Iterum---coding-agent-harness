import React, { useState } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"
import { DialogHost } from "./DialogHost"
import type { EffortLevel } from "@iterum/core/llm/vendors"

export interface EffortPickerProps {
  levels: { id: EffortLevel; label: string }[]
  current?: EffortLevel
  supported: boolean
  onPick(e: EffortLevel): void
  onCancel(): void
}

export function EffortPicker({ levels, current, supported, onPick, onCancel }: EffortPickerProps) {
  const [sel, setSel] = useState(() => Math.max(0, levels.findIndex(l => l.id === current)))

  useInput((input, key) => {
    if (key.escape) { onCancel(); return }
    if (!supported) return
    if (key.upArrow) { setSel(i => Math.max(0, i - 1)); return }
    if (key.downArrow) { setSel(i => Math.min(levels.length - 1, i + 1)); return }
    if (key.return) {
      const l = levels[sel]
      if (l) onPick(l.id)
    }
  })

  if (!supported) {
    return (
      <DialogHost title="/effort 思考强度">
        <Text>当前厂商/模型不支持思考强度</Text>
      </DialogHost>
    )
  }

  return (
    <DialogHost title="/effort 思考强度" hint="[↑↓] 选择  [Enter] 确认  [Esc] 取消">
      <Box flexDirection="column">
        {levels.map((l, i) => (
          <Text key={l.id}>{i === sel ? "▸ " : "  "}{l.label}{l.id === current ? "  (当前)" : ""}</Text>
        ))}
      </Box>
    </DialogHost>
  )
}
