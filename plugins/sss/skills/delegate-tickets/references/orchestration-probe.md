# Reading the orchestration probe

Read when step 4's probe (`orca orchestration task-create --spec "PROBE" --json`) answers anything
other than `"ok": true`. Three answers look alike and mean different things; only one of them is the
fence.

## `code: legacy_read_only` — the fence

Message: *"this retained legacy coordinator could not prove its original process identity"*. The
whole lifecycle is fenced and no supervised dispatch is possible.

**Stop and ask the user to quit and reopen the Orca app.** Restarting this session or spawning a
fresh terminal does not clear it. `orca orchestration reset --all` wipes task history for *every*
run, so leave it alone while other worktrees hold live agents.

## `run_required` — a missing binding

No Run is bound yet. Bind one (`run-create` / `run-use`) and probe again. This is a missing binding,
not a fence, and it does **not** call for quitting the app.

## A bare usage error — a wrong verb or flag

You spelled a verb or flag this CLI does not have. Read `orca orchestration --help` and use what it
prints; the verbs are not spelled consistently with each other, and a guessed synonym fails
identically to a fenced runtime.
