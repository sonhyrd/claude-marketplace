---
name: delegate-tickets
description: Delegate an approved ticket tree to parallel Orca workers — one child worktree per ticket, dispatched in DAG order, merged back as each finishes. Use when delegating tickets to parallel workers, or fanning an approved plan out to Orca child worktrees.
---

# Delegate Tickets

Delegate a ticket tree produced by `/to-tickets` to parallel workers, coordinated through Orca's own orchestration lifecycle: one Orca child worktree per ticket, dispatched in DAG order, merged back into the current branch as each finishes.

The tickets' **blocking edges ARE the dependency DAG** — read them off the tickets and use them as-is. Wide refactors already serialize through their edges by construction.

**A coordinator's resting state is `<orca> orchestration check --wait`**, and it returns there after every action, because the mailbox does not wake an idle TUI: a `worker_done` sits unread until that command runs in this terminal, or until a human pokes the pane. So a turn ends in exactly three places — the final report in step 7, an escalation raised to the user, or a **refusal-to-start**: step 1's declined gate, and every preflight stop in step 4, are kinds of refusal-to-start. A recap naming the next merge or the next dispatch is not one of them; it ends the turn while reading like progress, which is how a finished worker goes unnoticed for an hour. Steps 5, 6 and 7 each hand back to the wait.

Every command below is written `<orca> …`. **Step 0 resolves that name and proves it answers**, before anything mutates — the binary is not the same on every host, and the wrong one fails silently rather than loudly.

> **Prerequisites.** The `sss` and `matt` plugins from this marketplace — `matt` supplies
> `/to-tickets` and the `implement` skill every worker runs, `sss` supplies this one. An **Orca
> install**, whose CLI step 0 resolves and whose bundled guide step 0 loads. Orca's **experimental
> orchestration feature**, enabled in the app's settings: with it off the lifecycle verbs are
> absent, which reads like a fenced runtime and is not one.

## 0. Resolve the CLI and load the live guide

**Nothing runs above this step** — no profile read, no worktree, no terminal, no lifecycle call.
Each of those mutates, and every one of them is a silent no-op against the wrong binary.

### Resolve the binary, and prove it

Two names can sit on `PATH` and only one of them is the CLI: on Linux the desktop **launcher** is
also called `orca`, and it answers *every* argument list with a single-instance notice and **exit
0**. A coordinator reading that exit 0 gets clean exit codes for a run in which nothing was
orchestrated.

So preference only orders the candidates — `orca-ide` first outside an Orca-managed pane, `orca`
first inside one — and what *selects* one is whether it answers `orchestration --help`:

```bash
ORCA=""
first=orca-ide; second=orca
if [ -n "${ORCA_PANE_KEY:-}" ] || [ "${TERM_PROGRAM:-}" = "Orca" ]; then
  first=orca; second=orca-ide
fi

for candidate in "$first" "$second"; do
  command -v "$candidate" >/dev/null 2>&1 || continue
  # Materialize the help before matching it: under `pipefail`, a `grep -q` that
  # exits on the first match can SIGPIPE the binary and turn a match into a
  # non-zero pipeline -- which reads as "answers nothing" about the one that does.
  help="$("$candidate" orchestration --help 2>/dev/null || true)"
  grep -q '^Usage: orca orchestration' <<<"$help" || continue
  ORCA="$candidate"; break
done
```

**An empty `$ORCA` means stop**, and say which names were on `PATH`: a host with no working Orca CLI is
not something a run can preflight its way past. `check-delegate-cli.sh`, in the marketplace repo
this skill ships from, resolves the binary the same way and asks it whether every command named
here still exists.

Substitute the resolved name into every command in this file and under `references/`. Where they
read `<orca> …`, a host that resolved `orca-ide` runs `orca-ide orchestration check`, `orca-ide
terminal read`, `orca-ide worktree create`. No command below spells a binary name of its own.

### Load the live guide

```bash
<orca> skills get orchestration --full
```

408 lines, bundled in the binary and **version-matched** to it. **Read it before the first lifecycle
call** — before any Run is created or bound, before any `task-*`, before any dispatch — and take
every lifecycle fact from it rather than from memory or from prose in this repo.

