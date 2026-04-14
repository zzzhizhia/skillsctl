# skillsctl

Enable/disable Claude Code skills interactively.

## Quick Start

```bash
# one-off
npx skillsctl

# install globally
npm install -g skillsctl
skillsctl
```

## Usage

```
? Toggle skills  (space: toggle, a: all, enter: confirm, q: quit)
❯ ◉ agent-browser [symlink]
  ◉ card
  ◯ deep-research [symlink]   ← disabled
  ◉ investigate [symlink]
  ...
```

- **Space** — toggle selected skill on/off
- **a** — select all / deselect all
- **Enter** — apply changes
- **q / Esc** — quit without changes

Skills stored as symlinks are labelled `[symlink]` and remain symlinks after being disabled.

## How It Works

Skills are files or directories in `~/.claude/skills/`. Disabling a skill moves it to `~/.claude/skills/disabled/` using `fs.renameSync`, which preserves symlinks. Enabling reverses the move.

## Requirements

- Node >= 20

## License

MIT
