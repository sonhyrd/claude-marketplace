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

### Engine setup — only when `--engine cursor`

```bash
which cursor-agent && cursor-agent status
```

Either failing → stop and report: run `/setup-cursor-worker` on this machine, then re-invoke autoship. Never fall back to `claude` when `cursor` was asked for.

## Worker engine argv

Every worker terminal in the run launches with the argv for the run's engine. Nothing else about dispatch differs.

| `--engine` | terminal command |
| ---------- | ---------------- |
| `claude` (default) | `claude` |
| `cursor` | `cursor-agent` |
| `cursor:<model-id>` | `cursor-agent --model <model-id>` |

**Launch cursor bare unless a model was explicitly requested.** A bare `cursor-agent` inherits the account's current model selection — set in the TUI's `/model` picker and synced account-side (see `/setup-cursor-worker`). That is the only route to 1M context: every flat id passed via `--model` resolves to 300K, and the base id and the bracket syntax in `cursor-agent --help` are both rejected outright, which kills the agent on startup. So `cursor:<model-id>` is an explicit trade the user opted into — worth taking for a cheap fast model on mechanical work, worth avoiding otherwise. Never edit `~/.cursor/cli-config.json` to change a worker's model; launching cursor rewrites it from the account preference.

## Worker readiness — before every dispatch

`tui-idle` is satisfied by a bare shell, so it never proves an agent launched. It is a cheap first gate, not the check. Applies to **every** engine:

```bash
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
orca terminal read --terminal <handle> --json    # must show a rendered agent frame
```

Read the pane. A pane holding only a shell prompt is **not ready**: either the TUI has not mounted yet, or the agent exited on startup and left the shell behind — the two are indistinguishable in a single read, so re-read rather than judging on the first one. Re-read up to 5 times before giving up.

Ready means the pane shows agent chrome — a statusline, a composer, a banner — not just a prompt. If the scrollback instead shows an error and a returned prompt (a rejected `--model` id does exactly this, printing the full model list and exiting), the worker is dead: **never dispatch into it.** Close it, create a fresh terminal, and count the attempt against the task's failure budget.

## Intake lookups

To resolve an Issue reference, follow the target repo's `docs/agents/issue-tracker.md` — it names the configured tracker and how to read from it (e.g. `gh issue view <n>` for GitHub, `glab issue view <n>` for GitLab, or a file under `.scratch/` for the local-markdown convention). Record the tracker and fetch date in the source brief's provenance.

## Run worktree

Derive `<run-name>` from the brief: a short kebab-case slug prefixed `autoship-`, e.g. `autoship-dark-mode`.

On `--engine claude`, let Orca launch the spec worker in the worktree's first terminal:

```bash
orca worktree create --name <run-name> --no-parent --agent claude --json
```

On any other engine, create the worktree plain and add the worker terminal with the engine's argv — `--agent` takes a fixed argv and cannot carry a model:

```bash
orca worktree create --name <run-name> --no-parent --json
orca terminal create --worktree id:<worktreeId> --title align --command "<engine argv>" --json
```

- `--no-parent` sets Orca lineage only (top-level worktree); the Git base comes from **omitting `--base-branch`**, which uses the repo default base. Never pass the invoking branch. To be explicit, pass the default base from `orca repo show --repo <selector> --json`.
- Omit `--repo` only when running inside an Orca-managed worktree; otherwise pass `--repo <selector>`.
- `--agent claude` launches the agent in the first terminal — do not create a separate startup terminal on that path. If an older CLI rejects `--agent`, fall back to the two-step form above.
- The two-step form can leave an unused fallback shell alongside the agent terminal. Target the agent handle only; close the other one solely after `terminal list` confirms it is an unused shell.

Read `worktreeId` from the output, find the worker's terminal handle, and confirm readiness per **Worker readiness** above — `tui-idle` alone is not enough:

