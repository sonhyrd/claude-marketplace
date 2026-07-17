Quickstart:

```bash
npx skills add mattpocock/skills --skill=delegate-tickets
```

```bash
npx skills update delegate-tickets
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/delegate-tickets)

## What it does

`delegate-tickets` hands an approved ticket tree to parallel workers: one Orca child worktree per ticket, dispatched in dependency order, each running [implement](https://aihero.dev/skills-implement) in a fresh session, merged back into your branch as they finish.

It never re-derives dependencies. The blocking edges [to-tickets](https://aihero.dev/skills-to-tickets) wrote into each ticket ARE the DAG — this skill reads them and works the **frontier**: every ticket whose blockers are done runs in parallel, everything else waits its turn.

## When to reach for it

You invoke this by typing `/delegate-tickets <feature-slug>` — the agent won't reach for it on its own, because it dispatches many agents and spends accordingly.

Reach for it when a ticket tree exists and you'd rather the tree were worked in parallel than one `/implement` at a time. For a single ticket, or when you want to watch each slice land yourself, use [implement](https://aihero.dev/skills-implement) directly.

## Prerequisites

- **Orca** — workers run in Orca child worktrees, coordinated by the orchestration layer.
- **A ticket tree** — from [to-tickets](https://aihero.dev/skills-to-tickets): local files under `.scratch/<feature-slug>/issues/`, or GitHub issues with blocking links, per the tracker [setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) configured.
- **A repo profile** — branch prefix, post-merge check, commit policy, and worker constraints, stored in the skill's `PROFILES.md` and matched by git remote. First run on a new repo interviews you once and saves the profile.

## The frontier

The skill prints the DAG, then dispatches every unblocked ticket at once. As each worktree merges back — conflicts resolved, the profile's post-merge check rerun on the merged result, the ticket marked done — the tickets it was blocking join the frontier and dispatch in turn. Workers stay dumb on purpose: each just runs `/implement` on its ticket, and `/implement`'s own `/tdd` and `/code-review` are the definition of done. The coordinator escalates only on an unresolvable merge conflict or a ticket whose acceptance criteria contradict the spec, and closes with a per-ticket report.

## Where it fits

A chain step at the end of the main flow — the parallel alternative to serially running [implement](https://aihero.dev/skills-implement) per ticket:

```txt
grill-with-docs → to-spec → to-tickets → delegate-tickets
```

Its neighbours are [to-tickets](https://aihero.dev/skills-to-tickets), which produces the edge-declaring tickets it consumes, and [implement](https://aihero.dev/skills-implement), which every worker runs. When you're unsure which skill or flow fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
