"""Tests that `sss:delegate-tickets` still carries the clauses that cost a run.

One file for one skill. It consolidates `test_delegate_tickets_review_gate.py`
and `test_delegate_tickets_wait_loop.py`, which it replaces, and adds the
step-0 clauses from #71, the step-4 clauses from #72 and the step-5 clauses
from #73. Grouping them is deliberate: the guarded failure mode
in every case is a maintainer trimming a clause for length, which takes several
clauses at once, so this fails loudly in one place rather than quietly in
three. Assertions match on the load-bearing tokens only, never on phrasing a
rewrite may legitimately change.

## Step 0 — resolve the binary, load the live guide (#71)

Measured on this host (Orca `1.4.187`, Linux): bare `orca` is the Electron
launcher. It prints a single-instance notice and **exits 0** for every argument
list it is given, so a coordinator running `orca orchestration task-create`
reads a clean exit code for a run in which nothing was orchestrated. The skill
claimed "step 4's probe resolves it once for every command below"; step 4 held
no resolution logic at all, and every command in the file spelled the bare
binary.

Three clauses answer that, and each has a test below:

1. **Resolution runs at step 0**, before any profile read, worktree, terminal
   or lifecycle call — a run that discovers the wrong binary at dispatch time
   has already mutated.
2. **Selection is by proof, not by platform.** Preference orders the candidates
   (`orca-ide` outside an Orca-managed pane, `orca` inside); what selects one is
   whether it answers `orchestration --help`. Exit 0 is exactly what the
   launcher gives, so exit 0 cannot be the test.
3. **The guide is loaded from the binary**, version-matched to it, before the
   first lifecycle call. `/orchestration` was never a marketplace plugin and is
   not installed on any machine here, so a deferral to it named nothing.

`scripts/check-delegate-cli.sh` asks the live binary the same question and is
the real instrument; these are its static, offline half — they fail on a host
with no Orca at all, where that script skips.

One clause is **retired** rather than carried over: the wait-loop file asserted
`skill_text.count("orca-ide") == 1`, guarding a binary name parenthesised per
mention against drift. Step 0 supersedes it — the name is now resolved once in
one place and the commands below carry no binary name at all — and
`test_no_command_is_spelled_against_the_bare_binary` holds the anti-drift force
it held, against the spelling that actually costs a run.

## Step 4 — the preflight (#72)

Step 4 proved the lifecycle writes by creating a throwaway task
(`--spec "PROBE"`) and retiring it with a status update, because the CLI has
no delete verb. Two costs, both measured against Orca `1.4.188`:

1. **Permanent litter.** A completed task is still a task. Every run added a
   row that no run ever used.
2. **A false alarm on a clean machine.** The probe ran before any Run was
   bound, so its likeliest answer was `run_required` — a setup step that reads
   as a failure.

The run creates a Run anyway, and that `run-create` is the first *mutating*
lifecycle call, so it carries the same evidence with no artifact. The step-4
argument survives intact: still cheap, still ahead of every worktree.

Two omitted preconditions join it. `status --json` must show a reachable
runtime — help text is local and every `orchestration` verb is an RPC, so a
binary that resolves and answers `--help` still reaches nothing when the app is
closed. And the host's **agent permission mode** is load-bearing: Orca supplies
`--dangerously-skip-permissions` (cursor's `--yolo`) from `agentDefaultArgs` in
the active profile's `orca-data.json`, which is app config no skill argument can
set. A host left on manual produces workers that stop at an approval prompt
nobody is watching — which never reports as a failure.

The dropped claim was "`run-create` succeeding proves nothing — the runtime can
be fenced per-command". It could not be reproduced, and the fence case itself
says the *whole lifecycle* is fenced.

## Step 5 — one supervised `worker-start` (#73)

Step 5 built each worker in four calls: `worktree create`, a `terminal create`
carrying the run's engine argv, `terminal wait --for tui-idle`, and a five-retry
`terminal read` loop. Measured against `orca-ide` (Orca 1.4.188, Linux) and the
guide step 0 loads from it, each of the four is now wrong for a different
reason:

1. **The composed call exists and the guide prefers it.** `worker-start` covers
   worktree, terminal, readiness and dispatch, and takes `--base-branch`.
2. **The hand-built worker is unsupervised.** `dispatch --inject` on an
   operator-started terminal writes no `worker_dispatches` row, so
   `worker-release` took no action — and step 7 has asked coordinators to reuse
   or release every settled terminal since it was written.
3. **The retry loop was approximating an exit code.** `worker-start` exits 0
   only for `ready`, decided on process identity: a bare shell is the negative
   signal for "is an agent running".
4. **The argv table's one load-bearing column was never argv.** The
   permissionless flag is app config keyed by engine id, which #72's preflight
   already reads.

Two gates survive, for opposite reasons, and each has a test below.
`--base-branch` verification stays because an ignored flag and an absent flag
still fail identically. The cursor Workspace Trust gate stays because process
identity is blind to what a TUI renders: a `cursor-agent` parked at its trust
box *is* the foreground process and *is* a recognised agent, so `ready` comes
back for a worker that will never move. [ADR-0011] records the trade.

## The review receipt (ADR-0010)

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

## The `check --wait` resting state

Measured on run `run_97a82d3add36` (2026-08-22, Opus 5 coordinator, Orca
1.4.187): the coordinator left `check --wait` to do local work step 6 itself
asks for — a measurement, a filed issue, a profile amend — finished it, and
ended the turn on a recap that *named* the next merge and the next dispatch.
The pane sat at an empty prompt. #1063's `worker_done` landed `read: 0`,
`delivered_at: null`, and stayed unread until a human sent a keystroke; the
coordinator then ran `check` immediately and correctly. Claude Code is
turn-based, the Run mailbox does not poke an idle TUI, and the only wake is
`check --wait` executing in that terminal.

Two things make that rule survivable, and each has a test below:

1. **A closed list of permitted turn-ends**, not an open "don't yield".
   "Don't yield" is checked by judgement and rationalised past by any model
   holding a tidy recap; "is this stop on the list" is a lookup.
2. **An explicit `--timeout-ms`.** The loaded guide documents no default —
   it says *always pass it*, and 900000 is only its example value. An empty
   40-second wait and an empty 15-minute wait are byte-identical JSON, so an
   omitted flag disguises a bug in the coordinator's own command line as a
   checkpoint.

## What the loaded guide already says (#74)

Step 0 loads all 408 lines of the live orchestration guide on **every** run, so
a rule this file restates is a second copy that ages independently of the one
the coordinator has in context. Six were verified against the loaded guide and
deleted; each is asserted absent over the whole plugin tree below, because a
clause retired from `SKILL.md` and left standing in a reference still ships.

| Deleted | Guide |
|---|---|
| ack-or-replay | "replays that exact batch until `--ack <delivery_id>`" |
| a timeout / `{count:0}` is a checkpoint | "Treat a ... timeout or `{count:0}` as a checkpoint" |
| workers run 15-60 minutes | "Long coding tasks routinely run 15-60 minutes" |
| account for settled terminals | "must account for every settled worker terminal" |
| keep rolling until every Dispatch settles | "keep waiting until every expected Dispatch settles" |
| the dispatch-capability revocation note | "do not reuse the settled Dispatch's lifecycle IDs" |

The last row is the **weakest** of the six and is recorded as such. The guide
never says a capability is revoked, a second report rejected, or an `ask`
failed; L386 and L408 say only that a settled worker sends no further lifecycle
messages and that a stale preamble is not one to report against. That covers the
consequence — a reported worker cannot be reached through the lifecycle — and
not the mechanism, so what went is the mechanism. The **instruction** it carried
stays in step 6 in its own right: re-tasking the worker is not on the table, and
the review is the coordinator's to run.

**Five rules stay**, plus the shared-stash rule, and each has a test below. Four
of the five the guide simply does not carry; `--timeout-ms` is kept on the
narrower ground recorded at `SURVIVING_RULES`. The stash rule keeps its "never"
*and* its reasoning: `git stash` is the correct reflex in a single checkout, the
damage lands in a sibling worktree nobody looks at, and the positive form alone
does not explain why the obvious move is wrong.

Deleting the duplicates makes step 5's preamble false as well as redundant — it
justified carrying Orca's rules on the grounds that `orca-cli` and
`orchestration` are outside this repo's write access, which was written when the
guide was not loaded. One line replaces it.

## Three statements that were false (#74)

1. **"A turn ends in exactly three places"** named the final report, an
   escalation, and step 1's gate — while step 4 alone stops in four more. A
   closed list that is demonstrably incomplete stops being a lookup, which is
   the entire reason it was written as a closed list. The fix keeps the closed
   form and widens the third entry to **refusal-to-start**, of which every
   preflight stop is one kind.
2. **"No receipt, no merge"** was a heading its own body contradicted: the body
   runs the Standards axis on a missing receipt and then *merges*. The rule is
   ADR-0010's and is not the defect — a measured ~1-in-3 trip rate would strand
   a third of all branches on an escalation. The heading is what changed, to the
   claim the body actually makes: a branch merges reviewed or not at all.
3. **Two `/tmp` placeholders.** Briefs and receipts have to share one, or the
   coordinator reads a path no worker wrote.

Four prohibitions became the positive instruction they were guarding, which is
the shape a reader can act on rather than one to avoid.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

SKILL_DIR = (
    Path(__file__).resolve().parent.parent
    / "plugins"
    / "sss"
    / "skills"
    / "delegate-tickets"
)
SKILL = SKILL_DIR / "SKILL.md"

RECEIPT_PATH = "/tmp/<ticket-slug>/review.md"
STEP_0 = "0. Resolve the CLI and load the live guide"

# `orca <group> <verb>` — the spelling that is a silent no-op on a host whose
# `orca` is the desktop launcher. Matched the way check-delegate-cli.sh matches
# it: a group the skill uses, then a verb. `Usage: orca orchestration` quoted as
# a grep pattern is not an invocation and does not match.
BARE_BINARY = re.compile(
    r"(?<![\w-])orca\s+(?:orchestration|terminal|worktree|skills)\s+[a-z][a-z0-9-]*"
)

# `/orchestration` as a slash command — not a `references/orchestration-*.md`
# path, and not the `orchestration` command group.
INVOCABLE_GUIDE = re.compile(r"(?<![\w/-])/orchestration\b(?!-)")


def flat(text: str) -> str:
    """One line, blockquote markers dropped.

    SKILL.md wraps its prose, so a clause can straddle a line break and a
    blockquote continues with `> `. Neither is phrasing, and neither should
    decide whether a clause is present.
    """
    return re.sub(r"\s+", " ", re.sub(r"^>[ \t]?", "", text, flags=re.MULTILINE))


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
    """Everything above step 0 — where a standing invariant belongs."""
    head, _, _ = skill_text.partition(f"## {STEP_0}")
    assert head, "SKILL.md has no step 0"
    return head


@pytest.fixture(scope="module")
def prerequisites(preamble: str) -> str:
    """The preamble flattened — its block is a wrapped blockquote.

    The invariant clauses below deliberately keep the raw text they have always
    matched on; only the block that needs unwrapping gets it.
    """
    return flat(preamble)


@pytest.fixture(scope="module")
def step_zero(skill_text: str) -> str:
    return flat(section(skill_text, STEP_0))


@pytest.fixture(scope="module")
def preflight(skill_text: str) -> str:
    return section(skill_text, "4. Preflight the orchestration runtime")


@pytest.fixture(scope="module")
def preflight_failures(preflight: str) -> str:
    """The merged `orchestration-probe.md` — now a subsection of step 4."""
    heading = "### Reading a preflight failure"
    assert heading in preflight, preflight
    return preflight.split(heading)[-1]


@pytest.fixture(scope="module")
def launch_ref() -> str:
    return (SKILL_DIR / "references" / "worker-launch.md").read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def skill_docs() -> dict[Path, str]:
    """Every Markdown file the plugin ships, for the whole-tree sweeps.

    A clause retired from `SKILL.md` and left standing in a reference is still
    shipped, so absence has to be asserted over the tree rather than the file.
    """
    return {
        doc.relative_to(SKILL_DIR): doc.read_text(encoding="utf-8")
        for doc in sorted(SKILL_DIR.rglob("*.md"))
    }


@pytest.fixture(scope="module")
def dispatch(skill_text: str) -> str:
    return section(skill_text, "5. Dispatch the frontier")


@pytest.fixture(scope="module")
def merge_back(skill_text: str) -> str:
    return section(skill_text, "6. Merge back in DAG order")


@pytest.fixture(scope="module")
def completion(skill_text: str) -> str:
    return section(skill_text, "7. Run to completion")


# --- Step 0: the binary and the guide ---------------------------------------


def test_step_zero_runs_before_anything_mutates(skill_text: str, step_zero: str) -> None:
    """A wrong binary found at dispatch time has already spent the setup budget."""
    assert skill_text.index(f"## {STEP_0}") < skill_text.index("## 1. Resolve the repo profile")
    assert re.search(r"[Nn]othing runs above this step", step_zero)
    for mutation in ("profile read", "worktree", "terminal", "lifecycle call"):
        assert mutation in step_zero, mutation


def test_the_binary_is_chosen_by_proof_not_by_platform(step_zero: str) -> None:
    """Preference orders the candidates; answering `orchestration --help` picks one."""
    assert "orca-ide" in step_zero
    assert "orchestration --help" in step_zero
    assert re.search(r"[Aa]nswers", step_zero)


def test_an_exit_zero_that_answers_nothing_is_rejected(step_zero: str) -> None:
    """The launcher's reply to every command is exit 0, so exit 0 proves nothing."""
    assert "exit 0" in step_zero
    assert re.search(r"launcher", step_zero)