It is loaded, never vendored and never installed as a snapshot: a copy under `~/.claude/skills/` or
in this repo ages against the runtime you are calling, and a flag invented from an old copy fails
the same way a fenced runtime does. There is no orchestration *skill* to invoke — it is not a
marketplace plugin and is installed on no machine here. Where a step below leaves a verb to the
guide, this is the text it means.

## 1. Resolve the repo profile

### Confirmation gate — model-invoked runs only

**This is the first thing step 1 does.** Nothing above it reads a profile, creates a worktree, or starts a terminal.

| How this run started | Gate |
|---|---|
| The user typed `/sss:delegate-tickets …`, or their message named the skill | **None.** The request *is* the consent — go straight to the profile. |
| Another skill or an agent launched it through the Skill tool, with no user instruction naming it | **Stop and ask once, before any profile work.** |

A run cuts a git worktree per ticket, fires each repo's setup hook, launches autonomous agents with `--dangerously-skip-permissions`, and merges their branches back into the user's current branch — none of which a user who never asked for it can take back. That is what the gate is asking about; [ADR-0006](../../../../docs/adr/0006-delegate-tickets-unpinned-behind-a-confirmation-gate.md) records why the gate replaced a pin.

> `delegate-tickets` will dispatch the ticket tree for `<argument>` to parallel Orca workers — one
> child worktree per ticket, agents running unattended, branches merged back into
> `<current-branch>`. Run it?

The ticket count isn't known yet — the tree resolves in step 2, and resolving it first would mean reading the repo's profile and writing one if absent. Ask on the shape of the run, not on a number.

- **Yes** → continue. Ask nothing else that the profile already answers.
- **No, or no answer** → stop with one line: `delegate-tickets — declined at the confirmation gate; nothing was run.` Never a partial run, never "just the DAG then dispatch".

Once per run. A confirmed run does not re-ask at any later step.

### Profile

Read the target repo's `docs/agents/delegate-profile.md`. It supplies every repo-specific value the steps below reference: branch prefix, post-merge check, commit policy, prohibitions, conventions. Ticket location is **not** a profile field — that comes from `issue-tracker.md` in step 2.

Discovery is presence-based, not a lookup: the profile is in this repo or it isn't.

- **Present** → compare its `Remote` field against `git remote get-url origin`. On mismatch, **warn — loudly, then continue.** A profile naming another repo usually means a checkout was copied and the profile came with it. This is a warning, not a gate: presence-based discovery cannot tell a copied profile from a renamed remote, and blocking on the ambiguous case would stall more runs than it saves.
- **Absent** → interview the user inline, here, for each field in [references/profile-template.md](references/profile-template.md). Do not send them off to a setup skill; a first run must not die before it prints the DAG. Write the answers to `docs/agents/delegate-profile.md` **and** add the pointer line under `## Agent skills` in the repo's `CLAUDE.md`, then continue.

## 2. Resolve the ticket tree

Read the target repo's `docs/agents/issue-tracker.md` (written by `/setup-matt-pocock-skills`) to learn where tickets live:

- **Local files** → tickets are `.scratch/<feature-slug>/issues/*.md`. The argument is the feature slug; with no argument, use the only `.scratch/*/issues/` directory if exactly one exists, otherwise ask which.
- **GitHub** → the argument names the parent issue, label, or milestone; fetch every ticket under it, including its blocking links.

If `issue-tracker.md` doesn't exist: fall back to a `.scratch/*/issues/` tree if one exists; otherwise stop and point the user at `/setup-matt-pocock-skills`.

## 3. Print the DAG

Read every ticket file/issue. Print the DAG: which tickets are unblocked now, which wait on what. Done when every ticket in the tree is accounted for as either unblocked or blocked-by-named-tickets.

## 4. Preflight the orchestration runtime

Before building any briefs, worktrees, or terminals, prove the orchestration lifecycle actually
writes. **One ordered sequence**, and each check is a precondition of the next — so the first thing
that fails is the thing to act on, and nothing below it is evidence of anything:

