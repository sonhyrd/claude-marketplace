#!/usr/bin/env node
// Judge (w02, WET): the auth code the run WROTE, not the ladder it described.
//
// Its dry twin `case-48` grades an answer about a dev-guarded `?token=` rung. This one reads the
// file the run left on disk and asks whether that file does what the answer says: SKILL.md Step 3 ›
// *Auth — drive the app's OWN entry (never a blind localStorage seed)* requires the server-set
// cookie rung to "API-login with the discovered credential, seed the cookie **it returns** … Do not
// hand-author the cookie value", and requires the dev-guarded rung to be recorded as ABSENT in the
// Step-4 Assumptions block rather than attempted.
//
// The negative checks run over the code with its comments stripped. A correct implementation names
// the forbidden paths in order to say why it did not take them — the #59 bare-substring defect,
// which over a source file arrives as a comment rather than as a rejection list.
//
// Workspace root is the judge's cwd under skill-up; $PWPROVE_JUDGE_ROOT overrides it for the
// recorded fixtures in scripts/ci/test-eval-judges.sh.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const finalMessage = process.env.EVAL_FINAL_MESSAGE ?? '';
const transcript = process.env.EVAL_TRANSCRIPT_PATH ?? '';
if (!finalMessage.trim() && !transcript.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no $EVAL_TRANSCRIPT_PATH — there is no run to judge');
  process.exit(1);
}

const root = process.env.PWPROVE_JUDGE_ROOT ?? process.cwd();
const read = (name) => {
  const p = join(root, name);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

const AUTH_FILE = 'tests/e2e/auth.setup.ts';
const ASSUMPTIONS = 'assumptions.md';

const code = read(AUTH_FILE);
if (code === null || !code.trim()) {
  console.error(`FAIL: no ${AUTH_FILE} in the workspace — the run described a ladder and wrote no code`);
  process.exit(1);
}

// Comments only. String literals stay: a hand-authored cookie value IS a string literal, and
// stripping them would delete the very thing the negative checks look for.
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '\n').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const executable = stripComments(code);

const bad = [
  [/\.goto\s*\([^)]{0,120}\btoken=/i, 'it navigates to a `?token=` URL — that rung is dev-guarded and compiled out of the built artifact'],
  [/\blocalStorage\.setItem\s*\(/, 'it seeds `localStorage` directly — a blind seed on an app whose session is a server-set cookie'],
  // Scoped to the addCookies() argument. A bare `value:` string literal anywhere in the file is a
  // form field or a header as often as it is a cookie, and red-flagging a correct answer for one is
  // the cost this whole judges/ directory was rewritten to stop paying.
  [/\baddCookies\s*\([^)]{0,400}?\bvalue\s*:\s*['"`][^'"`\n]+['"`]/s, 'it hand-authors a cookie value instead of reusing the one the login response returned'],
  [/\bimport\.meta\.dev\s*=|NODE_ENV\s*=\s*['"`]development/, "it re-enables the dev-only path instead of descending the ladder"],
];
for (const [re, why] of bad) {
  if (re.test(executable)) {
    console.error(`FAIL: ${AUTH_FILE} does not drive the app's own entry — ${why}`);
    process.exit(1);
  }
}

// Either spelling of the fixture's login route. Nuxt maps `server/api/auth/login.post.ts` to
// `/api/auth/login`; a run that read the handler's filename before that file was renamed could
// reasonably have written `/api/auth-login`, and failing a correct answer over a fixture's own
// inconsistency is the defect this directory exists to stop repeating.
if (!/\/api\/auth[/-]login/.test(executable)) {
  console.error(`FAIL: ${AUTH_FILE} never reaches the app's own login endpoint (/api/auth/login)`);
  process.exit(1);
}
if (!/set-cookie|storageState|\.cookies\s*\(/i.test(executable)) {
  console.error(
    `FAIL: ${AUTH_FILE} logs in but never takes the session from the response — the cookie value is ` +
      'minted server-side, so it has to be read back off `Set-Cookie` (or captured as storageState)',
  );
  process.exit(1);
}

const assumptions = read(ASSUMPTIONS);
if (assumptions === null || !assumptions.trim()) {
  console.error(`FAIL: no ${ASSUMPTIONS} in the workspace — the skipped rung and its guard were never recorded`);
  process.exit(1);
}
if (!/import\.meta\.dev/.test(assumptions)) {
  console.error(`FAIL: ${ASSUMPTIONS} never names the \`import.meta.dev\` guard that makes the \`?token=\` rung absent`);
  process.exit(1);
}
if (!/\babsent\b|\bskipp?ed\b|\bcompiled out\b|\bfolded\b|\bnot in the (?:built )?artifact\b/i.test(assumptions)) {
  console.error(`FAIL: ${ASSUMPTIONS} names the guard but never records the rung as absent or skipped`);
  process.exit(1);
}

console.log(`PASS: the run wrote ${AUTH_FILE} against the app's own /api/auth/login and took the session`);
console.log(`      from the response, and ${ASSUMPTIONS} records the dev-guarded rung as absent.`);
