import { describe, expect, test } from "bun:test"
import { SkillCatalog, buildSkillSection, ReadSkillTool } from "../src/memory/skills"
import { join } from "node:path"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"

const fixtures = join(import.meta.dir, "fixtures")

describe("SkillCatalog", () => {
  test("discovers SKILL.md files with parsed frontmatter", () => {
    const skills = SkillCatalog.discover(join(fixtures, "global-skills"), join(fixtures, "project-skills"))
    expect(skills.length).toBe(2)
    const s = skills.find(x => x.name === "write-tests")!
    expect(s.description).toContain("Write failing tests first")
    expect(s.body).toContain("## Instructions")
    expect(s.source).toBe("global")
  })

  test("project-level skill overrides global with same name", () => {
    const skills = SkillCatalog.discover(join(fixtures, "global-skills"), join(fixtures, "project-skills"))
    const deploy = skills.filter(s => s.name === "deploy")
    expect(deploy.length).toBe(1)
    expect(deploy[0]!.source).toBe("project")
  })

  test("discovers SKILL.md with CRLF line endings", () => {
    const dir = mkdtempSync(join(tmpdir(), "iterum-crlf-"))
    mkdirSync(join(dir, "crlf-skill"))
    writeFileSync(join(dir, "crlf-skill", "SKILL.md"), "---\r\nname: crlf-skill\r\ndescription: works on windows\r\n---\r\n\r\n## Instructions\r\nbody\r\n")
    const skills = SkillCatalog.discover(dir, join(dir, "project-skills"))
    const s = skills.find(x => x.name === "crlf-skill")
    expect(s).toBeDefined()
    expect(s!.body).toContain("## Instructions")
  })
})

describe("buildSkillSection", () => {
  test("renders name and description per skill", () => {
    const out = buildSkillSection([{ name: "write-tests", description: "Write failing tests first", body: "x", source: "global" }])
    expect(out).toContain("## Skills")
    expect(out).toContain("write-tests")
    expect(out).toContain("Write failing tests first")
  })

  test("empty list returns empty string", () => {
    expect(buildSkillSection([])).toBe("")
  })
})

describe("ReadSkillTool", () => {
  test("returns skill body on demand (not in system prompt)", async () => {
    const catalog = SkillCatalog.discover(join(fixtures, "global-skills"), join(fixtures, "project-skills"))
    const tool = new ReadSkillTool(catalog)
    expect(tool.name).toBe("read_skill")
    const res = await tool.execute({ name: "read_skill", args: { name: "write-tests" } })
    expect(res.ok).toBe(true)
    expect(res.output).toContain("## Instructions")
  })

  test("unknown skill returns ok:false", async () => {
    const tool = new ReadSkillTool([])
    const res = await tool.execute({ name: "read_skill", args: { name: "nope" } })
    expect(res.ok).toBe(false)
  })
})
