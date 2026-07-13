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
The hosted, shareable proof of a PR-mode run: a watch.html page (title + chapters + video), not a bare .webm. Required deliverable in PR-mode.

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
The single film-QA evidence artifact record.mjs extracts: 30 frames spanning the whole film, tiled on one image (`CONTACT=`). Its final tile is the film's final-frame evidence (there is no separate poster). Step 8 reads it once per film before publishing; the report's `Film QA:` line is filled from it.

## Film QA gate
The Step 8 structural gate on the proof film: record.mjs's scripted floors (duration ≥ 4s + ~3s per scenario, chapter count ≥ scenario count, ordered timestamps, contact-sheet extraction — any failure is exit 5) plus the agent's one contact-sheet screening. Film runs are single-attempt (`--retries=0`): a flaky film is a re-shoot, not a proof. Publishing past a failed gate is forbidden.

## Refilm budget
The bound on Step 8's fix-and-refilm loop: one diagnose+fix+refilm attempt per failing chapter. A chapter that fails its second film is dropped from the film and its scenario demoted — never a third cycle. Decided 2026-07-10 after a run spent three full-price refilm cycles on a chapter that was deleted anyway.

## Flake screen
Using Step 7's own run verdicts as the admission test for film chapters: a scenario Playwright marked flaky does not get a chapter until it has passed clean. Failing the screen leads to demotion, not to filming-and-hoping.

## Demotion
Recording a scenario as `unproven — gated: <reason>` on the report's ACs line instead of proving it. Demotion affects the film and the report only — the committed spec never loses a passing scenario to make a film green.

## State-isolation rule
The film-spec authoring constraint that follows from chapters sharing one browser context (unlike committed tests, which each get a fresh one): any scenario whose committed test depends on fresh-context state (cookies, storage, locale, auth) must open with an explicit state reset or be excluded from the film via demotion.

## Land the proof
Step 9, the deterministic PR-mode tail: hygiene sweep → commit spec+POM to the PR branch → push → watch-link PR comment (creating a PR when none exists) → completion report. The report format is the run's exit gate: structurally invalid in PR-mode without its Watch link, Film QA, Committed, Pushed, and PR comment lines.
