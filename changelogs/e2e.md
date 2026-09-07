# Changelog - e2e

All notable changes to the e2e plugin in this marketplace will be documented in this file.

> Installed as **`e2e`**, so its skills invoke as `/e2e:pw-prove`, `/e2e:e2e-reviewer` and
> `/e2e:playwright-debugger`.
> The plugin directory is `plugins/e2e-skills/` — that path is a `git subtree` prefix and renaming
> it would break both `git subtree pull` and `git subtree push`.
>
> Unlike `plugins/mattpocock-skills/`, **this subtree is editable in place.** Author changes here,
> then push them back with a **targeted push** — build a commit on `e2e-fork/main` carrying only the
> paths the fork owns and `git push e2e-fork <sha>:main`. Never `git subtree push`, which splits the
> whole prefix and lands the two marketplace-only plugin manifests on a fork that deliberately ships
> none (`docs/adr/0005`).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.10.0] - Unreleased

### Changed

- **The subtree is synced to `e2e-fork/main` at `9f7c58d6` (`pw-prove` 0.39.0 → 0.42.1)**, bringing five fork PRs down: **#178** (the `SKILL.md` body split into `references/step-*.md` — a file-layout change), **#187** (0.40.0 — `RESTART=proven` no longer names a dead server; it refuses in 2.4s), **#188** (0.41.0 — the first-run smoke rule moved into the split `step-7-verify.md` with its guard repointed), **#195** (0.42.0 — see below) and **#196** (0.42.1 — the Clips publish advertises both media types the transport requires). `e2e-reviewer` and `playwright-debugger` are unchanged. #196 landed on the fork *mid-run*, after the sync to `31b31ea` was already committed: the acceptance gate `scripts/check-e2e-subtree.sh` fetches the remote and diffs against **live** `main`, so a sync pinned to a SHA the fork has moved past reads as three divergences and the gate ships red. The prefix was therefore re-synced forward to `9f7c58d6` in the same pull request. **The plugin version does not move for it**: a patch on the fork side does not move the marketplace minor, and 1.10.0 has not shipped, so there is no cache keyed on it to invalidate. **A minor, not a patch**: #178 changed the file layout and a runtime behaviour was retired. **Not a major**: no skill description changed on any of the three skills, so the routing table is untouched and nothing re-routes on install.
- **This repo's own `references/step-*.md` split (#97/#98, shipped as 1.9.2) is superseded wholesale by the fork's #178.** The two are the same eight-file shape done twice, on both sides of the subtree boundary; the fork's contents win. Eight reference files replaced at once is the sync working, not a reverted layout change.

### Removed

- **`pw-prove`'s runtime profile is retired** (fork #195, and the fork's own `docs/adr/0021-no-durable-runtime-profile.md` arrives with this sync). The Step 1 read, the Step 8 write and the `git add -f .pw-prove/profile.md` are gone; durable findings now travel as a `Learned:` line in the completion report. This is the reason the sync was time-sensitive rather than merely overdue: hosts on 1.9.x carry a skill that writes `.pw-prove/profile.md` into every repo it proves, and two repos had already deleted that file (`hyrdrocks/nuxt-hyrd-chrysus#3703`, `hyrdrocks/hyrd-widget#1356`). Until the hosts pull 1.10.0, the next proof run puts it back. Nothing under the prefix now writes or force-adds the path — the 23 surviving mentions are all historical prose in `README.md` and `docs/`, which is the record of the retirement rather than the writer.

### Fixed

- **The subtree split chain is repaired.** The newest commit carrying `git-subtree-split` was `bcd6b25c` (split `e8ddfd3`); the five syncs after it were squash-merged on GitHub, which drops the trailers, so `git subtree pull` diffed against a merge base ~90 commits stale. One attempt was made here for the evidence and produced add/add conflicts across the prefix exactly as predicted. The sync was done instead as `git merge -s ours` with the prefix replaced wholesale from the fork's tree, the two marketplace-only manifests written back, and every other blob verified byte-identical to the fork **by object hash** (660/660 at each of the two syncs) before committing — with all three trailers (`git-subtree-dir`, `git-subtree-mainline`, `git-subtree-split`) recorded, so the next pull diffs against this sync.

## [1.9.2] - Unreleased

### Changed

