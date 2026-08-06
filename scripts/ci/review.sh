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

# Check 4: debugger evals.json may only reference F-codes from SKILL.md F-table
for skill in ('playwright-debugger',):
    md_path = pathlib.Path('skills') / skill / 'SKILL.md'
    evals_path = pathlib.Path('skills') / skill / 'evals' / 'evals.json'
    md_text = md_path.read_text(encoding='utf-8')
    evals = json.loads(evals_path.read_text(encoding='utf-8'))
    skill_codes = set(re.findall(r'\|\s*(F\d+)\s*\|', md_text))
    seen = set()

    def scan(obj):
        if isinstance(obj, str):
            seen.update(re.findall(r'\bF\d+\b', obj))
        elif isinstance(obj, list):
            for v in obj:
                scan(v)
        elif isinstance(obj, dict):
            for v in obj.values():
                scan(v)

    scan(evals)
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
