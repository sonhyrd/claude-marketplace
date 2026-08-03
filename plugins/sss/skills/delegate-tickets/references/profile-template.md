# Repo profile template

A repo profile lives in the repo it describes, as `docs/agents/delegate-profile.md` — alongside
`issue-tracker.md`, `domain.md`, and `triage-labels.md`. It is versioned with the code it
constrains, visible to anyone working there, and amendable by the coordinator during merge-back.

Copy the block below into `docs/agents/delegate-profile.md` in the target repo and fill every
field. Then add a one-line pointer under `## Agent skills` in that repo's `CLAUDE.md`:

```markdown
### Delegation profile

Branch prefix, post-merge check, commit policy, and worker constraints for `/delegate-tickets`.
See `docs/agents/delegate-profile.md`.
```

**Ticket location is not a profile field.** Where tickets live — including a cross-repo rule such
as "tickets live on `<org>/<other-repo>`, pass `--repo` on every `gh issue` call" — belongs in
`docs/agents/issue-tracker.md`, which step 2 already reads. Recording it in both lets the two
files disagree.

## The template

Everything inside the fence, and nothing outside it:

````markdown
# Delegation profile

Read by `/delegate-tickets` (step 1). Amended by the coordinator when a merge-back reveals a new
baseline, known-noise test, or environment trap.

- **Remote**: `<org>/<repo>` — the origin this profile describes. Step 1 compares it against
  `git remote get-url origin` and warns on mismatch. This is a self-check, not a key: the profile
  is found by being in this repo, not by matching a list.
- **Branch prefix**: prefix for per-ticket branches (`<prefix><ticket-slug>`)
- **Post-merge check**: the command that must pass after every merge-back. Record the measured
  baseline with the commit and date it was measured at, and any known-noise failures — a check
  with no recorded baseline makes every pre-existing failure read as a regression.
- **Commit policy**: what commit messages must and must not contain
- **Worker constraints**: repo rules every worker prompt carries verbatim. Prohibitions belong
  here — a worker's brief injects these rather than pointing at this file, because a prohibition
  that was not read is not in force.
````
