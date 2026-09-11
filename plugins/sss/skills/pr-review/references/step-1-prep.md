# pr-review — Step 1 reference: Prep

Moved verbatim from `SKILL.md`, whose Step 1 says when to read it. Nothing here changes the procedure `SKILL.md` states.

A track that never sees another track's findings cannot be talked out of its own. Where two or more land on the same defect, that agreement is the strongest signal in the report — and in Step 4 it is what decides which fix lands first.

Tracks are concurrent and never merged; stages are serial and share one context and one working tree. Steps 1-3 are the read stage; every step after them writes — Step 4 fixes, Step 5 syncs, Step 6 proves. **Step 1 moves the tree to the PR head**, so every stage after it reads and writes the same files the tracks read. Where it cannot, it stops the run there rather than reporting on a tree the fixes could never reach. Step 5 is conditional on top of that, and in a repo with no translation config is simply not there. One `BASE`, resolved in Step 1, holds from the first step to the last. See `CONTEXT.md`.

Run this in the parent, before anything spawns. Its output is a set of **findings** the two skills verify on arrival rather than rediscover — one resolved `BASE` shared by all four tracks is what makes their reports comparable.

### Preflight — what this run needs to finish

**Every prerequisite is checked here, before the tree moves and before a track spawns, and a missing one stops the run.** Two of the four stages are only as strong as the tools underneath them: without `ocr` the review loses one of its axes, and without a working `orca` CLI the proof never runs. A run that degrades around either still closes looking complete — a three-track report and an unspawned proof read exactly like a finished review — and that is the outcome this gate exists to prevent.

Then resolve the Orca CLI. **Preference orders the candidates; evidence selects one.**
`sss:autoship` owns this idiom (`reference.md`, section "Orca orchestration") and
`scripts/check-orca-cli.sh` in the marketplace repo asserts it — this is the same resolution against the command this skill actually calls:

**`ocr` reports its version, and presence is the gate.** Below v1.9.3 `sss:ocr-delegate` parses text where it would otherwise parse JSON, and that still produces a full OCR track — a different path to the same axes, not a degraded review. So an old `ocr` passes preflight and the report says which path ran; only an absent one stops the run.

**An empty `$ORCA` stops the run**, naming which of the two were on `PATH`. Where Orca ships as an AppImage, `orca` on `PATH` is the desktop launcher (`.../squashfs-root/AppRun`) and `orca-ide` beside it is the CLI; the launcher accepts every subcommand, prints Electron startup noise, and answers nothing — so a run that calls it concludes Orca is unavailable on a machine where Orca is running fine, loses the proof stage, and blames the box. `orca-ide --help` prints its own usage as `orca <command>`: the two names are one tool.

**A name that answers is the only evidence that counts.** Preference is a guess about which name is the CLI — inverted inside an Orca-managed pane, where `orca` is — and the launcher's exit 0 is exactly what makes a guess unfalsifiable. Requiring `worktree --help` to print its usage line is what settles it. Use `$ORCA` at every later Orca call in this skill, Step 6c's spawn included.

**The Orca probe passes on parsed JSON, never on an exit code.** Read `ok` and `result.worktree` out of what it printed. Anything else — empty output, Electron noise, an HTML error page — is a failed preflight whatever the exit status was. Exit codes are what made this class of failure invisible: the launcher exits non-zero for reasons of its own, and a wrapper can exit zero having done nothing, so neither value separates a working CLI from a silent one. The JSON does.

| Missing | Command |
|---|---|
| `ocr` | `npm install -g @alibaba-group/open-code-review@latest` |
| the Orca CLI | `/sss:claude-settings` — it deploys the shim that makes `orca` resolve |
| `gh` or `git` | this platform's package manager |
| the `matt` or `sss` plugin | `claude plugin install <name>@sss-marketplace`, then restart Claude Code |
| the `pw-prove` skill (`~/.claude/skills/pw-prove/SKILL.md`) | `teamai pull` — it installs the skill from `sonhyrd/agent-kit` — then restart Claude Code |
| the `ponytail` plugin | `claude plugin marketplace add DietrichGebert/ponytail` then `claude plugin install ponytail@ponytail`, then restart Claude Code |

`/sss:claude-settings` provisions everything but `pw-prove` (that is `teamai pull`) in one pass, and is the answer to give when more than one line is missing.

**Preflight reports, and provisioning is `/sss:claude-settings`'s job.** The stop names the fix and routes there; this skill runs no `npm install`, and no `orca repo add`. A review that reconfigures the machine on its way to reviewing a PR owns every side effect of that repair for the rest of the run — which is a larger promise than a review should make, and the reason repair lives in a skill the user invokes on purpose.

