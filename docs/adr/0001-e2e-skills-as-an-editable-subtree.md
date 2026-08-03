# 1. e2e-skills as an editable, bidirectional git subtree

- **Status:** Accepted
- **Date:** 2026-08-03
- **Issue:** [#1](https://github.com/sonhyrd/claude-marketplace/issues/1)

## Context

Five E2E agent skills — `pw-prove`, `e2e-reviewer`, `playwright-test-generator`,
`playwright-debugger`, `cypress-debugger` — lived outside this marketplace, in a standalone clone at
`/Users/sondh0127/orca/e2e-skills`. They reached agents through hand-made symlinks into
`~/.claude/skills` and `~/.agents/skills`, created by that repo's own
`scripts/dev/reinstall-skills.sh`.

Three costs followed from that:

- **Invisible.** No version, no changelog entry, no install path, and no way onto a second machine
  without re-running a bespoke script.
- **Ungoverned.** `make validate` never saw them; their frontmatter and manifests were unchecked by
  the tooling every other plugin here must pass.
- **Oversized.** Five skills, 13 ADRs, a 34K README, a CI suite and a pattern corpus, for two
  skills actually in use.

The complicating fact is that the source is a *live fork of a live upstream*: `sonhyrd/e2e-skills`
is 52 commits ahead of its merge-base with `voidmatcha/e2e-skills`, which is itself 14 commits ahead
and recently committed. "Retire it" therefore cannot mean "freeze a copy" — whatever lands here has
to keep a working path back to upstream, and has to become the place changes are authored.

## Decision

Graft the whole fork into this marketplace as a **git subtree** at `plugins/e2e-skills/`, published
as the plugin **`e2e`**, and make that the only copy that gets edited.

1. **Real `git subtree add`, no `--squash`.** Two-parent merge, all 146 commits grafted (repo 397 →
   544).
2. **Remote is the fork**, `sonhyrd/e2e-skills`, not `voidmatcha`.
3. **Bidirectional.** Author in `plugins/e2e-skills/`; return with
   `git subtree push --prefix=plugins/e2e-skills e2e-fork main`. Inbound: merge `voidmatcha/main`
   into the fork in the old clone, push, then `git subtree pull` here.
4. **Two of five skills declared** — `pw-prove` and `e2e-reviewer` — enumerated as explicit paths
   rather than a `./skills` glob, which would ship all five.
5. **Both declared skills pinned user-invocable-only** via `disable-model-invocation: true`.
6. **Fresh `1.0.0`**, `Apache-2.0`, marketplace `0.46.0 → 0.47.0`.

## Rationale

**Why not `--squash`.** The flow is bidirectional, and `git subtree push` re-splits the prefix's
history. Handing the fork a synthesized history it has never seen is the known-flaky direction.
Push reliability is the thing being bought.

**Why the fork and not upstream.** Grafting `voidmatcha` directly would import a tree missing the 52
commits of `pw-prove` work — the very surface most actively developed.

**Why the directory keeps the name `e2e-skills`.** It is the subtree prefix. Renaming it to
`plugins/e2e/` would break both `pull` and `push`. Directory-differs-from-plugin-name is already
established here by `mattpocock-skills` → `matt`.

**Why frontmatter and not settings for the invocation pin.** Confirmed empirically against Claude
Code 2.1.220, not assumed: the override resolver returns `"on"` unconditionally for any skill whose
`source` is `"plugin"`, so `skillOverrides` keys in `~/.claude/settings.json` — bare-name or
namespaced — are inert for plugin skills. The only author-side mechanism is
`disable-model-invocation: true` in `SKILL.md` frontmatter. This is the one place the "no edits to
vendored skill text" constraint had to yield; it costs one frontmatter line per skill, and this
subtree is editable by design.

**Why the three undeclared skills still ship as files.** `e2e-reviewer/scripts/scan.mjs` dynamically
imports `../../playwright-test-generator/scripts/ptg-run.mjs` for run-ledger telemetry. The import
is `try`/`catch`-wrapped and degrades silently, but keeping the file present keeps it working.

**Why no new validation seam.** Two seams already cover this: `make validate-strict` (which globs
`plugins/*/skills/*/SKILL.md` — and the flat `skills/<name>/` layout *does* match that glob, unlike
`mattpocock-skills`' category-nested layout) and `claude plugin validate . --strict`. A
declared-path-resolves check was considered and rejected: two entries, rarely changed, fails loudly
the first time `/e2e:` is typed. A subtree-drift check needs network and could not live in
`make validate` anyway.

## Consequences

**Accepted costs, recorded so they are not later mistaken for oversights:**

1. `plugins/e2e-skills/CLAUDE.md` is an 11-byte `@AGENTS.md` include that pulls a 15.4K file into
   context for any agent working in that directory.
2. `pw-prove`'s `SKILL.md` still tells the model to invoke `playwright-debugger` after three failed
   heal attempts. That skill is not declared, so the handoff dangles. It dangled before this change
   too (`playwright-debugger` was `off`), and editing it would create a permanent conflict surface
   in a file upstream actively edits. **This is a known lie, not an oversight.**
3. 146 grafted commits make `git log` interleave two histories. Blame and bisect get noisier. This
   is the price paid for a reliable `git subtree push`.
4. Manifests live *inside* the subtree, so `.claude-plugin/plugin.json` and the generated
   `.codex-plugin/plugin.json` will land in the fork on the next push. The local-only-deviation
   bookkeeping used for `matt` is not available here. Accepted, not worked around.

**A precedent that does not exist.** `CLAUDE.md` describes `plugins/mattpocock-skills` as a git
subtree, but it is not one — commit `9a7aa85` has a single parent and the repo contains no
`git-subtree-dir` metadata. It is a plain copy with a remote configured so `git subtree pull` can be
used later. **This is the repo's first genuine subtree graft and its first bidirectional one.** Do
not look to `mattpocock-skills` for how push behaves; it has never pushed.

**What survives.** The old clone at `/Users/sondh0127/orca/e2e-skills` is kept as a *merge
workbench* — somewhere to merge `voidmatcha` before pulling — and is never a source. The GitHub repo
`sonhyrd/e2e-skills` stays un-archived so it can serve as the push target.

## Alternatives considered

- **Squashed subtree.** Rejected: breaks the reliable push direction, which is the point.
- **Plain copy (the `matt` pattern).** Rejected: gives no return path, and this code is actively
  authored rather than consumed.
- **Cherry-pick only the two skills in use.** Rejected: subtree grafts whole repos; trimming
  forfeits the pull path entirely.
- **A `CONTEXT.md`.** Rejected: the vocabulary here is two terms, and the `CLAUDE.md` bullet carries
  them better than a near-empty glossary would.
