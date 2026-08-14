import React from "react"
import { describe, expect, test } from "bun:test"
import { render } from "ink-testing-library"
import { ConnectWizard } from "../src/components/ConnectWizard"

describe("ConnectWizard", () => {
  test("第一步渲染厂商列表", () => {
    const { lastFrame } = render(
      <ConnectWizard
        vendors={[{ id: "openai", name: "OpenAI" }, { id: "deepseek", name: "DeepSeek" }]}
        loading={false}
        models={[]}
        onPickVendor={() => {}}
        onSubmitKey={() => {}}
        onPickModel={() => {}}
        onManualModel={() => {}}
        onCancel={() => {}}
      />,
    )
    const frame = lastFrame()
    expect(frame).toContain("OpenAI")
    expect(frame).toContain("DeepSeek")
  })
})