**Preflight runs ahead of the tree acquisition** so a stop costs a message and leaves the checkout exactly where the user left it. Everything below needs `gh` and `git` in its first line anyway; a run that cannot finish should never have moved the tree to find out.

**Both ends resolve to SHAs before the tree moves**, so a bad ref stops the run with the tree where the user left it. There is no `git pull` in this stage: `fetch` plus a SHA is the whole resolution.

**The stacked probe is conditional on the default branch.** `baseRefName` may itself be an open PR, and then `BASE` sits off the default branch. Look that branch up — it is not always `main` — and run `gh pr list --head <baseRefName>` only when `baseRefName` differs from it. Aimed at the default branch the probe returns nothing and reads as *not stacked* by accident. An open parent PR goes in the provenance line's stack clause; the merge-base arithmetic is unchanged either way.

**Each guard names one thing `switch -C` would destroy**, which is why there are three: `-C` resets an existing local branch of that name.

- **Guard 1 — a dirty tree.** Uncommitted work stays exactly where the user left it: never stashed, never reset, never carried across into a review of files the PR does not contain. **The stop names the two routes back** — stash or commit the edits and re-run, or review the PR from a separate worktree so this checkout is never touched. Whose hands the stash is in is the whole distinction: the user popping their own costs them one command, where this skill holding it would own restoring that state across four stages and `pw-prove`'s push.
- **Guard 2 — `fatal: '…' is already used by worktree at '…'`, caught before it fires.** The ordinary Orca case, a review in a fresh worktree while the branch is live in the main clone. Only *another* worktree counts; the branch already being current here is the success path.
- **Guard 3 — unpushed commits.** A non-zero count is work `-C` would strand. The command failing means no such branch, which has nothing to lose.

**A failed guard prints the provenance line, then stops the run** — naming the guard and the corrective action, `re-run from <that worktree>`. No track spawns, no file is written, the tree does not move. The guards sit ahead of the Step 2 fan-out, so the stop costs a message and nothing else, and the write stages are never reached. The cost is stated rather than softened: on a guard failure there is no report at all until the user re-runs from a usable tree.

Four fields in PR mode, and **every SHA is the full 40 characters, never abbreviated** — a 40-character string gets copied where a 9-character one gets retyped, and one transposition survived into a track prompt and cost that track its base. `TREE` is whatever `git rev-parse HEAD` returned, so the verdict `tree at PR head` is a conclusion the reader draws from two printed SHAs rather than a claim to take on trust. The stack clause appears only where the probe found an open parent PR. Branch mode fills the same slots with what it has: `BASE=<40-char> (user-named fixed point 'main') · HEAD=<40-char> · branch mode`. One line, printed before the fan-out, is the point: four tracks reading a base nobody printed is how a wrong one survives to the end of a run.

No file, and the first finding is false and the second does not need asking. Otherwise read `localesDir` out of what it printed — the config is a handful of keys, so read it rather than shelling out to a JSON parser this skill would then depend on — and resolve the directory the way `translation-sync` Step 2 does: `localesDir` if it is set **and exists on disk**, else the first of `i18n/locales`, `app/locales`, `locales` that does. Only once that resolved to a real directory:

Any output at all and the second finding is true. Do not run it with `$DIR` unset: git rejects an empty pathspec outright, and this line failing would be indistinguishable from the failures that are meant to stop the run. A config present but naming no resolvable directory is simply the second finding false — the sync has nowhere to read from.

Done when preflight has passed, the tree is acquired, seven findings are in hand, and the provenance line has been printed: the resolved `BASE` SHA, `HEAD_SHA` and the `TREE_SHA` read against it, a non-empty diff, the spec source (the PR body plus any issue it closes, fetched with `gh` — or "none" in branch mode), whether `.github/hyrd-trans-bot.json` exists at the repo root, and whether the diff touched locale JSON under the directory it resolves to. A missing prerequisite, a bad ref, an empty diff or a failed guard stops here, naming which one failed. Neither sync finding stops the run; the two of them decide whether Step 5 exists.

**Preflight is a gate and the sync checks are findings, and the difference is what each one decides.** A gate decides whether the run happens at all; a finding decides the shape of a later stage. `ocr` and the Orca CLI moved from the second kind to the first because a run without them cannot reach full strength — and the two of them used to be findings, which is exactly how a run once lost the OCR track and the proof and closed as though it had neither.
