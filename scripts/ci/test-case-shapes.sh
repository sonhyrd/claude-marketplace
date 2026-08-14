#!/usr/bin/env bash
# Prompt-shape attribution over the pw-prove eval cases (issue #60).
#
# A case prompt has one of two shapes, and the shape decides what a NOT-LOADED verdict from
# `skills/pw-prove/evals/judges/skill-loaded.mjs` means:
#
#   trigger   The prompt is a realistic top-of-task request. Nothing tells the agent to load
#             pw-prove; whether it does is the measurement. A trigger case that fails to load is a
#             defect in the skill's `description:` frontmatter, recorded as such — never repaired by
#             editing the prompt, which would destroy the only signal the case produces.
#   behavior  The prompt presupposes mid-run context — a step number, a preflight exit code, a
#             pasted server log. Nothing about such a prompt would ever trip the skill's trigger, so
#             the case must place the agent inside the skill explicitly. Then a failure means the
#             BODY was wrong, which is what the case exists to measure.
#
# The classification is recorded in each case file's `shape:` key and narrated in
# `skills/pw-prove/evals/prompt-shapes.md`. This script is what keeps the two honest: a new case
# with no shape, a behavior case that forgot the placement line, or a trigger case that quietly
# grew one, all go red here.
#
# Deliberately NOT wired into `ci-local.sh`. No CI check reads the eval suite, in any skill, by
# decision (#54) — CI is the contract for the shipped surface and the eval suite is an instrument
# operated by hand, exactly as `scripts/ci/test-eval-judges.sh` is. Run it by name:
#
#   bash scripts/ci/test-case-shapes.sh
#
# The last section runs the checks against deliberately malformed cases and requires them to go
# RED. A harness that cannot go red tests nothing.
#
# Dependency, unlike every sibling suite here: **python3 with PyYAML**. The case files are read as
# YAML rather than grepped, so a case that moved a key or refolded a scalar still reads correctly —
# which is the whole point when the last change to this suite refolded 62 of them. Missing either is
# a refusal with a named reason, never a skip: an instrument that skips proves nothing.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || exit 1
# The self-test re-invokes THIS file, not the committed path of the same name — so an edit under
# review is what goes red, rather than whatever happens to be checked in beside it.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" || exit 1
cd "$REPO_ROOT" || exit 1

EVALS_ROOT="${PWPROVE_EVALS_ROOT:-$REPO_ROOT/skills/pw-prove/evals}"
SELF_TEST="${PWPROVE_CASE_SHAPES_SELFTEST:-1}"

command -v python3 >/dev/null 2>&1 || {
  echo "test-case-shapes.sh: python3 is required" >&2
  exit 1
}
python3 -c 'import yaml' 2>/dev/null || {
  echo "test-case-shapes.sh: python3 -c 'import yaml' failed — PyYAML is required" >&2
  exit 1
}

pass=0
fail=0
ok()  { pass=$((pass + 1)); echo "  [PASS] $1"; }
bad() { fail=$((fail + 1)); echo "  [FAIL] $1"; }