def test_the_guide_is_loaded_from_the_resolved_binary(step_zero: str) -> None:
    """Version-matched to the runtime being called, so it cannot age against it."""
    assert "skills get orchestration --full" in step_zero
    assert re.search(r"version-matched", step_zero)


def test_the_guide_is_read_before_the_first_lifecycle_call(step_zero: str) -> None:
    """Loading it after a `run-create` is loading it after the first flag guess."""
    assert re.search(r"[Rr]ead it before the first lifecycle call", step_zero)


def test_no_command_is_spelled_against_the_bare_binary() -> None:
    """The defect itself: `orca <group> <verb>` orchestrates nothing on this host.

    `scripts/check-delegate-cli.sh` reports this as BARE BINARY against the live
    CLI; here it is asserted statically, over every doc the plugin ships.
    """
    offenders = {
        f"{doc.relative_to(SKILL_DIR)}: {match.group(0)}"
        for doc in sorted(SKILL_DIR.rglob("*.md"))
        for match in BARE_BINARY.finditer(doc.read_text(encoding="utf-8"))
    }
    assert not offenders, offenders


def test_orchestration_is_never_named_as_an_invocable_skill() -> None:
    """It is not a marketplace plugin and is installed on no machine here."""
    for doc in sorted(SKILL_DIR.rglob("*.md")):
        assert not INVOCABLE_GUIDE.search(doc.read_text(encoding="utf-8")), doc


