import React, { useState } from "react"
import { render } from "ink"
import { App } from "@iterum/tui/src/App"
import type { AgentLoop } from "@iterum/core/agent/loop"
import type { Session, SessionEvent } from "@iterum/core/transcript/types"

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
  return session
}

export function TuiApp({ session, loop, connected = true }: { session: Session; loop: AgentLoop; connected?: boolean }) {
  const [s, setS] = useState(session)
  const [busy, setBusy] = useState(false)
  const onSubmit = async (text: string) => {
    if (busy) return
    setBusy(true)
    try {
      // run() 会原地改写传入的 session；给浅拷贝让状态对象保持干净，事件归约产出新状态
      let cur: Session = { ...s, messages: [...s.messages] }
      for await (const ev of loop.run(cur, text)) {
        cur = reduceSession(cur, ev)
        setS(cur)
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