```bash
orca terminal list --worktree id:<worktreeId> --json
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

## Coordinator wait loop — align

The coordinator is the product-owner proxy. Wait in rolling windows — never sleep/poll. **Always pass `--terminal` explicitly**: subshells can resolve to a different identity than the handle the workers address, leaving the coordinator silently deaf while messages queue. The coordinator handle is `created_by_terminal_handle` in the `task-create` output:

```bash
orca orchestration check --wait --terminal <coordinator_handle> --types worker_done,escalation,decision_gate --timeout-ms 900000 --json
```

Handle each outcome, then loop:

- **`decision_gate`** (the worker's `ask`): answer grounded only in the source brief, the target repo's `CONTEXT.md`, and its ADRs. If ungrounded, give the most reversible answer and append an entry to `.scratch/autoship/assumptions.md` in the run worktree. Either way:

  ```bash
  orca orchestration reply --id <msg_id> --body "<answer>" --json
  ```

- **Timeout / `{count:0}`**: a checkpoint, not a failure — align runs can take 15–60+ minutes. Check liveness, and also poll for pending gates: a worker whose blocking `ask` dies client-side falls back to `gate-create` + `escalation`, and gates never arrive as messages. Then wait again:

  ```bash
  orca terminal read --terminal <handle> --json
  orca orchestration gate-list --status pending --json   # resolve any pending gate like a decision_gate
  ```

- **`escalation`**: treat like a `decision_gate` — answer it with `reply` under the same grounding and never-block rules; do not wait for a human.

- **`worker_done`**: mark the align task completed, verify the spec and Issues exist in the tracker per `docs/agents/issue-tracker.md`, report spec + Issues + assumptions log to the user, then continue into the Frontier drain (below):

  ```bash
  orca orchestration task-update --id <task_id> --status completed --json
  ```

## Frontier drain

### Mirror the DAG

One orchestration task per published Issue. Create blockers before dependents so `--deps` can name their task ids; read each Issue's blocking edges from the tracker per `docs/agents/issue-tracker.md` and mirror them exactly — no edge added, none dropped:

```bash
orca orchestration task-create --spec "<Issue worker spec — template below>" --json
orca orchestration task-create --spec "<...>" --deps '["<blocker_task_id>","<blocker_task_id>"]' --json
```

Put the Issue identifier on the first line of each task spec so task output maps back to the tracker. The Frontier is then a query, never a recollection:

```bash
orca orchestration task-list --ready --json   # Issues whose blockers are all completed
```

### Issue worker dispatch

One Issue at a time, in dependency order. Every dispatch gets a fresh terminal in the run worktree — never the spec worker's terminal, never a previous Issue's:

```bash
orca terminal create --worktree id:<worktreeId> --title issue-<id> --command "<engine argv>" --json
# then confirm readiness per "Worker readiness" above — tui-idle alone is not enough
orca orchestration dispatch --task <task_id> --to <handle> --inject --json
```

Issue worker spec template (fill per Issue):

```text
Implement exactly one Issue in this worktree, on the current branch.

Issue <tracker id>: <title>
<full Issue body, verbatim, including acceptance criteria>

Spec, for context — the Issue above bounds your scope: <spec location>
Conventions agreed during align: the spec's implementation decisions, plus
.scratch/autoship/assumptions.md in this worktree.

Read and follow ~/.claude/skills/implement/SKILL.md as instructions — it is
user-only, do NOT Skill-invoke it. Where it says to use code-review, Skill-invoke
code-review (it is model-invocable), reviewing against the commit that was HEAD
when you started.

Review loop, hard cap two cycles: fix every must-fix finding from the first
review, re-review once, then stop — findings still open after the second review
are residual findings to report, not fix.

End with exactly ONE commit on this branch containing all work for this Issue
(amend if fixes land after the first commit — never a second commit). Then send
worker_done exactly once, even on failure, to the coordinator handle in your
dispatch preamble, with payload:
{"taskId":"<task_id>","dispatchId":"<dispatch_id>","issue":"<tracker id>",
 "commit":"<sha>","reviewCycles":<1 or 2>,"filesModified":["path/a", ...],
 "residualFindings":["<finding>", ...]}
