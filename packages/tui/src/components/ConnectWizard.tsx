import React, { useState } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"
import { DialogHost } from "./DialogHost"

export interface VendorOption { id: string; name: string }

export interface ConnectWizardProps {
  vendors: VendorOption[]
  current?: string
  loading: boolean
  error?: string
  models: string[]
  onPickVendor(id: string): void
  onSubmitKey(key: string): void
  onPickModel(model: string): void
  onManualModel(model: string): void
  onCancel(): void
}

const WINDOW = 20

export function ConnectWizard(props: ConnectWizardProps) {
  const { vendors, current, loading, error, models, onPickVendor, onSubmitKey, onPickModel, onManualModel, onCancel } = props
  const [step, setStep] = useState<"pick-vendor" | "enter-key">("pick-vendor")
  const [keyBuf, setKeyBuf] = useState("")
  const [sel, setSel] = useState(0)
  const [manual, setManual] = useState(false)
  const [manualBuf, setManualBuf] = useState("")

  const visible: "pick-vendor" | "enter-key" | "loading" | "error" | "pick-model" =
    loading ? "loading" : error ? "error" : models.length > 0 && step !== "pick-vendor" ? "pick-model" : step

  useInput((input, key) => {
    if (loading) return
    if (key.escape) { onCancel(); return }
    if (visible === "pick-vendor") {
      if (key.upArrow) { setSel(i => Math.max(0, i - 1)); return }
      if (key.downArrow) { setSel(i => Math.min(vendors.length - 1, i + 1)); return }
      if (key.return) {
        const v = vendors[sel]
        if (v) { onPickVendor(v.id); setStep("enter-key"); setKeyBuf("") }
      }
      return
    }
    if (visible === "enter-key") {
      if (key.backspace || key.delete) { setKeyBuf(t => t.slice(0, -1)); return }
      if (key.return && keyBuf.length > 0) { onSubmitKey(keyBuf); setKeyBuf(""); return }
      setKeyBuf(t => t + input)
      return
    }
    if (manual) {
      if (key.backspace || key.delete) { setManualBuf(t => t.slice(0, -1)); return }
      if (key.return && manualBuf.trim().length > 0) { onManualModel(manualBuf.trim()); return }
      setManualBuf(t => t + input)
      return
    }
    if (input === "m") { setManual(true); setManualBuf(""); return }
    if (key.upArrow) { setSel(i => Math.max(0, i - 1)); return }
    if (key.downArrow) { setSel(i => Math.min(models.length - 1, i + 1)); return }
    if (key.return) {
      const m = models[sel]
      if (m) onPickModel(m)
    }
  })

  if (visible === "loading") {
    return (
      <DialogHost title="/connect 连接厂商" hint="">
        <Text>加载模型列表…</Text>
      </DialogHost>
    )
  }

  if (visible === "pick-vendor") {
    return (
      <DialogHost title="/connect 连接厂商" hint="[↑↓] 选择  [Enter] 确认  [Esc] 取消">
        <Box flexDirection="column">
          {vendors.map((v, i) => (
            <Text key={v.id}>{i === sel ? "▸ " : "  "}{v.name}</Text>
          ))}
        </Box>
      </DialogHost>
    )
  }

  if (visible === "enter-key") {
    return (
      <DialogHost title={`/connect 连接厂商 — 输入 API key`} hint="[Enter] 提交  [Esc] 取消">
        <Text>API key：{"*".repeat(keyBuf.length)}</Text>
      </DialogHost>
    )
  }

  if (visible === "error") {
    return (
      <DialogHost title="/connect 连接厂商" hint="[m] 手动输入模型名  [Esc] 取消">
        <Text color="red">{error}</Text>
        <Text>拉取失败，按 m 手动输入模型名，Esc 取消</Text>
        {manual ? <Text>模型名：{manualBuf}</Text> : null}
      </DialogHost>
    )
  }

  const start = Math.max(0, Math.min(sel - Math.floor(WINDOW / 2), Math.max(0, models.length - WINDOW)))
  const slice = models.slice(start, start + WINDOW)
  return (
    <DialogHost title="/connect 连接厂商 — 选择默认模型" hint="[↑↓] 选择  [Enter] 确认  [m] 手动输入  [Esc] 取消">
      <Box flexDirection="column">
        {slice.map((m, i) => (
          <Text key={m}>{start + i === sel ? "▸ " : "  "}{m}{m === current ? "  (当前)" : ""}</Text>
        ))}
        {models.length > WINDOW ? <Text dimColor>… 共 {models.length} 个模型</Text> : null}
        {manual ? <Text>模型名：{manualBuf}</Text> : null}
      </Box>
    </DialogHost>
  )
}
