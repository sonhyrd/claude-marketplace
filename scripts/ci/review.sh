#!/usr/bin/env bash
# Automated convention review for e2e-skills.

set -uo pipefail

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || {
  echo "review.sh: cannot resolve repo root" >&2
  exit 1
}
cd "$REPO_ROOT" || {
  echo "review.sh: cannot cd to $REPO_ROOT" >&2
  exit 1
}

ERRORS=0
WARNINGS=0
PASSED=0

err() { echo "  [FAIL] $*" >&2; ERRORS=$((ERRORS + 1)); }
warn() { echo "  [WARN] $*" >&2; WARNINGS=$((WARNINGS + 1)); }
ok() { [ "$QUIET" = "1" ] || echo "  [OK] $*"; PASSED=$((PASSED + 1)); }
section() { [ "$QUIET" = "1" ] || { echo ""; echo "-- $* --"; }; }
repo_files() { git ls-files -co --exclude-standard -- "$@" 2>/dev/null; }

section "Eval metadata"
eval_log=$(mktemp "${TMPDIR:-/tmp}/e2e-skills-evals.XXXXXX")
if ./scripts/validate-evals.sh >"$eval_log" 2>&1; then
  total=$(grep -oE 'total: [0-9]+ eval\(s\)' "$eval_log" | tail -1 || true)
  ok "validate-evals.sh ${total:-passed}"
else
  err "validate-evals.sh failed"
  [ "$QUIET" = "0" ] && tail -20 "$eval_log" >&2
fi
rm -f "$eval_log"

if command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY'
import json
import pathlib
import sys

errors = []
seen = set()
for path in sorted(pathlib.Path('skills').glob('*/evals/evals.json')):
    data = json.loads(path.read_text(encoding='utf-8'))
    skill = path.parts[1]
    if data.get('skill_name') != skill:
        errors.append(f"{path}: skill_name must be {skill!r}")
    ids = []
    for entry in data.get('evals', []):
        eval_id = entry.get('id')
        key = (skill, eval_id)
        if key in seen:
            errors.append(f"{path}: duplicate eval id {eval_id!r}")
        seen.add(key)
        ids.append(eval_id)
        if 'files' in entry and not isinstance(entry['files'], list):
            errors.append(f"{path}: eval {eval_id!r} files must be a list when present")
    if ids != sorted(ids):
        errors.append(f"{path}: eval ids should be sorted")

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)
PY
  then
    ok "eval names and ids match skill conventions"
  else
    err "eval convention check failed"
  fi
else
  warn "python3 not available; skipped eval convention check"
fi

section "Security"
if [ "${E2E_SKILLS_SKIP_SECURITY:-}" = "1" ]; then
  ok "pre-push-security.sh skipped by E2E_SKILLS_SKIP_SECURITY=1"
else
  security_log=$(mktemp "${TMPDIR:-/tmp}/e2e-skills-security.XXXXXX")
  if bash scripts/ci/pre-push-security.sh --quiet >"$security_log" 2>&1; then
    ok "pre-push-security.sh clean"
  else
    err "pre-push-security.sh blockers found"
    [ "$QUIET" = "0" ] && cat "$security_log" >&2
  fi
  rm -f "$security_log"
fi

section "Public skill surface"
if command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY'
import pathlib
import re
import sys

# The marketplace owns distribution: this repo carries no plugin manifest and no host adapter, so
# the skill surface is exactly `skills/<name>/SKILL.md` and its frontmatter.
errors = []
skill_dirs = sorted(path for path in pathlib.Path('skills').iterdir() if path.is_dir())
expected = {path.name for path in skill_dirs}

