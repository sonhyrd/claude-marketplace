# Changelog - e2e

All notable changes to the e2e plugin in this marketplace will be documented in this file.

> Installed as **`e2e`**, so its skills invoke as `/e2e:pw-prove`, `/e2e:e2e-reviewer` and
> `/e2e:playwright-debugger`.
> The plugin directory is `plugins/e2e-skills/` — that path is a `git subtree` prefix and renaming
> it would break both `git subtree pull` and `git subtree push`.
>
> Unlike `plugins/mattpocock-skills/`, **this subtree is editable in place.** Author changes here,
> then `git subtree push --prefix=plugins/e2e-skills e2e-fork main`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.3.0] - Unreleased

### Changed

- Subtree pulled from `e2e-fork/main` (`b2665ec` → `3f2b418`, 26 commits). `pw-prove` moves
  0.15.2 → **0.20.0** and `e2e-reviewer` 1.9.0 → **1.10.0**; `playwright-debugger` stays 1.9.0.
  A minor bump, not a patch: the two skills' descriptions changed, which changes what the model
  routes to them.
- **Routing between the two skills is now explicit in both descriptions.** A request about routes,
  pages or flows with *no* test — an untested-routes audit, a coverage-gap report, a plan for
  missing tests — is `pw-prove`'s coverage-gap mode. Reviewing the quality of specs that already
  exist is `e2e-reviewer`'s. Each description now names the other and says which requests belong to
  it, so the two stop competing for the same prompt.
- `pw-prove` Step 1 reads what an earlier run learned about the repository instead of re-deriving
  it, and the shipped body now carries its own reasons rather than pointing at files that live only
  in the fork's repo.

### Removed

- Eval case `case-17` (PROVES-header audit) and its judge `proves-header-verdict.mjs`, retired
  upstream for zero uplift against a clean baseline. The behaviour it guarded is unchanged and still
  stated in SKILL.md Step 6 — the case is what went. The 43 other `case-<n>.yaml` files are renamed
  by the fork to `case-<n>-<what-it-guards>.yaml`.

### Fixed

- `scripts/ci/test-har-scrub.sh` assembles its synthetic Stripe fixture at runtime instead of
  writing `sk_live_<24>` as one source literal. The value was always fake — the scrubber under test
  reads the *key* a secret sits under, never the value's shape, so nothing depended on it being one
  token — but a contiguous match tripped GitHub push protection and blocked every push of this
  sync. Fixed in the fork (`05a10da`) and pulled back rather than patched here.

### Notes

- **This pull is `--squash`, matching every prior pull of this prefix.** An un-squashed pull was
  attempted first and had to be abandoned twice over. It grafts the fork's 26 commits into this
  repo's history, and four of them — predating `05a10da` — carry the whole `sk_live_…` literal, so
  push protection blocked the branch on *history* that no fix to the tip can reach. It also merged
  badly: rename and delete detection failed against the un-squashed base, resurrecting the 43 old
  `case-<n>.yaml` names and the retired `case-17` judge and fixtures, 49 files that had to be
  deleted by hand. The squashed pull reproduced the same tree with **zero conflicts** and applied
  the fork's renames and deletions correctly. The 1.0.0 graft was deliberately un-squashed so
  `git blame` reaches the fork's commits; pulls since have all squashed, and this records why that
  should stay the default.

## [1.2.1] - Unreleased

### Changed

- `pw-prove` moves 0.15.0 → **0.15.2**: the announced port is now stated where the bring-up step
  reads it (skill 0.15.1), and the retired `--workers=1` mandate is gone from the shipped body
  (skill 0.15.2, following `docs/adr/0017`). A patch bump, not a minor: no skill is added or
  removed and no interface changes — only the instruction bodies two audit tickets edited.
- The subtree was pulled from the branch that actually carries the content rather than from the
  fork's `main`, which is why `AGENTS.md` and `README.md` in the plugin now name the marketplace at
  `~/work/claude-marketplace`. The 1.1.0 pull took `main` and left the old `~/SonDev` path behind.
- Serving surface: `--workers` no longer appears anywhere under `plugins/e2e-skills/skills/`. The
  string surviving in a version-keyed cache copy is what the audit that produced these two skill
  versions was built around, so it is checked after propagation, not assumed.

## [1.2.0] - Unreleased

### Added

- `playwright-debugger` — root-cause diagnosis of a failed Playwright run from `playwright-report/`,
  traces and screenshots, classifying each failure into the stable `F1`–`F15` taxonomy. It shipped
  in the subtree from the 1.0.0 graft onward and Claude Code always exposed it, because an explicit
  `skills` array is *additive* to the default `./skills/` scan rather than a whitelist. Naming it in
  the manifest ends a two-skill story that three manifests and this changelog were all telling.

