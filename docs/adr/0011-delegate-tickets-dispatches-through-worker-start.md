# 11. `delegate-tickets` dispatches through `worker-start`

- **Status:** Accepted
- **Date:** 2026-08-22
- **Follows:** [ADR-0010](./0010-delegate-tickets-gates-merge-back-on-a-review-receipt.md)

## Context

Step 5 built each worker by hand, in four calls: `worktree create`, then `terminal create` with the
run's engine argv, then `terminal wait --for tui-idle`, then a five-retry `terminal read` loop that
required a rendered agent frame. `references/worker-engines.md` held the argv table those calls
indexed — `claude --effort medium --dangerously-skip-permissions`, `cursor-agent --force`,
`cursor-agent --force --model <id>`.

Three measurements against the live Orca CLI (`orca-ide`, Orca 1.4.188, Linux) say that path is the
wrong one now.

**The composed call exists and the guide prefers it.** The bundled orchestration guide — the one
step 0 loads from the binary — names `worker-start` "the normal supervised path" and says it
"composes the existing worktree, terminal, readiness, and dispatch primitives while returning exact
created/reused effects". Its flags cover everything the four calls covered: `--task`, `--worktree
new-child`, `--name`, `--base-branch`, `--agent`, `--setup run`, plus `--model` / `--effort` and
`--retry-of`.

**The hand-built worker is unsupervised, and step 7 already assumed it was not.** The same guide:
`dispatch --inject` "deliberately keeps an operator-started terminal unsupervised: it never creates
a `worker_dispatches` row"; settled `worker-retain` and `worker-release` "report `retained` with
`no_owned_resource` and take no process action". Step 7 has told coordinators to reuse or release
every settled worker terminal since it was written. On the path step 5 built, neither verb did
anything.

**The readiness loop was approximating an exit code.** `worker-start` "exits 0 only for ready", and
readiness is decided on process identity — `out/shared/shell-process-detection.js` states that a
bare shell is the negative signal for "is an agent running". That is what the `tui-idle` wait plus
five `terminal read` retries were trying to establish, less reliably. On failure the call exits
nonzero with `stage`, `effects` and `residualResources`, so a half-built worker becomes a named
residual rather than a silent one.

**The argv table's one load-bearing column was never argv.** `out/shared/tui-agent-permissions.js`
sets `DEFAULT_TUI_AGENT_ARGS = YOLO_TUI_AGENT_ARGS` — `claude` → `--dangerously-skip-permissions`,
`cursor` → `--yolo`. The permissionless flag is app config keyed by engine id, which no argument
this skill passes can set; #72 already added the preflight that reads it. A table restating it could
only agree redundantly or contradict silently.

## Decision

**Step 5 starts every worker with one `worker-start`.** `--task`, `--worktree new-child`, `--name`,
`--base-branch <integration-branch>`, `--agent`, `--setup run`, and `--model` / `--effort` where the
user named them. The `tui-idle` wait and the five-retry `terminal read` loop are deleted; a nonzero
exit is what means the worker did not start, and it is read — `stage`, `effects`,
`residualResources` — not guessed at or automatically retried.

`references/worker-engines.md` becomes `references/worker-launch.md`, rewritten around `--agent` /
`--model` / `--effort` with no argv column. `references/orchestration-probe.md` is merged into step
4 as a preflight-failures subsection and deleted, leaving exactly two references.

The low-level `worktree create` + `terminal create` custom-argv path stays documented as the escape
hatch the guide itself names, for topology `worker-start` cannot express — not as the default.

## Consequences

**Two things are given up.** Custom argv is one: any flag not expressible as `--agent` / `--model` /
`--effort` now costs the escape hatch and its supervision. Per-run context is the other — the guide
is version-matched to the binary, so a `worker-start` flag set that changes under the skill changes
without a repo commit. Step 0 loading the live guide before the first lifecycle call is what makes
that survivable, and it is why the skill defers verb detail to the guide rather than restating it.

**Two gates survive the migration, for opposite reasons.** `--base-branch` verification stays: the
flag moved from `worktree create` to `worker-start` but an ignored flag and an absent flag still
fail identically, and still stay invisible until merge-back. The cursor Workspace Trust gate stays
and gets sharper: readiness inspects the process table, and a `cursor-agent` parked at its trust box
*is* the foreground process and *is* a recognised agent — so `ready` is returned for a worker that
will never move. The old retry loop would at least have rendered the box. The gate is now stated
against `worker-start` in `references/worker-launch.md`.

**Rejected: keep the four calls and add the lifecycle verbs on top.** `worker-show` / `worker-read`
/ `worker-release` are reachable by name on an unsupervised terminal; they report
`no_owned_resource` and do nothing. Wiring step 7 to call them would have made the accounting look
done rather than be done.

**Rejected: keep the argv table for `--engine cursor` only.** The trap that table existed for —
Workspace Trust, and passing no `--model` unless the user names one — is a launch-preference and
readiness trap, not an argv one. Both survive in `worker-launch.md` without a command line.

**Rejected: retry a failed start automatically.** The guide is explicit that a failed or unknown
start should be inspected "instead of guessing or automatically retrying", and a retry repeating the
same placement on top of a live residual builds the second half-worker. `--retry-of <dispatch_id>`
is the deliberate replacement, and it inherits no placement on purpose.

**The instrument is `scripts/check-delegate-cli.sh`.** It carries a SUPERSEDED PATH entry that fires
on `terminal create --command` whenever `orchestration worker-start` exists in the live binary — so
this decision is asserted against the CLI, not held as an opinion in prose. Its static half is
`tests/test_delegate_tickets.py`.
