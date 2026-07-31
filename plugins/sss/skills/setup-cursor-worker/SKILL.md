---
name: setup-cursor-worker
description: One-time machine setup that makes cursor-agent usable as an Orca worker engine for /autoship and /delegate-tickets. Verifies PATH, auth, permissions, model, and workspace trust, then proves the dispatch round-trip with a live smoke test.
---

# Setup Cursor Worker

`/autoship` and `/delegate-tickets` can run their workers on `cursor-agent` instead of `claude` via `--engine cursor`. That swap is only a launch-argv change — everything else (task DAG, `--inject` dispatch, `ask`/`reply`, `worker_done`) is engine-agnostic Orca machinery. This skill makes the swap safe on **this machine**, once.

It is machine-scoped, not repo-scoped. Run it once; re-run it after a Cursor upgrade, after changing your Cursor model, or whenever a cursor worker fails to start.

> **Prerequisites.** `cursor-agent` on `PATH` and authenticated, plus an Orca install. Only useful
> alongside `/autoship` and `/delegate-tickets` (also in this plugin), which in turn need the
> `mattpocock-skills` plugin from this marketplace.

Its output is a verdict, not a config dump: either **ready** (the smoke test received `worker_done`) or **not ready** plus exactly what is missing.

## Why each step exists

Every check below exists because its absence produces a *silent* failure — a worker that looks alive and never works. That is the failure mode this skill exists to prevent, and it is why the definition of done is a live dispatch rather than a set of assertions.

## 1. Binary and authentication

`cursor-agent` must be on PATH and logged in. Check both; a logged-out CLI starts, renders, and then fails on first model call — indistinguishable from a slow worker.

```bash
which cursor-agent
cursor-agent --version
cursor-agent status
```

Missing binary → install the Cursor CLI. Not authenticated → the user runs `cursor-agent login` themselves (it opens a browser; never attempt it unattended).

## 2. Permissions — no prompt can ever appear

An Orca worker is unattended. Any approval prompt is not a delay, it is a hang: the terminal stays alive, `tui-idle` reports ready, and the coordinator waits out its full timeout window on a worker that will never move.

In `~/.cursor/cli-config.json`, ensure:

- `approvalMode: "unrestricted"` — the persistent equivalent of `--yolo`. The enum is `allowlist | auto-review | unrestricted`; the first two can prompt.
- `sandbox: { "mode": "disabled" }` — workers must run `git`, the repo's package manager, and `orca orchestration`, none of which survive a default sandbox.

Preserve every other key. Cursor writes this file itself, so re-read before writing and merge rather than replace.

Verify by reading the launched TUI's statusline later (step 5): it must show `Run Everything`.

## 3. Model — set it in the TUI picker, never in the config file

Workers launch as bare `cursor-agent` with **no `--model` flag**, so they inherit the account's current model selection.

**Do not try to set the model by editing `cli-config.json`.** Its `model` and `modelParameters` keys are a *cache* of an account-level preference that `cursor-agent` re-syncs on every launch: write `context=1m, effort=medium` to the file, launch, and the file comes back rewritten to whatever the account last selected, with the statusline following the account rather than the file. Editing it looks like it worked — the write succeeds and reads back correctly — right up until a worker starts.

`--model` cannot substitute either. It accepts only flat variant ids (`claude-opus-5-thinking-medium`), and **every flat id resolves to 300K context**; the base id (`claude-opus-5`) and the bracket syntax advertised in `cursor-agent --help` (`claude-opus-5[context=1m,...]`) are both rejected outright, and a rejected id makes the agent print the model list and exit.

So the account preference is the only route to 1M context, and the only way to change it is the picker inside a running TUI:

1. Launch `cursor-agent` in any trusted directory.
2. Type `/model`.
3. Highlight the model (e.g. `Opus 5`) and press **Tab** to edit its parameters.
4. Set Context and Effort with ↑/↓ + Enter (e.g. `1M`, `Medium`; leave Thinking on, Fast off), then **Esc**.
5. Press **Enter** on the model row to make it active.

The statusline updates immediately — e.g. `Opus 5 1M Medium · MAX` — and the selection syncs account-side, so every later bare `cursor-agent` inherits it.

