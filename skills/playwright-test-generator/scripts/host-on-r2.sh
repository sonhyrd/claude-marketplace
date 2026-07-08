#!/usr/bin/env sh
# Upload a file to the public Cloudflare R2 bucket and print its public watch URL.
# Objects are namespaced per project:  <bucket>/<project>/<keyname>
#
#   host-on-r2.sh <file> <project> [keyname]
#     <file>     local path to upload (e.g. demo.webm)
#     <project>  per-project folder, usually the repo short name (e.g. nuxt-hyrd-chrysus)
#     [keyname]  object name under the project folder; defaults to the file's basename.
#                may include slashes to nest (e.g. rfp-verify/pr42-a1b2c3d.webm)
#
# Before a PUBLIC upload it runs two STOP gates — a proof video must never leak a credential or land under a
# broken key:
#   • TOKEN gate (SKILL »HOST«/»Honesty«): if BEARER is set, refuse when it appears in <file> OR in any artifact
#     listed in $SCAN (the committed spec + film script). Seed auth out-of-band so this never fires; the gate is
#     the backstop, not the plan.
#   • DEGENERATE-KEY gate: refuse an empty-segment / dangling-'-' key (e.g. pr42-.webm from an unset $SHA).
#   • EMPTY-FILE gate: refuse a < 1KB file — a 0-byte / header-only webm is a broken recording, not a proof.
#
# Prints the public URL on stdout (wrangler chatter goes to stderr) so callers can do:
#   URL=$(host-on-r2.sh demo.webm myproj)
# Needs wrangler authenticated (`npx wrangler whoami`). Exits non-zero if a gate trips or the upload fails.
set -eu

BUCKET="paul-rfp-public"                                    # this account's public R2 bucket
PUB="https://pub-0e54d86b28da4e8f933f8eacd1a84c6c.r2.dev"   # its r2.dev public domain
# Point elsewhere by editing the two vars above.

FILE="${1:?usage: host-on-r2.sh <file> <project> [keyname]}"
PROJECT="${2:?usage: host-on-r2.sh <file> <project> [keyname]}"
KEYNAME="${3:-$(basename "$FILE")}"
KEY="$PROJECT/$KEYNAME"

# Refuse a degenerate key (empty path segment / dangling '-.' from an unset SHA var, e.g. pr2809-.webm) —
# a blank $(git rev-parse …) run in a non-repo scratch dir once uploaded a stray, unreachable object.
case "$KEY" in                             # *-.* = dangling '-' before ANY extension, not an enumerated few
  *//*|*-.*|*/.*)
    echo "host-on-r2: refusing degenerate key '$KEY' — empty segment; check your SHA/keyname" >&2; exit 2 ;;
esac

# EMPTY/TRUNCATED gate — the video IS the proof, so a 0-byte or header-only file is no proof at all. A dead
# screencast.start() or a crashed page yields a tiny webm; publishing it as the watch link proves nothing.
BYTES=$(($(wc -c < "$FILE" 2>/dev/null || echo 0)))   # $(( )) normalizes wc's whitespace; missing file → 0
if [ "$BYTES" -lt 1024 ]; then
  echo "host-on-r2: STOP — '$FILE' is only ${BYTES}B (< 1KB) — a broken/empty recording, not a proof. Re-film, then retry." >&2
  exit 3
fi

# Token gate — never publish an artifact that carries the auth token. Grep <file> and every $SCAN path (the
# committed spec + film script) for $BEARER; STOP on a hit. LC_ALL=C + grep -F keeps it binary-safe and literal.
if [ -n "${BEARER:-}" ]; then
  for f in "$FILE" ${SCAN:-}; do
    [ -f "$f" ] || continue
    if LC_ALL=C grep -qF -- "$BEARER" "$f" 2>/dev/null; then
      echo "host-on-r2: STOP — the auth token (\$BEARER) appears in '$f'. A public upload would leak it." >&2
      echo "            Seed auth out-of-band (env + addInitScript / gitignored storageState), scrub it, then retry." >&2
      exit 6
    fi
  done
fi

case "$FILE" in
  *.webm) CT=video/webm ;;
  *.mp4)  CT=video/mp4 ;;
  *.png)  CT=image/png ;;
  *.gif)  CT=image/gif ;;
  *.jpg|*.jpeg) CT=image/jpeg ;;
  *)      CT=application/octet-stream ;;
esac

npx -y wrangler r2 object put "$BUCKET/$KEY" --file="$FILE" --content-type="$CT" --remote >&2
echo "$PUB/$KEY"
