# Handoff — pw-prove clips publishing: cut the config surface

**Date:** 2026-08-04
**Next session focus:** make the pw-prove → Clips publish path work with *less configuration*, so a run
stops silently ending at `Proof page: skipped`.

## Where this came from

Session `bb187b57-f7a4-4143-82db-6ec0736003a5`
(`~/.claude/projects/-home-orca-work-hyrd-widget/bb187b57-f7a4-4143-82db-6ec0736003a5.jsonl`) ran
`/e2e:pw-prove` against `hyrdrocks/hyrd-widget` PR #813. The proof itself succeeded — 7/7 scenarios
green, mutation went RED, spec committed as `102bd7fe` on `sss/start-job-page-interface-pass`, PR
comment posted. **No test work is outstanding.**

What failed is delivery: the publish step never executed.

## The diagnosis (already done — don't re-derive)

`PROBE_HOSTING=1 preflight.mjs` reported `HOSTING_READY=no` at minute zero, so Step 8 skipped before
calling `publish-proof.mjs`. Three WARNs:

1. `ffmpeg`/`ffprobe` not on PATH — hard blocker, `publish-proof.mjs` exits 4 without them.
2. Publish credential not configured — no `CLIPS_*` env, no `~/.config/pw-prove-clips.env`.
3. Chrome not found — cosmetic for this spec (bundled Chromium lacks a PDF viewer and some codecs).

Then the Step-9 hygiene sweep ran `rm -rf test-results`, deleting all 7 `video.webm` clips. There is
no `$KEPT` fallback file, because that only exists on an *undelivered publish* (exit 0, empty
`$PAGE`) — not on a pre-call skip. This was **not** a gate (exits 3/6/8/9).

Machine state confirmed at the time of writing: no `ffmpeg`, no `ffprobe`, no Chrome, no credential
file, no `CLIPS_*` in the environment.

## The config surface to attack

Authoritative source — read these, don't work from this summary:

- `plugins/e2e-skills/skills/pw-prove/scripts/clips.mjs` — the only place
  that knows how to reach Clips. Header comment explains *why* each variable exists and is not
  defaulted. `CLIPS_VARS` is the complete list.
- `.../scripts/preflight.mjs` — the `PROBE_HOSTING` block, `HOSTING_READY` / `PUBLISH_READY` /
  `VIDEO_TOOLING` conjunction (~lines 120–200).
- `.../scripts/publish-proof.mjs` — ffprobe/ffmpeg use, gate exits.
- `.../SKILL.md` Step 8 (~lines 500–560) — the manifest, the three outcomes table, `docs/adr/0012`.

Five required variables today, none defaulted: `CLIPS_ORIGIN` (must equal the deployment's own
`APP_URL`), `CLIPS_A2A_SECRET`, `CLIPS_ORG_ID`, `CLIPS_ORG_DOMAIN`, `CLIPS_SUBJECT` (an email that is
already a member of that org). Values live in the Clips deployment's `org` row — same Agent Native
org schema Dispatch reads in `paul-dispatch-app `server/lib/org-apps-directory.ts``.

The design rationale for *not* defaulting is real and documented in `clips.mjs`: a guessed org id or
subject mints a token that travels the whole way and is refused remotely with a bare 401/403, hours
from where the mistake was made. **Any simplification must not reintroduce that failure mode** —
prefer deriving values from an authenticated source over guessing them.

## Candidate directions (unvalidated — the next session should evaluate, not assume)

- **Derive the three identity values from one.** `CLIPS_ORG_DOMAIN` selects which org's secret the
  receiver tries; `CLIPS_ORG_ID` is the org the import runs under; the receiver already refuses
  unless the domain owns the id. If the deployment can resolve id-from-domain (or expose a
  `whoami`-style lookup for a valid secret), the operator could supply origin + secret + subject and
  let the rest be fetched — an authenticated lookup, not a guess.
- **Make the receiver's 401/403 self-describing.** The stated reason for five explicit variables is
  that remote refusals are opaque. If the Clips side named which of domain/id/subject was wrong, the
  argument for hand-supplying all of them weakens considerably.
- **Fix the sweep-before-publish ordering.** Independent of any config change: when
  `HOSTING_READY=no`, `test-results/` should be preserved instead of swept, so clips stay
  recoverable. This run lost 7 webms to a skip that was known at minute zero. Cheapest win here.
- **ffmpeg/Chrome provisioning.** Consider whether the skill should ship an install-check remedy
  (the repo's `/watch` skill has a `setup.py` precedent) rather than a WARN the operator must act on.

Note the ownership boundary: `pw-prove` lives in this repo (`plugins/e2e-skills/`), the Clips
deployment is not checked out on the machine this was written from. Changes may span two repos, and the Clips side may
not be editable from here — check before planning work that assumes it is.

## Recovering the lost clips (if a link is still wanted for PR #813)

Spec is already pushed, so this is a re-record only. Start the dev server on 4110
(`BUILD_ENV=staging VITE_CONFIG="{configFile:'vite.config.start-ssr.ts'}" pnpm exec vike dev --host
localhost --port 4110 --mode staging`), then:

```bash
SPEC_BASE_URL=http://localhost:4110 PW_PROVE_CLIP=1 PW_PROVE_W=1600 PW_PROVE_H=900 \
  npx --no-install playwright test tests/e2e/start-palette-layout.spec.ts \
  --project=chromium --workers=1 --config playwright.proof.config.ts --reporter=list
```

Then the Step 8 manifest + `publish-proof.mjs`. Two traps that have already bitten: read the URL via
`sed -n 's/^PWPROVE_URL //p'` (never `head -n1` — ffmpeg chatter takes line 1), and branch on the
**exit code**, not on an empty `$PAGE`. Publish *before* the hygiene sweep.

## Constraints carried from this session

- No credentials were obtained, written, or seen. `~/.config/pw-prove-clips.env` does not exist on
  this machine. Nothing in this document is secret; do not paste real secret values into any handoff,
  commit, or PR comment.
- `~/work/hyrd-widget` tree was left clean; dev server on 4110 was stopped.
- Ports 4100/4101 held stale sibling servers returning HTTP 500 — use 4110 via `SPEC_BASE_URL`.

## Suggested skills

- `matt:codebase-design` — the core question is a seam/interface one: how few inputs can `clips.mjs`
  take while keeping failures diagnosable locally. Load this before proposing an API shape.
- `sss:config-schema` — directly on point for auditing which env keys are actually read, killing dead
  ones, and making missing config fail loudly with every missing key named at once.
- `matt:grilling` — worth one pass on any proposed reduction, because the current five-variable design
  is a deliberate response to a real remote-401 debugging cost. A simplification needs to survive that
  argument, not ignore it.
- `matt:diagnosing-bugs` — only if the publish path turns out to fail *after* config is supplied
  (gate exits 3/6/8/9, or a 401/403 from a correct-looking credential).
- Skip `e2e:pw-prove` unless a fresh proof run is actually wanted; the spec work is done.
