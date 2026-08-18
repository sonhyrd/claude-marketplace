# Step 7 audits before it films, and rebuilds only when something needs the server

Two orderings inside Step 7 were each defended by a written justification, and each was paying for a
case that usually did not exist. Both changed. A reader who finds the old reasoning in a commit — or
in the habits of a run that predates this — should find out why.

## Audit before filming

The old order was: proof run with `PW_PROVE_CLIP=1` → clip inspection → [hermetic
audit](../../CONTEXT.md#hermetic-audit) → mutation check. That guarantees, structurally, that any
hermetic finding invalidates footage already shot: a LIVE call means a spec edit, and a spec edit
means the clips show software that no longer exists.

In the traced run it cost a re-film. The audit found three LIVE calls — socket.io polling and two
Intercom POSTs — none of which fall inside the [HAR fixture](../../CONTEXT.md#har-fixture)'s
`**/api/**` scope, and **all three were already sitting in the recon HAR's 83 entries seven minutes
before the run filmed against them.**

The new order splits the run in two:

1. an **audit run** — no `PW_PROVE_CLIP`, no video, no dwells — whose traces the audit classifies;
2. the audit, and any fix it forces;
3. the **filming run**, whose clips are delivered;
4. clip inspection;
5. the mutation check.

This is cheap because `hermetic.mjs` classifies from **traces**, and the [proof
config](../../CONTEXT.md#proof-config) sets `trace: 'on'` regardless of `PW_PROVE_CLIP`. The
protective run is therefore strictly cheaper than the footage it protects: it skips video encoding
and every 2500ms dwell. The heal loop moves onto it too, so a spec that takes three attempts to go
green pays for no film at all until it is green.

Seeding the block list from the recon HAR is the other half, and it is deliberately **not** a gate:
third-party origins observed at recon are blocked in the generated spec, but the audit still
classifies every request and still fails on any LIVE call without a `// CARVE-OUT:` line. Seeding
that missed something must produce exactly the failure it produces today. A seeded list that could
suppress a finding would be a silent-always-pass with an optimisation's name on it.

## Rebuild only when something needs the server

The mutation check's old step 4 reverted the source, then rebuilt and restarted the preview
unconditionally, justified by: *"every later step — a re-film, a heal run, the hermetic audit — runs
against deliberately broken software."* The justification is sound in general and vacuous whenever
the mutation check is the run's last step, which it usually is. In the traced run that rebuild
finished at 13:24:33 and Step 8 stopped the server at 13:26:55: 82 seconds of build, served for two
minutes, killed.

The revert stays unconditional and immediate — the tree is never left mutated. What became lazy is
the rebuild: the artifact is marked **stale**, and any step that needs the server rebuilds first if
the marker is set, forcing the build and proving the restart exactly as before. Step 8 hygiene stops
a stale server rather than rebuilding it.

The marker exists because the *artifact* is out of step with a tree that looks unchanged, which is
precisely the case the build-reuse check cannot see: reuse is measured against HEAD plus the
working-tree difference, and the revert restored the tree. Build reuse is otherwise untouched, so the
per-batch economics that make the [proof target](../../CONTEXT.md#proof-target) affordable are
unchanged.

`BUILD_REUSE=never` on the mutation's own rebuild is unchanged and stays. That one must never inherit
an artifact.

## What this costs

The stale state is now something a reader has to know about, so it appears in the Step 8 completion
report: a `Preview server:` line that says `artifact stale` is saying the build on disk still holds
the mutation and the source on disk does not. A reader who cannot tell has to rebuild to find out,
which is the cost the marker exists to make visible rather than to hide.

The audit split adds a second run to the wall clock. It is the cheap one, and it replaces re-films
that cost the expensive one — measured at roughly 4.5 minutes of re-filming in the run that motivated
this, against an un-clipped run that skips every dwell.