frontmatter_names = set()
for skill_dir in skill_dirs:
    skill_file = skill_dir / 'SKILL.md'
    text = skill_file.read_text(encoding='utf-8')
    match = re.search(r"^---\n(.*?)\n---", text, re.S)
    if not match:
        errors.append(f"{skill_file}: missing YAML frontmatter")
        continue
    name = re.search(r"^name:\s*['\"]?([^'\"\n]+)['\"]?\s*$", match.group(1), re.M)
    if not name:
        errors.append(f"{skill_file}: missing frontmatter name")
        continue
    public_name = name.group(1).strip()
    frontmatter_names.add(public_name)
    if public_name != skill_dir.name:
        errors.append(f"{skill_file}: frontmatter name must match directory {skill_dir.name}")
    desc = re.search(r"^description:\s*(.+?)\s*$", match.group(1), re.M)
    if desc:
        val = desc.group(1)
        quoted = (val.startswith("'") and val.endswith("'")) or (val.startswith('"') and val.endswith('"'))
        desc_value = val[1:-1] if quoted else val
        if len(desc_value) > 1024:
            errors.append(
                f"{skill_file}: frontmatter description exceeds 1024 characters "
                f"({len(desc_value)})"
            )
        if not quoted and re.search(r":\s", val):
            errors.append(
                f"{skill_file}: frontmatter description contains ': ' (colon-space) in an unquoted plain scalar — "
                "wrap the description in single quotes; YAML parsers (gray-matter / js-yaml) reject this and the "
                "skills CLI will silently skip the skill (regression of bug fixed in v0.7.3)"
            )

if frontmatter_names != expected:
    errors.append(f"skills/*/SKILL.md names mismatch: {sorted(frontmatter_names)} != {sorted(expected)}")

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)
PY
  then
    ok "skill directories and SKILL.md frontmatter match"
  else
    err "public skill surface parity failed"
  fi
else
  warn "python3 not available; skipped public skill surface check"
fi

section "Pattern and description parity"
if command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY'
import json
import pathlib
import re
import sys

errors = []

skill_text = pathlib.Path('skills/e2e-reviewer/SKILL.md').read_text(encoding='utf-8')
grep_text = pathlib.Path('skills/e2e-reviewer/references/grep-patterns.md').read_text(encoding='utf-8')
patref_text = pathlib.Path('skills/e2e-reviewer/references/pattern-reference.md').read_text(encoding='utf-8')
scan_text = pathlib.Path('skills/e2e-reviewer/scripts/scan.mjs').read_text(encoding='utf-8')
docs_text = pathlib.Path('docs/e2e-test-smells.md').read_text(encoding='utf-8')
readme_text = pathlib.Path('README.md').read_text(encoding='utf-8')

qr_match = re.search(r'## Quick Reference\s*\n(?:.*\n)*?((?:\|.*\n)+)', skill_text)
if not qr_match:
    print('e2e-reviewer/SKILL.md: could not locate Quick Reference table', file=sys.stderr)
    sys.exit(1)

qr_severity = {}
for row in qr_match.group(1).splitlines():
    m = re.match(r'\|\s*(\d+[a-z]?)\s*\|\s*[^|]+\|\s*(P[012](?:/P[012])?)\s*\|', row)
    if m:
        qr_severity[m.group(1)] = m.group(2)
qr_ids = set(qr_severity)

def base_id(s):
    s = s.split('-')[0]
    m = re.match(r'^(\d+)', s)
    return m.group(1) if m else s

def matches_qr(s):
    return s in qr_ids or base_id(s) in qr_ids

# Check 1: every pattern id in subordinate sources must map back to a QR base id
grep_ids = sorted(set(re.findall(r'\|\s*#(\d+[a-z]?(?:-\d+[a-z]?)?)', grep_text)))
# Reads the CHECKS table in scan.mjs: `{ severity: 'P0', id: '#4c-4e', title: … }`.
scan_ids = sorted(set(re.findall(r"id:\s*'#(\d+[a-z]?(?:-\d+[a-z]?)?)'", scan_text)))
if not scan_ids:
    # Without this guard, a regex that stops matching makes every downstream parity check silently
    # pass on an EMPTY id set — the exact silent-always-pass class this repo exists to catch.
    print('scripts/ci/review.sh: extracted ZERO pattern ids from the CHECKS table in scan.mjs — its '
          'shape changed and this regex did not follow it', file=sys.stderr)
    sys.exit(1)