def test_quickstart_is_gone_and_nothing_links_it(skill_text: str) -> None:
    """It documented a different repo's install lines and a path that never existed."""
    assert not (SKILL_DIR / "references" / "quickstart.md").exists()
    assert "quickstart" not in skill_text


def test_prerequisites_are_named_in_the_skill_itself(prerequisites: str) -> None:
    """`quickstart.md` was what SKILL.md pointed at for these, and it omitted them."""
    assert "`sss`" in prerequisites and "`matt`" in prerequisites
    assert re.search(r"Orca install", prerequisites)
    assert re.search(r"experimental", prerequisites)


def test_every_reference_link_resolves(skill_text: str) -> None:
    """A pointer to a deleted file reads as disclosure and discloses nothing."""
    links = re.findall(r"\]\((references/[^)#]+)", skill_text)
    assert links, "SKILL.md links no references/ file"
    for link in links:
        assert (SKILL_DIR / link).is_file(), link


# --- Step 4: the preflight (#72) ---------------------------------------------


def test_the_preflight_is_one_ordered_sequence(preflight: str) -> None:
    """Each check is a precondition of the next, so the first failure is the one to act on.

    Out of order, the sequence misreads itself: a `run-create` run before the
    runtime check reports a transport error, and a permission-mode read run
    after the Run is bound has already mutated.
    """
    order = [
        "resolve",
        "orchestration --help",
        "status --json",
        "guide",
        "permission mode",
        "run-create",
    ]
    items = re.findall(r"^\d+\. .*?(?=^\d+\. |^\n)", preflight, re.MULTILINE | re.DOTALL)
    assert len(items) == len(order), items
    for item, token in zip(items, order):
        assert token in item, (token, item)


