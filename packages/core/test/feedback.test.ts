import { describe, expect, test } from "bun:test"
import { VerifyRunner } from "../src/feedback/verify"
import { formatFeedback } from "../src/feedback/verify"

const failRunner = async () => ({ exitCode: 1, output: "FAIL auth.test.ts: expected 1, got 2\n27 passed, 1 failed" })
const passRunner = async () => ({ exitCode: 0, output: "28 passed" })

describe("VerifyRunner", () => {
  test("non-zero exit produces fail feedback with summary", async () => {
    const r = new VerifyRunner("test", failRunner)
    const f = await r.verify([{ path: "src/auth.ts", action: "write" }])
    expect(f.status).toBe("fail")
    expect(f.verifier).toBe("test")
    expect(f.affectedFiles).toEqual(["src/auth.ts"])
  })

  test("zero exit produces pass", async () => {
    const r = new VerifyRunner("test", passRunner)
    expect((await r.verify([])).status).toBe("pass")
  })

  test("feedback text template is deterministic", () => {
    const f = { verifier: "test", tool: "write_file", status: "fail" as const, exitCode: 1, summary: "1 failed", affectedFiles: ["a.ts"] }
    expect(formatFeedback(f)).toContain("[feedback] verifier=test tool=write_file status=fail exitCode=1")
    expect(formatFeedback(f)).toContain("affectedFiles: a.ts")
  })
})
