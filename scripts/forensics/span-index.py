#!/usr/bin/env python3
"""Span index: the run ledger and the local transcript tree in, a classified session inventory out.

The run-forensics exercise (issue #130) reads 226 MB of session transcripts through one sub-agent
per session. pw-prove is a *span* inside each of those transcripts, not the file, and slicing 26
spans by hand is both error-prone and silent when it goes wrong. So the slice is computed once,
here, and every downstream step reads this index rather than re-deriving which sessions matter.

For each session in the window it emits the repository and worktree, the transcript path, the skill
versions seen, the ledger record and non-zero-exit counts, the first and last ledger timestamp, and
the transcript line/byte range those timestamps bracket. Sessions are classified `corpus` (the two
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
                                            [--since ISO] [--until ISO] [--out P]

Exit codes:
    0  index emitted
    1  usage or input error (a named input is missing or unreadable)
    2  the window holds no attributable ledger records — named on stderr, no index written
"""

import argparse
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

LEDGER_PREFIX = "PWPROVE_RUN "
DEFAULT_LEDGER = os.path.join(os.path.expanduser("~"), ".ptg", "ledger.jsonl")
DEFAULT_TRANSCRIPTS = os.path.join(os.path.expanduser("~"), ".claude", "projects")
DEFAULT_SINCE = "2026-08-15"


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
                "records": 0, "nonzero_exits": 0, "first_ts": ts, "last_ts": ts, "versions": {},
            })
            entry["records"] += 1
            if rec.get("exit") != 0:
                entry["nonzero_exits"] += 1
            entry["first_ts"] = min(entry["first_ts"], ts)
            entry["last_ts"] = max(entry["last_ts"], ts)
            skill = rec.get("skill") or "unknown"
            version = rec.get("version") or "unknown"
            entry["versions"].setdefault(skill, set()).add(version)

    return sessions, refusals, counts


# --- transcripts -------------------------------------------------------------------------------


def index_transcripts(root):
    """Map session id -> transcript path. Paths only; no body is read here."""
    found = {}
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if name.endswith(".jsonl"):
                found.setdefault(name[:-len(".jsonl")], os.path.join(dirpath, name))
    return found


def scan_transcript(path, first_ts, last_ts):
    """Locate the region of `path` that the ledger window brackets.

    Reads one line at a time and looks at each line's top-level `timestamp` only — enough to place
    the line in time, and never enough to carry transcript content into the index. Lines carrying
    no timestamp (a transcript opens with `mode` and `permission-mode` records that have none)
    cannot be placed, so they never bound a span.

    Returns the span dict, or (None, reason) when nothing falls inside the window.
    """
    line_start = line_end = None
    byte_start = byte_end = None
    entries = 0
    total_lines = 0
    offset = 0

    try:
        fh = open(path, "rb")
    except OSError as exc:
        return None, "transcript unreadable: %s" % exc

    with fh:
        for lineno, raw in enumerate(fh, start=1):
            total_lines = lineno
            length = len(raw)
            start = offset
            offset += length
            try:
                rec = json.loads(raw.decode("utf-8", "replace"))
            except ValueError:
                continue
            if not isinstance(rec, dict):
                continue
            ts = rec.get("timestamp")
            if not isinstance(ts, str) or ts < first_ts or ts > last_ts:
                continue
            entries += 1
            if line_start is None:
                line_start, byte_start = lineno, start
            line_end, byte_end = lineno, start + length

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


# --- classification ----------------------------------------------------------------------------


def split_cwd(cwd):
    """(repository, worktree) for a session's working directory.

    Two layouts appear in practice: an Orca worktree under `.../workspaces/<repo>/<worktree>`, and
    a primary checkout whose last segment is the repository itself.
    """
    parts = [p for p in cwd.split("/") if p]
    if "workspaces" in parts:
        i = parts.index("workspaces")
        if len(parts) > i + 2:
            return parts[i + 1], parts[i + 2]
        if len(parts) > i + 1:
            return parts[i + 1], None
    if parts:
        return parts[-1], None
    return None, None


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
    for sid, agg in ledger_sessions.items():
        path = transcripts.get(sid)
        entry = {
            "session": sid,
            "records": agg["records"],
            "nonzero_exits": agg["nonzero_exits"],
            "first_ts": agg["first_ts"],
            "last_ts": agg["last_ts"],
            "versions": {k: sorted(v) for k, v in sorted(agg["versions"].items())},
            "transcript": path,
        }
        if path is None:
            # Stated, never dropped: a gap the exercise can see is worth more than a corpus that
            # quietly shrank by one session.
            entry["no_transcript"] = True
            entry["repository"] = None
            entry["worktree"] = None
            entry["cwd"] = None
            entry["class"] = "excluded"
            entry["reason"] = ("no transcript on disk for this session, so its repository cannot "
                               "be determined and its span cannot be located")
            entry["span"] = None
            entry["span_note"] = "no transcript"
        else:
            entry["no_transcript"] = False
            cwd = read_cwd(path)
            repository, worktree = split_cwd(cwd) if cwd else (None, None)
            entry["cwd"] = cwd
            entry["repository"] = repository
            entry["worktree"] = worktree
            entry["class"], entry["reason"] = classify(repository)
            span, note = scan_transcript(path, agg["first_ts"], agg["last_ts"])
            entry["span"] = span
            entry["span_note"] = note
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
    }

    return {
        "schema": 1,
        "source": {
            "ledger": os.path.abspath(args.ledger),
            "transcripts": os.path.abspath(args.transcripts),
            "window": {"since": args.since, "until": args.until},
        },
        "totals": totals,
        "refusals": refusals,
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
    parser.add_argument("--out", default=None, help="write the index here (default: stdout)")
    args = parser.parse_args(argv)

    index = build(args)

    for refusal in index["refusals"]:
        print("span-index: refused ledger line %d: %s" % (refusal["line"], refusal["reason"]),
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