def test_no_run_leaves_a_task_it_does_not_use() -> None:
    """The probe task was permanent litter: there is no `task-delete` verb.

    Retiring it with `task-update --status completed` left the row behind, so
    every run added one. The Run the coordinator needs anyway is the probe now.

    Scoped to the *throwaway* task, not to `task-create`, which stays a
    legitimate verb: a supervised `worker-start --task <id>` needs a task, so
    banning it outright would fail the next ticket for doing the right thing.
    """
    for doc in sorted(SKILL_DIR.rglob("*.md")):
        text = doc.read_text(encoding="utf-8")
        assert "PROBE" not in text, doc
        assert "--status completed" not in text, doc


def test_run_create_is_the_fence_probe(preflight: str) -> None:
    """Same evidence as the throwaway task, and no artifact left behind."""
    heading = "### The fence probe"
    assert heading in preflight, preflight
    fence_probe = preflight.split(heading)[-1]
    assert "run-create" in fence_probe
    assert re.search(r"fence", fence_probe)
    assert re.search(r"[Bb]efore .*(worktree|brief)", flat(preflight))


def test_the_unverifiable_fence_claim_is_gone(skill_text: str) -> None:
    """`orchestration-probe.md` says the *whole lifecycle* is fenced.

    The claim that `run-create` succeeding proves nothing rested on a
    per-command fence nobody could reproduce, and it was the only reason the
    preflight needed a task of its own.
    """
    assert "proves nothing" not in skill_text


