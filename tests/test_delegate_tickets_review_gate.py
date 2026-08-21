"""Tests that `sss:delegate-tickets` still carries the review-receipt gate.

The gate exists because a dispatched worker's code review was the run's only
quality bar and nothing checked that it ran. Measured over this host's Claude
Code history (82 ticket-worker sessions, 40 coordinator sessions, 2026-08-02 to
2026-08-21):

1. **22 of 82 workers ran no review at all.** Each read `implement`'s "Once done,
   use /code-review" into context and never mentioned it again.
2. **7 more ran the wrong review** — a bare `/code-review` resolves to a built-in
   skill, not matt's two-axis pair. One spent 33-35 agents on it.
3. **Coordinators opened a worker's review 0 times in 40 sessions.** The review
   reached them only as a clause in a 3-sentence `worker_done` body, so an absent
   review and a clean one were indistinguishable. Two incidents followed: a P0
   that hollowed out an acceptance gate shipped, and a worker found two real
   defects in already-merged code after its dispatch capability was revoked.

Each clause below is one of those failures, written down. The guarded failure
mode is a maintainer trimming the gate for length — which takes several clauses
at once, so this is deliberately one file that fails loudly rather than six that
each fail quietly. Assertions match on the load-bearing tokens only, never on
phrasing a rewrite may legitimately change.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

SKILL = (
    Path(__file__).resolve().parent.parent
    / "plugins"
    / "sss"
    / "skills"
    / "delegate-tickets"
    / "SKILL.md"
)

RECEIPT_PATH = "/tmp/<ticket-slug>/review.md"


@pytest.fixture(scope="module")
def skill_text() -> str:
    return SKILL.read_text(encoding="utf-8")


def section(text: str, heading: str) -> str:
    """The body of one `## ` section, up to the next `## ` or EOF."""
    match = re.search(
        rf"^## {re.escape(heading)}.*?(?=^## |\Z)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    assert match, f"SKILL.md has no '## {heading}' section"
    return match.group(0)


@pytest.fixture(scope="module")
def dispatch(skill_text: str) -> str:
    return section(skill_text, "5. Dispatch the frontier")


@pytest.fixture(scope="module")
def merge_back(skill_text: str) -> str:
    return section(skill_text, "6. Merge back in DAG order")


def test_brief_names_the_receipt_and_the_fix_all_bar(dispatch: str) -> None:
    """Failure 1: the worker's exit condition has to name a file, not a habit."""
    assert RECEIPT_PATH in dispatch
    assert "--report-path" in dispatch
    assert re.search(r"[Ee]very finding is the worker's to fix", dispatch)


def test_receipt_precedes_the_report(dispatch: str) -> None:
    """A review landing after `worker_done` amends an already-merged commit."""
    assert re.search(r"before\W+`?worker_done", dispatch)


def test_prohibited_findings_have_a_named_exit(dispatch: str) -> None:
    """Without HANDOFF, 'fix all' is unsatisfiable and gets met with a lie.

    Prohibition 7 forbids editing the profile; Prohibition 10 forbids closing
    your own ticket. Findings landing there are the coordinator's.
    """
    assert "HANDOFF" in dispatch
    assert "Prohibitions" in dispatch


def test_brief_names_the_shadowed_skill(dispatch: str) -> None:
    """Failure 2: `/code-review` by bare name is a different, built-in skill."""
    assert "built-in" in dispatch
    assert re.search(r"resolved absolute path", dispatch)


def test_definition_of_done_names_both_axes(dispatch: str) -> None:
    """The second half of the shadow guard: a built-in run writes no axes."""
    assert "Standards" in dispatch and "Spec" in dispatch


def test_merge_back_refuses_a_missing_receipt(merge_back: str) -> None:
    """Failure 3: the teeth. Absence has to block, not pass silently."""
    assert "No receipt, no merge" in merge_back
    assert RECEIPT_PATH in merge_back
    assert re.search(r"Standards axis", merge_back)
    assert "HANDOFF" in merge_back