# --- the checks -------------------------------------------------------------------------------------
# One python pass over the suite, printing one `PASS <text>` / `FAIL <text>` line per finding, so the
# shell owns the tally and the exit code and python owns nothing but the reading.
run_checks() {
  EVALS_ROOT="$1" python3 - <<'PY'
import hashlib
import os
import pathlib
import re
import sys

import yaml

root = pathlib.Path(os.environ['EVALS_ROOT'])
# `context.files` values are resolved against the EVALS root (a case names `evals/files/x` from
# there); `context.repo_fixture` is resolved by skill-up against the SKILL directory, one level up.
# Two bases, so both are named.
skill_dir = root.parent
cases_dir = root / 'cases'
eval_yaml = root / 'eval.yaml'

# The canonical placement line. One wording, because a behavior case that invents its own is a
# behavior case nobody can grep for — and this is the only mechanism putting the body in context.
PLACEMENT = re.compile(r'Load the .?pw-prove.? skill with the Skill tool', re.I)
# Role injection asserts a persona; it does not load a body. b01 carried "You are pw-prove." into
# the only recorded run and still read NOT LOADED. It is allowed beside the placement line and
# forbidden as a substitute for it, and forbidden outright in a trigger prompt.
ROLE_INJECTION = re.compile(r'You are (the )?.?pw-prove', re.I)
SHAPES = ('trigger', 'behavior')

verdicts = []
def report(good, text):
    verdicts.append(('PASS' if good else 'FAIL', text))

def report_all(summary, problems):
    """One headline verdict, then one line per offender so the fix is named, not hunted."""
    report(not problems, summary)
    for line in problems:
        report(False, line)

if not cases_dir.is_dir():
    print(f'FAIL no cases directory at {cases_dir}')
    sys.exit(0)

def prompt_text(case):
    """Every string a case puts in front of the agent, joined."""
    inp = case.get('input') or {}
    parts = []
    if isinstance(inp.get('prompt'), str):
        parts.append(inp['prompt'])
    for turn in inp.get('turns') or []:
        if isinstance(turn, dict) and isinstance(turn.get('content'), str):
            parts.append(turn['content'])
    return '\n'.join(parts)

def first_prompt(case):
    """What the agent is handed FIRST. A placement line in turn 3 places nothing in turn 1."""
    inp = case.get('input') or {}
    if isinstance(inp.get('prompt'), str):
        return inp['prompt']
    for turn in inp.get('turns') or []:
        if isinstance(turn, dict) and isinstance(turn.get('content'), str):
            return turn['content']
    return ''

cases = {}
for path in sorted(cases_dir.glob('*.yaml')):
    try:
        cases[path.stem] = (path, yaml.safe_load(path.read_text(encoding='utf-8')) or {})
    except Exception as exc:  # noqa: BLE001 — the filename and the parser's own words are the report
        report(False, f'{path.name}: does not parse as YAML ({exc.__class__.__name__})')

if not cases:
    print('FAIL no case files found — the checks would pass vacuously')
    sys.exit(0)

# 1. Every case is classified, and the classification is one of the two shapes.
unclassified = []
for cid, (path, case) in cases.items():
    shape = case.get('shape')
    if shape not in SHAPES:
        unclassified.append(f'{path.name}: shape is {shape!r}, expected one of {SHAPES}')
report_all(f'every case declares shape: trigger|behavior ({len(cases)} case file(s))', unclassified)

# 2. A behavior case places the agent inside the skill, in the FIRST thing it is handed.
missing = []
for cid, (path, case) in cases.items():
    if case.get('shape') != 'behavior':
        continue
    if not PLACEMENT.search(first_prompt(case)):
        missing.append(f'{path.name}: behavior case does not place the agent in the skill')
report_all('every behavior case places the agent in the skill explicitly', missing)

# 3. A trigger case keeps a realistic top-of-task prompt: no placement line, no role injection.
staged = []
for cid, (path, case) in cases.items():
    if case.get('shape') != 'trigger':
        continue
    text = prompt_text(case)
    if PLACEMENT.search(text):
        staged.append(f'{path.name}: trigger case carries the placement line — loading is no longer the measurement')
    if ROLE_INJECTION.search(text):
        staged.append(f'{path.name}: trigger case carries role injection — its prompt is not a top-of-task request')
report_all('every trigger case keeps a realistic top-of-task prompt', staged)

# 4. The active list resolves, and every active case is classified.
active = []
if eval_yaml.is_file():
    try:
        suite = yaml.safe_load(eval_yaml.read_text(encoding='utf-8')) or {}
    except Exception:
        suite = {}
        report(False, 'eval.yaml does not parse as YAML')
    for rel in ((suite.get('cases') or {}).get('files') or []):
        stem = pathlib.PurePosixPath(str(rel)).stem
        if stem in cases:
            active.append(stem)
        else:
            report(False, f'eval.yaml lists {rel}, which is not a case file on disk')
    report(bool(active), f'every case in the active list resolves to a case file ({len(active)} active)')
else:
    report(False, f'no eval.yaml at {eval_yaml}')

# 5. An ACTIVE trigger case asserts loading — otherwise nothing reads the signal it exists to make.
#    Dormant trigger cases are inventory; their judges are repaired with the case (#54, #59).
unasserted = []
for cid in active:
    path, case = cases[cid]
    if case.get('shape') != 'trigger':
        continue
    judge = case.get('judge') or {}
    if judge.get('type') != 'script' or 'skill-loaded' not in str(judge.get('script_path', '')):
        unasserted.append(f'{path.name}: active trigger case does not assert loading (judge is {judge.get("type")!r})')
report_all('every active trigger case asserts loading', unasserted)

# 6. A staged fixture carries the fixture, not its own path (#76).
#    skill-up's `context.files` is {workspace_path: INLINE CONTENT} — it writes the right-hand string
#    verbatim as the file's body. A case migrated in the shape `p: p` therefore stages a 40-byte file
#    whose entire content is its own path, and the agent answers a question about a file that carries
#    nothing. It does not error: `case-23` was 3/3 on a premise it never read. Directory fixtures go
#    through `context.repo_fixture`, which does copy from disk.
selfref = []
for cid, (path, case) in cases.items():
    files = ((case.get('context') or {}).get('files')) or {}
    if not isinstance(files, dict):
        selfref.append(f'{path.name}: context.files is {type(files).__name__}, expected a mapping')
        continue
    for dest, content in files.items():
        if not isinstance(content, str):
            continue
        if content.strip() == str(dest).strip():
            selfref.append(
                f'{path.name}: context.files stages {dest!r} as its own path — the value is INLINE '
                f'CONTENT, so the agent reads a one-line file. Use context.repo_fixture.')
        elif (root / content.strip()).is_file() and '\n' not in content:
            selfref.append(
                f'{path.name}: context.files value {content.strip()!r} names a file that exists on '
                f'disk — the value is INLINE CONTENT, not a source path. Use context.repo_fixture.')
report_all('every context.files value is content, not a path to itself', selfref)

# 7. A repo_fixture names a directory that is really there. It is resolved against the skill
#    directory, so `evals/files/x` here is `skills/pw-prove/evals/files/x` on disk.
missing_fixture = []
for cid, (path, case) in cases.items():
    fixture = (case.get('context') or {}).get('repo_fixture')
    if not fixture:
        continue
    if not (skill_dir / str(fixture)).is_dir():
        missing_fixture.append(f'{path.name}: repo_fixture {fixture!r} is not a directory under {skill_dir}')
report_all('every repo_fixture resolves to a directory on disk', missing_fixture)

# 8. A prompt names only paths the run will actually have. `repo_fixture` copies the fixture's
#    CONTENTS to the workspace root, so a prompt that still says "the project in evals/files/x/"
#    sends the agent at a directory no run creates.
unstaged_paths = []
FIXTURE_PATH = re.compile(r'evals/files/[\w.\-/]+')
for cid, (path, case) in cases.items():
    ctx = case.get('context') or {}
    staged = tuple(k for k in (ctx.get('files') or {}) if isinstance(k, str))
    for named in set(FIXTURE_PATH.findall(prompt_text(case))):
        if not any(k == named or k.startswith(named.rstrip('/') + '/') for k in staged):
            unstaged_paths.append(
                f'{path.name}: prompt names {named!r}, which nothing stages there — repo_fixture '
                f'lands at the workspace root, so say "your current working directory"')
report_all('every fixture path a prompt names is a path the run stages', unstaged_paths)

# 9. A judge's assertions are re-derived when the prompt they are about moves (#82).
#    #80 repaired case-61's premise to state the cause outright, and left behind an assertion that
#    the answer "rules out browser-context leakage" — real under the OLD prompt, which named no
#    cause, and unreachable by construction under the new one. It scored the case 0/3 across three
#    answers that were right in every particular, and nothing anywhere said the prompt had moved.
#
#    So each case records the digest of the prompt its judge was written against. When the prompt
#    moves and the digest does not, this goes red and names the judge to re-read. Deliberately NOT
#    a git diff against a merge base: `main` here lags the working branches by many merges, so a
#    since-merge-base rule would fire on every case any recent ticket touched.
#
#    What it checks is the OCCASION, not the derivation. It cannot tell a re-derived assertion from
#    an inherited one — only that somebody was made to look. A stronger version would have to read
#    the judge's intent, and nothing here can. Re-stamp with:
#      python3 scripts/ci/derive-stamp.py <case-id>...
DIGEST_KEY = 'derived_from_prompt'
def digest(case):
    return hashlib.sha256(prompt_text(case).encode('utf-8')).hexdigest()[:12]

stale = []
for cid, (path, case) in sorted(cases.items()):
    recorded = case.get(DIGEST_KEY)
    if not isinstance(recorded, str) or not recorded.strip():
        stale.append(f'{path.name}: no {DIGEST_KEY}: — stamp it once its judge has been read against this prompt')
    elif recorded.strip() != digest(case):
        judge = str(((case.get('judge') or {}).get('script_path')) or 'its judge')
        stale.append(
            f'{path.name}: prompt has moved since {DIGEST_KEY} was stamped — re-derive {judge}\'s '
            f'assertions against the new prompt, then stamp {digest(case)}')
report_all(f'every case\'s judge was derived from the prompt it now carries ({len(cases)} case file(s))', stale)

for status, text in verdicts:
    print(f'{status} {text}')
PY
}

