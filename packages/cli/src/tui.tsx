import React, { useState } from "react"
import { render } from "ink"
import { App } from "@iterum/tui/src/App"
import type { AgentLoop } from "@iterum/core/agent/loop"
import type { Session, ToolPart, PermissionPart, FeedbackPart } from "@iterum/core/transcript/types"
import type { SessionEvent } from "@iterum/core/transcript/events"
import { VENDORS, getVendor, resolveEffort, type EffortLevel } from "@iterum/core/llm/vendors"
import { fetchModels } from "@iterum/core/llm/models"
import { CredentialStore } from "@iterum/core/credentials/store"
import { readConfig, writeConfig } from "./config"
import type { Runtime } from "./main"

export function reduceSession(session: Session, event: SessionEvent): Session {
  if (event.type === "session_idle") return session
  if (event.type === "assistant_started") {
    const last = session.messages.at(-1)
    if (last?.role === "assistant" && last.id === event.messageId) {
      // 与 loop.run() 原地改写的 assistant 对象解耦，事件归约拥有该消息（避免 delta 双写）
      const fresh = { ...last, parts: [...last.parts] }
      return { ...session, messages: [...session.messages.slice(0, -1), fresh] }
    }
    return { ...session, messages: [...session.messages, { id: event.messageId, role: "assistant", parts: [], time: { start: Date.now(), end: 0 } }] }
  }
  if (event.type === "text_delta" || event.type === "reasoning_delta") {
    const messages = session.messages.map((m, i) => {
      if (i !== session.messages.length - 1) return m
      const parts = [...m.parts]
      const lastPart = parts.at(-1)
      if (event.type === "text_delta") {
        if (lastPart?.type === "text") parts[parts.length - 1] = { ...lastPart, text: lastPart.text + event.text }
        else parts.push({ type: "text", text: event.text })
      } else {
        if (lastPart?.type === "reasoning") parts[parts.length - 1] = { ...lastPart, markdown: lastPart.markdown + event.text }
        else parts.push({ type: "reasoning", markdown: event.text, time: { start: Date.now(), end: Date.now() } })
      }
      return { ...m, parts }
    })
    return { ...session, messages }
  }
  if (event.type === "tool_started") {
    const messages = session.messages.map((m, i) => {
      if (i !== session.messages.length - 1) return m
      const part: ToolPart = { type: "tool", tool: event.tool, args: event.args, state: "running", time: { start: Date.now(), end: 0 } }
      return { ...m, parts: [...m.parts, part] }
    })
    return { ...session, messages }
  }
  if (event.type === "tool_completed") {
    const messages = session.messages.map((m, i) => {
      if (i !== session.messages.length - 1) return m
      const parts = [...m.parts]
      for (let j = parts.length - 1; j >= 0; j--) {
        const p = parts[j]
        if (p && p.type === "tool" && p.state === "running") {
          parts[j] = { ...p, state: event.result.ok ? "completed" : "error", result: event.result, time: { ...p.time, end: Date.now() } }
          break
        }
      }
      return { ...m, parts }
    })
    return { ...session, messages }
  }
  if (event.type === "permission_requested") {
    const messages = session.messages.map((m, i) => {
      if (i !== session.messages.length - 1) return m
      const part: PermissionPart = { type: "permission", request: event.request }
      return { ...m, parts: [...m.parts, part] }
    })
    return { ...session, messages }
  }
  if (event.type === "feedback_injected") {
    const messages = session.messages.map((m, i) => {
      if (i !== session.messages.length - 1) return m
      const part: FeedbackPart = { type: "feedback", verifier: event.verifier, status: "fail", summary: event.summary, failureIndex: event.failureIndex }
      return { ...m, parts: [...m.parts, part] }
    })
    return { ...session, messages }
  }
  return session
}