docs_ids = sorted(set(re.findall(r'\|\s*#(\d+[a-z]?)\s*\|', docs_text)))
for label, ids in (
    ('skills/e2e-reviewer/references/grep-patterns.md', grep_ids),
    ('skills/e2e-reviewer/scripts/scan.mjs', scan_ids),
    ('docs/e2e-test-smells.md', docs_ids),
):
    for pid in ids:
        if not matches_qr(pid):
            errors.append(f"{label}: pattern #{pid} has no matching base id in e2e-reviewer/SKILL.md Quick Reference")

# Check 1b: every QR base id must appear in docs/e2e-test-smells.md (reverse of Check 1)
docs_id_set = set(docs_ids)
missing_in_docs = sorted(pid for pid in qr_ids if pid not in docs_id_set)
if missing_in_docs:
    errors.append(
        f"docs/e2e-test-smells.md: missing rows for Quick Reference ids {missing_in_docs}"
    )

# Check 2: docs P0/P1/P2 section placement must agree with QR severity
sections = re.split(r'^##\s+(P[012]):', docs_text, flags=re.M)
for i in range(1, len(sections), 2):
    sev = sections[i]
    body = sections[i + 1]
    for pid in re.findall(r'\|\s*#(\d+[a-z]?)\s*\|', body):
        key = pid if pid in qr_severity else base_id(pid)
        qr_sev = qr_severity.get(key)
        if qr_sev and sev not in qr_sev:
            errors.append(f"docs/e2e-test-smells.md: #{pid} under {sev} but Quick Reference says {qr_sev}")

# Check 3: README severity-section placement must agree with QR severity
readme_sev_specs = [
    ('P0', 'P0', r'#### P0 — Must Fix[^\n]*\n(.+?)(?=\n####|\n###|\Z)'),
    ('P1', 'P1', r'#### P1 — Should Fix[^\n]*\n(.+?)(?=\n####|\n###|\Z)'),
    ('P2', 'P2', r'#### P2 — Nice to Fix[^\n]*\n(.+?)(?=\n####|\n###|\Z)'),
]
for sev_name, required, pattern in readme_sev_specs:
    tm = re.search(pattern, readme_text, re.S)
    if not tm:
        errors.append(f"README: missing {sev_name} section")
        continue
    for pid in re.findall(r'\|\s*(\d+[a-z]?)\s*\|\s*\*\*', tm.group(1)):
        qr_sev = qr_severity.get(pid)
        if qr_sev and required not in qr_sev:
            errors.append(f"README {sev_name} lists #{pid} but Quick Reference severity is {qr_sev}")

# Check 3b: e2e-reviewer/SKILL.md severity-section placement must agree with QR severity
skill_sev_specs = [
    ('P0', 'P0', r'### P0 — Must Fix[^\n]*\n(.+?)(?=\n### |\Z)'),
    ('P1', 'P1', r'### P1 — Should Fix[^\n]*\n(.+?)(?=\n### |\Z)'),
    ('P2', 'P2', r'### P2 — Nice to Fix[^\n]*\n(.+?)(?=\n### |\Z)'),
]
section_ids = set()
for sev_name, required, pattern in skill_sev_specs:
    tm = re.search(pattern, patref_text, re.S)
    if not tm:
        errors.append(f"e2e-reviewer/references/pattern-reference.md: missing {sev_name} section")
        continue
    for pid in re.findall(r'^####\s+(\d+[a-z]?)\.', tm.group(1), re.M):
        section_ids.add(pid)
        qr_sev = qr_severity.get(pid)
        if qr_sev and required not in qr_sev:
            errors.append(
                f"e2e-reviewer/references/pattern-reference.md {sev_name} lists #{pid} but Quick Reference severity is {qr_sev}"
            )

# Check 3c: Quick Reference row count equals 24 and ID set equals Pattern Reference section IDs
if len(qr_severity) != 24:
    errors.append(
        f"e2e-reviewer/SKILL.md Quick Reference: expected 24 rows, got {len(qr_severity)}"
    )
