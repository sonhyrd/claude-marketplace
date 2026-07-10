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

## Run worktree

Derive `<run-name>` from the brief: a short kebab-case slug prefixed `autoship-`, e.g. `autoship-dark-mode`.

```bash
orca worktree create --name <run-name> --no-parent --agent claude --json
```

- `--no-parent` sets Orca lineage only (top-level worktree); the Git base comes from **omitting `--base-branch`**, which uses the repo default base. Never pass the invoking branch. To be explicit, pass the default base from `orca repo show --repo <selector> --json`.
- Omit `--repo` only when running inside an Orca-managed worktree; otherwise pass `--repo <selector>`.
- `--agent claude` launches the align worker's agent in the worktree's first terminal — do not create a separate startup terminal. If an older CLI rejects `--agent`, create the worktree plain, then `orca terminal create --worktree id:<worktreeId> --title align --command "claude" --json`.

Read `worktreeId` from the output, then find the worker's terminal handle and wait for it to be ready:

```bash
orca terminal list --worktree id:<worktreeId> --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
```

## Align dispatch

```bash
orca orchestration task-create --spec "<align spec — template below>" --json
orca orchestration dispatch --task <task_id> --to <handle> --inject --json
```

`--inject` sends the spec plus a coordinator preamble into the worker so its `ask` and `worker_done` carry the right `taskId`/`dispatchId` and coordinator handle.

Align spec template (fill in the full source brief):

```text
Align this brief into a spec and published Issues. Work only in this worktree.

Source brief:
<the full source brief, verbatim>

Read and follow these skill files as instructions, in one continuous context.
Do NOT Skill-invoke them — to-spec and to-tickets are user-only and the whole
sequence must share your context window:
1. ~/.claude/skills/grilling/SKILL.md  (with ~/.claude/skills/domain-modeling/SKILL.md)
2. ~/.claude/skills/to-spec/SKILL.md
3. ~/.claude/skills/to-tickets/SKILL.md

Wherever those skills say "the user", that is your coordinator (handle in your
dispatch preamble). Ask every question one at a time with
`orca orchestration ask --to <coordinator_handle> --question "..." --json`;
the reply is your answer. Never ask questions in the terminal — nobody is watching it.

Publish the spec and the Issues with their blocking edges per this repo's
docs/agents/issue-tracker.md. Then send worker_done once, with the spec
location and the published Issue identifiers (with their blocking edges)
in the body.
```

## Coordinator wait loop

The coordinator is the product-owner proxy. Wait in rolling windows — never sleep/poll:

```bash
orca orchestration check --wait --types worker_done,escalation,decision_gate --timeout-ms 900000 --json
```

Handle each outcome, then loop:

- **`decision_gate`** (the worker's `ask`): answer grounded only in the source brief, the target repo's `CONTEXT.md`, and its ADRs. If ungrounded, give the most reversible answer and append an entry to `.scratch/autoship/assumptions.md` in the run worktree. Either way:

  ```bash
  orca orchestration reply --id <msg_id> --body "<answer>" --json
  ```

- **Timeout / `{count:0}`**: a checkpoint, not a failure — align runs can take 15–60+ minutes. Check liveness, then wait again:

  ```bash
  orca terminal read --terminal <handle> --json
  ```

- **`escalation`**: treat like a `decision_gate` — answer it with `reply` under the same grounding and never-block rules; do not wait for a human.

- **`worker_done`**: mark the task completed, verify the spec and Issues exist in the tracker per `docs/agents/issue-tracker.md`, then report spec + Issues + assumptions log and stop (this version ends here):

  ```bash
  orca orchestration task-update --id <task_id> --status completed --json
  ```
