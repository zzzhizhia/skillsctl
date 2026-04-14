import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { checkbox } from "@inquirer/prompts";
import pc from "picocolors";
import { listSkills, applyChanges, type Skill } from "./skills.js";

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

async function main() {
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

  if (enabled.length > 0) {
    console.log(pc.green("Enabled:  ") + enabled.join(", "));
  }
  if (disabled.length > 0) {
    console.log(pc.red("Disabled: ") + disabled.join(", "));
  }
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
