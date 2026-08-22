#!/usr/bin/env python3
"""Span index: the run ledger and the local transcript tree in, a classified session inventory out.

The run-forensics exercise (issue #130) reads 226 MB of session transcripts through one sub-agent
per session. pw-prove is a *span* inside each of those transcripts, not the file, and slicing 26
spans by hand is both error-prone and silent when it goes wrong. So the slice is computed once,
here, and every downstream step reads this index rather than re-deriving which sessions matter.

For each session in the window it emits the repository and worktree, the transcript path, the skill
versions seen, the ledger record and non-zero-exit counts, the first and last ledger timestamp, and
the transcript line/byte range those timestamps bracket, and the two ranges either side of it that
the ledger cannot see: the **lead** back to the turn that loaded pw-prove, which is where Steps 1 and
2 live, and the bounded **reaction tail** after the last script exited, where a failure is actually
handled and the final report is written. Sessions are classified `corpus` (the two
repositories under audit), `control` (this repository's own dev and CI sessions, whose failures are
deliberate) or `excluded` with a stated reason.

Two rules the exercise depends on, both enforced here rather than left to the reader:

  - A session the ledger knows but no transcript exists for is emitted with an explicit marker. A
    corpus that silently shrinks is worse than one that reports a gap.
  - A window holding no records exits non-zero. An empty corpus emitted with exit 0 reads as
    "nothing went wrong", which is the one thing it does not mean.

Repo-only tooling: no npm dependency, standard library only. Python for the same reason
scripts/ci/derive-stamp.py is — it parses JSON and walks a directory tree.

Usage:
    python3 scripts/forensics/span-index.py [--ledger P] [--transcripts D]
                                            [--since ISO] [--until ISO]
                                            [--lead-lines N]
                                            [--tail-lines N] [--tail-minutes N] [--out P]

Exit codes:
    0  index emitted
    1  usage or input error (a named input is missing or unreadable)
    2  the window holds no attributable ledger records — named on stderr, no index written
"""

import argparse
import datetime
import json
import os
import sys

# Ledger schemas this index knows how to read. Fields are added over time, so an unrecognised
# schema is REFUSED rather than read with its absent fields as null — the whole point of the
# `schema` field is that a reader can tell "not present" from "not written yet".
KNOWN_SCHEMAS = {1, 2}
# Schemas predating the `session` field. A record with no session cannot be attributed to one.
SESSIONLESS_SCHEMAS = {1}

# Issue #130 fixes the corpus at exactly these two repositories, and retains e2e-skills as a
# control list: its CI runs exercise failure paths deliberately, so their non-zero exits are not
# evidence of struggle. Everything else is out.
CORPUS_REPOS = {"nuxt-hyrd-chrysus", "hyrd-widget"}
CONTROL_REPOS = {"e2e-skills"}
KNOWN_REPOS = CORPUS_REPOS | CONTROL_REPOS

LEDGER_PREFIX = "PWPROVE_RUN "
DEFAULT_LEDGER = os.path.join(os.path.expanduser("~"), ".ptg", "ledger.jsonl")
DEFAULT_TRANSCRIPTS = os.path.join(os.path.expanduser("~"), ".claude", "projects")
DEFAULT_SINCE = "2026-08-15"

# The reaction tail. The span ends when the last shipped script EXITS, but what the agent then did
# about that result — the turns where a failure is actually handled, or the final report is written
# — lands after it. So the index emits a bounded tail as well, and the two caps below are measured
# rather than guessed: across the 26 corpus sessions the reaction ran 10 to 128 lines and, in 25 of
# 26, under six minutes. Neither cap binds on a reaction; they exist because 13 of those sessions
# never hand control back, and two of those transcripts carry on into unrelated work for another
# 1,145 and 2,617 lines. See docs/studies/session-distillation.md.
DEFAULT_TAIL_LINES = 150
DEFAULT_TAIL_MINUTES = 30

# The lead. The span's LOWER bound is the first ledger record, so everything before the first script
# ran — Step 1's environment work and Step 2's derivation, the part of a run that reads the target
# repository's profile — falls outside it. Across the corpus that is 49 to 398 lines, median 117,
# and it is missing from 25 of the 26 sessions unless the span reaches back to the turn that loaded
# pw-prove. The cap is a backstop against a resumed session whose load turn is hours behind, and at
# 500 it clears the widest lead observed by a quarter.
DEFAULT_LEAD_LINES = 500


