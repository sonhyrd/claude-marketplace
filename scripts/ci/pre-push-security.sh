#!/usr/bin/env bash
# Local security gate for e2e-skills. Mirrors the lightweight checks used in CI.

set -uo pipefail

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)" || {
  echo "pre-push-security: cannot resolve repo root" >&2
  exit 2
}
cd "$REPO_ROOT" || {
  echo "pre-push-security: cannot cd to $REPO_ROOT" >&2
  exit 2
}

ERRORS=0
WARNINGS=0
PASSED=0

err() { echo "  [FAIL] $*" >&2; ERRORS=$((ERRORS + 1)); }
warn() { echo "  [WARN] $*" >&2; WARNINGS=$((WARNINGS + 1)); }
ok() { [ "$QUIET" = "1" ] || echo "  [OK] $*"; PASSED=$((PASSED + 1)); }
section() { [ "$QUIET" = "1" ] || { echo ""; echo "-- $* --"; }; }

SELF="pre-push-security.sh"

section "Secrets"
secret_patterns=(
  'AKIA[0-9A-Z]{16}'
  'sk-[a-zA-Z0-9]{20,}'
  'ghp_[a-zA-Z0-9]{36}'
  'xox[baprs]-[0-9A-Za-z-]{10,}'
  'AIza[0-9A-Za-z_-]{35}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)

secret_hits=0
for pattern in "${secret_patterns[@]}"; do
  hits=$(grep -rEn \
    --include='*.sh' --include='*.md' --include='*.json' --include='*.yaml' --include='*.yml' \
    --exclude="$SELF" --exclude='e2e-smell-report.txt' \
    --exclude-dir=.git --exclude-dir='*-workspace' --exclude-dir=node_modules --exclude-dir=testbed \
    "$pattern" . 2>/dev/null || true)
  if [ -n "$hits" ]; then
    err "potential secret matching /$pattern/"
    printf '%s\n' "$hits" | head -3 | sed 's/^/      /' >&2
    secret_hits=$((secret_hits + 1))
  fi
done
[ "$secret_hits" -eq 0 ] && ok "no high-confidence API keys, tokens, or private keys"

section "Code injection"
eval_hits=$(grep -rEn \
  --include='*.sh' --exclude="$SELF" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=testbed \
  "(^|[;&|])[[:space:]]*eval([[:space:]\"']|$)" . 2>/dev/null | \
  grep -vE "^[^:]+:[0-9]+:[[:space:]]*#" || true)
if [ -z "$eval_hits" ]; then
  ok "no bash eval() in shell scripts"
else
  err "bash eval() found"
  printf '%s\n' "$eval_hits" | head -5 | sed 's/^/      /' >&2
fi

fixed_tmp_hits=$(grep -rEn \
  --include='*.sh' --exclude="$SELF" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=testbed \
  '/tmp(/|/[A-Za-z0-9_.-]+)' . 2>/dev/null | \
  grep -vE 'mktemp|TMPDIR|TEMP_FILE|RESULT_FILE' || true)
if [ -z "$fixed_tmp_hits" ]; then
  ok "no fixed /tmp file paths in shell scripts"
else
  err "fixed /tmp paths found"
  printf '%s\n' "$fixed_tmp_hits" | head -5 | sed 's/^/      /' >&2
fi

backdoor_hits=$(grep -rEn \
  --include='*.sh' --exclude="$SELF" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=testbed \
  'nc -[el]|/dev/tcp/|bash -i.*&|reverse shell|exec [0-9]<>/dev/' . 2>/dev/null || true)
if [ -z "$backdoor_hits" ]; then
  ok "no reverse-shell or backdoor shell patterns"
else
  err "reverse-shell or backdoor pattern found"
  printf '%s\n' "$backdoor_hits" | head -5 | sed 's/^/      /' >&2
fi

section "Skill frontmatter"
if command -v python3 >/dev/null 2>&1; then
  if python3 - <<'PY'
import pathlib
import re
import sys

errors = []
skill_dirs = sorted(path for path in pathlib.Path('skills').iterdir() if path.is_dir())

for skill_dir in skill_dirs:
    skill_file = skill_dir / 'SKILL.md'
    skill_text = skill_file.read_text(encoding='utf-8')
    frontmatter = re.search(r"^---\n(.*?)\n---", skill_text, re.S)
    if not frontmatter:
        errors.append(f"{skill_file}: missing YAML frontmatter")
    else:
        desc = re.search(r"^description:\s*(.+?)\s*$", frontmatter.group(1), re.M)
        if not desc:
            errors.append(f"{skill_file}: missing frontmatter description")
        else:
            val = desc.group(1).strip()
            quoted = (val.startswith("'") and val.endswith("'")) or (
                val.startswith('"') and val.endswith('"')
            )
            desc_value = val[1:-1] if quoted else val
            if len(desc_value) > 1024:
                errors.append(
                    f"{skill_file}: frontmatter description exceeds 1024 characters "
                    f"({len(desc_value)})"
                )


if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)
PY
  then
    ok "SKILL.md frontmatter descriptions match repo conventions"
  else
    err "skill frontmatter convention check failed"
  fi
else
  warn "python3 not available; skipped skill frontmatter checks"
fi

section "Shell syntax"
syntax_fail=0
while IFS= read -r file; do
  [ -z "$file" ] && continue
  if ! bash -n "$file" 2>/dev/null; then
    err "syntax error: $file"
    syntax_fail=$((syntax_fail + 1))
  fi
done < <(find scripts -name '*.sh' -type f 2>/dev/null)
[ "$syntax_fail" -eq 0 ] && ok "all shell scripts parse"

section "Hardcoded paths"
# Scope: scripts/ and skills/. README/docs are allowed to use example paths freely
# (the previous `grep -vE '…|example|~/'` exclusion was too loose to catch a real
# leak in those files anyway); skills/ MUST be scanned — a leaked `/Users/...` path
# there rides the subtree straight into the marketplace and every install.
hardcoded_paths=$(grep -rEn \
  --include='*.sh' --include='*.md' --include='*.json' --include='*.yaml' --include='*.yml' --include='*.py' \
  --exclude="$SELF" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=testbed --exclude-dir='*-workspace' \
  '/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/' scripts skills 2>/dev/null | \
  grep -vE 'example|placeholder|~/' || true)
if [ -z "$hardcoded_paths" ]; then
  ok "no hardcoded absolute user-home paths in scripts/ or skills/"
else
  err "hardcoded absolute user-home paths found in scripts/ or skills/"
  printf '%s\n' "$hardcoded_paths" | head -5 | sed 's/^/      /' >&2
fi

echo ""
echo "========================================"
echo "  Pre-push security: $PASSED passed, $WARNINGS warnings, $ERRORS blockers"
echo "========================================"

if [ "$ERRORS" -gt 0 ]; then
  echo "  BLOCKERS found - fix before push" >&2
  exit 1
fi

[ "$QUIET" = "1" ] && echo "  clean"
exit 0
