# pw-prove — Step 8 reference: Deliver (PR-mode tail)

Moved verbatim from `SKILL.md`, whose Step 8 says when to read it. Nothing here changes the procedure `SKILL.md` states.

PR-mode owns its tail; a proof ending with uncommitted tests or unposted clips is not delivered. Coverage/target mode: skip to item 5 (report only). **Step 8 is reached only after a green proof run** — a run that took the Step-7 handover stop never arrives here, and in particular never reaches the commit and push below: the spec it holds is failing, and it travelled in the handover comment instead. Run in order:

1. **Publish the PR's proof as chaptered recordings, six ACs to a recording.** Find the per-test webms under `test-results/**/*.webm` — the filming run wrote one per scenario of the **PR spec set**, so carried scenarios stand there beside this run's — and map each to the AC it proves. A chapter for a scenario an earlier run wrote is indistinguishable from one this run wrote, which is the point: a reviewer reads the proof without knowing the branch's session history. Write a manifest, then hand the whole run to `publish-proof.mjs`: it probes and gates every clip, joins them by **stream copy** into one video, and POSTs the whole thing to Paul Clips in one authenticated JSON-RPC call, returning one `https://clips.paulsjob.ai/share/<id>` link. Each clip becomes a **chapter** on the scrubber: the scenario name is the marker label, because a label renders as a tooltip-sized space, and the AC verbatim lands as a timestamped comment beneath it, where a sentence has room to wrap. **N clips, one link** — a reviewer opens one URL and watches the whole proof as one pass.

   **Six ACs fill a recording; the seventh opens the next one.** Batch the AC table's rows in **AC order**, strictly by count — ACs 1–6 to recording 1, 7–12 to recording 2, and on for as many as the table holds. AC order is already chapter order, so a reviewer can derive the boundary from the table and check that they were sent to the right film. Each batch is its own manifest and its own `publish-proof.mjs` call, so N recordings costs N invocations and nothing in the script changes. A run whose table fits in six rows publishes one recording, exactly as before.
   ```bash
   cat > /tmp/pw-prove-manifest.json <<'JSON'
   {
     "title":    "PR #<N> — <change in a phrase>",
     "prUrl":    "<PR url, or omit to let gh resolve it>",
     "spec":     "<the PR spec set> — hermetic, HAR replay (carve-outs: <none | the declared list>)",
     "mutation": "RED — <the mutation that turned it red> | unguardable at <layer>",
     "clips": [
       { "ac": "<AC verbatim>", "scenario": "<the test's title>", "file": "test-results/<...>/video.webm" }
     ]
   }
   JSON
   # The manifest path is the ONLY argument — Clips assigns the identifier, so there is no project
   # folder and no key prefix to pass. Configuration is ONE environment variable, CLIPS_MCP_TOKEN:
   # an opaque bearer the Clips deployment minted, carrying its own destination (`aud`), subject and
   # organization, so nothing else is configured. It is long-lived and individually revocable — it is
   # NOT minted per publish and it is not scoped to this one action — so a machine connects ONCE and
   # every later run leases the same credential.
   # Lease it into the child process for the call. Never export it into a shell, and never write it
   # where the scripts could find it on their own: the scripts read the variable out of their own
   # environment and spawn nothing, so the lease is the only way in.
   #   agent-native vault exec --app <the workspace vault app> --key CLIPS_MCP_TOKEN -- node …
   # Unset on this machine? Do not guess the app name — Step 3's PROBE_HOSTING warning already
   # printed the exact command for this workspace, and pasting it is the whole fix.
   # (PW_PROVE_CLIPS_ENDPOINT overrides the endpoint for a self-hosted deployment. It is a test knob,
   # not a second credential.)
   # BEARER + SCAN protect the PUBLIC recording — the gate greps the webm bytes AND the chapter
   # titles / description for the token. Prefer programmatic auth (Step 3) so no credential ever
   # enters the frame; a recorded UI login would trip it.
   # Read the PWPROVE_URL MARKER, never `head -n1`: npm/ffmpeg chatter lands on line 1 the moment
   # anything merges the streams, and a run has already lost five URLs to exactly that.
   # Read the BODY, never the status: A REFUSAL ARRIVES AS HTTP 200. Once authentication resolves,
   # every failure — an action absent from this token's callable catalog, rejected arguments, an
   # import the far end declined — comes back 200 with the failure written in the body, so a check
   # keyed on the status code passes vacuously and the run reports a proof it never published.
   # Authentication is the ONE exception: a refused credential is a genuine 401 whose body is not
   # JSON-RPC at all, with no `result` to reach for. Two shapes, and code that handles only one is
   # broken in a way that looks fine. `clips.mjs` classifies by parsing; do not re-derive an outcome
   # from `res.ok` here, and do not read $RC below as though it were an HTTP status.
   # Run the invocation below UNDER THE LEASE — prefix it with the `agent-native vault exec … --`
   # line above. Unwrapped, CLIPS_MCP_TOKEN is absent and the publish stops at exit 1 (configuration)
   # before a byte moves, which the case statement below reports on the `*)` branch.
   BEARER="${AUTH_TOKEN:-}" SCAN="<generated-spec-file>" \
     node <skill-base>/scripts/publish-proof.mjs /tmp/pw-prove-manifest.json \
     >/tmp/pw-prove-publish.out 2>/tmp/pw-prove-publish.log
   RC=$?
   PAGE=$(sed -n 's/^PWPROVE_URL //p' /tmp/pw-prove-publish.out | head -n1)
   KEPT=$(sed -n 's/^PWPROVE_PROOF_FILE //p' /tmp/pw-prove-publish.out | head -n1)
   # Branch on the EXIT CODE, not on an empty $PAGE — 0-with-no-URL and a gate are different outcomes.
   case "$RC" in
     0) [ -n "$PAGE" ] && echo "published: $PAGE" \
          || echo "UNDELIVERED — attach by hand: $KEPT"; tail -5 /tmp/pw-prove-publish.log ;;
     *) echo "GATE (exit $RC) — nothing published, no file offered:"; tail -20 /tmp/pw-prove-publish.log ;;
   esac
   ```
   **Three outcomes, and they are not interchangeable — read the exit code, not just `$PAGE`:**

   | Outcome | Looks like | What to do |
   |---|---|---|
   | Published | exit 0, `$PAGE` set | Report the share link and its per-AC timestamps. |
   | **Undelivered** (transport/credential: 500, refused connection, rejected token) | exit 0, `$PAGE` empty, **`$KEPT` set** | The run **stays alive** — a run never fails over undelivered evidence. Attach `$KEPT` to the PR by hand, and report `Proof page: skipped — <the failure, verbatim from the log>` with `Kept locally: $KEPT`. |
   | **Gated** (3 empty recording · 6 token leak · 8 homogeneity · 9 duration reconciliation) | exit 3/6/8/9, no `$PAGE`, **no `$KEPT`** | Nothing was published and **no file is offered** — the artifact is *wrong*, not merely undelivered. Report **which** gate fired from the log and fix the cause; never re-run the publish before reading why. |

   Never conflate the last two: an empty `$PAGE` alone does not say whether the proof is undeliverable or wrong.

   Gate exits: empty recording (3), token leak (6, widened to the title, description and chapter titles), homogeneity (8, mismatched codec/dimensions — stream copy would corrupt the video *without failing*), duration reconciliation (9). Exit 1 is usage/manifest/configuration, exit 4 is the video tooling. A gate that trips on any clip **aborts the whole recording** — a proof with a hole in it is worse than none. A publish-not-ready environment (Step 3 `PROBE_HOSTING` reported `HOSTING_READY=no`) skips before the call altogether: `Proof page: skipped — publish prerequisites not ready` with the probe output pasted beneath. That is a third skip cause, not a gate — never fail the run over a missing link.

   Clip order in `clips[]` is the order a reviewer watches, so it is the **AC order**, not the order `test-results/` happened to list — it is chapter order, and the script prints each chapter's deep link on stderr.

   **Over the inline ceiling, split again.** `publish-proof.mjs` refuses a recording above its 64 MiB inline ceiling and publishes no page at all. Size is a second reason to open a new recording, so a batch that would exceed the ceiling splits at the last AC that fits and the rest start the next one — the film keeps every scenario, and only the packaging moves. **Truncation is the last resort, for the un-splittable case only:** one AC whose own chapter exceeds the ceiling on its own. Then drop that scenario and name the omission in two places — the report's `Proof page:` line (`N chapters, M omitted for size: <scenario names>`) and the manifest's `spec` field, which is what the description shows a reviewer. A truncated film that declares its truncation is evidence; a gated one is nothing. The script's gate is unchanged — this is the skill choosing what to hand it.

   **The `spec` field is the description a reviewer reads**, so it carries the two facts the footage cannot show: that every scenario replays a recorded HAR fixture — so the film proves the frontend's read and write shapes, and a reviewer who concludes the backend is proven has been misled — plus each declared carve-out, plus any truncation above.