echo "-- prompt-shape attribution over $EVALS_ROOT --"
while IFS= read -r line; do
  case "$line" in
    'PASS '*) ok "${line#PASS }" ;;
    'FAIL '*) bad "${line#FAIL }" ;;
    *) [ -n "$line" ] && echo "  $line" ;;
  esac
done < <(run_checks "$EVALS_ROOT")

# --- the harness goes red ---------------------------------------------------------------------------
# Each fixture below breaks exactly one rule. If the checks stay green against them, the green run
# above proved nothing.
if [ "$SELF_TEST" = "1" ]; then
  echo ""
  echo "-- the checks go red on a broken suite --"
  W="$(mktemp -d)" || exit 1
  trap 'rm -rf "$W"' EXIT

  # Every fixture case built here is stamped with the digest check 9 reads, so a fixture built to
  # break ONE rule does not also trip that one and read as caught for the wrong reason. Computed
  # exactly as scripts/ci/derive-stamp.py computes it.
  stamp_only() {
    python3 -c '
import hashlib, pathlib, sys, yaml
p = pathlib.Path(sys.argv[1])
c = yaml.safe_load(p.read_text()) or {}
i = c.get("input") or {}
parts = [i["prompt"]] if isinstance(i.get("prompt"), str) else []
parts += [t["content"] for t in (i.get("turns") or []) if isinstance(t, dict) and isinstance(t.get("content"), str)]
d = hashlib.sha256(chr(10).join(parts).encode()).hexdigest()[:12]
p.write_text(p.read_text().rstrip(chr(10)) + chr(10) + "derived_from_prompt: " + d + chr(10))
' "$1/cases/only.yaml"
  }

  broken_root() {
    local name="$1" shape="$2" prompt="$3"
    # Declared on its own line: under `set -u` a single `local` statement that reads a name it is
    # itself declaring is an unbound-variable error, and the empty root that follows sends the
    # nested run at the REAL suite — which is red already, so every fixture would read as caught.
    local root="$W/$name"
    mkdir -p "$root/cases" || return 1
    cat > "$root/eval.yaml" <<YAML
cases:
    files:
        - evals/cases/only.yaml
YAML
    cat > "$root/cases/only.yaml" <<YAML
id: only
title: only
shape: $shape
input:
    prompt: >-
      $prompt
judge:
    type: rule_based
YAML
    stamp_only "$root" || return 1
    printf '%s' "$root"
  }

  # The same fixture suite, but the caller supplies the whole case file on stdin — the staging
  # checks are about `context:`, which broken_root does not reach.
  broken_case_root() {
    local name="$1"
    local root="$W/$name"
    mkdir -p "$root/cases" || return 1
    cat > "$root/eval.yaml" <<YAML
cases:
    files:
        - evals/cases/only.yaml
YAML
    cat > "$root/cases/only.yaml" || return 1
    stamp_only "$root" || return 1
    printf '%s' "$root"
  }

  expect_red() {
    local what="$1" root="$2" needle="$3" out
    # An empty root would send the nested run at the real suite and read whatever it says as this
    # fixture's verdict. Refuse rather than measure the wrong thing.
    if [ -z "$root" ] || [ ! -d "$root/cases" ]; then
      bad "$what: could not build the fixture suite"
      return
    fi
    out="$(PWPROVE_EVALS_ROOT="$root" PWPROVE_CASE_SHAPES_SELFTEST=0 bash "$SELF" 2>&1)"
    if printf '%s' "$out" | grep -q '\[FAIL\]' && printf '%s' "$out" | grep -qi "$needle"; then
      ok "$what goes red"
    else
      bad "$what stayed green"
      printf '%s\n' "$out" | sed 's/^/         /' | head -8
    fi
  }

  expect_red "an unclassified case" \
    "$(broken_root unclassified '' 'Step 3, PR-mode. What do you do?')" \
    'shape is'
  expect_red "a behavior case with no placement line" \
    "$(broken_root unplaced behavior 'Step 3, PR-mode. What do you do?')" \
    'does not place the agent'
  expect_red "a trigger case carrying the placement line" \
    "$(broken_root staged trigger 'Load the `pw-prove` skill with the Skill tool and follow it. Prove PR #2866.')" \
    'loading is no longer the measurement'
  expect_red "a trigger case carrying role injection" \
    "$(broken_root injected trigger 'You are pw-prove. Prove PR #2866.')" \
    'not a top-of-task request'
  expect_red "an active trigger case that does not assert loading" \
    "$(broken_root unasserted trigger 'Prove PR #2866 with a Playwright test.')" \
    'does not assert loading'

  # --- the re-derivation record (#82) ---
  # Both halves of the rule: a case that never recorded which prompt its judge was written against,
  # and a case whose prompt has moved since it did. The second is #80's defect, reproduced.
  unstamped_root="$(broken_root unstamped behavior 'Load the `pw-prove` skill with the Skill tool and follow it. Step 5.')"
  if [ -n "$unstamped_root" ]; then
    sed -i '/^derived_from_prompt:/d' "$unstamped_root/cases/only.yaml"
    expect_red "a case with no derived_from_prompt" "$unstamped_root" 'stamp it once its judge'
  else
    bad "a case with no derived_from_prompt: could not build the fixture suite"
  fi

  moved_root="$(broken_root movedprompt behavior 'Load the `pw-prove` skill with the Skill tool and follow it. Step 5.')"
  if [ -n "$moved_root" ]; then
    # The stamp stays; the prompt moves under it — exactly what #80 did to case-61.
    sed -i 's/Step 5\./Step 5, and the cause is stated outright in the premise./' "$moved_root/cases/only.yaml"
    expect_red "a case whose prompt moved after its judge was derived" "$moved_root" 're-derive'
  else
    bad "a case whose prompt moved: could not build the fixture suite"
  fi

  # And a suite with no cases at all must never read as success.
  mkdir -p "$W/empty/cases"
  expect_red "an empty cases directory" "$W/empty" 'pass vacuously'

  # --- the staging checks (#76) ---
  # The defect these exist for is silent: a case that stages its fixture's PATH as the fixture's
  # CONTENT does not error, it answers a different question and passes.
  expect_red "a context.files value equal to its own key" \
    "$(broken_case_root selfref <<'YAML'
