# 5. `pw-prove` is unpinned, behind a confirmation gate

- **Status:** Accepted
- **Date:** 2026-08-07
- **Issue:** [#9](https://github.com/sonhyrd/claude-marketplace/issues/9) (parent
  [#8](https://github.com/sonhyrd/claude-marketplace/issues/8))
- **Amends:** [ADR-0001](./0001-e2e-skills-as-an-editable-subtree.md), decision 5

## Context

`e2e:pw-prove` shipped with `disable-model-invocation: true` in its frontmatter. ADR-0001 recorded
that as decision 5 and gave it two jobs:

1. **Anti-shadowing.** The flag removes a skill from the model-facing listing entirely. A
   `/e2e:pw-prove` that fails to parse as a command — a leading U+00A0 from a paste is the observed
   case — leaves the model with no `pw-prove` in its listing, so it falls through to whatever listed
   skill advertises the same job. `playwright-test-generator` was that skill.
2. **Keeping an expensive, irreversible run human-triggered.** A PR-mode run brings up a dev server,
   checks out and base-merges a branch in the user's worktree, records a HAR, commits, pushes, and
   comments on the PR. None of that is something a user who never asked for it can take back.

The first job is already dead. The fork retired `playwright-test-generator`
(`652c696 retire(playwright-test-generator)`), so there is no longer a skill to fall through *to*;
the shadow was removed at its source, and `CLAUDE.md` has said so since.

The second job is real, but the flag is a blunt instrument for it: it does not distinguish "a model
started this unprompted" from "a skill the user invoked handed off to it". `disable-model-invocation`
blocks **chained** Skill-tool launches too — this repo has already paid for that once, when
`e2e-reviewer` briefly carried the flag and killed `pw-prove`'s own Step 6 quality gate with
`Skill e2e:e2e-reviewer cannot be used with Skill tool due to disable-model-invocation`, inside a run
the user had started by name.

Issue #8 makes `/sss:pr-review <PR#>` a six-stage arc ending in a proof. Its last stage hands into
`pw-prove`. With the pin in place that stage cannot exist at all.

## Decision

**Remove `disable-model-invocation: true` from `pw-prove`, and replace its second job with a
confirmation gate that fires on the model-invoked path only.**

- The gate is the first thing Step 1 does. Nothing above it starts a process, writes a file, or
  touches git.
- A run the user started by name — `/e2e:pw-prove …`, or a message naming the skill — asks nothing.
  The request is the consent, and the path used most costs nothing.
- A run another skill or agent launched through the Skill tool stops once, states what is about to
  happen, and waits. Declined or unanswered means nothing was run — never a partial run, never a
  re-ask.

**The change is pushed to the fork** (`git subtree push --prefix=plugins/e2e-skills e2e-fork main`),
so `skills/pw-prove/SKILL.md` is byte-identical on both sides. `check-e2e-subtree.sh`'s expected
divergence set drops from three entries to the two plugin manifests, and `CLAUDE.md`'s paragraph on
the pin is rewritten in the same change — a test asserts that paragraph names every path the script
expects, so the two cannot be changed apart.

## Rationale

**Why a gate and not a narrower pin.** There is no narrower pin. `disable-model-invocation` is the
only mechanism that pins a plugin skill to user-invocable-only (`skillOverrides` in
`~/.claude/settings.json` is inert for plugin-sourced skills), and it is all-or-nothing across the
unprompted and the chained path alike.

**Why the gate is placed in the skill body and not in tooling.** The property being protected is
"the user consented to *this* run", which only the run itself knows. Nothing outside the skill can
see who invoked it.

**Why push it to the fork rather than keep it as a marketplace deviation.** The deviation existed
because the pin was a marketplace decision the fork did not share. The unpin is not: the fork wants
a chainable `pw-prove` for the same reason this repo does, and a file that is identical on both
sides is one fewer thing for the guard to police and one fewer thing a merge can silently revert.

## How the change reached the fork — not with `git subtree push`

`git subtree push --prefix=plugins/e2e-skills e2e-fork main` is the command
[ADR-0001](./0001-e2e-skills-as-an-editable-subtree.md) records and `CLAUDE.md` used to give
unqualified. **Do not run it.** It splits the *whole* prefix, so the tip it pushes carries
`.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` — measured, not assumed: the split
diffs against `e2e-fork/main` as `A .claude-plugin/plugin.json`, `A .codex-plugin/plugin.json`,
`M skills/pw-prove/SKILL.md`.

Landing those two on the fork defeats this change twice over. The fork must stay manifest-free —
its own `AGENTS.md` says so, and "the fork ships no plugin manifests at all" is the *reason* both
entries are in the expected divergence set. Push them and the set collapses from two entries to
zero, and `check-e2e-subtree.sh` immediately reports both as reverted marketplace-only decisions.

So the pw-prove edit went over as a **targeted push**: a commit built on `e2e-fork/main` carrying
only `skills/pw-prove/SKILL.md`, pushed with `git push e2e-fork <sha>:main`. The fork gets exactly
the skill change, the manifests stay marketplace-only, and the next `git subtree pull` is a no-op
for that file because both sides already hold it.

**This is the rule for any prefix change from here on**, not a one-off: a marketplace → fork push is
targeted at the paths the fork owns. `git subtree pull` is unaffected and stays the inbound path.

## Consequences

**The alarm inverts rather than disappearing.** `skills/pw-prove/SKILL.md` used to be an expected
entry, and the guard fired when it *vanished*. It is now not expected at all, so the pin coming back
— by hand or carried in by a `git subtree pull` — makes the file diverge and is reported as an
**unexpected divergence**. Same guard, opposite direction, and
`tests/bash/test-e2e-subtree-check.sh` covers the new direction explicitly.

**The gate is prose, and nothing tests it.** This marketplace has no eval harness for skill
behaviour, so "a model-invoked run stops and a user-invoked run does not" is an instruction, not an
assertion. `plugins/e2e-skills/skills/pw-prove/evals/evals.json` is where that coverage would go if
it is wanted later.

**One human checkpoint in a long chain.** After #8 lands, `/sss:pr-review <PR#>` is three reviewers,
code edits, a commit, a translation-server write, a browser bring-up and a push. This gate is the
only place it stops for a person, and it fires only when a model — not the user — reached for
`pw-prove`. That is the trade: chainability bought with one prompt on the path that did not exist
before.

**The pin is now removable by hand with nothing to stop it.** The guard sees a returning pin as
drift, but a hand edit that re-adds it *and* is pushed to the fork looks like agreement, not drift.
This ADR is the only record of why it should not be re-added.

## Alternatives considered

- **Leave the pin and have `pr-review` print "now run `/e2e:pw-prove <PR#>`".** Rejected by #8's
  premise: the seam it asks the user to cross by hand is the thing being removed. It also loses the
  handoff — a cold run derives acceptance criteria from a diff the review already interpreted.
- **Gate on every run, user-invoked included.** Rejected: it taxes the common path to protect
  against a case that path does not have. A user who typed the command has already consented.
- **Keep the unpin as a marketplace-only deviation instead of pushing it.** Rejected: it keeps a
  three-entry expected set, keeps a skill body a `git subtree pull` can revert, and leaves the fork
  shipping a `pw-prove` nothing can chain into.