def test_the_permission_mode_is_read_not_passed(preflight: str) -> None:
    """Orca supplies the bypass flag as app config, so a skill cannot pass it.

    A host left on manual produces workers that hang on an approval prompt
    nobody is watching — which is not a failure and never reports as one.
    """
    flat_preflight = flat(preflight)
    assert "agentDefaultArgs" in flat_preflight
    assert "--dangerously-skip-permissions" in flat_preflight
    assert "--yolo" in flat_preflight
    assert re.search(r"app config", flat_preflight)
    assert re.search(r"manual-mode host: \*\*stop\*\*", flat_preflight), flat_preflight


def test_a_disabled_feature_is_told_apart_from_a_fence(preflight: str) -> None:
    """Absent lifecycle verbs read like a fenced runtime and are not one.

    Naming the feature is not enough: the clause has to say it is *not* the
    fence, or a coordinator reads the same symptom and quits the app.
    """
    clause = flat(preflight)
    assert re.search(r"experimental", clause)
    assert re.search(r"experimental[^.]*not a fenced runtime", clause), clause


def test_every_preflight_failure_has_one_next_step(preflight_failures: str) -> None:
    """Four failures look alike at the CLI and take four different actions."""
    for cause in ("fenced", "not running", "experimental", "manual"):
        assert cause in preflight_failures, cause
    assert "run-create" in preflight_failures
    assert "task-create" not in preflight_failures


def test_the_probe_reference_is_merged_in_and_gone(
    skill_text: str, preflight_failures: str
) -> None:
    """A one-symptom reference the step already reaches on every failure path.

    Its `run_required` and bare-usage-error cases went with the probe: nothing
    below step 4 makes a lifecycle call before `run-create` binds the Run, and a
    guessed verb is what step 0's loaded guide exists to prevent. `run_required`
    survives only where #72 cites it — as the answer the *retired* probe task
    drew on a clean machine — never as a failure a coordinator has to act on.
    """
    assert not (SKILL_DIR / "references" / "orchestration-probe.md").exists()
    assert "orchestration-probe" not in skill_text
    assert "run_required" not in preflight_failures
    assert "usage error" not in preflight_failures


def test_exactly_two_references_remain() -> None:
    """`worker-launch.md` and `profile-template.md`, and nothing else."""
    assert {doc.name for doc in (SKILL_DIR / "references").glob("*.md")} == {
        "worker-launch.md",
        "profile-template.md",
    }


# --- The review receipt (ADR-0010) ------------------------------------------


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


def test_merge_back_acts_on_a_missing_receipt(merge_back: str) -> None:
    """Failure 3: the teeth. Absence has to cost something, not pass silently.

    ADR-0010's clauses, unchanged: the coordinator opens the receipt before the
    merge, a missing one buys a Standards pass on that branch, and `HANDOFF`
    entries are the coordinator's to fix in the merge commit.
    """
    assert RECEIPT_PATH in merge_back
    assert re.search(r"Standards axis", merge_back)
    assert "HANDOFF" in merge_back
    assert re.search(r"[Bb]efore the merge", merge_back)


def test_the_receipt_heading_matches_its_body(merge_back: str) -> None:
    """The old heading promised a refusal the body does not perform.

    The body runs the Standards axis and then merges — deliberately, per
    ADR-0010, because at a ~1-in-3 trip rate a refusal strands a third of all
    branches. So the heading is what was wrong: a branch merges reviewed, or it
    does not merge.
    """
    assert "No receipt, no merge" not in merge_back
    assert re.search(r"merges reviewed, or not at all", merge_back), merge_back


# --- The `check --wait` resting state ----------------------------------------


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


def test_permitted_turn_ends_are_a_closed_list_and_a_true_one(preamble: str) -> None:
    """All three, closed — and now actually exhaustive.

    The old third entry was "a decline at step 1's gate", while step 4 alone
    stops four more times. A list a reader can falsify from the same file is
    worse than no list: it is consulted once, found incomplete, and thereafter
    treated as advice. Widening the third entry to *refusal-to-start* keeps the
    lookup and absorbs every preflight stop, so the count survives the next stop
    being added.
    """
    flat_preamble = flat(preamble)
    assert "exactly three places" in flat_preamble
    for turn_end in ("final report", "escalation", "refusal-to-start"):
        assert turn_end in flat_preamble, turn_end
    assert re.search(
        r"preflight[^.]*refusal-to-start|refusal-to-start[^.]*preflight", flat_preamble
    ), flat_preamble


