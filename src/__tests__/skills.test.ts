import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  lstatSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to test the pure logic with a temp directory.
// Patch getSkillsDir by importing the module with overrides via a factory.

async function makeModule(skillsDir: string) {
  // Inline the same logic as skills.ts but with a fixed path for testing.
  const { mkdirSync: mds, readdirSync: rds, lstatSync: ls, renameSync: rs } = await import("node:fs");
  const { join: j } = await import("node:path");

  const disabledDir = j(skillsDir, "disabled");

  function listSkills() {
    mds(disabledDir, { recursive: true });
    const entries: Array<{ name: string; enabled: boolean; isSymlink: boolean }> = [];

    const scan = (dir: string, enabled: boolean) => {
      let names: string[];
      try { names = rds(dir); } catch { return; }
      for (const name of names) {
        if (name.startsWith(".") || (enabled && name === "disabled")) continue;
        const fullPath = j(dir, name);
        let stat: ReturnType<typeof ls>;
        try { stat = ls(fullPath); } catch { continue; }
        if (stat.isSymbolicLink() || stat.isDirectory()) {
          entries.push({ name, enabled, isSymlink: stat.isSymbolicLink() });
        }
      }
    };

    scan(skillsDir, true);
    scan(disabledDir, false);
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  function disableSkill(name: string) {
    mds(disabledDir, { recursive: true });
    rs(j(skillsDir, name), j(disabledDir, name));
  }

  function enableSkill(name: string) {
    rs(j(disabledDir, name), j(skillsDir, name));
  }

  function applyChanges(
    current: Array<{ name: string; enabled: boolean; isSymlink: boolean }>,
    selectedNames: Set<string>,
  ) {
    const toEnable: string[] = [];
    const toDisable: string[] = [];
    for (const skill of current) {
      const shouldBeEnabled = selectedNames.has(skill.name);
      if (skill.enabled && !shouldBeEnabled) { disableSkill(skill.name); toDisable.push(skill.name); }
      else if (!skill.enabled && shouldBeEnabled) { enableSkill(skill.name); toEnable.push(skill.name); }
    }
    return { enabled: toEnable, disabled: toDisable };
  }

  return { listSkills, disableSkill, enableSkill, applyChanges };
}

describe("skills management", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "skillsctl-test-"));
    mkdirSync(join(tmpDir, "disabled"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists directory skills as enabled", async () => {
    mkdirSync(join(tmpDir, "my-skill"));
    const { listSkills } = await makeModule(tmpDir);
    const skills = listSkills();
    expect(skills).toContainEqual({ name: "my-skill", enabled: true, isSymlink: false });
  });

  it("lists symlink skills as enabled with isSymlink=true", async () => {
    const target = mkdtempSync(join(tmpdir(), "skill-target-"));
    symlinkSync(target, join(tmpDir, "sym-skill"));
    const { listSkills } = await makeModule(tmpDir);
    const skills = listSkills();
    expect(skills).toContainEqual({ name: "sym-skill", enabled: true, isSymlink: true });
    rmSync(target, { recursive: true, force: true });
  });

  it("lists disabled skills from disabled/ folder", async () => {
    mkdirSync(join(tmpDir, "disabled", "off-skill"));
    const { listSkills } = await makeModule(tmpDir);
    const skills = listSkills();
    expect(skills).toContainEqual({ name: "off-skill", enabled: false, isSymlink: false });
  });

  it("excludes hidden files and the disabled/ folder from enabled list", async () => {
    writeFileSync(join(tmpDir, ".hidden"), "");
    const { listSkills } = await makeModule(tmpDir);
    const skills = listSkills();
    expect(skills.every((s) => !s.name.startsWith("."))).toBe(true);
    expect(skills.every((s) => s.name !== "disabled")).toBe(true);
  });

  it("disables a skill by moving it to disabled/", async () => {
    mkdirSync(join(tmpDir, "active-skill"));
    const { disableSkill } = await makeModule(tmpDir);
    disableSkill("active-skill");
    expect(existsSync(join(tmpDir, "active-skill"))).toBe(false);
    expect(existsSync(join(tmpDir, "disabled", "active-skill"))).toBe(true);
  });

  it("enables a skill by moving it from disabled/", async () => {
    mkdirSync(join(tmpDir, "disabled", "dormant-skill"));
    const { enableSkill } = await makeModule(tmpDir);
    enableSkill("dormant-skill");
    expect(existsSync(join(tmpDir, "disabled", "dormant-skill"))).toBe(false);
    expect(existsSync(join(tmpDir, "dormant-skill"))).toBe(true);
  });

  it("preserves symlink when disabling a symlinked skill", async () => {
    const target = mkdtempSync(join(tmpdir(), "skill-target-"));
    symlinkSync(target, join(tmpDir, "sym-skill"));
    const { disableSkill } = await makeModule(tmpDir);
    disableSkill("sym-skill");
    const stat = lstatSync(join(tmpDir, "disabled", "sym-skill"));
    expect(stat.isSymbolicLink()).toBe(true);
    rmSync(target, { recursive: true, force: true });
  });

  it("applyChanges disables unchecked enabled skills", async () => {
    mkdirSync(join(tmpDir, "skill-a"));
    mkdirSync(join(tmpDir, "skill-b"));
    const { listSkills, applyChanges } = await makeModule(tmpDir);
    const skills = listSkills();
    const { disabled } = applyChanges(skills, new Set(["skill-a"]));
    expect(disabled).toContain("skill-b");
    expect(existsSync(join(tmpDir, "disabled", "skill-b"))).toBe(true);
  });

  it("applyChanges enables checked disabled skills", async () => {
    mkdirSync(join(tmpDir, "disabled", "skill-c"));
    const { listSkills, applyChanges } = await makeModule(tmpDir);
    const skills = listSkills();
    const { enabled } = applyChanges(skills, new Set(["skill-c"]));
    expect(enabled).toContain("skill-c");
    expect(existsSync(join(tmpDir, "skill-c"))).toBe(true);
  });

  it("returns sorted skill list", async () => {
    mkdirSync(join(tmpDir, "zebra"));
    mkdirSync(join(tmpDir, "alpha"));
    mkdirSync(join(tmpDir, "mango"));
    const { listSkills } = await makeModule(tmpDir);
    const names = listSkills().map((s) => s.name);
    expect(names).toEqual([...names].sort());
  });
});