- `pw-prove` skill: **`SKILL.md` split into a 15.8 KB procedure plus `references/step-1-dispatch.md` … `references/step-8-deliver.md`** (#97); skill version 0.38.0 → 0.39.0. 146,529 → 15,797 bytes at the top of every prove session, with the procedure unchanged — every moved paragraph is verbatim in the reference its step names. Marketplace-side edit to the subtree, not yet pushed to the fork. Full entry in the root `CHANGELOG.md`.

## [1.9.0] - Unreleased

### Added

- **The subtree is pulled up to `e2e-fork/main` (`b659f9f` → `2dbded1`, 70 commits — 46 of them non-merge), moving `pw-prove` 0.27.1 → 0.37.0** with `e2e-reviewer` at 1.10.0 and `playwright-debugger` at 1.9.0 unchanged. A minor, not a patch: Step 7 gains a run interface it did not have, and gains refusals that can stop a run which previously proceeded — but **no skill description changed on any of the three**, so the routing table is untouched and nothing re-routes on install.
- **Step 7's three runs become three verbs of one module.** `skills/pw-prove/scripts/proof-run.mjs` (new, ~1850 lines) owns `audit`, `film` and `mutate`, each of them a single command that cannot forget its own rules — previously prose the agent re-assembled by hand every run. `audit` resolves the spec set, clears the results directory, runs un-clipped, and bounds the heal loop through the no-progress checkpoint, with state persisted under the run's `.pw-prove/` so the checkpoint holds *across* invocations rather than within one. It also owns two preconditions that refuse under their own exit codes before a browser run is spent: a type check against the e2e tsconfig (root tsconfig when there is none), and the HAR bind that points the canonical recording at this run's origin. `film` runs the clip-fidelity audit as a **precondition** — a spec with no reader for the clip variable never reaches a filming run — then films, extracts one frame per clip, and carries clip paths and measured durations in its summary so the publish step reads a manifest rather than globbing for one.
- **Filming is refused while an undeclared live call stands (exit 13), and the re-film it already paid for is remembered.** The audit run persists the live calls it saw; `film` recomputes the undeclared list against the spec text in front of it, so declaring the carve-out clears the refusal with no second audit, while a spec set that moved under the record is named `stale` rather than read as clearance. An audit that never asked the question now leaves no clean bill of health behind. The body allows exactly one re-film, and the second filming run sets `publish_with_warning` in its own summary instead of asking the agent to recall across a diagnosis which attempt this was.
- **A mutation check proves its own restart, and a stale artifact refuses the next verb.** `mutate` sequences `preflight.mjs`'s `build` and `serve` phases and accepts only the server's **own new announcement in its own log, past a mark taken when the restart was issued** — not an answer on the port, which a survivor process serving the pre-mutation build answers just as well (one observed run spent 128s on a loading splash before it would have reported "the spec guards the change" on evidence that proved nothing; killing the survivor gave the genuine RED in 18.7s). An unproven restart is **exit 11 with no verdict to read**. Between a mutation's revert and the next build the built artifact still holds the reverted mutation — a state build-reuse cannot see, since reuse is measured against HEAD plus the working tree and the revert restored both — so `mutate` records `.pw-prove/artifact-stale`, and `audit` and `film` **refuse while it stands** (exit 15), changing nothing, clearing nothing, and printing the exact commands that clear it in order. They never self-heal, because a silent rebuild would hide that the machine was left in that state.

### Fixed

- **A stream-encoded publish response no longer reads as a rejection**, and a plain body carrying a `data:` line no longer reads as a stream. The publish step's wire-encoding handling was wrong in both directions at once.
- **Preflight stated a loopback family the wildcard bind never claimed.** A server announcing `[::]` or `0.0.0.0` names no loopback form, so the serve phase now keeps the origin you asked for rather than re-spelling it into one the server never offered.
- **Step 7's audit verb refused to run at all inside a git worktree** — which is where a delegated proof run lives.
- **The Clips publish advertised only `application/json` and was refused with HTTP 406.** The deployment requires a POST to accept *both* encodings — `Client must accept both application/json and text/event-stream` — so a completed proof run ended with `undelivered` and no hosted URL, with the concatenated clip surviving only as a local file. `clips.mjs` now sends `Accept: application/json, text/event-stream`. The header had been narrowed to JSON-only on the reasoning that an Accept header should describe what the client *wants* rather than everything it could survive; that reasoning is sound and the narrowing was still wrong, because the server reads the header as a capability declaration and this client genuinely handles either encoding — `unwrapSseBody` already reads both, which is what makes the wider header accurate rather than defensive. Observed on a real run (proof for `hyrd-widget` PR #1094): 406 before the change, `https://clips.paulsjob.ai/share/txYRbeUX1nQl` after it, from the same three clips.

### Changed

- **`.pw-prove/` is git-ignored** as the run's handoff artifact path, and the run's three state records share one codec.
- **The eval suite is re-baselined against the verbs that ship**: the Step-7 cases judge the verbs rather than the retired prose, six that judged prose that no longer exists are repaired, and six assertions stop echoing their own prompt. New CI scripts `test-proof-run.sh` (1758 lines), `test-invocation-parity.sh` and `test-span-index.sh` join `ci-local.sh`.
- **A week of finished runs is read as evidence**, landing as `docs/studies/` (`run-forensics.md`, `session-distillation.md`, `profile-audit.md`, `friction-findings.md`, and two per-repository setup studies) with a `Run forensics` vocabulary section in `CONTEXT.md` and a ranked fix spec at `docs/specs/0002-pw-prove-fix-spec.md`. **None of it is a gate** — no run passes or fails anything defined there.

**Sync mechanics.** The recorded subtree split was last written by `bcd6b25` (`e8ddfd3`); the five syncs after it were squash-merged on GitHub, which drops the `git-subtree-*` trailers, so `git subtree pull` diffed against a merge base 90 commits stale and produced add/add conflicts across the whole prefix. The pull was redone as a content sync that **repairs the chain**: an `-s ours` merge of `e2e-fork/main` (so the fork is a real parent), the prefix replaced wholesale by the fork's tree, and the two marketplace-only manifests written back. Every other blob in the prefix was then verified byte-identical to `e2e-fork/main` by object hash before committing, and the merge commit carries the `git-subtree-dir` / `git-subtree-mainline` / `git-subtree-split: 2dbded1` trailers so the next pull bases off this one instead of replaying five syncs' worth of history again. `make check-e2e-subtree` is green at exactly the expected 2 entries. The Codex manifest was regenerated with `scripts/sync_codex_plugins.py`.

## [1.8.2] - Unreleased

### Fixed

- **The subtree is pulled up to `e2e-fork/main` (`e455514` → `b659f9f`, 2 commits — one fix and its merge), moving `pw-prove` 0.27.0 → 0.27.1** with `e2e-reviewer` at 1.10.0 and `playwright-debugger` at 1.9.0 unchanged. A patch: it repairs a guard 1.8.1 shipped rather than changing what a run proves. **Step 8's pre-push guard stopped on the operator's own commits.** 1.8.1 taught the push to read `@{upstream}..HEAD` before publishing, and to refuse when the list carries a commit the run did not make — right, and it folded a second case into the same paragraph: a `HEAD` that moved under the run. Those are not the same event. A moved `HEAD` is an *observation* (a tree that lost modifications between two of the run's own snapshots reads exactly like destroyed work and is not, so the answer is `git reflog -5`, not a stop), while a foreign commit is a refusal. Read as one rule, the guard stopped a run on the operator committing to their own branch mid-proof — the very thing a proof run is expected to tolerate. The two now sit as separate bullets, the observation first, so the refusal keeps its narrow trigger. The completion report's `Pushed:` line gains the commit count and subjects, which is what makes the guard's decision legible after the fact. **No description changed on any of the three skills**, so the routing table is untouched. The pull merged the fork's history (not `--squash`), so the plugin manifests survived; the single conflict — `pw-prove/SKILL.md` — came from the stale merge base rather than a local edit, and both sides were verified byte-identical to the fork before and after resolving. `make check-e2e-subtree` is green at exactly the expected 2 entries after. The Codex manifest was regenerated with `scripts/sync_codex_plugins.py`.

## [1.8.1] - Unreleased

### Fixed

- **The marketplace entry's description was 59 characters over the schema cap**, and had been since
  this version landed, so `make validate` and `make validate-strict` were red on `main` for every
  change that followed — the one gate `CLAUDE.md` requires before a commit. `maxLength` is 500 and
  the description was 559; it is now 446. Two clauses went: the subtree provenance, which belongs in
  `CLAUDE.md` and not in a discovery surface, and the enumeration of which skill chains into which,
  kept only as *all three are model-invocable and chain*. The three per-skill trigger sentences —
  the part a host actually routes on — are untouched. No plugin version bump: the description lives
  in `.claude-plugin/marketplace.json`, which is read live, not in the versioned plugin directory.
- **Subtree pulled from `e2e-fork/main`** (`618a6ef` → `e455514`, 4 commits — two fixes and their
  merges), moving `pw-prove` 0.26.0 → **0.27.0** with `e2e-reviewer` at 1.10.0 and
  `playwright-debugger` at 1.9.0 unchanged. A patch, because both changes are guards inside steps
  that already existed — no step gains or loses a phase, and no skill description changed, so the
  routing table is untouched.
- **A recording that pins an origin makes the port part of the match key, not a preference.**
  Step 1's port rule was unconditional: allocate a free port, a configured port is only a
  preference. That is right for its stated hazard (a sibling worktree holding the port) and wrong
  for a suite whose committed HAR entries carry a concrete `host:port`. Playwright's replay matches
  on exact request-URL string equality, so an allocated port makes every entry unmatchable, every
  read aborts under `notFound: 'abort'`, and the app dies on its loading splash — with symptoms
  that read as broken locators rather than as a wrong port. Step 1 now asks the recordings
  themselves (a loop over committed `.har` files under the test dir, reading each entry's host);
  a named origin means serve on the recorded port and shift only on an actual `EADDRINUSE`. The
  carve-out is decided from the HAR's own entries rather than from a scrubber marker, because every
  recording committed before such a marker existed is pinned and carries none.
- **Where the project owns rebinding, Step 7 drops the `--origin` bind and says so.** A repo that
  ships its own replay helper (an `installApiHar()` over `routeFromHAR`) rebinds to the run's origin
  at runtime, so `har-scrub.mjs bind --origin` duplicates it. The rest of the block **stays**: an
  exit-4 placeholder sitting in the match key is still the run's to bind, and a runtime rebinder
  does not supply it.
- **Step 8 no longer pushes a shared worktree's branch blind.** The push assumed the run owns the
  tree and the branch; a second agent session or the operator can commit to the branch mid-run, and
  `git push` carries every unpushed commit rather than the run's own — publishing work-in-progress
  to the remote, to CI, and onto a PR under review. The push now reads `@{upstream}..HEAD` first
  (`<base>..HEAD` with no upstream) and checks each commit against the two this run makes; a
  foreign commit is a blocking no-skip-form stop that names it and hands over the exact `git push`
  command. A `HEAD` that moved under the run is reported as an observation with `git reflog -5`
  named as the check, rather than reasoned about as lost work — a run that concludes its work was
  destroyed and re-does it makes things worse.

## [1.8.0] - Unreleased

### Fixed

- **Subtree pulled from `e2e-fork/main`** (`bc38f0f` → `618a6ef`, 4 commits — two fixes and their
  merges), moving `pw-prove` 0.24.0 → **0.26.0** with `e2e-reviewer` at 1.10.0 and
  `playwright-debugger` at 1.9.0 unchanged. A minor here, because bring-up gains a phase that can
  stop a run and the proof config's `webServer` rule changes shape — what a run *does* changes, not
  just what it repairs. **No description changed on any of the three skills**, so the routing table
  is untouched and nothing re-routes.
- **Bring-up now checks for the browser it will launch.** Playwright's browser binaries are the one
  dependency a package-manager install does not put in `node_modules`, so a repo could pin
  `@playwright/test`, have a complete `node_modules`, pass the config phase, pay a 162-second build,
  and then have every runner invocation exit 2 on `Executable doesn't exist at
  .../chromium_headless_shell-...` — the exact failure the phase split exists to move to the front.
  A **`browser` phase** now sits between `config` and `build` and refuses with **exit 6**, naming
  each chromium binary, the path it looked at, and the install command for the project's own package
  manager. It **refuses rather than installs**: a ~93 MB download is the operator's decision.
  Detection reuses Playwright's own resolution — the project's pinned CLI, found through its package
  `bin`, running `install chromium --dry-run` — and **never `npx playwright`**, which in a directory
  without the runner downloads `playwright@latest`, the auto-install this skill forbids, on exactly
  the repo that lacks it. Installed means Playwright's `INSTALLATION_COMPLETE` marker, not a
  directory, because a directory check is what cannot see an interrupted download. **Three outcomes
  deliberately do not stop the run** — no runner resolvable (greenfield bootstraps one at Step 5b),
  a checker that broke, and a missing bundled ffmpeg (video is evidence, the launch is the proof).
- **The inherited `webServer` is kept or dropped by what answers at its url.** The proof config
  spreads the project's Playwright config, and the spread copies `webServer`; the rule that followed
  was unconditional suppression. That is right for a development server and **inverts wherever the
  inherited entry is the build-and-boot of the proof target itself** — dropping it there does not
  protect the target, it removes it, and the run has no origin at all. The decision now reads on
  what answers at the entry's url, taken in Step 3 from the curl that step already performs. Reading
  the entry's `command` was rejected as a guess about intent on an arbitrary shell string.
- Marketplace mechanics: the pull merged the fork's history (not `--squash`), so the plugin
  manifests survived. Ten conflicts surfaced — `AGENTS.md`, `CONTEXT.md`, `README.md`, two ADRs,
  `scripts/ci/ci-local.sh`, `scripts/ci/test-pw-prove-scripts.sh`, `pw-prove/SKILL.md`, its
  `evals/REGISTRY.md` and `preflight.mjs` — all from a stale merge base, not from local edits: every
  conflicted file on our side was verified byte-identical to the fork at `bc38f0f` before resolving,
  so taking the fork's side is the whole of the change. `make check-e2e-subtree` is green at exactly
  the expected 2 entries after. The Codex manifest was regenerated with
  `scripts/sync_codex_plugins.py`.

## [1.7.1] - Unreleased

### Fixed

- **Subtree pulled from `e2e-fork/main`** (`fd2fceb` → `bc38f0f`, 2 commits — one fix and its
  merge). A patch: it repairs a bring-up input that never worked rather than changing what a run
  proves. **No description changed on any of the three skills**, so the routing table is untouched
  and nothing re-routes.
- **`ENV_CONTRACT` is gone; `REQUIRED_ENV` is the one declaration form.** `ENV_CONTRACT=none` was
  documented as a sentinel in two places and implemented nowhere — `'none'` is truthy, so
  `preflight.mjs` resolved it as a path, found no file called `none`, and exited 1 before the build.
  Following the skill's own runtime-profile template cost a live run its bring-up. The sentinel was
  not implemented; the contract read was deleted instead, because it was the source of a second
  defect too: the valueless-key heuristic over-declared from a **generated** `.env.example` (which
  declares optional keys exactly like required ones) and stopped a real app in 91 ms over 11 keys,
  9 of which it boots without. Recon now names the keys.
- **Three SKILL.md sites that disagreed with each other now say one thing.** The runtime-profile
  template ships `REQUIRED_ENV`, the header-key table's two rows collapse to one, and the Step-3
  invocation names the generated-`.env.example` trap inline. `ENV_FILES` / `.env` — the *supply*
  side, which keeps a key the app provides itself from reading as missing — is untouched, as is
  `APP_ROOT` (it no longer resolves a relative `ENV_CONTRACT`, only `ENV_FILES` / `.env`).
- **The undeclared-config warning now carries the form to paste** (`REQUIRED_ENV="KEY_A KEY_B"`),
  and a missing key reports `declared by REQUIRED_ENV` instead of naming a file. `CONFIG=undeclared`
  still does not read as a pass.
- **`pw-prove` stays at 0.24.0** with `e2e-reviewer` at 1.10.0 and `playwright-debugger` at 1.9.0.
  Not an oversight to correct here: the fork branched this fix off 0.23.1 and bumped to 0.24.0 in
  parallel with the AC-table work that 1.7.0 shipped, so one skill version now covers both changes
  upstream. The marketplace patch bump is what distinguishes them downstream.
- Marketplace mechanics: the pull merged the fork's history (not `--squash`), so the plugin
  manifests survived; the four conflicts — `pw-prove/SKILL.md`, `preflight.mjs`,
  `evals/cases/case-44-config-exit-names-the-key.yaml` and `scripts/ci/test-pw-prove-scripts.sh` —
  were resolved by taking the fork's side, skill bodies being byte-identical on both sides by
  contract. `make check-e2e-subtree` is green at exactly the expected 2 entries. The Codex manifest
  was regenerated with `scripts/sync_codex_plugins.py`.

## [1.7.0] - Unreleased

### Changed

- **Subtree pulled from `e2e-fork/main`** (`e8ddfd3` → `fd2fceb`, 2 commits — one feature and its
  merge). `pw-prove` moves 0.23.1 → **0.24.0**; `e2e-reviewer` stays 1.10.0 and
  `playwright-debugger` stays 1.9.0. A minor, not a patch: what a run **writes into the AC table
  and how it packages the proof** both change shape. **No description changed on any of the three
  skills**, so the routing table is untouched and nothing re-routes.
- **The AC table is written for the reviewer, not for the diff's author.** The AC column is now a
  manual test plan — one user-observable behavior, active voice, what a tester does and sees — and
  it carries **no function, component, file, constant, prop or feature-flag name**; identifiers
  live in the `Changed files` and `Proven by` columns. On-screen text stays, quoted exactly, because
  that is what keeps a scoped condition checkable. Rows merge **by behavior, not by surface**: one
  rule proved on three surfaces is one row naming the surfaces as its condition, and it still films
  three chapters.
- **A row with no observable form is folded, not asserted.** A routing flag's value, a helper's
  return, a constant's default — unit-test material that reached the wrong table. It keeps its row
  with `not user-observable — <where it is proven>` on the same never-silent terms, and it is
  **excluded from `M total`**: it is not a criterion, so nothing can prove it. The report's `ACs:`
  line lists those rows explicitly alongside the gated, carried and already-covered ones.
- **A scope qualifier rides on every row it weakens.** A bound like "a HAR fixture answers the
  write, so persistence past the response is unproven" belongs in that row's Proven-by cell, where
  a reviewer reads it while reading the criterion. A caveat parked below the table qualifies
  nothing.
- **Six ACs fill a recording; the seventh opens the next one.** Step 8 publishes chaptered
  recordings in AC-order batches of six rather than one film per PR, each batch its own manifest and
  its own `publish-proof.mjs` call — nothing in the script changes, and a table of six rows or fewer
  publishes exactly one recording as before. The 64 MiB inline ceiling is now a **second reason to
  split** instead of a reason to truncate: a batch that would exceed it splits at the last AC that
  fits. Truncation survives only for the un-splittable case — a single chapter over the ceiling on
  its own — and still declares itself in both the report and the manifest's `spec` field.
- **One PR comment carries every recording's `/share/<id>` link**, listed above the table in AC
  order, with each row naming its recording and timestamp as plain text (`clip 2 · 1:47`).
  `/embed/<id>?t=` URLs stay out of the comment, unchanged: GitHub unfurls them into a video player
  that buries the AC text. Supersession is now per **comment**, so it retires all of that comment's
  links at once.
- **The PROVES header inherits Step 2's phrasing contract.** A **Then** that names an identifier is
  rewritten to what a tester sees *before* it is quoted into the header, and the table or plan is
  corrected to match, so header and source stay word-for-word identical — which is what the Step 6
  audit reads.

## [1.6.1] - Unreleased

### Fixed

- **Subtree pulled from `e2e-fork/main`** (`256f761` → `e8ddfd3`, 2 commits — one fix and its merge).
  `pw-prove` moves 0.23.0 → **0.23.1**; `e2e-reviewer` stays 1.10.0 and `playwright-debugger` stays
  1.9.0. A patch: it repairs the command 1.6.0 introduced, and **no description changed on any of
  the three skills**, so nothing re-routes. Step 7's PR spec-set resolution used
  `-- '<testDir>/**/*.spec.*'`, which **looks like a glob and is not one** — git's default pathspec
  mode is not glob mode, so `**/` demands a subdirectory most projects do not have, and a flat test
  dir matched nothing. Measured against the 7-spec PR the 1.6.0 feature was written for, the
  pathspec form returned **0** and the replacement returns **7**. It now pathspecs the directory and
  filters by extension afterwards (`-- '<testDir>' | grep -E '\.(spec|test)\.[cm]?[jt]sx?$'`).
  The failure mode is exactly the one 1.6.0 existed to remove — an empty set films an empty set and
  says nothing about it — so **an empty result is now a stop**, naming its two causes (a wrong
  `<base>`, or a `<testDir>` that is not where the specs landed), rather than a filming instruction.

### Changed

- **e2e plugin author corrected to `sonhyrd`.** The three published manifests — `.claude-plugin/marketplace.json`'s `e2e` entry, `plugins/e2e-skills/.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` (both its `author.name` and `interface.developerName`) — still credited `voidmatcha`, the pre-fork upstream, which is who wrote the skills but not who publishes this bundle. All three are marketplace-only files the fork does not ship, so the change is invisible to `check-e2e-subtree.sh`'s divergence set (still green at exactly 2 entries). **Upstream attribution is untouched on purpose**: `README.md`'s Apache-2.0 notice, `AGENTS.md`, and `playwright-debugger`'s `metadata.author` stay as they are — the licence requires the first and the last is byte-identical subtree content whose edit would register as an unexpected divergence.

## [1.6.0] - Unreleased

### Changed

- Subtree pulled from `e2e-fork/main` (`6963cad` → `256f761`, 2 commits — one feature and its
  merge). `pw-prove` moves 0.22.0 → **0.23.0**; `e2e-reviewer` stays 1.10.0 and
  `playwright-debugger` stays 1.9.0. A minor, not a patch: what a run **films, publishes and
  reports** changes shape. **No description changed on any of the three skills**, so the routing
  table is untouched and nothing re-routes.
- **The proof describes the PR, not the run that produced it.** A branch proven across several
  pw-prove runs used to deliver a page holding only the latest run's chapters, with every run's
  report correct about itself and wrong about the PR. Three rules fix the denominator: an AC an
  earlier run proved is **`carried`**, it keeps its row in the Step-2 AC table, and that row count
  is the only source of the run's `M total`. Step 2 derives against the **PR's whole diff**, never
  this session's commits.
- **Step 7 films the PR spec set.** The set is resolved mechanically — `git diff --name-only
  <merge-base>...HEAD -- '<testDir>/**/*.spec.*'` plus the spec this run wrote — so no judgement
  call reintroduces the drift, and Step 4's Assumptions block states it in the plan rather than
  surprising the operator at minute fifty. A **carried spec that goes red is a finding**, not a
  spec to heal: loosening its assertion to get green deletes the guard that just caught a
  regression.
- **The mutation check deliberately stays narrow** — this run's new scenarios only, because
  re-deriving a carried verdict costs a forced-no-reuse rebuild each (~635s). The run now carries
  two scopes on purpose: *filmed* is the PR spec set, *mutation-verified* is the delta. A re-film
  that wrote no new scenario reports `Mutation: carried (no new scenario this run)`.
- **The `ACs:` report line states three numbers** — new, carried, total — and a bare `N of M` is
  no longer a valid form of it. That single number is exactly how a run's delta got read as the
  PR's total.
- **Two publishing rules.** A joined film over `publish-proof.mjs`'s **64 MiB inline ceiling** now
  truncates from the end of AC order and declares the omission in both the report's `Proof page:`
  line and the manifest's `spec` field, rather than gating into publishing nothing — a hazard two
  chapters never reached and a PR-wide set does. And the `spec` field, which is the description a
  reviewer reads, must say the suite is **HAR replay**, so nobody reads the film as proof of a
  backend.
- **A new proof page supersedes the previous one.** The new PR comment opens with `Supersedes
  <url>` and the earlier comment is edited in place to carry `**Superseded by <link>**`, so a
  reviewer scrolling the thread does not meet the oldest partial film first. Only comments this
  skill authored are edited.
- Eval surface: `case-63-report-states-pr-total` and its judge assert the report's three numbers,
  with a must-PASS twin that names the delta in order to reject it. Upstream marks the case
  *authored and validated, not yet characterized*.
- The pull is `--squash`, as every pull of this prefix since the 1.0.0 graft has been, and it
  deleted `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` again — the fork ships
  neither and they are the entire expected divergence, so restoring them is a step of the
  procedure. `make check-e2e-subtree` is red at exactly those two entries until the restore and
  green after. The Codex manifest was regenerated with `scripts/sync_codex_plugins.py`.

## [1.5.0] - Unreleased

### Changed

- Subtree pulled from `e2e-fork/main` (`d701b50` → `6963cad`, 2 commits — one feature and its
  merge). `pw-prove` moves 0.21.0 → **0.22.0**; `e2e-reviewer` stays 1.10.0 and
  `playwright-debugger` stays 1.9.0. A minor bump, not a patch: `pw-prove` now **refuses work it
  used to do badly**, which is behaviour a user observes on their first heavy session. **No
  description changed on any of the three skills**, so the routing table is untouched and nothing
  re-routes.
- **`pw-prove` refuses to start above 100k tokens of context.** Invoked deep into a long session
  it stops before Step 1, names the size it measured against the threshold, and gives the exact
  invocation to paste into a fresh session — a refusal costs one message and no work. A calling
  skill's own confirmation question cannot spend the gate: that question is about *proceeding*,
  never about *where*, so only the user, in their own words, continues the run. This is the
  change most likely to surprise: a skill chained from `sss:pr-review` mid-session will now
  decline where it used to deliver, and the fix is in the caller. Upstream `docs/adr/0019`
  carries the reasoning and the measurement — a traced 144-minute session whose pw-prove segment
  opened at 196k and lost two instructions it had demonstrably read.
- **Step 7 audits before it films.** An un-clipped, un-dwelled *audit run* now produces the
  traces the hermetic audit classifies and carries the whole heal loop; the filming run comes
  after, so a hermetic finding can no longer invalidate footage already shot. Cheap because
  `trace: 'on'` is in the proof config regardless of `PW_PROVE_CLIP`. The third-party block list
  is seeded from the recon HAR, as an optimisation only — the audit still fails on any LIVE call
  missing a `// CARVE-OUT:` line. Upstream `docs/adr/0020`.
- **The mutation check's revert stops rebuilding.** The source is reverted unconditionally and
  the artifact is marked *stale*; the rebuild is paid by whichever later step next needs the
  server, and Step 8 hygiene stops a stale server rather than rebuilding it. The completion
  report's `Preview server:` line gains the artifact state, so a reader can tell whether the
  build on disk matches the source.
- **`probe.mjs start` self-daemonizes**, returning once the socket answers instead of running the
  daemon in the foreground until its idle timeout. A second `start` against a live daemon is a
  no-op that says so and exits 0 rather than exit 1. Because the daemon is now detached, the HAR
  scrub verdict — including the `probe: REFUSED` that decides whether a recording may be
  committed — comes back over the `close` call rather than into a log nobody watches.
- Two smaller rules: the preview server is stopped by a **recorded PID** rather than a `pkill -f`
  whose pattern matches the shell issuing it, and a dwell on a **transient payoff** (a toast, an
  auto-dismissing banner) sits immediately after its assertion so the element is still on screen
  in the held frame.
- Eval surface: `case-20` was **re-derived end to end** — its premise (recommend a fresh session,
  then continue inline) is what the gate retired — and its registry row is labelled
  *re-characterization owed*, because a 3/3 measured against a retired premise is not evidence
  about the new one. `case-52` was **split rather than widened**, with the new lazy-rebuild guard
  filed as `case-62`, quarantined pending characterization; splitting kept `case-52`'s recorded
  2026-08-14 must-PASS fixture valid instead of editing a real answer to match a new rule.
- The pull is `--squash`, as every pull of this prefix since the 1.0.0 graft has been, and it
  **deleted `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` again**, restored in a
  follow-up commit. Same mechanism as 1.4.0: the fork ships neither, they are the entire expected
  divergence, and a squashed pull merges the fork's tree. `make check-e2e-subtree` is red at
  exactly those two entries until the restore and green after — verified both ways here.

## [1.4.0] - Unreleased

### Changed

- Subtree pulled from `e2e-fork/main` (`3f2b418` → `d701b50`, 2 commits — one feature and its
  merge). `pw-prove` moves 0.20.0 → **0.21.0**; `e2e-reviewer` stays 1.10.0 and
  `playwright-debugger` stays 1.9.0. A minor bump, not a patch: `pw-prove` gained behaviour a
  user will observe. **No description changed on any of the three skills**, so unlike 1.3.0 the
  routing table is untouched and nothing re-routes.
- `pw-prove` **writes back what a run learned about the repository**, so a fact outlives the
  session that paid for it — the read side of this landed in 1.3.0's Step 1, and this is the write
  side that fills it. A new eval case (`b06-profile-contradicted-written-back`) and its judge
  guard the case that matters: a run whose evidence contradicts an existing profile entry must
  correct the entry, not merely report the contradiction and move on.
- The pull is `--squash`, as every pull of this prefix since the 1.0.0 graft has been.
- **The pull deleted `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` and they were
  restored in a follow-up commit.** This is not a surprise and not a conflict: the fork ships
  neither file, they are the entire expected divergence, and a squashed pull merges the fork's
  tree — so it removes both every time. Restoring them is a step of the pull. `make
  check-e2e-subtree` is red at exactly those two entries until it happens, and green after.
- Verified after the pull rather than assumed: `make check-e2e-subtree` reports the expected
  two-entry divergence, no skill in the subtree carries `disable-model-invocation`, and all three
  on-disk skills are declared in `plugin.json`.

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
