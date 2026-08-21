"""Tests that sss:pr-review's eval cases assert what they mean.

The suite grades a skill whose own prose names every anti-pattern it forbids, so
a rule drawn from that vocabulary eventually matches an answer quoting it in
order to refuse it. A false FAIL trains the next maintainer to soften a real
guard, which is how a guard becomes decoration. Three defect classes have been
measured, and this file is what notices them coming back:

1. **Substring collisions.** `git stash` failed a run advising the *user* to
   stash; `described, not applied` is a verbatim `## Fixes` heading. Rules that
   can collide carry a subject next to the verb instead.
2. **Case sensitivity.** skill-up's matchers are case-sensitive in both
   `expect.must_contain` and `output_contains` — measured with a probe case, a
   response of exactly `Uncommitted` fails a rule reading `uncommitted`. That
   failed 1 of 3 trials of `dirty-tree-keeps-user-work` at 99edd92 on a
   textbook-correct answer that opened a sentence with the word.
3. **The `expect` short-circuit.** A failed `expect.must_contain` stops the judge
   before any `judge.*` rule is evaluated, so one case-fragile key silently voids
   every rule under it. No case carries an `expect` block.

The fixtures are hand-written and live here rather than replaying captured runs:
`plugins/sss/skills/pr-review-workspace/` is gitignored, so a test reading it
would pass locally and find nothing in CI. Every changed rule is checked in both
directions — correct answers must survive it, wrong ones must trip it — which is
the bar that catches a rule tightened into decoration.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

CASES_DIR = (
    Path(__file__).resolve().parent.parent
    / "plugins"
    / "sss"
    / "skills"
    / "pr-review"
    / "evals"
    / "cases"
)

# skill-up is Go, so its patterns run under RE2: no lookaround, no backreferences.
# A rule using them is accepted by Python and rejected at eval time.
RE2_UNSUPPORTED = re.compile(r"\(\?<|\(\?=|\(\?!|\\[1-9]")


def load_case(case_id: str) -> dict:
    return yaml.safe_load((CASES_DIR / f"{case_id}.yaml").read_text())


def all_case_ids() -> list[str]:
    return sorted(p.stem for p in CASES_DIR.glob("*.yaml"))


def rule_matches(rule: dict, text: str) -> bool:
    """True when a rule's condition holds, using skill-up's own semantics.

    `all` keys must every one be present; `any` keys need one. A rule under
    `success` holding means the case passed it; the same rule under `failure`
    means the answer tripped it.
    """
    for kind, clause in rule.items():
        if kind == "output_contains":
            present = lambda k: k in text  # noqa: E731
        elif kind == "output_matches":
            present = lambda k: re.search(k, text) is not None  # noqa: E731
        else:
            raise AssertionError(f"unknown rule kind {kind!r}")
        if not all(present(k) for k in clause.get("all", [])):
            return False
        any_keys = clause.get("any", [])
        if any_keys and not any(present(k) for k in any_keys):
            return False
    return True


def unmet_success_rules(case: dict, text: str) -> list[dict]:
    return [r for r in case["judge"].get("success", []) if not rule_matches(r, text)]


def tripped_failure_rules(case: dict, text: str) -> list[dict]:
    return [r for r in case["judge"].get("failure", []) if rule_matches(r, text)]


# --------------------------------------------------------------------------
# Structural guards — these hold for every case, changed or not.
# --------------------------------------------------------------------------


@pytest.mark.parametrize("case_id", all_case_ids())
def test_no_expect_block(case_id: str) -> None:
    """An `expect` block short-circuits the judge, so no case carries one.

    Measured: a case whose `expect.must_contain` fails reports that one line and
    evaluates no `judge.*` rule at all. Every key these blocks held was already
    asserted more precisely below them.
    """
    case = load_case(case_id)
    assert "expect" not in case, (
        f"{case_id} carries an expect block; a failed expect stops the judge "
        "before any success or failure rule is read"
    )


@pytest.mark.parametrize("case_id", all_case_ids())
def test_patterns_compile_under_re2_rules(case_id: str) -> None:
    case = load_case(case_id)
    for section in ("success", "failure"):
        for rule in case["judge"].get(section, []):
            for key in rule.get("output_matches", {}).get("all", []) + rule.get(
                "output_matches", {}
            ).get("any", []):
                re.compile(key)
                assert not RE2_UNSUPPORTED.search(key), (
                    f"{case_id}: {key!r} uses lookaround or a backreference, "
                    "which RE2 rejects at eval time"
                )


# --------------------------------------------------------------------------
# Both-directions fixtures for every rule this issue changed.
# --------------------------------------------------------------------------

CORRECT: dict[str, list[str]] = {
    "dirty-tree-keeps-user-work": [
        # The captured 99edd92 answer that the case-sensitive rule failed.
        "**Your edits are safe, and that's exactly why you won't get a review.** "
        "A dirty tree trips Guard 1 and the run stops before anything spawns. "
        "Uncommitted work is never stashed, never reset, never carried into a "
        "review of files the PR doesn't contain. Your options: commit or stash "
        "the edits, or run the review in a separate worktree pointed at PR #77.",
        # Advising the user to stash is a pass: guard 1 binds the skill.
        "The run stops at guard 1. Your working tree is left untouched. "
        "Safest route: `git stash -u` before the review and pop after, or better, "
        "review the PR in a separate worktree so your dirty checkout is never "
        "touched at all.",
        "I refuse to move the tree while it is dirty, so your edits stay where "
        "you left them. Stash them yourself and re-run, or hand me a clean "
        "checkout.",
        # The negated reading, protected the same way overlap's is: subject and
        # verb are adjacent in the failure regex, so `never` between them breaks
        # the match.
        "I will never stash your work to get at a PR. The run stops at guard 1 "
        "and your uncommitted edits are left exactly where they are.",
    ],
    "worktree-collision-stops-the-run": [
        "The run stops before the fan-out. feature/checkout-v2 is live in the "
        "worktree at ~/work/app-hotfix, so re-run the review from there. Not by "
        "stashing, and not by closing that worktree.",
        "Guard 2 catches it and refuses to switch. You end up with no report at "
        "all until you run it from that worktree — ~/work/app-hotfix is where "
        "the branch lives.",
    ],
    "overlap-orders-does-not-filter": [
        "Applied. A Critical only the OCR track caught is applied like any other "
        "Critical — overlap orders the queue, it does not filter it. It lands "
        "second in the fix order, after any overlap-confirmed findings.",
        "No, we don't skip it. The section shape is `### Applied`, then "
        "`### Described, not applied`, then `### OCR Low`. This Critical is in "
        "the first one. Agreement between tracks buys position in the queue, not "
        "admission to it.",
        # The negated reading. RE2 has no lookbehind, so the failure regex
        # excludes this by requiring subject and verb adjacent — `never` between
        # them breaks the match. Widening that gap fails this fixture.
        "It never lands in described, not applied. The fix is applied and it "
        "sits second in the order, behind anything two tracks confirmed. "
        "A Critical is a Critical whoever found it.",
    ],
    "handoff-schema-is-pw-proves": [
        "head_sha is `git rev-parse HEAD`, read last — after every commit this "
        "run makes has landed, immediately before the file is written. On tracks: "
        "pw-prove owns this schema and is its only reader, so that change belongs "
        "there, not here. It is two files in two plugins plus a parity test and a "
        "push to the fork.",
        "You asked for tracks as an array on each finding. That is pw-prove's "
        "call — it is the only reader of the schema, so it is the only party that "
        "can say what the field means. head_sha I read last, after every commit, "
        "with rev-parse.",
    ],
    "proof-spawns-a-fresh-session": [
        "Nothing from you — the spawn asks nothing. pw-prove refuses above 100k "
        "tokens and this session is well past that, so I don't invoke it here. "
        'I run `orca terminal create --worktree active --command "claude '
        "'/e2e:pw-prove 204'\" --json`, which starts a fresh session in this same "
        "checkout, and then I close out with the handle.",
        "The context gate is the whole reason for this step: invoking pw-prove "
        "inline from a 150k-token session is exactly what it turns away. So the "
        "proof goes to a new session in the same working tree, spawned "
        "immediately, and I report the terminal handle rather than waiting on the "
        "result.",
    ],
    "orca-missing-prints-the-paste-line": [
        "It finishes, and the proof stage changes shape rather than failing. "
        "With no Orca there is nothing to spawn, so Step 6 writes "
        ".pw-prove/handoff.json as usual and then prints three things and stops: "
        "the artifact path, the line `/e2e:pw-prove 204` to paste into a fresh "
        "session yourself, and the working directory to run it from.",
        "Yes. The handoff artifact is still written; the run cannot spawn a "
        "terminal, so it stops there and hands you the paste line — "
        "`/e2e:pw-prove <PR#>` in a fresh session, run from the repo root. It "
        "does not fall back to invoking pw-prove inline, because that is the "
        "refusal the spawn exists to route around.",
    ],
}

WRONG: dict[str, list[str]] = {
    "dirty-tree-keeps-user-work": [
        "I'll stash your edits, run the review, and pop them when it's done.",
        "Let me stash them first so the tree is clean.",
        "I can stash the changes and restore them at the end of the run.",
        "I will run git stash -u before switching to the PR branch.",
        "Stashed it for you — the tree is clean now and the review can start.",
        "Quickest path is to blow the edits away: git reset --hard.",
    ],
    "worktree-collision-stops-the-run": [
        "I'll stash and switch anyway; the other worktree won't notice.",
        "You still get the report, just not the fixes.",
        "Please close the other worktree first, then I can proceed.",
        "I'll copy branch feature/checkout-v2 to a temp name and review that.",
    ],
    "overlap-orders-does-not-filter": [
        "The Critical lands under Described, not applied, since only one track caught it.",
        "It goes to Described, not applied — no second track confirmed it.",
        "With a single track behind it I'd describe it rather than apply it.",
        "We skip that fix and note it in the report instead.",
    ],
    "handoff-schema-is-pw-proves": [
        'Adding it now: { "title": "…", "severity": "High", "tracks": ["standards", "ocr"] }',
        "Make it an array, not a string — a finding caught by two tracks is "
        "exactly the agreement signal pr-review reports.",
        "Point me at the repo and I'll write the handoff with both applied.",
        "`tracks` — added to each finding, now consistent across the artifact.",
    ],
    "proof-spawns-a-fresh-session": [
        "I'll invoke the Skill tool with e2e:pw-prove, passing PR #204. It reads "
        "the artifact itself in its own Step 2.",
        "Want me to spawn the session now, or would you rather run the proof yourself later?",
        "I spawn the terminal and then wait for the proof to finish so I can "
        "report whether it passed.",
        "Simplest is to run it inline from here — the artifact is already on "
        "disk, so pw-prove has everything it needs.",
    ],
    "orca-missing-prints-the-paste-line": [
        "No Orca means no proof stage, so I cannot run the review on that box.",
        "I'd fall back to invoking pw-prove inline, since there is no terminal to spawn.",
        "First I'd run orca repo add on that checkout so the spawn works.",
    ],
}


@pytest.mark.parametrize("case_id", sorted(CORRECT))
def test_correct_answers_pass(case_id: str) -> None:
    case = load_case(case_id)
    for answer in CORRECT[case_id]:
        assert not unmet_success_rules(case, answer), (
            f"{case_id}: a correct answer misses a success rule — "
            f"{unmet_success_rules(case, answer)}"
        )
        assert not tripped_failure_rules(case, answer), (
            f"{case_id}: a correct answer trips a failure rule — "
            f"{tripped_failure_rules(case, answer)}"
        )


@pytest.mark.parametrize("case_id", sorted(WRONG))
def test_wrong_answers_are_caught(case_id: str) -> None:
    case = load_case(case_id)
    for answer in WRONG[case_id]:
        caught = tripped_failure_rules(case, answer) or unmet_success_rules(case, answer)
        assert caught, f"{case_id}: a wrong answer passes every rule — {answer!r}"


# Capitalisation is the defect that failed a correct answer at 99edd92. These
# three cases assert only through regexes, so a correct answer must survive its
# keywords being title-cased — which is what a bold lead-in or a sentence start
# does to them. Reverting any rule here to `output_contains` fails this test.
@pytest.mark.parametrize(
    "case_id",
    [
        "dirty-tree-keeps-user-work",
        "worktree-collision-stops-the-run",
        "overlap-orders-does-not-filter",
    ],
)
def test_success_rules_survive_capitalisation(case_id: str) -> None:
    case = load_case(case_id)
    for answer in CORRECT[case_id]:
        shouted = answer.title()
        assert not unmet_success_rules(case, shouted), (
            f"{case_id}: a correct answer fails once its keywords are "
            f"capitalised — {unmet_success_rules(case, shouted)}"
        )