1. **The binary resolves** — step 0, above.
2. **It answers `orchestration --help`** — step 0. Lifecycle verbs *missing* from that help is
   Orca's experimental orchestration feature being off, not a fenced runtime: the verbs were never
   registered. Same symptom, different fix.
3. **The runtime is running**: `<orca> status --json` reports `runtime.reachable: true` and
   `runtime.state: "ready"`. A CLI that resolves and answers `--help` still reaches nothing when the
   app is closed — the help text is local, and every `orchestration` verb is an RPC to the runtime.
4. **The guide is loaded** — step 0, and before the `run-create` below, which is itself a lifecycle
   call.
5. **The host's agent permission mode is yolo** — the read is below.
6. **The Run exists**: `<orca> orchestration run-create --objective "<what this run delegates>" --json`

### The permission mode is app config, not an argument

Orca supplies the unattended-agent flag from **app config** — `--dangerously-skip-permissions` for
`claude`, `--yolo` for `cursor` — so no argument this skill passes can set it. A host left on manual
launches workers that stop at an approval prompt with nobody watching: not a failure, never reported
as one, and indistinguishable from a slow worker until the dispatch times out.

Read what this host will actually launch with, for the run's engine:

```bash
ORCA_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/orca"                # Linux
[ -f "$ORCA_ROOT/orca-profile-index.json" ] \
  || ORCA_ROOT="$HOME/Library/Application Support/orca"           # macOS

ENGINE=claude   # the run's engine id, per step 5: claude | cursor | …

python3 - "$ORCA_ROOT" "$ENGINE" <<'READ_DEFAULT_ARGS'
import json, pathlib, sys
root, engine = pathlib.Path(sys.argv[1]), sys.argv[2]
index = json.loads((root / "orca-profile-index.json").read_text())
data = json.loads((root / "profiles" / index["activeProfileId"] / "orca-data.json").read_text())
print(data["settings"].get("agentDefaultArgs", {}).get(engine, ""))
READ_DEFAULT_ARGS
```

`settings.agentDefaultArgs` is the map the app launches from, keyed by engine id. An empty answer, or
one without that engine's bypass flag, is a manual-mode host: **stop**, and name the fix — Settings →
Agents, set that engine's default arguments back to the yolo flag. Do not work around it by spelling
the flag into a launch command; the flag belongs to the launch the app owns.

Where neither root holds an `orca-profile-index.json`, the read has **failed rather than answered**.
Say which paths were tried and have the user confirm the setting before continuing — an unreadable
setting is not evidence of a good one. Measured on Orca 1.4.188, Linux; the macOS root is the
standard Electron `userData` path and was not measured here.

### The fence probe is the `run-create`

Item 6 is the run's **first mutating lifecycle call**, so a fenced runtime is caught there — the same
evidence a throwaway probe task bought, with no artifact left behind. That task was permanent litter
(there is no delete verb, so retiring it left the row), and it ran *before* any Run was bound, so on
a clean machine its likeliest answer was `run_required` — a setup step read as a failure.

Any answer other than `"ok": true` is decisive. This step is cheap and it is the whole point of
doing it first: a run that discovers the fence at dispatch time has already spent its setup budget.

### Reading a preflight failure

Most often the sequence stops on its last item, `<orca> orchestration run-create --objective
"<…>" --json`, answering anything other than `"ok": true`. Four causes look alike at the CLI and
take four different actions. Act on the **first item in the sequence that fails**; a later item's
answer is not evidence while an earlier one is unmet.

**`code: legacy_read_only` — the fence.** Message: *"this retained legacy coordinator could not
prove its original process identity"*. The whole lifecycle is fenced and no supervised dispatch is
possible. Stop and ask the user to quit and reopen the Orca app: restarting this session or spawning
a fresh terminal does not clear it. `<orca> orchestration reset --all` wipes task history for
*every* run, so leave it alone while other worktrees hold live agents.

**A runtime that is not running — the app is closed.** `<orca> status --json` answers with
`runtime.reachable: false`, or every lifecycle verb fails on transport rather than on a `code`. The
CLI resolves and prints help either way: help is local, and the verbs are RPC calls. Ask the user to
open Orca (`<orca> open` waits for the runtime to become reachable), then rerun the sequence from
item 3. This is not a fence and does not call for a quit-and-reopen.

