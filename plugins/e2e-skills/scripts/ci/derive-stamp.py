#!/usr/bin/env python3
"""Stamp a case's `derived_from_prompt:` digest — the re-derivation record check 9 of
`scripts/ci/test-case-shapes.sh` reads.

A judge's assertions are written against ONE prompt. When that prompt moves, some of them become
unreachable and some become free, so they are re-derived rather than inherited — #80 repaired
case-61's premise and left an assertion the repair had made meaningless, which scored the case 0/3
across three correct answers. The digest is how a prompt repair announces itself.

Run it AFTER reading the judge against the new prompt, never as a way to clear a red run:

    python3 scripts/ci/derive-stamp.py case-61            # one case
    python3 scripts/ci/derive-stamp.py --all              # every case missing or stale
    python3 scripts/ci/derive-stamp.py --check            # print what would change, write nothing

The digest is sha256 of every string the case puts in front of the agent — `input.prompt` plus each
`input.turns[].content` — joined with newlines, first 12 hex characters. It is written as a
top-level key and appended textually rather than by re-serialising the YAML, so a stamp does not
reformat 49 case files into an unreviewable diff.
"""
import hashlib
import pathlib
import re
import sys

import yaml

KEY = 'derived_from_prompt'
ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = ROOT / 'skills' / 'pw-prove' / 'evals' / 'cases'


def prompt_text(case):
    """Every string a case puts in front of the agent, joined. Mirrors test-case-shapes.sh."""
    inp = case.get('input') or {}
    parts = []
    if isinstance(inp.get('prompt'), str):
        parts.append(inp['prompt'])
    for turn in inp.get('turns') or []:
        if isinstance(turn, dict) and isinstance(turn.get('content'), str):
            parts.append(turn['content'])
    return '\n'.join(parts)


def digest(case):
    return hashlib.sha256(prompt_text(case).encode('utf-8')).hexdigest()[:12]


def stamp(path, want, write=True):
    text = path.read_text(encoding='utf-8')
    line = f'{KEY}: {want}'
    pattern = re.compile(rf'^{KEY}:.*$', re.M)
    new = pattern.sub(line, text) if pattern.search(text) else (
        text if text.endswith('\n') else text + '\n') + line + '\n'
    if new == text:
        return False
    if write:
        path.write_text(new, encoding='utf-8')
    return True


def main(argv):
    check = '--check' in argv
    every = '--all' in argv or check
    names = [a for a in argv if not a.startswith('--')]
    if not every and not names:
        print(__doc__.strip().splitlines()[0], file=sys.stderr)
        print('usage: derive-stamp.py <case-id>... | --all | --check', file=sys.stderr)
        return 2

    paths = sorted(CASES.glob('*.yaml')) if every else [CASES / f'{n}.yaml' for n in names]
    changed = 0
    for path in paths:
        if not path.is_file():
            print(f'no such case file: {path}', file=sys.stderr)
            return 1
        case = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
        want = digest(case)
        if case.get(KEY) == want:
            continue
        if stamp(path, want, write=not check):
            changed += 1
            print(f'{"would stamp" if check else "stamped"} {path.name}: {KEY}: {want}')
    print(f'{changed} case file(s) {"would change" if check else "stamped"}')
    return 1 if (check and changed) else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
