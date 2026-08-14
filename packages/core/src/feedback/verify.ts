import type { CommandRunner } from "../tools/types"
import type { ChangedFile, Feedback } from "./types"

export class VerifyRunner {
  constructor(private verifier: string, private runner: CommandRunner) {}
  async verify(changed: ChangedFile[]): Promise<Feedback> {
    const t = Date.now()
    const { exitCode, output } = await this.runner(this.verifier, process.cwd())
    const tail = output.split("\n").slice(-15).join("\n")
    return {
      verifier: this.verifier, status: exitCode === 0 ? "pass" : "fail", exitCode,
      summary: tail, affectedFiles: changed.map(c => c.path),
    }
  }
}

export function formatFeedback(f: Feedback): string {
  return `[feedback] verifier=${f.verifier}${f.tool ? ` tool=${f.tool}` : ""} status=${f.status} exitCode=${f.exitCode ?? ""}\nsummary:\n${f.summary}\naffectedFiles: ${f.affectedFiles.join(", ")}`
}
