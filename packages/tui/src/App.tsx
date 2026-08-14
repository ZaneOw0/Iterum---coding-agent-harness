import React from "react"
import { Box } from "ink"
import type { Session } from "@iterum/core/transcript/types"
import { Transcript } from "./components/Transcript"
import { Composer } from "./components/Composer"
import { Footer } from "./components/Footer"
import { ConnectWizard, type ConnectWizardProps } from "./components/ConnectWizard"
import { ModelPicker, type ModelPickerProps } from "./components/ModelPicker"
import { EffortPicker, type EffortPickerProps } from "./components/EffortPicker"

export function App(props: {
  session: Session
  onSubmit?: (text: string) => void
  connected?: boolean
  dialog?: "connect" | "model" | "effort" | null
  modelLabel?: string
  composerStatus?: string
  connectProps?: ConnectWizardProps
  modelProps?: ModelPickerProps
  effortProps?: EffortPickerProps
}) {
  const { session, onSubmit = () => {}, connected = true, dialog = null, modelLabel, composerStatus, connectProps, modelProps, effortProps } = props
  return (
    <Box flexDirection="column">
      <Transcript session={session} />
      <Composer onSubmit={onSubmit} usage={{ tokens: session.contextUsage.inputTokens, percent: session.contextUsage.contextPercent, costUsd: session.contextUsage.costUsd }} model={modelLabel ?? session.model} status={composerStatus} disabled={dialog != null} />
      {dialog === "connect" && connectProps
        ? <ConnectWizard {...connectProps} />
        : dialog === "model" && modelProps
          ? <ModelPicker {...modelProps} />
          : dialog === "effort" && effortProps
            ? <EffortPicker {...effortProps} />
            : null}
      <Footer cwd={session.cwd} permissionCount={0} mcpCount={0} connected={connected} />
    </Box>
  )
}