// 对话过程状态文案：按事件类型映射（空串 = 无状态）
export function statusFor(ev: SessionEvent): string {
  switch (ev.type) {
    case "assistant_started": return "连接中…"
    case "reasoning_delta": return "思考中…"
    case "tool_started": return `执行工具 ${ev.tool}…`
    case "tool_completed":
    case "text_delta": return "回复中…"
    case "assistant_completed":
    case "session_idle": return ""
    default: return ""
  }
}

// 驱动事件流：run() 抛错不重抛，转为错误字符串返回（null = 成功）
export async function driveSession(
  loop: Pick<AgentLoop, "run">,
  session: Session,
  text: string,
  onUpdate: (s: Session) => void,
  onEvent?: (ev: SessionEvent) => void,
): Promise<string | null> {
  // run() 会原地改写传入的 session；给浅拷贝让状态对象保持干净，事件归约产出新状态
  let cur: Session = { ...session, messages: [...session.messages] }
  try {
    for await (const ev of loop.run(cur, text)) {
      onEvent?.(ev)
      cur = reduceSession(cur, ev)
      onUpdate(cur)
    }
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export function routeSlash(text: string): "connect" | "model" | "effort" | null {
  const t = text.trim()
  if (t === "/connect") return "connect"
  if (t === "/model") return "model"
  if (t === "/effort") return "effort"
  return null
}

export function effortLabel(e?: string): string {
  if (e === "low") return "低"
  if (e === "medium") return "中"
  if (e === "high") return "高"
  if (e === "max") return "极高"
  return ""
}

const VENDOR_OPTIONS = Object.values(VENDORS).map(v => ({ id: v.id, name: v.name }))
const EFFORT_LEVELS: { id: EffortLevel; label: string }[] = [
  { id: "low", label: "低" },
  { id: "medium", label: "中" },
  { id: "high", label: "高" },
  { id: "max", label: "极高" },
]

export function TuiApp({ session, loop, runtime, store, fetcher = fetchModels }: {
  session: Session
  loop: AgentLoop
  runtime: Runtime
  store: CredentialStore
  fetcher?: typeof fetchModels
}) {
  const [s, setS] = useState(session)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [dialog, setDialog] = useState<"connect" | "model" | "effort" | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pendingVendorId, setPendingVendorId] = useState<string | undefined>(undefined)

  const addAssistant = (text: string) =>
    setS(cur => ({
      ...cur,
      messages: [...cur.messages, {
        id: crypto.randomUUID(), role: "assistant",
        parts: [{ type: "text", text }],
        time: { start: Date.now(), end: 0 },
      }],
    }))

  async function pullModels(providerName: string, key: string) {
    setLoading(true)
    setError(undefined)
    try {
      const vendor = getVendor(providerName)
      if (!vendor) throw new Error(`unknown vendor: ${providerName}`)
      const list = (await fetcher(vendor, key)).slice(0, 200)
      setModels(list)
      const cfg = readConfig()
      writeConfig({ ...cfg, modelCache: { ...cfg.modelCache, [providerName]: list } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (text: string) => {
    if (busy) return
    const cmd = routeSlash(text)
    if (cmd === null && text.trim().startsWith("/")) {
      addAssistant("未知指令：可用 /connect /model /effort")
      return
    }
    if (cmd === "connect") {
      setDialog("connect")
      setModels([])
      setError(undefined)
      setPendingVendorId(undefined)
      return
    }
    if (cmd === "model" || cmd === "effort") {
      if (!runtime.connected) {
        addAssistant("请先 /connect 配置凭据")
        return
      }
      if (cmd === "model") {
        setDialog("model")
        setError(undefined)
        const cached = readConfig().modelCache?.[runtime.providerName] ?? []
        setModels(cached)
        if (cached.length === 0) {
          const cred = await store.get(runtime.providerName)
          if (cred) await pullModels(runtime.providerName, cred.key)
          else setError("无凭据，无法拉取模型列表")
        }
      } else {
        setDialog("effort")
        setError(undefined)
      }
      return
    }
    setBusy(true)
    setStatus("")
    try {
      const driveError = await driveSession(loop, s, text, setS, ev => setStatus(statusFor(ev)))
      if (driveError) {
        // 错误呈现为一条 assistant 文本消息，TUI 不崩溃、busy 复位
        setStatus(`Error: ${driveError}`)
        setS(cur => ({
          ...cur,
          messages: [...cur.messages, {
            id: crypto.randomUUID(), role: "assistant",
            parts: [{ type: "text", text: `Error: ${driveError}` }],
            time: { start: Date.now(), end: 0 },
          }],
        }))
      }
    } finally {
      setBusy(false)
    }
  }

  const onPickVendor = (id: string) => {
    setPendingVendorId(id)
  }

  const onSubmitKey = async (key: string) => {
    if (!pendingVendorId) return
    const vendor = getVendor(pendingVendorId)
    if (!vendor) return
    await store.set(pendingVendorId, key)
    await pullModels(pendingVendorId, key)
  }

  const switchModel = async (providerName: string, model: string) => {
    const code = await runtime.rebuild({ providerName, model })
    if (code === 0) {
      setDialog(null)
      setError(undefined)
      setPendingVendorId(undefined)
      addAssistant(`已切换 ${providerName}/${model}`)
    } else {
      setError("切换失败：该厂商无凭据，请先 /connect 添加")
    }
  }

  const onPickModel = (model: string) => { void switchModel(pendingVendorId ?? runtime.providerName, model) }
  const onManualModel = (model: string) => { void switchModel(pendingVendorId ?? runtime.providerName, model) }

  const onRefresh = () => {
    const providerName = runtime.providerName
    void (async () => {
      const cred = await store.get(providerName)
      if (!cred) { setError("无凭据，无法拉取模型列表"); return }
      await pullModels(providerName, cred.key)
    })()
  }

  const onPickEffort = async (e: EffortLevel) => {
    const code = await runtime.rebuild({ effort: e })
    if (code === 0) {
      setDialog(null)
      setError(undefined)
      addAssistant(`思考强度已切换：${effortLabel(e)}`)
    } else {
      setError("切换失败")
    }
  }

  const onCancel = () => {
    setDialog(null)
    setError(undefined)
    setPendingVendorId(undefined)
  }

  const vendor = getVendor(runtime.providerName)
  const effortSupported = resolveEffort(vendor, runtime.model, "low") !== undefined
  const effortTag = effortLabel(runtime.effort)
  const modelLabel = `${runtime.providerName}/${runtime.model}` + (effortTag ? ` · ${effortTag}` : "")

  return (
    <App
      session={s}
      onSubmit={onSubmit}
      connected={runtime.connected}
      dialog={dialog}
      modelLabel={modelLabel}
      composerStatus={status}
      connectProps={dialog === "connect" ? {
        vendors: VENDOR_OPTIONS, current: runtime.model, loading, error, models,
        onPickVendor, onSubmitKey, onPickModel, onManualModel, onCancel,
      } : undefined}
      modelProps={dialog === "model" ? {
        models, current: runtime.model, loading, error,
        onPick: onPickModel, onRefresh, onManual: onManualModel, onCancel,
      } : undefined}
      effortProps={dialog === "effort" ? {
        levels: EFFORT_LEVELS, current: runtime.effort as EffortLevel | undefined, supported: effortSupported,
        onPick: onPickEffort, onCancel,
      } : undefined}
    />
  )
}

export function runTui(opts: {
  session: Session
  loop: AgentLoop
  connected?: boolean
  runtime: Runtime
  store: CredentialStore
  fetcher?: typeof fetchModels
}): void {
  render(<TuiApp session={opts.session} loop={opts.loop} runtime={opts.runtime} store={opts.store} fetcher={opts.fetcher} />)
}
