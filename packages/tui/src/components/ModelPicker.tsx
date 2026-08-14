import React, { useState } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"
import { DialogHost } from "./DialogHost"

export interface ModelPickerProps {
  models: string[]
  current?: string
  loading: boolean
  error?: string
  onPick(m: string): void
  onRefresh(): void
  onManual(m: string): void
  onCancel(): void
}

export function ModelPicker(props: ModelPickerProps) {
  const { models, current, loading, error, onPick, onRefresh, onManual, onCancel } = props
  const [sel, setSel] = useState(0)
  const [manual, setManual] = useState(false)
  const [buf, setBuf] = useState("")

  useInput((input, key) => {
    if (loading) return
    if (key.escape) { onCancel(); return }
    if (manual) {
      if (key.backspace || key.delete) { setBuf(t => t.slice(0, -1)); return }
      if (key.return && buf.trim().length > 0) { onManual(buf.trim()); return }
      setBuf(t => t + input)
      return
    }
    if (input === "m") { setManual(true); setBuf(""); return }
    if (input === "r") { onRefresh(); return }
    if (key.upArrow) { setSel(i => Math.max(0, i - 1)); return }
    if (key.downArrow) { setSel(i => Math.min(models.length - 1, i + 1)); return }
    if (key.return) {
      const m = models[sel]
      if (m) onPick(m)
    }
  })

  return (
    <DialogHost title="/model 切换模型" hint="[↑↓] 选择  [Enter] 确认  [r] 刷新  [m] 手动输入  [Esc] 取消">
      {loading ? <Text>加载模型列表…</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
      {manual ? <Text>模型名：{buf}</Text> : null}
      <Box flexDirection="column">
        {models.map((m, i) => (
          <Text key={m}>{i === sel ? "▸ " : "  "}{m}{m === current ? "  (当前)" : ""}</Text>
        ))}
      </Box>
    </DialogHost>
  )
}