def test_the_recap_shape_is_named(preamble: str) -> None:
    """The exact shape that shipped the incident: a recap reading as progress."""
    assert "recap" in preamble


def test_wait_loop_pins_the_timeout(completion: str) -> None:
    """The guide has no default; an unpinned window fakes a checkpoint."""
    assert "--timeout-ms 900000" in completion
    assert re.search(r"[Aa]lways pass", completion)
    assert "no default" in completion


def test_local_work_returns_to_the_wait(skill_text: str) -> None:
    """Step 6 asks for local work; both it and step 5 have to hand back."""
    merge_back = section(skill_text, "6. Merge back in DAG order")
    dispatch = section(skill_text, "5. Dispatch the frontier")
    assert re.search(r"step 7", flat(dispatch)), dispatch
    assert re.search(r"step 7", merge_back)


# --- What the loaded guide already says (#74) --------------------------------

# Each entry is (name, pattern) for a rule verified present in the live guide
# `orca-ide skills get orchestration --full` prints. Matched over every doc the
# plugin ships, not just SKILL.md: a clause retired here and left in a reference
# is still a second copy.
# Each pattern targets the *rule*, never a word the rule happens to use. Too
# broad and it bans ordinary English across the plugin forever; too narrow and
# any rewording walks straight past it. So each alternation carries the clause's
# load-bearing phrase plus the near-synonym a rewrite would reach for first.
GUIDE_DUPLICATES = (
    (
        "ack-or-replay",
        re.compile(r"oldest \*?\*?unacknowledged|makes `check` replay|[Aa]cking is not waiting"),
    ),
    ("a timeout is a checkpoint", re.compile(r"\{count:0\}")),
    ("workers run 15-60 minutes", re.compile(r"15.60 minutes")),
    # The coordinator's *rule*, not the verb: step 5's escape-hatch bullet still
    # names `worker-release` to say it takes no action on an unsupervised worker,
    # which is ADR-0011's point and not this accounting instruction.
    (
        "settled-terminal accounting",
        re.compile(r"[Aa]ccount for every settled|worker-retain|worker-release --dispatch"),
    ),
    (
        "keep rolling until every Dispatch settles",
        re.compile(r"[Kk]eep rolling|until every expected Dispatch|until every Dispatch settles"),
    ),
    (
        "dispatch-capability revocation",
        re.compile(
            r"capability is revoked|dispatch capability[^.]*revoke"
            r"|second report is rejected"
        ),
    ),
)


@pytest.mark.parametrize(
    ("name", "pattern"), GUIDE_DUPLICATES, ids=[d[0] for d in GUIDE_DUPLICATES]
)
def test_the_guide_is_not_restated(
    name: str, pattern: re.Pattern[str], skill_docs: dict[Path, str]
) -> None:
    """A rule the loaded guide carries is a second copy that ages on its own.

    Step 0 loads all 408 lines every run, so the coordinator already has these
    in context by the time it reaches step 5. A pointer into the guide would go
    stale the same way, only more quietly, so the duplicates are deleted rather
    than summarised.
    """
    offenders = {}
    for doc, text in skill_docs.items():
        match = pattern.search(text)
        if match:
            offenders[doc] = match.group(0)
    assert not offenders, (name, offenders)


def test_step_five_defers_lifecycle_to_the_guide(dispatch: str) -> None:
    """The preamble justifying a second copy went with the copies.

    It rested on `orca-cli` and `orchestration` being outside this repo's write
    access — true, and irrelevant once the guide is loaded on every run.
    """
    flat_dispatch = flat(dispatch)
    assert "outside this repo's write access" not in flat_dispatch
    assert re.search(r"guide is authoritative", flat_dispatch), flat_dispatch


# Rules that survive the sweep above, verified against the loaded text. Four of
# the five are simply absent from the guide, so deleting one deletes the only
# copy. `--timeout-ms` is the exception and is kept on narrower grounds: the
# guide *does* say "Always pass `--timeout-ms`" (L379), but it documents no
# default, and it is that gap — an omitted flag leaving the window to the
# runtime, so a bug in the command line arrives as an empty wait — the skill
# states and the guide does not.
SURVIVING_RULES = (
    ("always pass --timeout-ms", r"[Aa]lways pass\*?\*? `--timeout-ms`"),
    ("message bodies via $(cat <file>)", r'"\$\(cat <file>\)"'),
    # The *verification*, not the flag and not step 6's merge-base diff — both
    # of which are asserted elsewhere and would pass this on their own.
    ("verify --base-branch took", r"must equal the integration branch head"),
    ("Unable to write index is contention", r"Unable to write index"),
    ("blocked_by lags the real edges", r"blocked_by"),
)