**Verify by launching, never by reading the file.** Start a fresh `cursor-agent` and read its statusline (step 6). A statusline reading `300K` when you wanted `1M` means the account preference is wrong — fix it in the picker and launch again. The file is evidence of nothing.

## 4. Workspace trust

Cursor refuses to start in an untrusted directory, printing an interactive menu. Every Orca worktree is a new directory, so without this step every worker hangs at that menu forever.

Trust markers live at `~/.cursor/projects/<slug>/.workspace-trusted` — outside the repo, so they never pollute a worker's commit — and **trust is inherited from ancestors**: cursor walks up from the cwd and accepts any ancestor holding a marker, provided that ancestor is at least 3 path segments deep and is neither the home directory nor an ancestor of it.

So trust the **worktree base directories** once and every future worktree under them is covered.

Derive the bases rather than assuming them — they differ per repo, and some repos are registered such that their Orca workspaces sit on the repo path itself rather than under a shared root:

```bash
orca worktree list --limit 200 --json   # take dirname of every non-main worktree path; dedupe
```

Group the results: the shared root (typically `~/orca/workspaces`) covers most repos in one marker; any outlier path needs its own. Discard candidates shallower than 3 segments — cursor will not inherit from them.

**Let cursor write each marker itself** rather than computing the slug by hand — the slug rewrites `/` and `_` and is not worth reimplementing:

```bash
cd <base-dir> && cursor-agent -p --trust "reply with OK"
```

`--trust` persists the marker for that directory. Confirm one landed for each base before continuing.

## 5. Skills and readiness

Cursor discovers skills from `.cursor/skills/`, `.cursor/skills-cursor/`, `.claude/skills/`, `.codex/skills/`, and `.agents/skills/`, so a machine already set up for Claude needs no skill syncing. Two specifics matter to workers:

- **`code-review` must be discoverable** — it is the one skill a worker genuinely Skill-invokes rather than reads by path. Confirm it appears in the worker's skill list.
- Everything else (`implement`, `to-spec`, `to-tickets`, `grilling`) is read by absolute path from the dispatch prompt, so discovery is irrelevant for those.

## 6. Definition of done — the live smoke test

Static checks cannot see the failures that actually happen. Prove the round-trip:

1. Create a throwaway Orca worktree.
2. `orca terminal create --command "cursor-agent"`.
3. **Do not trust `tui-idle`.** It is satisfied by the bare shell that exists before cursor's TUI mounts. Poll `orca terminal read` until the pane shows a rendered agent frame, and confirm the statusline reads `Opus 5 1M Medium` and `Run Everything`.
4. `orca orchestration task-create` a trivial connectivity task that instructs the worker to send `worker_done` with an agreed token and the character count of the spec it received, and to touch no files.
5. `orca orchestration dispatch --task <id> --to <handle> --inject`.
6. `orca orchestration check --wait --terminal <coordinator_handle> --types worker_done` — require the message back, with matching `taskId`/`dispatchId` in its payload and a character count matching what was sent (this is what proves the spec arrived un-truncated).
7. Tear down: stop terminals, remove the worktree, mark the task completed.

Report **ready** only after step 6 returns the message. Anything else is **not ready** — say which step failed and what the terminal showed.

## Gotchas

- **A bad `--model` id kills the agent instantly.** `cursor-agent` prints the full model list and exits, leaving a bare shell that `tui-idle` calls ready. If a worker terminal shows a shell prompt where the TUI should be, read the scrollback before assuming a slow start.
- **`--list-models` display names lie about context.** It labels `claude-opus-5-thinking-high` as "Opus 5 1M Thinking", but launching it yields a `300K High` statusline. Trust the statusline of a running agent, never the model list.
- **`cli-config.json` is not authoritative for the model.** Launching cursor rewrites it from the account preference. It *is* authoritative for `approvalMode` and `sandbox` — those survive a launch.
- **`cursor-agent status` is `whoami`, not health.** It proves auth, not that a model call will succeed.
- **Never run `cursor-agent login` unattended.** It opens a browser and blocks; hand it to the user.
- **Re-run after a Cursor upgrade.** Model ids, config keys, and the trust mechanism are all Cursor-version-specific; this skill's assertions are pinned to what a given version does.
