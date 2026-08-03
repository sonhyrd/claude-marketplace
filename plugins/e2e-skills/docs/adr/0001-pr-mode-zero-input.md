# PR-mode is zero-input: notify-and-continue plus a deterministic tail

A 2026-07 audit of all 15 real playwright-test-generator runs found every single one blocked on user input — chiefly the Step 4 approval gate (which also bundled selector/POM/dirty-tree side-questions) and an unspecified ending ("want me to commit?"). But PR-mode's scope is closed: the acceptance criteria derive from the diff, so there is nothing a question can add that the contract doesn't already answer.

Decision: in PR-mode the pipeline takes zero input. Step 4 posts the scenario plan as an audit trail and continues immediately (silence is consent; the user interrupts to redirect); every would-be side-question resolves from the contract as a stated line in the plan's Assumptions block. Step 9 owns the full tail deterministically — commit spec+POM to the PR branch, push, post the watch link as a PR comment (creating a PR when none exists). The completion-report format is the exit gate: it is structurally invalid without the tail lines, because the audit proved prose gates ("REQUIRED in PR-mode") get skipped while format invariants don't. The only sanctioned PR-mode stop is a base-merge conflict ([ADR-0002](0002-merge-main-before-proof.md)).

A real approval gate survives only in coverage-gap mode, where scope is open and the plan genuinely is a question.
