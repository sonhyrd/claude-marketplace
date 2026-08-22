"""Tests that `sss:delegate-tickets` still keeps a coordinator in `check --wait`.

Measured on run `run_97a82d3add36` (2026-08-22, Opus 5 coordinator, Orca
1.4.187): the coordinator left `check --wait` to do local work step 6 itself
asks for — a measurement, a filed issue, a profile amend — finished it, and
ended the turn on a recap that *named* the next merge and the next dispatch.
The pane sat at an empty prompt. #1063's `worker_done` landed `read: 0`,
`delivered_at: null`, and stayed unread until a human sent a keystroke; the
coordinator then ran `check` immediately and correctly. Claude Code is
turn-based, the Run mailbox does not poke an idle TUI, and the only wake is
`check --wait` executing in that terminal.

Two things make the rule survivable, and each has a test below:

1. **A closed list of permitted turn-ends**, not an open "don't yield".
   "Don't yield" is checked by judgement and rationalised past by any model
   holding a tidy recap; "is this stop on the list" is a lookup.
2. **An explicit `--timeout-ms`.** `/orchestration` documents no default —
   it says *always pass it*, and 900000 is only its example value. An empty
   40-second wait and an empty 15-minute wait are byte-identical JSON, so an
   omitted flag disguises a bug in the coordinator's own command line as a
   checkpoint.

The guarded failure mode is a maintainer trimming the invariant for length,
or relocating it into step 7 where it reads as an end-of-run instruction.
Assertions match load-bearing tokens only, never phrasing a rewrite may
legitimately change.
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
def preamble(skill_text: str) -> str:
    """Everything above step 1 — where a standing invariant belongs."""
    head, _, _ = skill_text.partition("## 1. Resolve the repo profile")
    assert head, "SKILL.md has no step 1"
    return head


@pytest.fixture(scope="module")
def completion(skill_text: str) -> str:
    return section(skill_text, "7. Run to completion")


def test_invariant_sits_above_step_one(preamble: str) -> None:
    """The failure fires during dispatch and merge-back, not at the end.

    Filed under step 7 it reads as an end-of-run instruction, which is
    precisely how a coordinator mid-merge-back reads past it.
    """
    assert re.search(r"resting state", preamble)
    assert "check --wait" in preamble


def test_only_check_wait_wakes_the_coordinator(preamble: str) -> None:
    """The mechanism, stated once: a mailbox message does not poke a TUI."""
    assert re.search(r"does not wake", preamble)
    assert "unread" in preamble


def test_permitted_turn_ends_are_a_closed_list(preamble: str) -> None:
    """All three, or the list stops being closed and becomes a suggestion."""
    assert re.search(r"final report", preamble)
    assert re.search(r"escalation", preamble)
    assert re.search(r"gate", preamble)


def test_the_recap_shape_is_named(preamble: str) -> None:
    """The exact shape that shipped the incident: a recap reading as progress."""
    assert "recap" in preamble


def test_binary_resolution_is_stated_once(skill_text: str) -> None:
    """`orca-ide` off an Orca-managed pane. Parenthesised per mention, it drifts."""
    assert skill_text.count("orca-ide") == 1


def test_wait_loop_pins_the_timeout(completion: str) -> None:
    """`/orchestration` has no default; an unpinned window fakes a checkpoint."""
    assert "--timeout-ms 900000" in completion
    assert re.search(r"[Aa]lways pass", completion)
    assert "no default" in completion


def test_a_timeout_is_a_checkpoint_not_completion(completion: str) -> None:
    assert "checkpoint" in completion
    assert "{count:0}" in completion
    assert re.search(r"15.60 minutes", completion)


def test_local_work_returns_to_the_wait(skill_text: str) -> None:
    """Step 6 asks for local work; both it and step 5 have to hand back."""
    merge_back = section(skill_text, "6. Merge back in DAG order")
    dispatch = section(skill_text, "5. Dispatch the frontier")
    assert re.search(r"[Aa]cking is not waiting", dispatch)
    assert re.search(r"step 7", merge_back)


def test_settled_terminals_are_accounted_for(completion: str) -> None:
    """`/orchestration`'s own rule, one clause, its verbs left upstream."""
    assert "release" in completion
