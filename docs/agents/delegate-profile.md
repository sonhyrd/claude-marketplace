# Delegation profile

Read by `/delegate-tickets` (step 1). Amended by the coordinator when a merge-back reveals a new
baseline, known-noise test, or environment trap.

- **Remote**: `sonhyrd/e2e-skills` — the origin this profile describes, and the only remote the repo
  carries. Step 1 compares it against `git remote get-url origin` and warns on mismatch. If a second
  remote is ever present, it is never a push target.

- **Branch prefix**: `sss/` — Orca prefixes worktree branches itself, so a worktree named
  `ticket/<slug>` produces branch `sss/ticket-<slug>`. Do not fight it; merge by the real branch
  name that `orca worktree create` reports, not by the name you asked for.

- **Post-merge check**:

  ```
  bash scripts/ci/ci-local.sh
  bash scripts/ci/pre-push-security.sh
  ```

  `ci-local.sh` is the single source of truth for what CI runs; if you change a check, update that
  script first. **Measured baseline: see the Baseline section below.**

- **Commit policy**: conventional commits, scoped to the skill or area touched, matching existing
  history (`fix(pw-prove): …`, `feat(e2e): …`). The subject describes the behaviour change from a
  reader's perspective, not the files edited. **No AI attribution, no co-author trailers, no
  "Generated with" lines.** Never bare `git stash` in a shared worktree.

- **Worker constraints** — every worker brief carries these verbatim:

  1. **Shipped scripts are zero-dependency ESM Node.** Everything under `skills/*/scripts/` runs
     inside someone else's repository on the Node standard library. Never add an npm dependency, a
     build step, or anything installed into a user's project. Invoke with `node <path>.mjs`, never
     `bash`.
  2. **Never make a private CLI a runtime dependency of a shipped script.** Scripts read
     environment variables; they never spawn `agent-native` or any other ecosystem-specific tool.
     Permitted subprocesses are the ones already assumed present: `rg`, `eslint`, `ast-grep`,
     `ffmpeg`, `ffprobe`, `git`, `gh`, `curl`, `npx playwright`.
  3. **Never print a credential.** Do not echo a bearer, do not write one to a log, and never paste
     a decoded token payload containing `sub`. Individual routing claims (`aud`, `iss`, `jti`) may
     be printed when diagnosing.
  4. **Do not rewrite the Tier-3 PCRE2 patterns as JS RegExp.** At least one is load-bearing on a
     possessive quantifier JS cannot express; rewriting it silently inverts the check. See
     `tests/pattern-corpus/README.md`.
  5. **No state-changing `gh` commands against third-party repos.** Cloning into `testbed/` and
     running the scanner locally is fine; pushing to forks, opening PRs or issues, and posting
     comments are not. `gh` inside some checkouts resolves to the wrong upstream — always pass
     `--repo`.
  6. **Never run `pnpm -r run test` (or turbo/nx) without capping both parallelism layers** —
     workspace concurrency *and* the runner's workers. Check `uptime` first.
  7. **Every new `docs/**/*.md` must be linked from `README.md`** or named in a `scripts/**/*.sh`,
     or the docs orphan check in `review.sh` fails.
  8. **Parity surfaces move in lock-step.** Adding or renaming a pattern touches the reviewer
     SKILL.md, the pattern reference, the smell taxonomy, the README table, the grep-patterns
     reference, `scan.mjs`, and all three plugin manifests. CI fails fast on drift.
  9. **Do not silently change a pattern ID, a severity, or a failure category code.** Downstream
     evals and adopters depend on them.
  10. **English-only public surface** — SKILL.md, README and `docs/` are English; CI enforces it.

## Baseline

- **Commit**: `aae5e82` · **Measured**: 2026-08-05
- `scripts/ci/review.sh` — **green**: 10 passed, 0 warnings, 0 errors.
- `scripts/ci/ci-local.sh` — **RED**: fails at `test-publish-proof.sh` (76 passed, 8 failed).
  All 8 are pre-existing; none is a defect in shipped behaviour. Two causes:
  - **5 failures — `HOME` is not isolated.** The config-refusal cases unset the `CLIPS_*`
    variables and assert a refusal, but `clips.mjs` falls back to the credential file at
    `~/.config/pw-prove-clips.env`. On a machine where that file exists, the script resolves a
    complete config and proceeds. **One case unsets the origin too, so it publishes to PRODUCTION
    Clips** — a run on 2026-08-05 created public recording `iAQpP1tuPrDk` this way.
  - **3 failures — stale tests.** The suite asserts "N clips in, ONE request out" and AC-titled
    chapters. Commit `ccba214` moved acceptance criteria from chapter titles into per-chapter
    comments, adding one request per chapter, and did not update the tests.

### Environment trap: the publish tests could reach production — CLOSED

Until the credential-file fallback was removed, **any worker running `ci-local.sh` on a machine with
`~/.config/pw-prove-clips.env` present created a real, public Clips recording.**

**Closed by #17 (2026-08-06), two ways:** the credential-file mechanism is deleted outright, and the
publish tests now run under an isolated `HOME`. Both belts matter — keep the isolation even though
the fallback is gone, because it is what makes an absent-credential test mean what it says.

- **Commit**: `5447df4` · **Measured**: 2026-08-06
- `ci-local.sh` — **GREEN**, all checks passed, zero `[FAIL]`.
- `pre-push-security.sh` — **GREEN**, 8 passed, 0 warnings, 0 blockers.
- Verified: the full run emits **no** `clips.paulsjob.ai` URL, so no production recording is created.

This green baseline supersedes the red one above. Any future failure is a real regression.
- **Known environment note:** this checkout has **no `.claude-plugin/` or `.codex-plugin/`
  directory** — the plugin manifests live only in the marketplace subtree copy. Manifest-parity
  checks therefore do not behave as `AGENTS.md` describes here. Do not "fix" this by recreating the
  manifests.

### Environment trap: `implement` is not at `~/.claude/skills/implement`

On this machine the Matt Pocock skills ship as a marketplace plugin, not as `~/.claude/skills`
entries. A worker brief that names `~/.claude/skills/implement/SKILL.md` sends the worker to a path
that does not exist, and it silently falls back to improvising a process. The real path is:

```
/Users/sondh0127/SonDev/claude-marketplace/plugins/mattpocock-skills/skills/engineering/implement/SKILL.md
```

Every worker brief must name **that** path. (`/implement` itself is `disable-model-invocation:
true`, so no dispatched worker can Skill-invoke it — path-reading is the only route.)

### Baseline correction: `pre-push-security.sh` reports 7, not 8

Commit `9eb094e` collapsed two manifest checks into one `[OK]` line when it deleted the manifest
machinery. The green figure is **7 passed, 0 warnings, 0 blockers**. A brief quoting 8 makes a
worker hunt a regression that is not there.

### Trap: `orca worktree create` does not branch from the coordinator's HEAD

The worktree for #27 was cut at `294b24e` while `main` was at `03d2ae0` — one commit behind. Orca
branches from its own recorded base, not from where the coordinator is standing. **After creating
each worktree, `git -C <worktree> reset --hard <integration-branch-HEAD>` before dispatching**, or
the worker builds on a base that is missing its blockers' merged work.

- **Commit**: `f0e5cc9` · **Measured**: 2026-08-06 (after #27 merge-back)
- `ci-local.sh` — **GREEN**, all checks passed. · `pre-push-security.sh` — **GREEN**, 7 passed.