**Missing lifecycle verbs — the experimental feature is off.** `<orca> orchestration --help`
answers, but the verbs the run needs are absent from what it prints; with the feature off they were
never registered. Ask the user to enable it in Settings → Experimental, then rerun the sequence from
item 2.

**An empty or non-yolo `agentDefaultArgs` — a manual-mode host.** Item 5's read answers with
nothing, or with arguments that do not carry that engine's bypass flag. Stop before any worktree;
the read, the refusal and the fix are stated above and are not restated here.

## 5. Dispatch the frontier

Coordinate through the orchestration lifecycle whose guide step 0 loaded — real Orca task/dispatch state, not generic subagents.

The guide is authoritative for lifecycle; this file carries only what it does not.

- **One supervised `worker-start` per ticket.** It composes the child worktree, the terminal, the
  readiness check and the dispatch into one call, and it is the only path on which the
  settled-terminal accounting the guide asks of a coordinator exists at all. Write the brief — the
  one the bullets below specify —
  to `/tmp/<ticket-slug>/brief.md` first, and pass it as the task's `--spec`:

  ```bash
  <orca> orchestration task-create --spec "$(cat /tmp/<ticket-slug>/brief.md)" --json
  <orca> orchestration worker-start --task <task_id> --worktree new-child \
    --name <branch-prefix><ticket-slug> --base-branch <integration-branch> \
    --agent claude --setup run --json
  ```

  `--agent` carries the engine choice, and `--model` / `--effort` carry the user's model choice
  where they named one — [references/worker-launch.md](references/worker-launch.md) holds the
  mapping, the constraints on those two flags, and the one thing a `ready` receipt does not cover.
- **`--base-branch <integration-branch>` is not optional, and it is not self-verifying.** Omitted,
  the worktree is cut from the repo's default base, so every worker branches from `main`. Passed,
  it still has to be checked: `git merge-base <integration-branch> HEAD` in the new worktree must
  equal the integration branch head. An ignored flag and an absent flag fail identically, and both
  stay invisible until merge-back hands you a branch carrying commits its worker never wrote.
- **A nonzero exit is what means the worker did not start.** `worker-start` exits 0 **only** for
  `ready`, which is the readiness proof, and readiness is decided on process identity rather than on
  a rendered frame. Read the receipt: `ready` alongside setup `running` is normal, and a
  `wait-for-setup` repo instead returns setup `succeeded` before it accepts task input. A failed or
  unknown start exits nonzero and names its own wreckage — read `stage`, `effects` and
  `residualResources` from the JSON and act on those. **Do not guess, and do not automatically
  retry**: a retry that repeats the placement on top of a live residual builds the second
  half-worker. A deliberate replacement is `--retry-of <dispatch_id>`, which links the attempt but
  inherits no placement, so repeat the `--worktree` and `--agent` choices explicitly.