@pytest.mark.parametrize(("name", "pattern"), SURVIVING_RULES, ids=[r[0] for r in SURVIVING_RULES])
def test_the_rules_the_guide_does_not_carry_survive(
    name: str, pattern: str, skill_text: str
) -> None:
    """Five rules, and the deletion sweep above is what makes them easy to lose.

    Trimming for length takes whatever is nearby, and these sit beside the six
    that went. Four are the only copy in existence of a trap measured on a run;
    `--timeout-ms` survives for the gap named above rather than for absence.

    Flattened, because `SKILL.md` wraps its prose and more than one of these
    clauses straddles a line break — which is not phrasing and must not decide
    whether the rule is present.
    """
    assert re.search(pattern, flat(skill_text)), name


def test_the_timeout_rule_is_kept_for_the_gap_not_for_absence(completion: str) -> None:
    """The guide says *always pass it* too — what it does not say is the default.

    Keeping the line on "the guide has no opinion here" would be the same defect
    this ticket is fixing, one file over. The clause has to name the gap it
    actually fills, or the next maintainer checks the guide, finds the sentence,
    and deletes a rule whose real content was never in it.
    """
    assert "no default" in completion, completion


def test_the_shared_stash_rule_keeps_its_prohibition_and_its_reasoning(
    merge_back: str,
) -> None:
    """The one case where the correct single-checkout reflex damages a sibling.

    `git stash` is right in one checkout, the stack is shared across every
    worktree of the repo, and the damage lands in a tree nobody is looking at.
    The positive form ("park work in a commit") does not explain why the obvious
    move is wrong, so this one keeps its "never" as well.
    """
    flat_merge = flat(merge_back)
    assert re.search(r"[Nn]ever[^.]*`git stash`", flat_merge), flat_merge
    assert re.search(r"one shared stack per repo", flat_merge), flat_merge
    assert re.search(r"another worker's uncommitted work", flat_merge), flat_merge


def test_the_cap_is_justified_by_review_surface_alone(dispatch: str) -> None:
    """`worker-start` retired the contention half of the argument.

    A half-built worker is now a nonzero exit naming its residuals, so a
    setup-hook fan-out that blocks past the Bash timeout is a read verdict
    rather than a silent one. The merge-back review surface is what still caps
    it at 2.
    """
    flat_dispatch = flat(dispatch)
    assert re.search(r"cap concurrency at 2", flat_dispatch), flat_dispatch
    assert re.search(r"review surface", flat_dispatch)
    assert "contention" not in flat_dispatch, flat_dispatch


def test_briefs_and_receipts_share_one_placeholder(skill_docs: dict[Path, str]) -> None:
    """A coordinator reading `/tmp/<slug>/…` opens a path no worker wrote."""
    placeholders = {
        match
        for text in skill_docs.values()
        for match in re.findall(r"/tmp/(<[a-z-]+>)/", text)
    }
    assert placeholders == {"<ticket-slug>"}, placeholders


# Prohibitions that became the instruction they were guarding, each as
# (name, the negative form that must be gone, the positive one that replaced
# it). Both halves belong in one row: dropping the "never" without leaving an
# instruction behind deletes the rule, and the two assertions are what catch
# each half of that. The stash rule is the deliberate exception, tested above.
POSITIVE_INSTRUCTIONS = (
    ("message bodies", r"never backticks", r"[Ww]rite every message body to a file"),
    (
        "merge-base diff",
        r"never `<integration-branch>\.\.HEAD`",
        r"Review each worker's branch against `git merge-base",
    ),
    (
        "the tickets' edges are the DAG",
        r"never re-derive",
        r"blocking edges ARE the dependency DAG",
    ),
    (
        "resolve implement's path",
        r"never copy the last one you saw",
        r"[Rr]esolve that path on THIS machine every run",
    ),
)


@pytest.mark.parametrize(
    ("name", "banned", "required"),
    POSITIVE_INSTRUCTIONS,
    ids=[p[0] for p in POSITIVE_INSTRUCTIONS],
)
def test_the_prohibition_became_an_instruction(
    name: str, banned: str, required: str, skill_text: str
) -> None:
    """The negative form goes, and the rule it carried stays."""
    assert not re.search(banned, skill_text, re.IGNORECASE), name
    assert re.search(required, flat(skill_text)), name


