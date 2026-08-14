› **Reading this in Claude Code?** See also `CLAUDE.md` if present. This file keeps the `AGENTS.md`
filename so any agent that follows the convention can read it.

# AGENTS.md

Guidance for AI coding agents working in this repository.

## Repository Overview

`e2e-skills` is **three** Agent Skills for end-to-end test work, plus a standalone scanner:

- `pw-prove` — prove a PR/branch/ticket/diff with a Playwright E2E test (bring-up → recon → plan → generate → review → verify → deliver).
- `e2e-reviewer` — static review of existing Playwright/Cypress specs against 24 anti-patterns grouped P0/P1/P2, and the scanner (`skills/e2e-reviewer/scripts/scan.mjs`).
- `playwright-debugger` — root-cause diagnosis from `playwright-report/`.

`cypress-debugger` and `playwright-test-generator` are retired (see `docs/adr/0005` and
`docs/adr/0012`); Cypress **static review** stays in `e2e-reviewer`.

### Distribution: subtree out, nothing in

This repo is not independently installable and will not be made so. It is grafted into the private
local marketplace (`~/work/claude-marketplace`) as an editable git subtree at
`plugins/e2e-skills`; **that** repo owns the plugin manifests, the version, and the shipped-skill
list. This repo is the source of truth for skill *content* only, and propagation is one-directional:

```bash
# from the MARKETPLACE checkout, never from here
git subtree pull --prefix plugins/e2e-skills <path-or-url-to-this-repo> main --squash
```

There is deliberately no plugin manifest, no host adapter, no installer script and no git hook here.
Manifest, marketplace and cross-host parity are not concepts this repo has. Changes you make land in
a runtime only after the operator pulls the subtree.

`origin` (`sonhyrd/e2e-skills`) is the only remote. There is deliberately no `upstream` remote: the
fork it would point at (`voidmatcha/e2e-skills`) has diverged into the public-bundle arrangement this
repo retired, so nothing there is mergeable wholesale. If you ever need a scanner fix from it, add it
fetch-only and push-disabled for that one job, port the change into `scan.mjs` by hand — upstream's
fix will land in `scan.sh`, which does not exist here — and remove the remote and any tags it
brought with it afterwards.

## Verification gate (must pass before commit)

```
[ ] bash scripts/ci/ci-local.sh          # review checks + drift smoke + corpus golden + 0 P0 smell hits
[ ] bash scripts/ci/pre-push-security.sh # secrets and credential leak guard (manual — no hook installs it)
```

`ci-local.sh` is the single source of truth for what CI runs (shell syntax, **Node syntax**, parity,
**skill version bump**, security, public skill surface, framework scope, link integrity,
docs orphan check, language,
**scanner pattern corpus**, the shipped pw-prove scripts at the process boundary, hermetic audit,
**the probe HAR contract**, the **HAR scrubber**, publish-proof, **clip-fidelity audit**,
**run-ledger smoke**, e2e smell scan). If you change any check, update this script first.

## Directory Layout

```
.
├── AGENTS.md               # This file (@-included by CLAUDE.md)
├── CONTEXT.md              # Domain model / ubiquitous language
├── agents/                 # Claude Code subagents (plugin-install only): read-only
│   ├── e2e-finding-verifier.md    # adversarially verify ONE reviewer finding
│   └── e2e-failure-classifier.md  # classify ONE failure into F1–F15
├── skills/                 # Three Agent Skills (the whole surface)
│   ├── pw-prove/
│   │   ├── SKILL.md        # Required: skill frontmatter + body
│   │   ├── best-practices.md
│   │   ├── code-rules.md
│   │   ├── evals/          # NOT shipped — skill-up suite: eval.yaml + cases/*.yaml
│   │   ├── evals/judges/   # NOT shipped — judge scripts + fixtures/<judge>/{pass,fail}--*.txt
│   │   ├── evals/files/    # NOT shipped — repo fixtures the wet cases run pw-prove against
│   │   └── scripts/        # SHIPPED — Node, zero deps: preflight/probe/har-scrub/hermetic/clip-fidelity/publish-proof/clips/video/pwprove-run .mjs
│   ├── e2e-reviewer/
│   │   └── scripts/        # SHIPPED — scan.mjs + ast-grep-rules/
│   └── playwright-debugger/
├── scripts/                # NOT shipped — repo CI tooling, stays shell
│   ├── ci/                 # parity, security, corpus golden, per-script process-boundary suites
│   ├── run-evals-isolated.sh # eval runs: isolated $HOME + the per-case skill-loaded sweep
│   └── verify-fixes.sh     # post-bulk-fix verification (sed-artifact AST detection)
├── tests/pattern-corpus/   # one hit + one JUSTIFIED twin per check, and the golden
├── docs/                   # taxonomy, framework scope, ADRs, specs, agent workflow config
└── README.md
```