2. **Hygiene sweep** before staging:
   - Delete `test-results/`/`playwright-report/` litter (and the mutation run's isolated output, which the mutate summary names as `output` — read it there rather than reconstructing the path), plus any legacy throwaway `.pw-prove.proof.config.*` left by an older run. **Keep `playwright.proof.config.ts`** — it is a deliverable, not litter; stage it when this run created it. Publish before deleting `test-results/`: the clips live there.
   - **Never delete the kept proof file** (`$KEPT`, i.e. `$TMPDIR/pw-prove-proof.webm`) when the publish came back undelivered. It is the only remaining copy of the evidence and the operator has been told to attach it — sweeping it away deletes the fallback moments after it was created. It is litter only once the run has published (`$PAGE` set) or a gate withheld it, and the script already removes it in the gate case.
   - **Stop the preview server if this run started it** (Step 3) — `kill <the recorded PID>`, then `kill -0 <pid>` to observe it gone; after a mutation check the recorded PID is that verb's `server.pid_after`, which leads its own process group, so stop it with `kill -- -<pid>` — and say so in the report: `Preview server: stopped (port <N>)` — or `left running (pre-existing)` when it was already up. Keep it running only if the user asked. A **stale** artifact needs no rebuild on the way out: stopping is the last thing that touches this server. Read `.pw-prove/artifact-stale` for the report's artifact state, then delete it — a marker outliving its run makes the next run's first build unconditional.
   - Revert codegen churn (`git checkout -- '**/auto-imports.d.ts' '**/components.d.ts'` on Nuxt-style repos).
   - **Prove the HAR is clean — do not confirm it, run the refusal:**

     ```bash
     node <skill-base>/scripts/har-scrub.mjs <testDir>/<feature>.api.har --verify
     ```

     Exit 0 stages it. **Exit 3 is a HARD STOP:** residue survived, the script names each location (never the value), and the HAR must not be staged — re-run `har-scrub.mjs` over the file, then verify again. A leaked bearer in a committed HAR is the same incident as one in a log line, so it is held by a gate here, exactly like the clip audit, the hermetic audit and the publish token grep. The scrub itself already happened at capture; this is the check that it held.

     **Exit 6 is a HARD STOP in the other direction:** the recording was destroyed by its own scrub. A learned value also occurred inside ordinary content, so the substitution replaced the application rather than the credential — the refusal names the placeholder and its occurrence count. Do not repair it by hand and do not commit it: re-record the recon pass. This is a separate exit code because over-scrub is invisible to a residue check, and a shredded 9.1 MB capture once verified *clean*.
   - **Append what proving taught to `.pw-prove/profile.md`** — gated routes, the HAR's scope, a carve-out this repo forces — under the admission test in [Step 1](step-1-dispatch.md#the-run-writes-the-profile-back), then stage it by exact path: `git add -f .pw-prove/profile.md`. The forced add is load-bearing: `.pw-prove/` is excluded, an exclude hides untracked files, and without `-f` a first-ever profile is committed by nothing and silently lost.
   - What remains staged is exactly the spec + POM + scrubbed `api.har` (+ shared helper if written), in the conventional test dir — never shadowing a route dir — plus `playwright.proof.config.ts` on the run that created it, plus `.pw-prove/profile.md`.
3. **Commit** to the PR branch: `test(e2e): prove PR #<N> — <short scenario list>`. The Step 3 base-merge commit rides along.
   - **A `HEAD` that moved under the run is an observation, not a loss.** A worktree is not exclusively this run's: a second agent session, or the operator, can commit to the branch while a proof run is in progress. Report the movement and name `git reflog -5` as the check — a tree that lost modifications between two of the run's own snapshots reads exactly like destroyed work and is not, and a run that concludes its work was destroyed and re-does it makes things worse.
4. **Push**, then **post the proof on the PR**: `gh pr comment <N> --body "<share links + AC table + mutation verdict>"`. **ONE comment carries every recording's `/share/<id>` link, listed above the table in AC order**, and those are the only clips URLs in it. Each AC row names its recording and chapter timestamp as plain text (`clip 2 · 1:47`), which is navigation inside a link already listed; keep every `/embed/<id>?t=` URL out of the comment. GitHub unfurls a clips `/embed/` URL into a video player, and in a table cell that player inflates every row into a tall black block that overflows the column and buries the AC text. The per-chapter deep links still belong in the **completion report**, where the operator reads them as text. **Copy the per-chapter deep links from the publish log's stderr — never build one by appending `?t=` to the share URL.** They are `/embed/<id>?t=<seconds>`, a different route from `/share/<id>`, because on the share route `t` is the agent-access token and a timestamp appended there is silently discarded: the reviewer lands at 0:00 and reads the wrong footage as the criterion.
   - **Supersede the earlier proof page.** An incrementally proven PR accumulates a proof comment per run, each a partial film of the same PR, and a reviewer scrolling the thread meets the oldest one first. Supersession is per **comment**, so it retires all of that comment's links at once: this comment opens with `Supersedes <the previous pw-prove comment's URL>`, and the previous comment is edited in place to carry `**Superseded by <this comment's URL>**` at its top: `gh api --method PATCH /repos/{owner}/{repo}/issues/comments/<id> -f body=<the amended body>`. Edit only comments this skill authored; a link nobody marked stale is reviewed as though it were current.
   - **No PR exists** (prose/branch run): push, `gh pr create` with the AC table as body, comment there.
   - **Merged-PR retarget** (Step 2): fresh test-only branch off the default, push, `gh pr create`, comment there.
5. **Completion report** — the run's exit artifact:

```
## pw-prove — Complete

Generated:
- <path to POM file> (new | modified)
- <path to spec file> (new, N scenarios)
- <path to api.har> (scoped **/api/**, scrubbed at capture, --verify clean)
- <configDir>/playwright.proof.config.ts (new — first run in this repo only; omit the line when reused)

ACs: <N> new, <N> carried, <N> proven of <M> total   # M = the Step-2 AC table's rows, minus the `not user-observable` ones; list each `unproven — gated: <what>`, each `carried: <spec file>`, each `already covered: <test file>` and each `not user-observable: <where proven>` explicitly
Preview server: stopped (port <N>, artifact <fresh | stale — mutation reverted, not rebuilt>) | left running (pre-existing)
Profile: .pw-prove/profile.md — written (N entries) | updated (N entries, M rewritten) | unchanged
e2e-reviewer: N P0 (fixed), N P1 (listed below)
Tests: N passed · hermetic (carve-outs: none | <declared list>)
Mutation: RED (spec guards the change) | unguardable at <layer>
Clips: N inspected — <clip 1: what its frame shows> · <clip 2: …>   # or `illegible (<diagnosis>), published with warning` / `uninspected — no video tooling`
Proof page: https://clips.paulsjob.ai/share/<id> (clip 1 of N, M chapters[, K omitted for size: <scenario names>])
- <AC1> -> https://clips.paulsjob.ai/embed/<id>?t=<seconds>
- <AC2> -> https://clips.paulsjob.ai/embed/<id>?t=<seconds>
Proof page: https://clips.paulsjob.ai/share/<id2> (clip 2 of N, M chapters)   # one line per recording; omit when the table fits one
- <AC7> -> https://clips.paulsjob.ai/embed/<id2>?t=<seconds>
Committed: <short-sha> on <branch>
Pushed: <remote>/<branch> — <N> commits: <subject>, <subject>
PR comment: <url>
```

**Report invariant (PR-mode):** structurally invalid unless every line above is present.

- `Proof page:` is either a share URL followed by its per-AC timestamp links — one such block per recording, in AC order, each naming its `clip <i> of <N>` — or `skipped — <the gate, the transport failure, or the unmet prerequisite>` **with the failing probe's or the publish log's output pasted directly beneath** (never from memory). A skip line with no output is a silent drop. N bare clip URLs and no recording is not a valid report.
- A skip caused by **undelivered** transport (exit 0 with a kept file) carries a `Kept locally: <path>` line beneath it and says the file was attached by hand; a skip caused by a **gate** never names a local file, because none is offered.
- `ACs:` states **three numbers**, always: this run's new scenarios, the carried ones it re-filmed, and the criterion total from the Step-2 AC table. Every one is a count of that table's rows, so a reader can check the report against something. A single `N of M` is not a valid form of this line — that shape is how a run's delta gets read as the PR's total, which is the whole reason the line has three numbers.
- `Mutation:` is `RED`, `unguardable at <layer>`, or `carried (no new scenario this run)` — never absent in PR-mode.
- `Preview server:` names the **artifact state** as well as the port. `stale` says the mutation check's revert left the build holding the mutation and no later step needed the server, so nothing rebuilt it — the source on disk is the source under proof, and the next run rebuilds by its own reuse check. A reader who cannot tell whether the artifact matches the source has to rebuild to find out.
- `Profile:` has **no skip form**. `unchanged` is a real outcome and says the run learned nothing durable; a run that rewrote an entry names how many, so a reader can see the profile being corrected rather than merely grown. In target and coverage-gap mode the same line names the path and adds `(untracked)`.
- `Clips:` states what each extracted frame SHOWED, in your own words — that is the whole point of looking. A clip that was re-filmed says so; a clip still illegible after the one re-film says `illegible (<diagnosis>), published with warning`; a clip nothing could extract says `uninspected`. Never write a description of a frame you did not open.
- `Committed / Pushed / PR comment` have **no skip form**: if the tail cannot complete (push rejected, `gh` unauthenticated), report the blocking error and the exact failing command output *instead of* a Complete report.

In coverage-gap mode (and target mode without a requested clip) the report is the first block (`Generated` through `Mutation`), plus `Proof page` only if a page was requested or produced.

## Script contracts (from `SKILL.md` → Reference)

- HAR scrubber and replay binding — **`probe.mjs` already runs the scrub at capture**, so a manual pass is a re-scrub, never the first one. `--verify` is Step 8's read-only check (exit 3 residue, exit 6 over-scrub) and `bind` is the audit verb's second phase, which invokes it rather than you (its own exit 4 and exit 5 reach you as the verb's exit 5, with `phases.har_bind.reason` saying which); both contracts are at those steps. One behavior stated nowhere else: a learned value too short to tell apart from ordinary content is placeheld **only where it was found**, never swept across the recording, and is reported by learn site and length: `scripts/har-scrub.mjs`
- Step-8 publish (manifest in, ONE chaptered Clips recording out; stream-copy concat, four gates, `PWPROVE_URL` / `PWPROVE_PROOF_FILE` marker lines): `scripts/publish-proof.mjs`