def end_of(ts, duration_ms):
    """The ISO timestamp a record's script finished at: its start plus its measured duration.

    String arithmetic is not an option and a dependency is not either, so this goes through the
    standard library's own parser and comes back in the same shape the ledger writes.
    """
    if not isinstance(duration_ms, int) or duration_ms <= 0:
        return ts
    try:
        started = datetime.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return ts
    ended = started + datetime.timedelta(milliseconds=duration_ms)
    return ended.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (ended.microsecond // 1000)


def plus_minutes(ts, minutes):
    """`ts` moved forward by `minutes`. A deadline, which is not what end_of() names."""
    return end_of(ts, minutes * 60 * 1000)


def die(message, code=1):
    print("span-index: " + message, file=sys.stderr)
    raise SystemExit(code)


# --- ledger ------------------------------------------------------------------------------------


def read_ledger(path, since, until):
    """Group the ledger's in-window records by session.

    Returns (sessions, refusals, counts). `refusals` names every record the index would have had
    to guess at; nothing is dropped quietly.
    """
    sessions = {}
    refusals = []
    counts = {"read": 0, "malformed": 0, "out_of_window": 0}

    try:
        fh = open(path, "r", encoding="utf-8", errors="replace")
    except OSError as exc:
        die("cannot read ledger %s: %s" % (path, exc))

    with fh:
        for lineno, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            if not line.startswith(LEDGER_PREFIX):
                counts["malformed"] += 1
                continue
            try:
                rec = json.loads(line[len(LEDGER_PREFIX):])
            except ValueError:
                counts["malformed"] += 1
                continue
            counts["read"] += 1

            # The schema is read BEFORE anything else: every other field's presence depends on it.
            schema = rec.get("schema")
            if schema not in KNOWN_SCHEMAS:
                refusals.append({
                    "line": lineno,
                    "reason": "unknown ledger schema %r — this index knows %s" % (
                        schema, ", ".join(str(s) for s in sorted(KNOWN_SCHEMAS))),
                })
                continue

            ts = rec.get("ts") or ""
            if ts < since or (until is not None and ts >= until):
                counts["out_of_window"] += 1
                continue

            if schema in SESSIONLESS_SCHEMAS or not rec.get("session"):
                refusals.append({
                    "line": lineno,
                    "reason": "ledger schema %s carries no session field; the record cannot be "
                              "attributed to a session" % schema,
                })
                continue

            entry = sessions.setdefault(rec["session"], {
                "records": 0, "nonzero_exits": 0, "first_ts": ts, "last_ts": ts,
                "span_until": ts, "versions": {},
            })
            entry["records"] += 1
            if rec.get("exit") != 0:
                entry["nonzero_exits"] += 1
            entry["first_ts"] = min(entry["first_ts"], ts)
            entry["last_ts"] = max(entry["last_ts"], ts)
            # `ts` is when the script STARTED. Ending the span there would cut the last invocation
            # off before it wrote its own result, which is the part a forensic reader most wants.
            entry["span_until"] = max(entry["span_until"], end_of(ts, rec.get("duration_ms")))
            skill = rec.get("skill") or "unknown"
            version = rec.get("version") or "unknown"
            entry["versions"].setdefault(skill, set()).add(version)

    return sessions, refusals, counts


# --- transcripts -------------------------------------------------------------------------------


def index_transcripts(root):
    """Map session id -> sorted list of transcript paths. Paths only; no body is read here.

    A list rather than a path because one session id can appear under two project directories (a
    session resumed after a `cd`, or a copied tree). Keeping only the first one os.walk happened to
    reach would decide silently which transcript the whole exercise reads, and this file's rule is
    that ambiguity is stated. The caller reports the collision and takes the first by sort order.
    """
    found = {}
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if name.endswith(".jsonl"):
                found.setdefault(name[:-len(".jsonl")], []).append(os.path.join(dirpath, name))
    return {sid: sorted(paths) for sid, paths in found.items()}


def scan_transcript(path, window):
    """Locate the region of `path` that the ledger window brackets.

    Reads one line at a time and looks at each line's top-level `timestamp` only — enough to place
    the line in time, and never enough to carry transcript content into the index. Lines carrying
    no timestamp (a transcript opens with `mode` and `permission-mode` records that have none)
    cannot be placed, so they never bound a span.

    `window` is the (first_ts, last_ts) pair the session's ledger records bracket, inclusive at
    both ends. Always returns a (span, reason) pair; exactly one half is None.
    """
    first_ts, last_ts = window
    line_start = line_end = None
    byte_start = byte_end = None
    entries = 0
    total_lines = 0

    try:
        for lineno, start, end, rec in iter_records(path):
            total_lines = lineno
            if rec is None:
                continue
            ts = rec.get("timestamp")
            if not isinstance(ts, str) or ts < first_ts or ts > last_ts:
                continue
            entries += 1
            if line_start is None:
                line_start, byte_start = lineno, start
            line_end, byte_end = lineno, end
    except OSError as exc:
        return None, "transcript unreadable: %s" % exc

    if line_start is None:
        return None, ("no timestamped transcript entry falls between %s and %s"
                      % (first_ts, last_ts))
    return {
        "line_start": line_start,
        "line_end": line_end,
        "byte_start": byte_start,
        "byte_end": byte_end,
        "entries": entries,
        "transcript_lines": total_lines,
    }, None


SKILL_NAME = "pw-prove"


def iter_records(path, start_line=1, start_byte=0):
    """(lineno, byte_start, byte_end, record) for every line from `start_byte` on.

    `record` is None for a line that is not a JSON object, so a caller can still place the line and
    count its bytes. One walk with three callers, because the offset arithmetic is the part that
    mis-slices a range silently when it is written out three times. Raises OSError like open() does.
    """
    with open(path, "rb") as fh:
        fh.seek(start_byte)
        offset = start_byte
        lineno = start_line - 1
        for raw in fh:
            lineno += 1
            start = offset
            offset += len(raw)
            try:
                parsed = json.loads(raw.decode("utf-8", "replace"))
            except ValueError:
                parsed = None
            yield lineno, start, offset, parsed if isinstance(parsed, dict) else None


def names_skill(value):
    """True when `value` addresses pw-prove itself, in any of the forms a caller writes it.

    A skill is addressed bare (`pw-prove`), namespaced (`e2e:pw-prove`) or as a slash command
    (`/e2e:pw-prove`), and any of those may be the whole argument or the head of one. A NEIGHBOUR
    whose name merely starts with it (`pw-prove-lite`, `pw-prove-forensics`) is a different skill.
    """
    head = value.strip().split()[0] if value.strip() else ""
    return head.lstrip("/").rsplit(":", 1)[-1] == SKILL_NAME


def load_marker(rec):
    """The mark a record carries if it is the turn that loaded pw-prove, else None.

    Three shapes appear across the corpus and all three are honoured, because which one a session
    left behind is an accident of how the operator started it: the slash command they typed, the
    `Skill` tool the agent called, and the skill body the harness then injects.
    """
    message = rec.get("message") or {}
    content = message.get("content")
    blocks = content if isinstance(content, list) else []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "tool_use" and block.get("name") == "Skill":
            # Matched on the NAME, not on a substring of the whole input. `SKILL_NAME in
            # json.dumps(input)` would anchor on a call to `pw-prove-lite`, or on one whose
            # arguments merely mention pw-prove — the bare-substring defect this repo already
            # names once, in the eval judges.
            for value in (block.get("input") or {}).values():
                if isinstance(value, str) and names_skill(value):
                    return "skill-tool"
    text = content if isinstance(content, str) else "".join(
        b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text")
    if not text:
        return None
    # The injected body is the WHOLE skill, so only its first line is a usable mark.
    first = text.split("\n", 1)[0].strip()
    if first.startswith("Base directory for this skill:") and first.endswith(SKILL_NAME):
        return "skill-body"
    if "<command-name>" in text:
        for line in text.split("\n"):
            if "<command-name>" not in line:
                continue
            named = line.split("<command-name>", 1)[1].split("<", 1)[0]
            if names_skill(named):
                return "slash-command"
    return None


def scan_lead(path, span, first_ts, lead_lines):
    """The lead: from the turn that loaded pw-prove down to where the span begins.

    Anchored on a MARK rather than on a distance, so a session that spent forty minutes in Step 2
    keeps all of it and a session that spent one keeps one. The cap only guards the pathological
    case — a resumed session whose load turn is hours and thousands of lines behind — and when it
    binds it still names the turn it could not reach back to, because a reader who can see what was
    cut can widen it deliberately.
    """
    lead = {
        "line_start": span["line_start"],
        "line_end": span["line_start"] - 1,
        "byte_start": span["byte_start"],
        "byte_end": span["byte_start"],
        "lines": 0,
        "marker": None,
        "marker_line": None,
        "marker_byte": None,
        "stop": "not-found",
    }
    try:
        for lineno, start, _end, rec in iter_records(path):
            if lineno >= span["line_start"]:
                break
            if rec is None:
                continue
            ts = rec.get("timestamp")
            if isinstance(ts, str) and ts > first_ts:
                break
            mark = load_marker(rec)
            if mark:
                # The LAST load before the span wins: an earlier one belongs to an earlier attempt.
                lead["marker"] = mark
                lead["marker_line"] = lineno
                lead["marker_byte"] = start
    except OSError:
        return lead

    if lead["marker_line"] is None:
        return lead

    lines = span["line_start"] - lead["marker_line"]
    if lines <= lead_lines:
        lead["line_start"] = lead["marker_line"]
        lead["byte_start"] = lead["marker_byte"]
        lead["lines"] = lines
        lead["stop"] = "skill-load"
        return lead

    # Capped: walk forward to the first line the cap allows and start there.
    lead["stop"] = "line-cap"
    wanted = span["line_start"] - lead_lines
    try:
        for lineno, start, _end, _rec in iter_records(path):
            if lineno == wanted:
                lead["line_start"] = lineno
                lead["byte_start"] = start
                lead["lines"] = lead_lines
                break
    except OSError:
        pass
    return lead


def is_human_turn(rec):
    """True for a turn the operator typed, false for the tool-result stream that looks like one.

    Both arrive as `type: "user"`. The overwhelming majority are tool results the harness posts on
    the agent's behalf, and reading one as a human turn would end almost every tail on its first
    line. The two marks that separate them: a tool result carries `toolUseResult`, and its content
    blocks are `tool_result` rather than `text`.
    """
    if rec.get("type") != "user" or rec.get("toolUseResult"):
        return False
    # A loaded skill's body is `type: "user"` with text content and nobody typed it. It carries
    # `isMeta`, and `sourceToolUseID` when a Skill call produced it. The n=1 distillation ended its
    # tail on one of these and reported it as the operator speaking.
    if rec.get("isMeta") or rec.get("sourceToolUseID"):
        return False
    content = (rec.get("message") or {}).get("content")
    if isinstance(content, str):
        return bool(content.strip())
    if isinstance(content, list):
        return any(isinstance(b, dict) and b.get("type") == "text" for b in content)
    return False


def scan_tail(path, span, span_until, tail_lines, tail_minutes):
    """The reaction tail: what follows the span, bounded so it cannot swallow the working day.

    Reads forward from the span's last byte and stops at whichever comes first — the operator's
    next turn (included, because a correction typed the moment a script fails IS the friction the
    exercise is looking for), the line cap, the time cap, or the end of the transcript. Always
    returns a dict naming which of the four stopped it: a tail that was cut and a tail that ran out
    are different evidence, and a reader who cannot tell them apart will read a cap as an ending.
    """
    deadline = plus_minutes(span_until, tail_minutes)
    tail = {
        "line_start": span["line_end"] + 1,
        "line_end": span["line_end"],
        "byte_start": span["byte_end"],
        "byte_end": span["byte_end"],
        "lines": 0,
        "human_turn_line": None,
        "stop": "end-of-transcript",
    }
    try:
        records = iter_records(path, span["line_end"] + 1, span["byte_end"])
    except OSError:
        return tail

    for lineno, _start, end, rec in records:
        if tail["lines"] >= tail_lines:
            tail["stop"] = "line-cap"
            break
        ts = (rec or {}).get("timestamp")
        if isinstance(ts, str) and ts > deadline:
            tail["stop"] = "time-cap"
            break
        tail["line_end"] = lineno
        tail["byte_end"] = end
        tail["lines"] += 1
        if rec is not None and is_human_turn(rec):
            tail["human_turn_line"] = lineno
            tail["stop"] = "human-turn"
            break

    return tail


# --- classification ----------------------------------------------------------------------------


def split_cwd(cwd):
    """(repository, worktree) for a session's working directory.

    Two layouts appear in practice: an Orca worktree under `.../workspaces/<repo>/<worktree>`, and
    a primary checkout whose last segment is the repository itself.

    A session entered at a SUBDIRECTORY is the trap here. Taking the last segment would read
    `.../nuxt-hyrd-chrysus/apps/web` as a repository called `web` and exclude it with a reason that
    reads perfectly right — a wrong classification that announces itself as a correct one, which is
    exactly the silent failure this index exists to prevent. So a known repository name anywhere in
    the path wins over the last segment.
    """
    parts = [p for p in cwd.split("/") if p]
    if not parts:
        return None, None
    if "workspaces" in parts:
        i = parts.index("workspaces")
        if len(parts) > i + 2:
            return parts[i + 1], parts[i + 2]
        if len(parts) > i + 1:
            return parts[i + 1], None
    for segment in reversed(parts):
        if segment in KNOWN_REPOS:
            return segment, None
    return parts[-1], None


def read_cwd(path):
    """The session's working directory, from the first transcript record that states one.

    Real transcripts state `cwd` on every message record; the handful of header records at the top
    of the file do not, so this reads forward a little rather than trusting line 1.
    """
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for _ in range(200):
                line = fh.readline()
                if not line:
                    break
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if isinstance(rec, dict) and isinstance(rec.get("cwd"), str) and rec["cwd"]:
                    return rec["cwd"]
    except OSError:
        return None
    return None


def classify(repository):
    if repository in CORPUS_REPOS:
        return "corpus", None
    if repository in CONTROL_REPOS:
        return "control", ("%s is this repository's own dev and CI work; its failures are "
                           "deliberate, so it is a control rather than corpus" % repository)
    if repository:
        return "excluded", "repository %s is outside the corpus" % repository
    return "excluded", "the session's repository could not be determined"


# --- assembly ----------------------------------------------------------------------------------


def tally_fields(sid, tally):
    """The half of a session entry that comes from the ledger alone."""
    return {
        "session": sid,
        "records": tally["records"],
        "nonzero_exits": tally["nonzero_exits"],
        "first_ts": tally["first_ts"],
        "last_ts": tally["last_ts"],
        "span_until": tally["span_until"],
        "versions": {k: sorted(v) for k, v in sorted(tally["versions"].items())},
    }


def unplaced():
    """The half of a session entry for a session with no transcript on disk.

    Stated, never dropped: a gap the exercise can see is worth more than a corpus that quietly
    shrank by one session.
    """
    return {
        "transcript": None,
        "no_transcript": True,
        "cwd": None,
        "repository": None,
        "worktree": None,
        "class": "excluded",
        "reason": ("no transcript on disk for this session, so its repository cannot be "
                   "determined and its span cannot be located"),
        "lead": None,
        "span": None,
        "span_note": "no transcript",
        "tail": None,
    }


def placed(path, tally, tail_lines, tail_minutes, lead_lines):
    """The half of a session entry that comes from the transcript: where it ran, and where to look."""
    cwd = read_cwd(path)
    repository, worktree = split_cwd(cwd) if cwd else (None, None)
    span, note = scan_transcript(path, (tally["first_ts"], tally["span_until"]))
    tail = (scan_tail(path, span, tally["span_until"], tail_lines, tail_minutes)
            if span else None)
    lead = scan_lead(path, span, tally["first_ts"], lead_lines) if span else None
    class_, reason = classify(repository)
    return {
        "transcript": path,
        "no_transcript": False,
        "cwd": cwd,
        "repository": repository,
        "worktree": worktree,
        "class": class_,
        "reason": reason,
        "lead": lead,
        "span": span,
        "span_note": note,
        "tail": tail,
    }


def build(args):
    if not os.path.isfile(args.ledger):
        die("ledger not found: %s" % args.ledger)
    if not os.path.isdir(args.transcripts):
        die("transcript directory not found: %s" % args.transcripts)

    ledger_sessions, refusals, counts = read_ledger(args.ledger, args.since, args.until)
    if not ledger_sessions:
        die("no ledger record in %s falls in the window [%s, %s) — refusing to emit an empty "
            "corpus, which would read as 'nothing went wrong' (%d record(s) read, %d out of "
            "window, %d refused)"
            % (args.ledger, args.since, args.until or "end of ledger",
               counts["read"], counts["out_of_window"], len(refusals)),
            code=2)

    transcripts = index_transcripts(args.transcripts)

    sessions = []
    ambiguous = []
    for sid, tally in ledger_sessions.items():
        paths = transcripts.get(sid) or []
        if len(paths) > 1:
            ambiguous.append({"session": sid, "paths": paths})
        entry = dict(tally_fields(sid, tally))
        entry.update(placed(paths[0], tally, args.tail_lines, args.tail_minutes,
                            args.lead_lines) if paths else unplaced())
        entry["transcript_also_at"] = paths[1:]
        sessions.append(entry)

    sessions.sort(key=lambda s: (s["first_ts"], s["session"]))

    totals = {
        "sessions": len(sessions),
        "corpus": sum(1 for s in sessions if s["class"] == "corpus"),
        "control": sum(1 for s in sessions if s["class"] == "control"),
        "excluded": sum(1 for s in sessions if s["class"] == "excluded"),
        "no_transcript": sum(1 for s in sessions if s["no_transcript"]),
        "records": sum(s["records"] for s in sessions),
        "nonzero_exits": sum(s["nonzero_exits"] for s in sessions),
        "refused_records": len(refusals),
        "malformed_lines": counts["malformed"],
        "out_of_window_records": counts["out_of_window"],
        "ambiguous_transcripts": len(ambiguous),
    }

    return {
        "schema": 1,
        "source": {
            "ledger": os.path.abspath(args.ledger),
            "transcripts": os.path.abspath(args.transcripts),
            "window": {"since": args.since, "until": args.until},
            "lead": {"lines": args.lead_lines},
            "tail": {"lines": args.tail_lines, "minutes": args.tail_minutes},
        },
        "totals": totals,
        "refusals": refusals,
        "ambiguous_transcripts": ambiguous,
        "sessions": sessions,
    }


def main(argv):
    parser = argparse.ArgumentParser(
        prog="span-index.py",
        description="Classified session inventory from the pw-prove run ledger and the local "
                    "Claude Code transcript tree.")
    parser.add_argument("--ledger", default=os.environ.get("PWPROVE_LEDGER") or DEFAULT_LEDGER,
                        help="run ledger JSONL (default: $PWPROVE_LEDGER or ~/.ptg/ledger.jsonl)")
    parser.add_argument("--transcripts", default=DEFAULT_TRANSCRIPTS,
                        help="transcript tree root (default: ~/.claude/projects)")
    parser.add_argument("--since", default=DEFAULT_SINCE,
                        help="window lower bound, inclusive, ISO-8601 prefix (default: %s)"
                             % DEFAULT_SINCE)
    parser.add_argument("--until", default=None,
                        help="window upper bound, exclusive, ISO-8601 prefix (default: none)")
    parser.add_argument("--lead-lines", type=int, default=DEFAULT_LEAD_LINES,
                        help="most transcript lines the lead may reach back for the turn that "
                             "loaded pw-prove (default: %d)" % DEFAULT_LEAD_LINES)
    parser.add_argument("--tail-lines", type=int, default=DEFAULT_TAIL_LINES,
                        help="most transcript lines the reaction tail may take (default: %d)"
                             % DEFAULT_TAIL_LINES)
    parser.add_argument("--tail-minutes", type=int, default=DEFAULT_TAIL_MINUTES,
                        help="minutes past the last script exit the reaction tail may reach "
                             "(default: %d)" % DEFAULT_TAIL_MINUTES)
    parser.add_argument("--out", default=None, help="write the index here (default: stdout)")
    args = parser.parse_args(argv)

    index = build(args)

    for refusal in index["refusals"]:
        print("span-index: refused ledger line %d: %s" % (refusal["line"], refusal["reason"]),
              file=sys.stderr)
    for entry in index["sessions"]:
        if entry["no_transcript"]:
            print("span-index: session %s is in the ledger with %d record(s) but has no transcript "
                  "on disk; it cannot be classified or spanned" % (entry["session"], entry["records"]),
                  file=sys.stderr)
    for clash in index["ambiguous_transcripts"]:
        print("span-index: session %s has %d transcripts on disk; reading %s and naming the rest "
              "in transcript_also_at" % (clash["session"], len(clash["paths"]), clash["paths"][0]),
              file=sys.stderr)

    text = json.dumps(index, indent=2, sort_keys=False) + "\n"
    if args.out:
        try:
            with open(args.out, "w", encoding="utf-8") as fh:
                fh.write(text)
        except OSError as exc:
            die("cannot write %s: %s" % (args.out, exc))
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