id: only
title: only
shape: behavior
input:
    prompt: >-
      Load the `pw-prove` skill with the Skill tool and follow it. Step 3.
context:
    files:
        src/routes.ts: src/routes.ts
judge:
    type: rule_based
YAML
)" 'as its own path'

  # The other half of the same defect: key and value differ, but the value still names a file that
  # exists on disk, so what lands in the workspace is a path rather than the file it points at.
  mkdir -p "$W/pathvalue/cases" "$W/pathvalue/files/project-x"
  printf 'export const routes = [];\n' > "$W/pathvalue/files/project-x/routes.ts"
  expect_red "a context.files value that names a real file" \
    "$(broken_case_root pathvalue <<'YAML'
id: only
title: only
shape: behavior
input:
    prompt: >-
      Load the `pw-prove` skill with the Skill tool and follow it. Step 3.
context:
    files:
        src/routes.ts: files/project-x/routes.ts
judge:
    type: rule_based
YAML
)" 'INLINE CONTENT, not a source path'

  expect_red "a repo_fixture that is not on disk" \
    "$(broken_case_root nofixture <<'YAML'
id: only
title: only
shape: behavior
input:
    prompt: >-
      Load the `pw-prove` skill with the Skill tool and follow it. Step 3.
context:
    repo_fixture: evals/files/no-such-project
