import React, { useState } from "react"
import { render } from "ink"
import { App } from "@iterum/tui/src/App"
import type { AgentLoop } from "@iterum/core/agent/loop"
import type { Session, ToolPart, PermissionPart, FeedbackPart } from "@iterum/core/transcript/types"
import type { SessionEvent } from "@iterum/core/transcript/events"

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

// 驱动事件流：run() 抛错不重抛，转为错误字符串返回（null = 成功）
export async function driveSession(
  loop: Pick<AgentLoop, "run">,
  session: Session,
  text: string,
  onUpdate: (s: Session) => void,
): Promise<string | null> {
  // run() 会原地改写传入的 session；给浅拷贝让状态对象保持干净，事件归约产出新状态
  let cur: Session = { ...session, messages: [...session.messages] }
  try {
    for await (const ev of loop.run(cur, text)) {
      cur = reduceSession(cur, ev)
      onUpdate(cur)
    }
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export function TuiApp({ session, loop, connected = true }: { session: Session; loop: AgentLoop; connected?: boolean }) {
  const [s, setS] = useState(session)
  const [busy, setBusy] = useState(false)
  const onSubmit = async (text: string) => {
    if (busy) return
    setBusy(true)
    try {
      const error = await driveSession(loop, s, text, setS)
      if (error) {
        // 错误呈现为一条 assistant 文本消息，TUI 不崩溃、busy 复位
        setS(cur => ({
          ...cur,
          messages: [...cur.messages, {
            id: crypto.randomUUID(), role: "assistant",
            parts: [{ type: "text", text: `Error: ${error}` }],
            time: { start: Date.now(), end: 0 },
          }],
        }))
      }
    } finally {
      setBusy(false)
    }
  }
  return <App session={s} onSubmit={onSubmit} connected={connected} />
}

export function runTui(opts: { session: Session; loop: AgentLoop; connected?: boolean }): void {
  render(<TuiApp session={opts.session} loop={opts.loop} connected={opts.connected} />)
}