```

### Drain loop

The same rolling wait as align, after every dispatch:

```bash
orca orchestration check --wait --terminal <coordinator_handle> --types worker_done,escalation,decision_gate --timeout-ms 900000 --json
```

- **`decision_gate` / `escalation`**: answer as the product-owner proxy under the align rules — grounded in the source brief, `CONTEXT.md`, and ADRs; ungrounded → most reversible answer plus an assumptions-log entry; `reply`, then keep waiting.
- **Timeout / `{count:0}`**: liveness checkpoint — `orca terminal read --terminal <handle> --json`, then wait again.
- **`worker_done` reporting success**: record the Issue's status, commit, and residual findings for the PR description, then:

  ```bash
  orca orchestration task-update --id <task_id> --status completed --result '<payload>' --json
  orca orchestration task-list --ready --json
  ```

  A ready task → dispatch it (fresh terminal, sequence above). Nothing ready and nothing pending → Ship, success variant.

- **`worker_done` reporting failure**: record the reason from its body and payload verbatim, then re-dispatch the same task into a fresh terminal (the fresh-terminal rule covers retries). Two runtime quirks the coordinator must absorb: a task still `dispatched` refuses re-dispatch — reset it first (`task-update --id <task_id> --status ready`); and a failure-reporting `worker_done` can auto-complete the task — verify its status afterwards and correct it. The coordinator counts the consecutive failures; after the third, mark the task `failed` (`task-update --id <task_id> --status failed`).

### Failure — detect the circuit-break and halt

A worker can also die without any `worker_done` — a liveness checkpoint finds the terminal gone or exited. The runtime saw no failure to count, so the coordinator tracks these itself: one failed attempt per dead worker, and on the third, mark the task failed directly:

```bash
orca orchestration task-update --id <task_id> --status failed --json
```

Either way, confirm what is recorded:

```bash
orca orchestration task-list --status failed --json       # the Issue's task shows failed → circuit-broken
orca orchestration dispatch-show --task <task_id> --json  # per-dispatch detail if the picture is unclear
```

A `failed` task ends the drain. Dispatch nothing further — independent Issues included — and leave every remaining task exactly as it is (`pending`/`ready`); do not mark, complete, or cancel them.

Capture the failure reason for the ship report: the last failed `worker_done`'s body and payload, or — when the worker died without one — the tail of its terminal:

```bash
orca terminal read --terminal <handle> --json
```

Then go to Ship, failure variant.

## Ship

Both variants push the run branch from the run worktree (path from the `worktree create` output) — on failure the branch simply carries only the commits that landed:

```bash
git -C <run-worktree-path> push -u origin <run-branch>
```

### Success — ready PR

Open one PR against the repo default base (from `orca repo show --repo <selector> --json`), e.g. on GitHub:

```bash
gh pr create --base <default-base> --title "<one-line feature summary>" --body-file <pr-body.md>
```

PR body — all three sections, always; the reviewer sees nothing the description omits:

```markdown
## Spec
<3–5 sentence summary of the spec, plus where the full spec lives>

## Assumptions log
<verbatim contents of .scratch/autoship/assumptions.md, or "No ungrounded decisions.">

## Issues
| Issue | Status | Commit | Residual findings |
| ----- | ------ | ------ | ----------------- |
| <id> <title> | completed | <sha> | <list, or none> |
```

Close or link the Issues per the target repo's `docs/agents/issue-tracker.md`:

- GitHub: append `Closes #<n>` lines to the PR body so the merge closes them.
- Trackers without PR linking (e.g. local markdown): mark each Issue closed per the tracker doc's Close convention, referencing the PR.

### Failure — draft PR

Open the same PR as a **draft** — the flag is what marks the run incomplete:

```bash
gh pr create --draft --base <default-base> --title "<one-line feature summary> [autoship: halted]" --body-file <pr-body.md>
```

PR body — the success sections plus a halt report on top:

```markdown
## Run halted
Issue <id> <title> failed: <failure reason, from its last worker_done or terminal evidence>.
Not attempted: <every remaining Issue, by id and title>.

## Spec
<3–5 sentence summary of the spec, plus where the full spec lives>

## Assumptions log
<verbatim contents of .scratch/autoship/assumptions.md, or "No ungrounded decisions.">

## Issues
| Issue | Status | Commit | Residual findings |
| ----- | ------ | ------ | ----------------- |
| <id> <title> | completed | <sha> | <list, or none> |
| <id> <title> | failed | — | <failure reason, one line> |
| <id> <title> | not attempted | — | — |
```

**Skip the close/link step entirely**: no `Closes #<n>` lines, no tracker Close — every Issue stays open for the user to resume by hand.

Report the PR URL to the user; the run ends.