- Dispatch the unblocked frontier in parallel, but **cap concurrency at 2 workers** unless the user raises it. Every branch a worker finishes is one you read at merge-back, and the cap is what keeps that review surface small enough to actually check rather than skim. A blocked ticket dispatches only after ALL its blockers have merged back.
- Each worker gets a fresh session in its worktree, and its brief is the task's `--spec`, which Orca injects as the worker's prompt. The brief must tell it to **read and follow `implement`'s `SKILL.md` by absolute path**, then name its ticket ref, then carry the profile's **Prohibitions** verbatim.
  - **Resolve that path on THIS machine every run, and use what this run resolved.** `implement` ships in the `matt` plugin, so it lives at `<marketplace-checkout>/plugins/mattpocock-skills/skills/engineering/implement/SKILL.md` — and the checkout root differs per host. `~/.claude/skills/` is the wrong place to send a worker: that directory holds a handful of symlinks, so a worker pointed there finds nothing, and **a worker that cannot find the skill invents a process and still passes the gates** — the omission is silent unless the worker happens to escalate. Locate it (`ls` the candidate, or search the marketplace checkout) and confirm the file exists **before** it goes in a brief. Prefer the marketplace checkout over any `~/.claude/plugins/cache/…` copy, which is version-pinned.
  - The brief must also spell out the absolute paths of the skills `implement` delegates to — `.../skills/engineering/tdd/SKILL.md` and `.../skills/engineering/code-review/SKILL.md` — under the same resolved root. A dispatched worker of any engine cannot invoke a slash command, so an unresolved name is a dead end for it. Leave its **Conventions** field where it is — a pointer to the repo's agent guide, which the worker loads on its own; injecting those too buries the ten rules that cost a rerun under thirty that don't. Path-reading rather than `/implement` is deliberate: `implement` is user-only (`disable-model-invocation: true`), so no dispatched worker of any engine can Skill-invoke it. `implement` drives TDD and `code-review` itself — don't re-specify them, and never hand-write a substitute process into the brief.
  - Name `code-review`'s **resolved absolute path** wherever the brief refers to it. `implement`'s own text says "use `/code-review`", and that bare name resolves to a **built-in skill of the same name**: 7 of 82 dispatched workers ran that one instead of the two-axis pair, one of them spending 35 agents on it before its findings landed. Naming the two axes in the definition of done below is the second half of the same guard — a worker that runs the built-in has no Standards/Spec receipt to write.
  - **The review leaves a receipt.** Definition of done: `implement` closes clean, the profile's post-merge check passes, and `/tmp/<ticket-slug>/review.md` exists **before `worker_done` goes out**, listing every **Standards** and **Spec** finding with the fix that answers it, passed back as `--report-path`. Every finding is the worker's to fix; one the profile's **Prohibitions** put outside its reach goes under a `HANDOFF` heading and belongs to the coordinator at merge-back — which keeps *fix all* true of the run rather than of one worker, and stops an unsatisfiable rule from being resolved with a dishonest receipt. Ordering is load-bearing: a review that lands after the report has a worker amending a commit you already merged. Of 82 dispatched workers, **22 ran no review at all** and none of them said so — absence and a clean verdict read identically until a file has to exist. Step 6 reads this file.
- The brief goes through a file rather than a quoted argument, as the first bullet shows: one long enough to matter is long enough to lose to shell quoting on one line. Where even `"$(cat …)"` is too long for one argument, make the `--spec` a one-liner pointing at the file — but the brief still *points at* `implement`'s SKILL.md rather than restating it.
- **Write every message body to a file and pass it as `"$(cat <file>)"`**, whose output is not re-parsed. A body spelled inline into a double-quoted shell string has its backticks run as command substitution: a reply quoting a command name executes it, mangles the body, and exits non-zero, so the reply never lands, leaving a blocked worker to re-ask the identical question.
- **Dispatching is not waiting.** Once the frontier is out, step 7's loop is what you return to.
- **The low-level path is the escape hatch, not the default.** `worktree create` plus a `terminal
  create` carrying custom argv (`--command`) is what the loaded guide keeps for topology or argv
  that `worker-start` cannot express. A worker built that way and dispatched into with `dispatch
  --inject` is **unsupervised**: Orca writes no `worker_dispatches` row, `worker-show` /
  `worker-read` / `worker-list` report it as `unsupervised`, and `worker-stop` / `worker-release`
  report `no_owned_resource` and take no process action — so the settled-terminal accounting the
  guide asks of a coordinator has nothing to act on. Take that path only for a stated
  reason, and say which. [ADR-0011](../../../../docs/adr/0011-delegate-tickets-dispatches-through-worker-start.md)
  records the trade.

## 6. Merge back in DAG order

As each worktree finishes: merge it into the current branch, resolve conflicts, rerun the profile's post-merge check on the merged result, mark the ticket done (edit the ticket file's Status locally; close the issue on GitHub), then dispatch any tickets it just unblocked — the frontier advances. Every action here is local work with workers still live; each one ends back in step 7's wait.