Each `skills/<name>/SKILL.md` is the contract. Everything in the skill body should be
**task-actionable instructions for the agent**, not narrative documentation; supporting reference
material (long tables, framework references) goes in sibling `.md` files and is read on demand.

### Shipped scripts are Node; repo scripts are shell

The shipped scripts under `skills/*/scripts/` run inside a **user's** repository, so they are plain
ESM `.mjs` on the Node standard library — **no npm dependency, no build step, nothing installed into
someone else's project**. Node is already a hard dependency there (they all invoke `npx playwright`).
Invoke them with `node <path>.mjs`, never `bash`.

They orchestrate; they do not match. `rg` (PCRE2), `eslint`, `ast-grep`, `ffmpeg`, `ffprobe`, `git`,
`gh`, `curl` and `npx playwright` stay subprocesses. One deliberate exception: `probe.mjs` imports
the **target project's own pinned** Playwright in-process (resolved from the app root — still nothing
installed anywhere), because a persistent browser context cannot live across `npx playwright`
subprocess invocations. **Do not rewrite the Tier-3 PCRE2 patterns as JS RegExp** — at least one is
load-bearing on a possessive quantifier JS cannot express, and rewriting it silently inverts the
check (see `tests/pattern-corpus/README.md`). Dropping the ripgrep dependency is a separate change
with its own fixtures.

Everything under `scripts/` is repo-only tooling and stays shell.

## Conventions

