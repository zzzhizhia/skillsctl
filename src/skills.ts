import { readdirSync, lstatSync, mkdirSync, renameSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export interface Skill {
  name: string;
  enabled: boolean;
  isSymlink: boolean;
}

export function getSkillsDir(): string {
  return resolve(join(homedir(), ".claude", "skills"));
}

export function getDisabledDir(): string {
  return join(getSkillsDir(), "disabled");
}

export function listSkills(): Skill[] {
  const root = getSkillsDir();
  const disabledDir = getDisabledDir();

  // Ensure disabled dir exists
  mkdirSync(disabledDir, { recursive: true });

  const entries: Skill[] = [];
  const seen = new Set<string>();

  const scan = (dir: string, enabled: boolean) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }

    for (const name of names) {
      // Skip hidden files and the disabled directory itself
      if (name.startsWith(".") || (enabled && name === "disabled")) continue;
      // Skip duplicates — root scan runs first, so root copy wins
      if (seen.has(name)) continue;

      const fullPath = join(dir, name);
      let stat: ReturnType<typeof lstatSync>;
      try {
        stat = lstatSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink() || stat.isDirectory()) {
        seen.add(name);
        entries.push({ name, enabled, isSymlink: stat.isSymbolicLink() });
      }
    }
  };

  scan(root, true);
  scan(disabledDir, false);

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function disableSkill(name: string): void {
  const root = getSkillsDir();
  const disabledDir = getDisabledDir();
  mkdirSync(disabledDir, { recursive: true });
  const dest = join(disabledDir, name);
  // Remove stale destination left by a previous failed operation
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  renameSync(join(root, name), dest);
}

export function enableSkill(name: string): void {
  const root = getSkillsDir();
  const disabledDir = getDisabledDir();
  const dest = join(root, name);
  // Remove stale destination left by a previous failed operation
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  renameSync(join(disabledDir, name), dest);
}

export function applyChanges(
  current: Skill[],
  selectedNames: Set<string>,
): { enabled: string[]; disabled: string[] } {
  const toEnable: string[] = [];
  const toDisable: string[] = [];

  for (const skill of current) {
    const shouldBeEnabled = selectedNames.has(skill.name);
    if (skill.enabled && !shouldBeEnabled) {
      disableSkill(skill.name);
      toDisable.push(skill.name);
    } else if (!skill.enabled && shouldBeEnabled) {
      enableSkill(skill.name);
      toEnable.push(skill.name);
    }
  }

  return { enabled: toEnable, disabled: toDisable };
}