### Changed

- Plugin, marketplace-entry and Codex-manifest descriptions now name all three skills. The Codex
  manifest already pointed at `./skills/` wholesale, so only its description undercounted.

## [1.1.0] - Unreleased

### Changed

- Plugin version moved off `1.0.0` for the first time since the graft. The plugin cache is a
  version-keyed file copy, so a version that never moves means a stale cache no metadata refresh
  can dislodge — this one had been serving `pw-prove` 0.1.0 across 14 skill versions.

## [1.0.0] - Unreleased

### Added

- Initial addition to the marketplace as **`e2e`** — [sonhyrd/e2e-skills](https://github.com/sonhyrd/e2e-skills)
  (Apache-2.0) grafted via a real, un-squashed `git subtree add` under `plugins/e2e-skills/`,
  bringing all 146 commits of history so `git blame` on a `pw-prove` line still reaches the commit
  that wrote it. The subtree remote is the fork, not upstream `voidmatcha/e2e-skills`, because the
  fork carries 52 commits of `pw-prove` work the upstream tree does not have.
- `pw-prove` — prove a PR / branch / ticket / diff with a Playwright E2E test, fast. Owns server
  bring-up, auth and live-DOM recon; the trace and video are a byproduct of the proof run rather
  than a hosted film.
- `e2e-reviewer` — static review of Playwright/Cypress specs and Page Object Models, flagging 24
  anti-patterns grouped P0 (silently always-pass) / P1 (poor diagnostics) / P2 (maintenance).

- **`pw-prove` Step 8 publishes the Proof page over JSON-RPC under one vaulted bearer.** Synced
  from the fork's merged PR #24 (15 commits), which the original graft predated — so the skill an
  agent loaded was not the skill that was built. Five environment variables (`CLIPS_ORIGIN`,
  `CLIPS_A2A_SECRET`, `CLIPS_ORG_ID`, `CLIPS_ORG_DOMAIN`, `CLIPS_SUBJECT`) collapse to a single
  `CLIPS_MCP_TOKEN` lease. The bearer is leased into the process environment and never echoed, so
  neither it nor its `sub` claim reaches a transcript or a CI log. An absent credential remains a
  named WARN that skips the Proof page link and never a stop — the proof is the passing test plus
  the mutation verdict — and the warning prints the literal `agent-native vault exec …` lease
  command with the app and key names filled in, plus the one-time `vault add` for a machine that
  never stored the key. A non-delegable action is reported identically by the minute-zero probe and
  the minute-fifty publish, and an action's presence in the searchable index is distinguished from
  its presence in the callable catalog, so a findable-but-uncallable action returning HTTP 200 no
  longer reads as working. The fork's transport spec, ADR-0014, delegation profile and
  issue-tracker doc arrive under the prefix so the rationale sits beside the code.
  `make check-e2e-subtree` guards the marketplace-only divergences this sync had to preserve.

### Changed

- **`pw-prove` is unpinned, and gated instead.** `disable-model-invocation: true` is gone from its
  frontmatter, so another skill can hand into it through the Skill tool — the flag blocks *chained*
  launches as well as unprompted ones, which is the seam that made a review-to-proof chain
  impossible. What the pin was protecting moves into the skill body as a **Step 1 confirmation
  gate**: a run the model started stops once, says it is about to bring up a dev server,
  base-merge a branch, commit, push and comment on the PR, and waits; a run the user started by
  name asks nothing. The pin's other job — keeping a mistyped `/e2e:pw-prove` from falling through
  to a shadowing skill — died with the retirement of `playwright-test-generator`, which was that
  skill. `docs/adr/0005` in the marketplace records the trade.
- **`pw-prove` reads a handoff artifact.** `.pw-prove/handoff.json` at the target repo root carries
  a preceding review's confirmed findings into Step 2 as **additive** context. A current handoff
  (its `head_sha` matches HEAD) folds findings into the AC table with `handoff` in the Source
  column; a stale one is deleted and reported in one line of the Step 4 Assumptions block, never
  silently, because its findings point at line numbers that have moved. The skill's own Diff → AC
  derivation runs identically either way, and `pw-prove` owns the schema as its only reader.
- **The expected divergence set is two entries, not three.** Both `pw-prove` edits are pushed to
  the fork, so `skills/pw-prove/SKILL.md` is byte-identical on both sides and only the two plugin
  manifests remain marketplace-only. The guard's alarm inverted rather than disappearing: a pin
  restored by hand or carried in by a `git subtree pull` is now reported as an *unexpected*
  divergence, and `tests/bash/test-e2e-subtree-check.sh` covers that direction.

### Fixed

- **The Step 6 quality gate could not run.** `pw-prove` and `playwright-test-generator` both
  invoke `e2e-reviewer` through the Skill tool, which failed outright with
  `Skill e2e:e2e-reviewer cannot be used with Skill tool due to disable-model-invocation`.
  `disable-model-invocation: true` blocks *every* model-initiated launch — including a chained one
  from inside a skill the user invoked by name, which is the only path that ever reached this gate.
  Dropped the flag from `e2e-reviewer`: a skill that is a documented handoff target cannot be
  pinned user-invocable-only. `pw-prove` kept its own pin at the time, as an entry point rather
  than a target — see **Changed** for why it lost it too.

- `playwright-test-generator` no longer shadows `/e2e:pw-prove`. Session
  `31c05f72-b031-4071-afa7-5d643f611c55` sent `/e2e:pw-prove <PR url>` with a leading U+00A0
  (non-breaking space) in front of the slash, so Claude Code's command parser did not recognise it
  and passed the line through as ordinary prose. `pw-prove` carries
  `disable-model-invocation: true`, which removes it from the model-facing skill listing entirely —
  so the model had no `pw-prove` to reach for, and picked the one listed skill whose description
  claimed the job: `playwright-test-generator` ("…or prove a PR/branch/ticket/diff with one"). The
  whole PR then ran through the wrong pipeline. Note the correction below — the `skills` array was
  never what kept it out of the model's hands.

### Removed

- `playwright-test-generator` and `cypress-debugger` are **gone from the bundle**, deleted by the
  fork itself (`652c696 retire(playwright-test-generator): delete the fork, repoint the run ledger
  at pw-prove`) and carried in by the subtree pull. This repo had disabled the former by renaming
  its `SKILL.md` to `SKILL.md.disabled` — a marketplace-only deviation tracked by
  `check-e2e-subtree.sh`. Upstream removing the directory outright supersedes that rename, so the
  deviation is dropped from the expected set, taking the check back to three entries — and then to
  two, once `pw-prove` lost its pin (see Changed). The run
  ledger's dynamic import of `playwright-test-generator/scripts/ptg-run.mjs` went with it, so
  keeping the directory is no longer load-bearing anywhere. Three skills remain on disk:
  `pw-prove`, `e2e-reviewer`, `playwright-debugger`.

### Notes

- **Never pin a handoff target.** A SKILL.md line saying "invoke `<x>` (Skill tool)" is only valid
  when `<x>` carries no `disable-model-invocation`. That now holds for both handoff targets in this
  bundle: `e2e-reviewer` (Step 6) and `playwright-debugger` (Step 7, never pinned).
- **Declaring a skill in `plugin.json` is not what makes it load.** All on-disk skills appear
  to the host as `e2e:<name>`, including the one the manifest omits — verified against the
  installed cache at `~/.claude/plugins/cache/sss-marketplace/e2e/1.0.0/skills/`, with no
  leftover `~/.claude/skills` symlinks in play. So `pw-prove`'s `playwright-debugger` handoff is
  not the dangling reference the note below assumed; the `skills` array affects the published
  manifest, not host discovery.
- **Two of the three live skills are declared.** `playwright-debugger` ships inside the subtree
  and loads, but is not registered in the manifest. Re-declaring it is a one-line edit to the
  `skills` array in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
- **No skill in this bundle is pinned.** `disable-model-invocation: true` is the only mechanism
  that pins a plugin-sourced skill — `skillOverrides` in `~/.claude/settings.json` does not apply
  to plugin skills — and it is now absent from all three. `pw-prove` confirms instead of pinning;
  see Changed. `e2e-reviewer` has deliberately carried no such flag since the fix above.
- **Version is fresh, not borrowed.** Upstream publishes no plugin and no repo version; the only
  signals are per-skill `metadata.version` (`1.9.0` on the four voidmatcha skills, `0.1.0` on
  `pw-prove`). Those disagree, and `1.9.0` describes a five-skill bundle. `1.0.0` is the honest
  number for a new two-skill artifact.
- **Known, deliberate divergence-avoidance.** `pw-prove`'s SKILL.md instructs the model to invoke
  `playwright-debugger` after three failed heal attempts; that skill is not declared, so the
  handoff dangles. It dangled before this move too (`playwright-debugger` was `off`), and editing
  it would create a permanent conflict surface in a file upstream actively edits. Left alone on
  purpose — this is a known lie, not an oversight.
