# Glossary

## PR-mode
The playwright-test-generator pipeline variant that proves a specific change (PR, branch, ticket, or prose "prove this change" argument) end-to-end. Scope is closed: acceptance criteria are derived from the diff.

## Coverage-gap mode
The pipeline variant invoked with no target, where PTG proposes what to cover. Scope is open: the user's intent cannot be derived from a diff.

## Approval gate
A hard stop where the pipeline waits for an explicit user go-ahead before proceeding. As of 2026-07-10: exists only in coverage-gap mode. PR-mode uses notify-and-continue.

## Notify-and-continue
Posting the scenario plan to the conversation as an audit trail and proceeding immediately without waiting for a reply. The user interrupts to redirect; silence is consent. The PR-mode replacement for the approval gate.

## Watch link
The hosted, shareable proof of a PR-mode run: a watch.html page (poster + chapters + video), not a bare .webm. Required deliverable in PR-mode.

## Proof film
The video behind the watch link. Covers every approved scenario, one titled chapter per scenario, ending with the final scenario's payoff held on screen. A film that covers fewer scenarios than the spec, or ends before the success state is visible, is a defective proof.

## Chapter
A titled segment of the proof film corresponding to exactly one approved scenario. Chapter titles must be readable in the published video (on screen long enough and at legible resolution).

## Hermetic spec
A generated spec whose every network call is mocked. The default for all PTG output; Step 7 fails a run on any live call that is not part of a declared carve-out.

## Declared carve-out
The sanctioned exception to hermetic specs: a real-backend interaction that is itself the acceptance criterion under proof. Must be named in the scenario plan and in the spec header. Reads freely; writes only with a proven restore; never creates data on a shared tenant.

## Proof
The complete PR-mode deliverable: green spec + POM committed to the PR branch, plus the watch link. A run that ends with uncommitted tests or no watch link has not delivered a proof.

## Contact sheet
The film-QA evidence record.sh extracts: the film's first frames plus one every ~3 seconds, tiled on a single image (`CONTACT=`). Step 8 requires reading it before publishing; the report's `Film QA:` line is filled from it.

## Film QA gate
The Step 8 structural gate on the proof film: record.sh's scripted floors (duration ≥ 4s + ~3s per scenario, chapter count ≥ scenario count, ordered timestamps, poster + contact sheet extraction — any failure is exit 5) plus the agent's contact-sheet screening. Publishing past a failed gate is forbidden.

## Land the proof
Step 9, the deterministic PR-mode tail: hygiene sweep → commit spec+POM to the PR branch → push → watch-link PR comment (creating a PR when none exists) → completion report. The report format is the run's exit gate: structurally invalid in PR-mode without its Watch link, Film QA, Committed, Pushed, and PR comment lines.