qr_only = qr_ids - section_ids
section_only = section_ids - qr_ids
if qr_only:
    errors.append(
        f"e2e-reviewer/SKILL.md Quick Reference has IDs missing from references/pattern-reference.md sections: {sorted(qr_only)}"
    )
if section_only:
    errors.append(
        f"e2e-reviewer/references/pattern-reference.md sections have IDs missing from Quick Reference: {sorted(section_only)}"
    )

# Check 4: playwright-debugger's evals.json may only reference F-codes from its SKILL.md F-table
md_text = pathlib.Path('skills/playwright-debugger/SKILL.md').read_text(encoding='utf-8')
evals_path = pathlib.Path('skills/playwright-debugger/evals/evals.json')
skill_codes = set(re.findall(r'\|\s*(F\d+)\s*\|', md_text))
seen = set()

def collect_f_codes(obj):
    if isinstance(obj, str):
        seen.update(re.findall(r'\bF\d+\b', obj))
    elif isinstance(obj, list):
        for v in obj:
            collect_f_codes(v)
    elif isinstance(obj, dict):
        for v in obj.values():
            collect_f_codes(v)

collect_f_codes(json.loads(evals_path.read_text(encoding='utf-8')))
missing = seen - skill_codes
if missing:
    errors.append(f"{evals_path}: F-codes not in SKILL.md taxonomy: {sorted(missing)}")

if errors:
    for err in errors:
        print(err, file=sys.stderr)
    sys.exit(1)
PY
  then
    ok "pattern IDs, severities, and F-codes consistent"
  else
    err "pattern/severity/description parity check failed"
  fi
else
  warn "python3 not available; skipped pattern parity check"
fi

section "Canonical dwell snippet"
if command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY'
import pathlib
import re
import sys

# ONE canonical payoff dwell, defined in clip-fidelity.mjs and carried verbatim by the two prose
# surfaces that must show it to an agent: SKILL.md Step 5, where the spec is written, and
# code-rules.md, where the contract is stated. Three near-identical variants used to exist and the
# field never reached any of them; this check is what stops them growing back.
errors = []
audit = pathlib.Path('skills/pw-prove/scripts/clip-fidelity.mjs').read_text(encoding='utf-8')
m = re.search(r'export const CANONICAL_DWELL = `(.*?)`;', audit, re.S)
if not m:
    print('skills/pw-prove/scripts/clip-fidelity.mjs: no CANONICAL_DWELL export to derive from',
          file=sys.stderr)
    sys.exit(1)
canonical = m.group(1).split('\n')

for rel in ('skills/pw-prove/SKILL.md', 'skills/pw-prove/code-rules.md'):
    lines = pathlib.Path(rel).read_text(encoding='utf-8').split('\n')
    found = 0
    for i, line in enumerate(lines):
        # Every gated wait in these files is a dwell, so every one of them must be the canonical
        # dwell — wording, duration and all — under whatever indent its snippet sits at.
        if 'PW_PROVE_CLIP' not in line or 'waitForTimeout' not in line:
            continue
        indent = line[: len(line) - len(line.lstrip())]
        start = i - len(canonical) + 1
        # A negative start would wrap the slice around the end of the file and compare the wrong
        # lines, so a wait too near the top of the file is simply not canonical.
        window = lines[start : i + 1] if start >= 0 else []
        if window == [indent + c for c in canonical]:
            found += 1
        else:
            errors.append(
                f"{rel}:{i + 1}: the gated wait here is not the canonical dwell — it must be the "
                "CANONICAL_DWELL block from clip-fidelity.mjs, verbatim, comment lines included"
            )
    if not found:
        errors.append(
            f"{rel}: carries no canonical dwell. The snippet must sit INLINE here — a pointer to "
            "another file is what ten of eleven field sessions never followed"
        )

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)
PY
  then
    ok "one canonical dwell, carried verbatim by the audit, Step 5 and code-rules.md"
  else
    err "canonical dwell snippet check failed"
  fi
