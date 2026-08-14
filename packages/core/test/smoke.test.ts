import { describe, expect, test } from "bun:test"
import { coreVersion } from "../src/index"

describe("core smoke", () => {
  test("coreVersion returns M1", () => {
    expect(coreVersion()).toBe("M1")
  })
})