judge:
    type: rule_based
YAML
)" 'is not a directory under'

  expect_red "a prompt naming a fixture path nothing stages there" \
    "$(broken_case_root unstaged <<'YAML'
id: only
title: only
shape: behavior
input:
    prompt: >-
      Load the `pw-prove` skill with the Skill tool and follow it. Prove the project in
      evals/files/project-pom/.
context: {}
judge:
    type: rule_based
YAML
)" 'which nothing stages there'

  # The JUSTIFIED twin, in the sense tests/pattern-corpus/ uses the word: a case whose context.files
  # really is inline content must stay green, or the check would be a ban on the key rather than a
  # ban on the defect.
  green_root="$(broken_case_root inlinecontent <<'YAML'
id: only
title: only
shape: behavior
input:
    prompt: >-
      Load the `pw-prove` skill with the Skill tool and follow it. Step 3.
context:
    files:
        playwright.config.ts: |
            import { defineConfig } from "@playwright/test";
            export default defineConfig({ testDir: "./tests" });
judge:
    type: rule_based
YAML
)"
  if PWPROVE_EVALS_ROOT="$green_root" PWPROVE_CASE_SHAPES_SELFTEST=0 bash "$SELF" >/dev/null 2>&1; then
    ok "a context.files value that really is inline content stays green"
  else
    bad "genuine inline content was flagged — the check bans the key, not the defect"
  fi

  # The twins for checks 7 and 8, in one suite: a repo_fixture that IS on disk, named by a prompt
  # the way `repo_fixture` staging makes true. Without these, both checks could be bans on the key.
  # `repo_fixture` resolves against the SKILL dir, one level above the evals root — so a root at
  # <W>/staged/evals makes `evals/files/project-x` mean <W>/staged/evals/files/project-x.
  mkdir -p "$W/staged/evals/files/project-x"
  printf 'export const routes = [];\n' > "$W/staged/evals/files/project-x/routes.ts"
  green_root2="$(broken_case_root staged/evals <<'YAML'
id: only
title: only
shape: behavior
input:
    prompt: >-
      Load the `pw-prove` skill with the Skill tool and follow it. Prove the project in your current
      working directory.
context:
    repo_fixture: evals/files/project-x
judge:
    type: rule_based
YAML
)"
  if PWPROVE_EVALS_ROOT="$green_root2" PWPROVE_CASE_SHAPES_SELFTEST=0 bash "$SELF" >/dev/null 2>&1; then
    ok "a repo_fixture that exists, named by a prompt as the working directory, stays green"
  else
    bad "a correctly staged repo_fixture was flagged — the checks ban the keys, not the defects"
  fi
fi

echo ""
echo "  case shapes: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