# --- Step 5: one supervised `worker-start` (#73) ------------------------------


def test_dispatch_goes_through_worker_start(dispatch: str) -> None:
    """One supervised call replaces worktree + terminal + wait + read."""
    flat_dispatch = flat(dispatch)
    assert "worker-start" in flat_dispatch
    for flag in ("--task", "--worktree new-child", "--name", "--agent", "--setup run"):
        assert flag in flat_dispatch, flag


def test_the_base_branch_flag_and_its_verification_both_survive(dispatch: str) -> None:
    """An ignored flag and an absent flag fail identically until merge-back."""
    flat_dispatch = flat(dispatch)
    assert "--base-branch" in flat_dispatch
    assert "git merge-base" in flat_dispatch


def test_a_nonzero_exit_is_what_means_the_worker_did_not_start(dispatch: str) -> None:
    """`worker-start` exits 0 only for ready — that is the readiness proof."""
    flat_dispatch = flat(dispatch)
    assert re.search(r"exits 0 \*\*only\*\* for", flat_dispatch), flat_dispatch
    assert re.search(r"[Nn]onzero exit", flat_dispatch)


def test_the_five_retry_readiness_loop_is_gone(skill_docs: dict[Path, str]) -> None:
    """Readiness is decided on process identity, not on a rendered frame.

    A bare shell is the negative signal for "is an agent running", so the
    `tui-idle` wait and the re-read loop that approximated it are both
    redundant against a call that exits 0 only for ready.
    """
    for doc, text in skill_docs.items():
        assert "tui-idle" not in text, doc
        assert not re.search(r"re-read(ing)? up to", text), doc


def test_a_failed_start_is_read_not_guessed_at(dispatch: str) -> None:
    """It names its own wreckage, so a half-built worker is a named residual."""
    flat_dispatch = flat(dispatch)
    for field in ("stage", "effects", "residualResources"):
        assert field in flat_dispatch, field
    assert re.search(r"[Dd]o not guess", flat_dispatch)
    assert re.search(r"automatically retry", flat_dispatch)
    assert "--retry-of" in flat_dispatch


def test_custom_argv_is_only_the_escape_hatch(
    dispatch: str, skill_docs: dict[Path, str]
) -> None:
    """The path the live CLI supersedes, kept for what `worker-start` cannot express.

    `scripts/check-delegate-cli.sh` reports the default spelling as SUPERSEDED
    PATH against the live binary; here the whole plugin is asserted free of it.
    """
    assert "escape hatch" in dispatch
    assert "unsupervised" in dispatch
    for doc, text in skill_docs.items():
        assert "terminal create --command" not in text, doc


def test_the_engine_argv_table_is_gone(launch_ref: str) -> None:
    """`--agent` / `--model` / `--effort` carry the engine choice now.

    The table's one load-bearing column was the permissionless flag, and Orca
    supplies that from app config keyed by engine id — so the column could only
    ever restate, or contradict, a setting no argument here can set.
    """
    assert "cursor-agent --force" not in launch_ref
    assert "--effort medium --dangerously-skip-permissions" not in launch_ref
    for flag in ("--agent", "--model", "--effort"):
        assert flag in launch_ref, flag


def test_the_launch_option_constraints_are_stated_where_they_trip(launch_ref: str) -> None:
    """`--effort` requires `--model`; neither combines with `--terminal`.

    Step 7's terminal reuse is the trip: it hands a settled `--terminal
    <handle>` to the next Dispatch, where a leftover `--model` rejects the call.
    """
    flat_ref = flat(launch_ref)
    assert re.search(r"`--effort` requires `--model`", flat_ref), flat_ref
    assert re.search(r"[Nn]either combines with `--terminal`", flat_ref), flat_ref


def test_the_trust_box_gate_is_restated_against_worker_start(launch_ref: str) -> None:
    """`ready` is a process fact, and a TUI gate is not visible to it."""
    flat_ref = flat(launch_ref)
    assert "Workspace Trust" in flat_ref
    assert "worker-start" in flat_ref
    assert re.search(r"process identity", flat_ref)
    assert re.search(r"no `--enter`", flat_ref)
    assert re.search(r"status line, never the absence", flat_ref), flat_ref
    assert "tail" in flat_ref


def test_the_launch_reference_carries_the_yolo_preflight(launch_ref: str) -> None:
    """The flag is app config keyed by engine, so the read follows `--agent`."""
    flat_ref = flat(launch_ref)
    assert "agentDefaultArgs" in flat_ref
    assert "--yolo" in flat_ref
    assert re.search(r"app config", flat_ref)