else
  warn "python3 not available; skipped canonical dwell check"
fi

section "Skill version bump"
if command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY'
import pathlib
import re
import subprocess
import sys

# The ledger's stale-install detection compares the frontmatter version of the installed skill
# against the one that produced a record. pw-prove sat at 0.1.0 across 638 recorded runs and 14
# distinct installs, so it detected nothing: the convention was stated and never enforced. This
# check enforces it — a change to a skill's body or its shipped scripts must move that skill's
# metadata.version.
#
# Scope is deliberately the two things the convention names. SKILL.md counts only below its
# frontmatter (the frontmatter is where the version itself lives, and an author or description edit
# is not a change to what the skill instructs); sibling and reference .md files count in full,
# because the body is split across them and read on demand; scripts/ counts in full. evals/ and the
# eval engine's own config (.skill-up.yaml at the skill root, and only there) are test material
# rather than the shipped instruction surface and do not demand a bump.


def git(*args):
    return subprocess.run(
        ['git', *args], capture_output=True, text=True, check=False
    )


def base_ref():
    # Compare against the point this line of work left the main line, so the question asked is
    # "does this commit move the version", not "does this checkout differ from some remote".
    for ref in ('origin/main', 'main'):
        if git('rev-parse', '--verify', '--quiet', f'{ref}^{{commit}}').returncode != 0:
            continue
        merge_base = git('merge-base', 'HEAD', ref)
        if merge_base.returncode == 0 and merge_base.stdout.strip():
            return merge_base.stdout.strip()
    return None


base = base_ref()
if base is None:
    print('no main line to compare against (no origin/main and no main) — cannot tell whether a '
          'skill changed', file=sys.stderr)
    sys.exit(2)

frontmatter_re = re.compile(r'\A---\n.*?\n---\n', re.S)
version_re = re.compile(r'^\s*version:\s*["\']?([^"\'\n]+?)["\']?\s*$', re.M)


def blob_at_base(rel):
    out = git('show', f'{base}:{rel}')
    return out.stdout if out.returncode == 0 else None


def version_of(text):
    # Read the version out of the frontmatter only. A `version:` line in the body — a config
    # example, a snippet — must not be mistaken for the skill's own, or a body edit could appear
    # to move a version it never touched.
    if text is None:
        return None
    frontmatter = frontmatter_re.match(text)
    if not frontmatter:
        return None
    match = version_re.search(frontmatter.group(0))
    return match.group(1) if match else None


def body_of(text):
    return frontmatter_re.sub('', text, count=1)


def changed_paths():
    # Working tree against the base, so an uncommitted edit is judged the same way a committed one
    # is — which is also what lets the drift harness mutate a file and watch this fire.
    tracked = git('diff', '--name-only', base, '--', 'skills')
    untracked = git('ls-files', '-o', '--exclude-standard', '--', 'skills')
    if tracked.returncode != 0:
        return None
    paths = set(tracked.stdout.split())
    paths.update(untracked.stdout.split())
    return paths


paths = changed_paths()
if paths is None:
    print(f'git diff against {base} failed — cannot tell whether a skill changed', file=sys.stderr)
    sys.exit(2)

errors = []
for skill_dir in sorted(p for p in pathlib.Path('skills').iterdir() if p.is_dir()):
    skill = skill_dir.name
    skill_md = skill_dir / 'SKILL.md'
    prefix = f'skills/{skill}/'

    triggers = []
    for rel in sorted(p for p in paths if p.startswith(prefix)):
        parts = pathlib.PurePosixPath(rel).parts
        if len(parts) > 2 and parts[2] == 'evals':
            continue
        if len(parts) == 3 and parts[2] == '.skill-up.yaml':
            continue
        if rel == skill_md.as_posix():
            before = blob_at_base(rel)
            after = skill_md.read_text(encoding='utf-8') if skill_md.exists() else ''
            # A frontmatter-only edit (the version bump itself included) is not a body change.
            if before is not None and body_of(before) == body_of(after):
                continue
        triggers.append(rel)

    if not triggers:
        continue

    before_md = blob_at_base(skill_md.as_posix())
    if before_md is None:
        # A skill that did not exist on the main line has no version to move.
        continue
    was = version_of(before_md)
    now = version_of(skill_md.read_text(encoding='utf-8')) if skill_md.exists() else None
    if was is not None and was == now:
        shown = ', '.join(triggers[:4]) + (' …' if len(triggers) > 4 else '')
        errors.append(
            f"skills/{skill}: body and/or shipped scripts changed but metadata.version is still "
            f"{now} — bump the version in {skill_md.as_posix()} (changed: {shown})"
        )

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)
PY
  then
    ok "every skill whose body or shipped scripts changed moved its metadata.version"
  else
    rc=$?
    if [ "$rc" = "2" ]; then
      warn "skill version bump check could not run"
    else
      err "skill version bump check failed"
    fi
  fi
