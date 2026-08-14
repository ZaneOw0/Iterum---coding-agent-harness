import React from "react"
import type { Session } from "@iterum/core/transcript/types"
import { Transcript } from "./components/Transcript"

export function App({ session }: { session: Session }) {
  return <Transcript session={session} />
}