- **Skill names**: kebab-case, must match the directory name and the `name:` in SKILL.md frontmatter.
- **SKILL.md frontmatter**: `name`, `description`, `license`, `metadata: { author, version }`. The description is the trigger surface — pack synonyms and the user's likely phrasing.
- **Pattern IDs**: 24 stable anti-pattern entries (`#1`–`#23` plus `#3b`) with P0/P1/P2 severity. IDs are stable; do not renumber. Severity rationale: P0 = silent always-pass, P1 = poor diagnostics, P2 = maintenance.
- **Failure category IDs**: 15 codes (`F1`–`F15`) used by `playwright-debugger` and its subagent. Codes are stable.
- **JUSTIFIED comments**: `// JUSTIFIED: <reason>` on the line above (or above the enclosing block / multi-line chain) suppresses scanner findings. Suppress for documented intent, never to hide a real finding.
- **Severity-first organization**: tables in SKILL.md, README, and `docs/e2e-test-smells.md` group by P0/P1/P2 in the same order.
- **Run ledger**: every shipped-script entry point emits one `PWPROVE_RUN {json}` line through `skills/pw-prove/scripts/pwprove-run.mjs` and appends it to `~/.ptg/ledger.jsonl` (`PWPROVE_LEDGER` overrides). Telemetry never fails a run. Records carry a `schema`; read it before reading anything else, because fields are added over time (schema 2 added `session`/`session_src`).
- **Session id**: a proof is many processes, so each record carries the session that produced it — `$PWPROVE_SESSION` (explicit override), else `$CLAUDE_CODE_SESSION_ID` (the host runtime's own id), else a cwd-keyed `$TMPDIR` nonce that expires after 30 idle minutes; `session_src` names which. Count *proofs* by distinct `session`, not by record.
- **Version bumps**: bump the `metadata.version` in a skill's SKILL.md whenever you change its body or its shipped scripts. The ledger's stale-install detection leans on that field, and a version that never moves detects nothing — pw-prove sat at `0.1.0` across 638 recorded runs and 14 distinct installs. This is enforced, not merely stated: `review.sh`'s `Skill version bump` check compares the working tree against the merge base with `main` and fails, naming the skill, when a body or a shipped script moved and the version did not. SKILL.md counts only below its frontmatter; sibling and reference `.md` files and `scripts/` count in full; `evals/` and the eval engine's own `.skill-up.yaml` do not.
- **English-only public surface**: SKILL.md, README, and `docs/` are English. CI enforces this (`Language` check).

## Frameworks in Scope

Playwright and Cypress only. The skill does not produce code or advice for Puppeteer, Selenium,
WebdriverIO, TestCafe, or Nightwatch. See `docs/framework-scope.md` for the rationale. CI fails on
accidental support claims for out-of-scope frameworks.

## Local Development Commands

```bash
# Full CI mirror — run before every commit
bash scripts/ci/ci-local.sh

# Individual stages
bash scripts/ci/review.sh           # parity, language, links, framework scope, orphans
bash scripts/ci/test-parity.sh      # drift smoke test (mutate-and-detect)
bash scripts/ci/test-corpus.sh      # scanner golden: 25/25 checks fire, suppression holds
bash scripts/ci/test-pw-prove-scripts.sh # preflight three-phase bring-up gate + probe argument/socket contract
bash scripts/ci/test-hermetic.sh    # hermetic.mjs: LIVE/MOCKED classification + route.fetch blind spot
bash scripts/ci/test-publish-proof.sh # publish-proof.mjs: manifest in, one Clips share link out (four gates, kept-file fallback)
bash scripts/ci/test-probe-har.sh   # probe.mjs: recordHar flushes on context close, and says so
bash scripts/ci/test-har-scrub.sh   # har-scrub.mjs: scrub/residue exit codes; the referrer + query-parameter under-scrub
bash scripts/ci/test-clip-fidelity.sh # clip-fidelity.mjs: the Step-6 dwell/pin/verdict exit codes, and the Step-7 frame over real video
bash scripts/ci/test-run-ledger.sh  # PWPROVE_RUN run-ledger contract on the shipped scripts
bash scripts/run-evals-isolated.sh --self-test # the eval runtime's own seam (no API calls)
bash scripts/ci/pre-push-security.sh
node skills/e2e-reviewer/scripts/scan.mjs path/to/tests   # standalone scanner

# Exercise the skills against a real repo (testbed/ is gitignored)
git clone --depth 1 https://github.com/calcom/cal.diy testbed/cal.diy
node skills/e2e-reviewer/scripts/scan.mjs testbed/cal.diy
```

`ci-local.sh` runs all of the above and must be green before you commit.

One suite is deliberately **outside** that list, and must stay outside it:

```bash
bash scripts/ci/test-eval-judges.sh  # eval judge scripts: fixture in, exit code + printed verdict out
```

A judge fixture is a `.txt` (fed as `$EVAL_FINAL_MESSAGE`) or a `.jsonl` (fed as
`$EVAL_TRANSCRIPT_PATH`, the serialized session transcript skill-up hands a script judge under
`environment.type: none`). A sibling `<slug>.env` — or a directory-wide `_fixtures.env`, with
`$EVAL_FIXTURE_DIR` already exported — adds environment for that fixture only; that is how a
transcript judge is kept hermetic against a fixture-local SKILL.md instead of the shipped one.

CI is the contract for the shipped surface; the eval suite is an instrument operated by hand, so
wiring this into `ci-local.sh` would give CI an eval dependency it should not have. Run it by name
whenever you add or change a judge under `skills/pw-prove/evals/judges/`. Every judge needs a
fixture directory carrying both halves — a must-FAIL input, and a must-PASS input that is *a
correct answer naming the forbidden thing in order to reject it*, which is the one-hit-one-JUSTIFIED-twin
rule from `tests/pattern-corpus/` applied to judges. That twin is what catches the bare-substring
judge, the defect behind seven of the nine failures in the 2026-08-13 run.

## The Eval Suite

**pw-prove is evaluated by the `skill-up` CLI, and that suite is the skill's eval
surface.** There is exactly one eval format for this skill; the `evals.json` predecessor
was mined and retired in #61. The surface is five things:

| Path | What it is |
|---|---|
| `skills/pw-prove/evals/eval.yaml` | Suite config: runtime, engine, the **active** case list, judge defaults |
| `skills/pw-prove/evals/cases/<id>.yaml` | One file per case. 61 on disk, 12 active — the rest are inventory, not coverage |
| `skills/pw-prove/evals/judges/` | Script judges, plus `fixtures/<judge>/{pass,fail}--*.txt` |
| `skills/pw-prove/evals/files/` | Repo fixtures a [wet case](CONTEXT.md#wet-case) runs pw-prove against |
| `skills/pw-prove/.skill-up.yaml` | User config for the run (e.g. the agent-under-test's effort level) |

### Running the eval suite

Run it by hand, and **always through the isolated runner — never `skill-up run` directly**:

```bash
bash scripts/run-evals-isolated.sh                       # the active cases
bash scripts/run-evals-isolated.sh --include-case-name 'b01-*'
bash scripts/run-evals-isolated.sh --sweep-only <workspace>  # re-judge an existing run
bash scripts/run-evals-isolated.sh --self-test           # no API calls, no spend
```

It gives the run a fresh `$HOME` carrying credentials and nothing else — no `plugins/`, no
user-level `skills/`, no host `settings.json` — because skill-up launches the agent against the
operator's real home, where a marketplace install of this very bundle also lives. Two cases in the
2026-08-13 run were graded against that plugin copy. Deleting the stale copy fixed that run and not
the next one; isolation is a property of the runtime, not of what the cache happens to hold today.
Isolate by `HOME`, not `CLAUDE_CONFIG_DIR`: the latter moves the session transcript out from under
skill-up, which then has none to hand a script judge.

Afterwards the runner sweeps every retained transcript through
`skills/pw-prove/evals/judges/skill-loaded.mjs` and prints one verdict per case — LOADED (and by
which route), NOT LOADED, or CONTAMINATED. A contaminated case fails the sweep, so isolation is
proven per run rather than assumed. A case that never loaded the skill is not measuring the skill,
whatever its own judge said; the gate makes that visible, and non-invocation stays a FAIL.

Note skill-up's config discovery is `$PWD`-only, so `.skill-up.yaml` is ignored without complaint
unless you are in `skills/pw-prove/` or pass it as `--config`. The runner handles this for you.

Four things to know before you touch any of it:

- **`environment.type: none` is fixed, and it is not a sandbox.** `docker` cannot see the files the
  run produces, so every wet case would fail for a reason that reads as a skill defect; `none` means
  the agent runs `--permission-mode=bypassPermissions` against the **real host filesystem**. Read
  `docs/adr/0018` before running the suite, and do not "fix" the runtime back to `docker`.
- **No CI check reads the eval suite, in any skill, by decision** (#54). Nothing will catch a broken
  case, a reverted runtime, or a case list that drifted. `scripts/ci/test-eval-judges.sh` covers the
  judge scripts only, and is run by name — see the section above for why it stays out of
  `ci-local.sh`.
- **`evals/` and `.skill-up.yaml` are eval-engine material, not the shipped instruction surface**, so
  neither triggers the `Skill version bump` check. Do not add a bump to pay a toll that is not owed.
- **Before hand-authoring a judge for a dormant case, read
  `skills/pw-prove/evals/mined-assertions.md`** — it holds the assertions the migration to case files
  dropped, so repairing a case is recovery rather than invention.

The vocabulary — **wet case, dry case, trusted core, characterization, blast radius** — is defined
once in `CONTEXT.md` under *Eval vocabulary*. Use those words for those things.

`e2e-reviewer` and `playwright-debugger` are unaffected: they still carry the older
`evals/evals.json` array format, and nothing here applies to them.

## When You Edit Skills

1. **Update parity surfaces in lock-step.** Adding or renaming a pattern means touching: `skills/e2e-reviewer/SKILL.md` (Quick Reference), `skills/e2e-reviewer/references/pattern-reference.md` (per-pattern contract — CI Checks 3b/3c validate this file), `docs/e2e-test-smells.md`, `README.md` 24 Patterns table, `skills/e2e-reviewer/references/grep-patterns.md`, and `skills/e2e-reviewer/scripts/scan.mjs`. CI fails fast if any one is out of step.
2. **Re-run the drift smoke test.** `scripts/ci/test-parity.sh` mutates known-bad versions of the files and asserts the parity check catches each one — keep it green when you add new parity rules.
2b. **Give the new pattern a corpus fixture and refresh the golden.** `tests/pattern-corpus/` holds one deliberate hit and one `// JUSTIFIED:` twin per check; `scripts/ci/test-corpus.sh` freezes the scanner's output over it. Add both fixtures, run `bash scripts/ci/test-corpus.sh --update`, and **read the diff before committing it** — the golden only protects you if a moved line makes you stop and look. A pattern with no fixture is a pattern nothing is testing. Never run `--update` to clear a red run you did not intend to cause.
3. **Add or update evals when behavior changes.** pw-prove's eval surface is the skill-up suite — `skills/pw-prove/evals/eval.yaml` plus one `cases/<id>.yaml` per case, run by hand through `scripts/run-evals-isolated.sh` (never bare
`skill-up run`, which the operator's own plugins contaminate) and never by CI. Its retired `evals.json` predecessor is gone; the assertions that file carried were mined into `skills/pw-prove/evals/mined-assertions.md`, which is where you look before hand-authoring a judge for a dormant case. `e2e-reviewer` and `playwright-debugger` still carry the older `evals/evals.json`. **No eval schema or convention is checked by CI, in any skill, by decision** — see issue #54; the one surviving CI read of an `evals/` file is the F-code taxonomy parity check on `playwright-debugger`, which guards the taxonomy and not the eval format. Each new smell or behavior change should still add at least two assertions: one true positive that must be flagged, and one false-positive guard that names the exact line and why it must not be flagged.
4. **Respect severity contracts.** P0 entries should be silent-always-pass smells; don't downgrade. P1/P2 should not creep into P0 just because they're easier to grep.
5. **Keep subagent wiring delegation-aware.** The `agents/` subagents (`e2e-finding-verifier`, `e2e-failure-classifier`) are discovered only when the bundle is installed as a Claude Code plugin (i.e. through the
marketplace subtree) — a plain skill copy never sees them. So any skill that delegates to a subagent MUST also carry an inline fallback that reaches an **identical** verdict from the same source of truth (`skills/e2e-reviewer/references/pattern-reference.md` for reviewer findings; `skills/playwright-debugger/SKILL.md`'s F1–F15 tables for failures). Never make a subagent the only path to a verdict.

## What Not to Do

- Do **not** add new file types under `docs/` without linking them from `README.md` or referencing them from a CI script — the docs orphan check will fail.
- Do **not** silently change a pattern ID, severity, or failure category code. The evals and the marketplace install depend on them.
- Do **not** introduce out-of-scope framework code paths. Skills must say "out of scope" rather than emit half-working examples for Selenium/WebdriverIO/etc.
- Do **not** push commits without running `bash scripts/ci/ci-local.sh`.
- Do **not** reintroduce plugin manifests, a host adapter surface, or a second installer. The marketplace owns distribution; a second propagation path is how a runtime ends up running a skill version this repo does not have.
- Do **not** add a permanent `upstream` remote, merge `voidmatcha/e2e-skills`, or open issues/PRs against it. `origin` is the only remote; see the distribution section for the one-off fetch-only exception.
- Do **not** edit `skills/e2e-reviewer/references/grep-patterns.md` without checking that the matching pattern IDs in `skills/e2e-reviewer/scripts/scan.mjs` still line up — `scan.mjs` is the runtime source of truth, `grep-patterns.md` is an ID-meaning reference for Phase 2 / debugger lookup.
- Do **not** create side effects on third-party repos when validating the skill. Cloning into `testbed/` and running `scan.mjs` locally is allowed; pushing to forks, opening PRs/issues, posting comments, or any state-changing `gh` command is not.

## Agent skills

### Delegation profile

Branch prefix, post-merge check, commit policy, and worker constraints for `/delegate-tickets`.
See `docs/agents/delegate-profile.md`.

### Issue tracker

Where tickets live, the triage label, and the `--repo` rule for every `gh issue` call.
See `docs/agents/issue-tracker.md`.

## License

Apache-2.0, inherited from `voidmatcha/e2e-skills`. Match the parent license in any new file you add,
and keep the attribution — the licence requires it.