else
  warn "python3 not available; skipped skill version bump check"
fi

section "Framework scope"
unsupported=$(
  while IFS= read -r path; do
    [ -f "$path" ] || continue
    grep -En 'Puppeteer|puppeteer' "$path" 2>/dev/null | sed "s|^|$path:|" || true
  done < <(repo_files README.md skills docs scripts) | \
    grep -vE '^docs/framework-scope\.md:|^scripts/ci/review\.sh:' || true
)
if [ -z "$unsupported" ]; then
  ok "no accidental Puppeteer support claims outside framework-scope.md"
else
  err "unsupported Puppeteer references found outside framework-scope.md"
  printf '%s\n' "$unsupported" | sed 's/^/      /' >&2
fi

if command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY'
import pathlib
import re
import sys

required = {
    'pw-prove': ('Playwright',),
    'e2e-reviewer': ('Playwright', 'Cypress'),
    'playwright-debugger': ('Playwright',),
}
errors = []
for skill, words in required.items():
    path = pathlib.Path('skills') / skill / 'SKILL.md'
    text = path.read_text(encoding='utf-8')
    frontmatter = re.search(r"^---\n(.*?)\n---", text, re.S)
    surface = frontmatter.group(1) if frontmatter else text[:500]
    for word in words:
        if word not in surface:
            errors.append(f"{path}: frontmatter description should mention {word}")

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)
PY
  then
    ok "skill trigger descriptions preserve Playwright/Cypress boundaries"
  else
    err "skill trigger boundary check failed"
  fi
else
  warn "python3 not available; skipped skill trigger boundary check"
fi

section "Markdown links"
if command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY'
import pathlib
import re
import subprocess
import sys
from urllib.parse import unquote

def repo_files():
    try:
        out = subprocess.check_output(
            ['git', 'ls-files', '-co', '--exclude-standard', '--'],
            text=True,
        )
        return [pathlib.Path(line) for line in out.splitlines() if line]
    except Exception:
        return [p for p in pathlib.Path('.').rglob('*') if p.is_file()]

errors = []
link_re = re.compile(r"\[[^\]]+\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
for path in sorted(p for p in repo_files() if p.suffix == '.md'):
    if any(part in {'.git', '.sisyphus', 'testbed', 'node_modules'} for part in path.parts):
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    for match in link_re.finditer(text):
        raw = match.group(1)
        if raw.startswith(('#', 'http://', 'https://', 'mailto:')):
            continue
        target = raw.split('#', 1)[0]
        if not target:
            continue
        target_path = (path.parent / unquote(target)).resolve()
        try:
            target_path.relative_to(pathlib.Path('.').resolve())
        except ValueError:
            continue
        if not target_path.exists():
            errors.append(f"{path}: broken local link {raw}")

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)
PY
  then
    ok "local markdown links resolve"
  else
    err "broken local markdown links found"
  fi
else
  warn "python3 not available; skipped markdown link check"
fi

section "Docs orphan check"
if command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY'
import pathlib
import re
import subprocess
import sys