**A branch merges reviewed, or not at all.** Open `/tmp/<ticket-slug>/review.md` before the merge — the `worker_done` body paraphrases the review, and a paraphrase of a review that never ran reads exactly like a paraphrase of a clean one. Where it is missing, run `code-review`'s **Standards axis** on that branch first, then merge the result: the review is what a missing receipt costs you, not the merge. Standards is the axis your own merge-back read leaves uncovered: that read is a diff read, and it earns its place on cross-branch damage — silent same-name-different-signature merges, colliding ADR numbers, gates green on a worker tree and red on the merged one. Three of the four findings measured shipping in silence were standards findings. `HANDOFF` entries in a receipt are yours to fix in the merge commit. **Re-tasking the worker is not on the table for either case** — a reported worker is settled, and the review is yours to run rather than its to redo.

**Recompute the frontier from the edges themselves, not from a summary field.** On GitHub, `issue_dependencies_summary.blocked_by` lags behind the real edges: a dependent issue can still report a non-zero blocker count after every blocker is closed, which silently stalls tickets that are actually ready. The authoritative read is the dependency list — `gh api repos/<owner>/<repo>/issues/<n>/dependencies/blocked_by --jq '.[] | "#\(.number) \(.state)"'` — and a ticket is unblocked when every entry is `closed`.

**A merge-back that fails with `Unable to write index` and no conflicted paths is contention, not a conflict.** Several workers and the host app share one object store, so a concurrent write can produce that error with `MERGE_HEAD` left behind, nothing conflicted, and ample disk. `git merge --abort`, then run the identical merge once more; only investigate if the retry fails the same way. The message names the index, which invites a hunt for a phantom conflict.

**Re-check the worker branch's head against the commit you merged, before you close the ticket.** A worker whose terminal is woken after `worker_done` may still **amend the commit you already merged**, and it cannot tell you: the report is settled. If the head moved, take the delta as a patch (`git diff <merged> <new-head>`) rather than re-merging a sibling of an already-merged commit.

Review each worker's branch against `git merge-base <integration-branch> HEAD`. A branch is cut from the base at dispatch time, so once siblings merge, a plain range diff renders **their** work as deletions and a clean branch reads as a revert.

Commits follow the profile's commit policy. Park work in a commit on the worker's own branch, and **never run a bare `git stash`**: the stash is one shared stack per repo rather than per worktree, so a stash pushed in one worktree is visible to — and poppable by — every other, and popping it in the wrong one silently moves another worker's uncommitted work. Stashing is the correct reflex in a single checkout, which is exactly why it needs saying here: the damage lands in a tree nobody is looking at.

When a merge-back reveals a baseline, known-noise test, or environment trap the profile doesn't record, **amend `docs/agents/delegate-profile.md` before dispatching the next frontier** — and commit it with the work that discovered it. The profile lives in the tree you are merging into, so this is one edit, and the next worker's brief carries it.

**The profile is a snapshot, not a ledger.** It states what is true now; `git log` keeps what was
true before. So amending means rewriting the superseded line: one baseline per check, and each fact
in the field that owns it — a dispatch trap is a dispatch trap, not a post-merge check. Stack a
correction beneath a stale line and the stale one wins, because it comes first and a worker reading
top-down stops there.

**The owning file gets the fix.** When a merge-back disproves a line in the repo's `AGENTS.md`,
edit `AGENTS.md` — same tree, same commit — and leave the profile alone. Keep another file's
correction here only while that file is outside your write access.

## 7. Run to completion

Return to the wait after every local action — a merge-back, a profile amend, a conflict resolution, a filed issue, a measurement:

```bash
<orca> orchestration check --ack <delivery_id> --wait \
  --types worker_done,escalation,question --timeout-ms 900000 --json
```

**Always pass `--timeout-ms`.** The loaded guide documents no default, so an omitted flag leaves the window to the runtime, which can close it inside a minute — and an empty 40-second wait is the same JSON as an empty 15-minute one. The flag is what keeps a bug in your own command line from reading as a checkpoint.

Escalate only on an unresolvable merge conflict or a ticket whose acceptance criteria contradict the spec. Done when every ticket is merged and marked, closed out by a final report — per ticket: status, branch, files changed, checks run, blockers hit.
