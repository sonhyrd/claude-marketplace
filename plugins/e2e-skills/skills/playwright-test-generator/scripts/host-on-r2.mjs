#!/usr/bin/env node
// Upload a file to the public Cloudflare R2 bucket and print its public watch URL.
// Objects are namespaced per project:  <bucket>/<project>/<keyname>
//
//   node host-on-r2.mjs <file> <project> [keyname]
//     <file>     local path to upload (e.g. demo.webm)
//     <project>  per-project folder, usually the repo short name (e.g. nuxt-hyrd-chrysus)
//     [keyname]  object name under the project folder; defaults to the file's basename.
//                may include slashes to nest (e.g. rfp-verify/pr42-a1b2c3d.webm)
//
// Before a PUBLIC upload it runs three STOP gates — a proof video must never leak a credential or
// land under a broken key. They run in this order, and the order is the contract:
//   • DEGENERATE-KEY gate (exit 2) — refuse an empty-segment / dangling-'-' key (pr42-.webm from an
//     unset $SHA). A blank `git rev-parse` in a non-repo scratch dir once uploaded a stray,
//     unreachable object.
//   • EMPTY-FILE gate (exit 3) — refuse a < 1KB file. A dead screencast.start() or a crashed page
//     yields a tiny webm; publishing it as the watch link proves nothing.
//   • TOKEN gate (exit 6) — if BEARER is set, refuse when it appears in <file> or in any artifact
//     listed in $SCAN (the committed spec + film script). Seed auth out-of-band so this never
//     fires; the gate is the backstop, not the plan.
//
// Prints the public URL as the FIRST stdout line (wrangler chatter goes to stderr; the trailing
// PTG_RUN ledger line follows it) so callers can do:
//   URL=$(node host-on-r2.mjs demo.webm myproj | head -n1)
// Needs wrangler authenticated (`npx wrangler whoami`). Exits non-zero if a gate trips or the
// upload fails.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ptgRun } from './ptg-run.mjs';

ptgRun(import.meta.url, 'publish'); // run ledger (issue #5) — registered before the gates

const BUCKET = 'paul-rfp-public'; //                                  this account's public R2 bucket
const PUB = 'https://pub-0e54d86b28da4e8f933f8eacd1a84c6c.r2.dev'; // its r2.dev public domain
// Point elsewhere by editing the two constants above.

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const [FILE, PROJECT, KEYNAME_ARG] = process.argv.slice(2);
if (!FILE || !PROJECT) {
  err('host-on-r2.mjs: usage: host-on-r2.mjs <file> <project> [keyname]\n');
  process.exit(1);
}
const KEY = `${PROJECT}/${KEYNAME_ARG || path.basename(FILE)}`;

// `-.` = a dangling '-' before ANY extension, not an enumerated few.
if (KEY.includes('//') || /-\./.test(KEY) || KEY.includes('/.')) {
  err(`host-on-r2: refusing degenerate key '${KEY}' — empty segment; check your SHA/keyname\n`);
  process.exit(2);
}

const bytes = (() => {
  try {
    return fs.statSync(FILE).size;
  } catch {
    return 0; //                                                       a missing file is an empty one
  }
})();
if (bytes < 1024) {
  err(
    `host-on-r2: STOP — '${FILE}' is only ${bytes}B (< 1KB) — a broken/empty recording, not a ` +
      'proof. Re-film, then retry.\n',
  );
  process.exit(3);
}

// Read as a Buffer and search the raw bytes: the payload is usually a webm, and decoding it as
// UTF-8 first would mangle byte sequences the token could be hiding in. This is the binary-safe,
// literal-match equivalent of the shell's `LC_ALL=C grep -qF`.
const BEARER = process.env.BEARER;
if (BEARER) {
  const needle = Buffer.from(BEARER, 'utf8');
  const scanPaths = [FILE, ...(process.env.SCAN ?? '').split(/\s+/).filter(Boolean)];
  for (const f of scanPaths) {
    let haystack;
    try {
      if (!fs.statSync(f).isFile()) continue;
      haystack = fs.readFileSync(f);
    } catch {
      continue;
    }
    if (haystack.includes(needle)) {
      err(`host-on-r2: STOP — the auth token ($BEARER) appears in '${f}'. A public upload would leak it.\n`);
      err(
        '            Seed auth out-of-band (env + addInitScript / gitignored storageState), scrub ' +
          'it, then retry.\n',
      );
      process.exit(6);
    }
  }
}

// Without an explicit content type a watch page uploads as octet-stream and DOWNLOADS instead of
// rendering — which is the whole point of hosting it.
const CONTENT_TYPES = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.html': 'text/html;charset=utf-8',
  '.vtt': 'text/vtt',
};
// No .toLowerCase(): the shell's `case "$FILE" in *.png)` was case-SENSITIVE, so DEMO.PNG fell
// through to octet-stream. Contract-frozen means keeping that, warts and all.
const contentType = CONTENT_TYPES[path.extname(FILE)] ?? 'application/octet-stream';

// stdio fd 2 for the child's STDOUT is deliberate, not a typo: callers do
// `URL=$(host-on-r2 … | head -n1)`, so our stdout carries ONLY the URL (line 1) and the PTG_RUN
// ledger line. Every byte wrangler prints goes to stderr.
const r = spawnSync(
  'npx',
  ['-y', 'wrangler', 'r2', 'object', 'put', `${BUCKET}/${KEY}`,
   `--file=${FILE}`, `--content-type=${contentType}`, '--remote'],
  { stdio: ['ignore', 2, 2] },
);
if (r.status !== 0) process.exit(r.status ?? 1);

out(`${PUB}/${KEY}\n`);