def repo_files():
    try:
        out = subprocess.check_output(
            ['git', 'ls-files', '-co', '--exclude-standard', '--'],
            text=True,
        )
        return [pathlib.Path(line) for line in out.splitlines() if line]
    except Exception:
        return [p for p in pathlib.Path('.').rglob('*') if p.is_file()]

docs_dir = pathlib.Path('docs')
if not docs_dir.is_dir():
    sys.exit(0)

# Files allowed to exist as references from CI scripts or other docs, not just README.
# Exclude test-parity.sh — it intentionally names docs files for drift smoke tests,
# which would otherwise mask real orphan detection (meta-circular).
ci_referenced_globs = ['scripts/**/*.sh', 'scripts/**/*.py']
excluded_paths = {'scripts/ci/test-parity.sh'}

all_repo_files = repo_files()
doc_files = sorted(p for p in all_repo_files if len(p.parts) > 1 and p.parts[0] == 'docs' and p.suffix == '.md')
if not doc_files:
    sys.exit(0)

readme_text = pathlib.Path('README.md').read_text(encoding='utf-8') if pathlib.Path('README.md').exists() else ''
ci_text_parts = []
for path in all_repo_files:
    if path.as_posix() in excluded_paths:
        continue
    if len(path.parts) > 1 and path.parts[0] == 'scripts' and path.suffix in {'.sh', '.py'}:
        ci_text_parts.append(path.read_text(encoding='utf-8', errors='ignore'))
ci_text = '\n'.join(ci_text_parts)

errors = []
for doc in doc_files:
    rel = doc.as_posix()
    name = doc.name
    # A doc qualifies if README links to it OR a CI script names it
    in_readme = rel in readme_text or name in readme_text
    in_ci = rel in ci_text or name in ci_text
    if not (in_readme or in_ci):
        errors.append(f"{rel}: orphan — not linked from README.md or any scripts/")

if errors:
    for err in errors:
        print(err, file=sys.stderr)
    sys.exit(1)
PY
  then
    ok "every docs/ file is linked from README.md or referenced by CI"
  else
    err "orphan doc files found — link from README.md or remove"
  fi
else
  warn "python3 not available; skipped docs orphan check"
fi

section "Language"
if command -v python3 >/dev/null 2>&1; then
  hangul_hits=$(python3 - <<'PY' 2>/dev/null || true
import pathlib
import re
import subprocess

def repo_files():
    try:
        out = subprocess.check_output(
            ['git', 'ls-files', '-co', '--exclude-standard', '--'],
            text=True,
        )
        return [pathlib.Path(line) for line in out.splitlines() if line]
    except Exception:
        return [p for p in pathlib.Path('.').rglob('*') if p.is_file()]

hangul = re.compile(r'[\uAC00-\uD7AF]')
# Sanctioned exception: language-switcher lines that link to README.<lang>.md
# translation files may carry Hangul. Matches both markdown links
# ([\uD55C\uAD6D\uC5B4](README.ko.md)) and centered HTML links
# (<a href="README.ko.md">\uD55C\uAD6D\uC5B4</a>).
switcher = re.compile(r'(?:\(|href=["\x27])README\.[a-z]{2}(?:-[a-z]{2,4})?\.md')
hits = []
for path in sorted(p for p in repo_files() if p.suffix == '.md'):
    if not (path.as_posix() == 'README.md' or path.parts[:1] in [('docs',), ('skills',)]):
        continue
    if '/evals/' in str(path):
        continue
    if not path.exists():
        continue
    for line in path.read_text(encoding='utf-8', errors='ignore').splitlines():
        if hangul.search(line) and not switcher.search(line):
            hits.append(str(path))
            break
print('\n'.join(hits))
PY
)
  if [ -z "$hangul_hits" ]; then
    ok "public docs and skill docs are English-only"
  else
    err "Korean text found in public docs: $hangul_hits"
  fi
else
  warn "python3 not available; skipped language check"
fi

echo ""
echo "========================================"
echo "  Review: $PASSED passed, $WARNINGS warnings, $ERRORS errors"
echo "========================================"

[ "$ERRORS" -gt 0 ] && exit 1
exit 0
