export interface ChangedFile { path: string; action: "write" | "delete" }
export interface Feedback {
  verifier: string; tool?: string; status: "pass" | "fail"; exitCode?: number
  summary: string; affectedFiles: string[]
}
