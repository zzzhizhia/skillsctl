import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { checkbox } from "@inquirer/prompts";
import pc from "picocolors";
import { listSkills, applyChanges, enableSkill, disableSkill, type Skill } from "./skills.js";

function withQuit<C, T>(
  prompt: (config: C, context?: { signal?: AbortSignal }) => Promise<T>,
  config: C,
): Promise<T> {
  const ac = new AbortController();
  const onData = (chunk: Buffer) => {
    if (chunk.toString() === "q") ac.abort();
  };
  process.stdin.on("data", onData);
  return prompt(config, { signal: ac.signal }).finally(() => {
    process.stdin.off("data", onData);
  });
}

function skillLabel(skill: Skill): string {
  const symTag = skill.isSymlink ? pc.dim(" [symlink]") : "";
  return pc.bold(skill.name) + symTag;
}

function cmdList() {
  const skills = listSkills();
  if (skills.length === 0) {
    console.log(pc.yellow("No skills found in ~/.claude/skills/"));
    return;
  }
  for (const skill of skills) {
    const tag = skill.isSymlink ? pc.dim(" [symlink]") : "";
    const status = skill.enabled ? pc.green("✓") : pc.red("✗");
    console.log(`${status} ${pc.bold(skill.name)}${tag}`);
  }
}

function cmdEnable(names: string[]) {
  const skills = listSkills();
  const disabledMap = new Map(skills.filter((s) => !s.enabled).map((s) => [s.name, s]));
  for (const name of names) {
    if (!disabledMap.has(name)) {
      const exists = skills.some((s) => s.name === name);
      console.log(exists ? pc.dim(`${name}: already enabled`) : pc.yellow(`${name}: not found`));
      continue;
    }
    enableSkill(name);
    console.log(pc.green(`Enabled:  ${name}`));
  }
}

function cmdDisable(names: string[]) {
  const skills = listSkills();
  const enabledMap = new Map(skills.filter((s) => s.enabled).map((s) => [s.name, s]));
  for (const name of names) {
    if (!enabledMap.has(name)) {
      const exists = skills.some((s) => s.name === name);
      console.log(exists ? pc.dim(`${name}: already disabled`) : pc.yellow(`${name}: not found`));
      continue;
    }
    disableSkill(name);
    console.log(pc.red(`Disabled: ${name}`));
  }
}

async function cmdInteractive() {
  const skills = listSkills();

  if (skills.length === 0) {
    console.log(pc.yellow("No skills found in ~/.claude/skills/"));
    return;
  }

  const choices = skills.map((skill) => ({
    name: skillLabel(skill),
    value: skill.name,
    checked: skill.enabled,
  }));

  let selected: string[];
  try {
    selected = await withQuit(checkbox, {
      message: pc.cyan("Toggle skills") + pc.dim("  (space: toggle, a: all, enter: confirm, q: quit)"),
      choices,
      pageSize: 25,
      loop: false,
      theme: {
        style: {
          answer: (text: string) => {
            const count = text.split(",").length;
            return pc.dim(`${count} skill(s) selected`);
          },
        },
      },
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "ExitPromptError" || name === "AbortError") {
      console.log(pc.dim("Aborted."));
      process.exit(0);
    }
    throw err;
  }

  const selectedSet = new Set(selected);
  const { enabled, disabled } = applyChanges(skills, selectedSet);

  if (enabled.length === 0 && disabled.length === 0) {
    console.log(pc.dim("No changes."));
    return;
  }

  if (enabled.length > 0) console.log(pc.green("Enabled:  ") + enabled.join(", "));
  if (disabled.length > 0) console.log(pc.red("Disabled: ") + disabled.join(", "));
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "list" || cmd === "ls") return cmdList();
  if (cmd === "enable" || cmd === "on") return cmdEnable(args);
  if (cmd === "disable" || cmd === "off") return cmdDisable(args);
  if (cmd === "--help" || cmd === "-h") {
    console.log(`Usage:
  skillsctl                     interactive toggle
  skillsctl list                list all skills with status
  skillsctl enable <skill...>   enable one or more skills
  skillsctl disable <skill...>  disable one or more skills`);
    return;
  }

  return cmdInteractive();
}

const currentFile = fileURLToPath(import.meta.url);
const isDirectRun =
  process.argv[1] != null &&
  resolve(realpathSync(process.argv[1])) === currentFile;

if (isDirectRun) {
  main().catch((err) => {
    if (err?.name === "ExitPromptError") process.exit(0);
    console.error(err.message ?? err);
    process.exit(1);
  });
}
