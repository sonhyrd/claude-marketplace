# Reading the orchestration preflight

Read when step 4's sequence stops short — most often when its last item,
`<orca> orchestration run-create --objective "<…>" --json`, answers anything other than `"ok": true`.

Four causes look alike from the CLI and take four different actions. Work the sequence in order and
act on the first one that fails; a later item's answer is not evidence while an earlier one is
unmet.

## `code: legacy_read_only` — the fence

Message: *"this retained legacy coordinator could not prove its original process identity"*. The
whole lifecycle is fenced and no supervised dispatch is possible.

**Stop and ask the user to quit and reopen the Orca app.** Restarting this session or spawning a
fresh terminal does not clear it. `<orca> orchestration reset --all` wipes task history for *every*
run, so leave it alone while other worktrees hold live agents.

## A runtime that is not running — the app is closed

`<orca> status --json` answers with `runtime.reachable: false`, or every `orchestration` verb fails
on transport rather than on a `code`. The CLI resolves and prints help either way: help is local,
and the verbs are RPC calls.

**Ask the user to open Orca** (`<orca> open` waits for the runtime to become reachable), then rerun
the sequence from item 3. This is not a fence and does not call for a quit-and-reopen.

## Missing lifecycle verbs — the experimental feature is off

`<orca> orchestration --help` answers, but the verbs the run needs are absent from what it prints.
Orca's orchestration feature is **experimental** and gated in the app's settings; with it off the
verbs were never registered, which reads exactly like a fenced runtime.

**Ask the user to enable it in Settings → Experimental**, then rerun the sequence from item 2.
Guessing a verb from memory fails identically to both of the causes above.

## An empty or non-yolo `agentDefaultArgs` — a manual-mode host

Step 4's read answers with nothing, or with arguments that do not carry the engine's bypass flag.

**Stop before any worktree.** Step 4 owns this one — the read, the refusal, and the fix are stated
there and are not restated here.

## `run_required` — a missing binding

No Run is bound yet. Bind one (`run-create` / `run-use`) and retry. This is a missing binding, not a
fence, and it does **not** call for quitting the app. It should not arise from step 4's own
`run-create`, which is what binds the Run; it arises from a lifecycle call made before it.

## A bare usage error — a wrong verb or flag

You spelled a verb or flag this CLI does not have. Read `<orca> orchestration --help` and use what it
prints; the verbs are not spelled consistently with each other, and a guessed synonym fails
identically to a fenced runtime.
