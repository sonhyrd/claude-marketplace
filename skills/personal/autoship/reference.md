# Autoship — command reference

Concrete invocations behind the checks and lookups described in [SKILL.md](./SKILL.md). Loaded on demand; SKILL.md stays goals-only.

## Precondition checks

Run both. Either failing ends the run with a stop-and-report naming the missing piece and its fix.

### Orca orchestration

```bash
orca status --json                    # must succeed and show a running runtime
orca orchestration task-list --json   # must succeed — proves orchestration RPC is enabled
```

Failure shapes and what to report:

- `orca` not found on PATH (`orca-ide` on Linux) → the Orca CLI is not installed or not on PATH.
- `orca status --json` errors or shows no running runtime → start the Orca app.
- `orca orchestration task-list --json` errors while `orca status` succeeds → enable the orchestration experimental feature in Orca's Settings > Experimental.

### Repo configuration

The Issue-tracker output of `/setup-matt-pocock-skills` must exist in the target repo:

```bash
test -f docs/agents/issue-tracker.md
```

Missing → run `/setup-matt-pocock-skills` in the target repo, then re-invoke autoship.

## Intake lookups

To resolve an Issue reference, follow the target repo's `docs/agents/issue-tracker.md` — it names the configured tracker and how to read from it (e.g. `gh issue view <n>` for GitHub, `glab issue view <n>` for GitLab, or a file under `.scratch/` for the local-markdown convention). Record the tracker and fetch date in the source brief's provenance.
