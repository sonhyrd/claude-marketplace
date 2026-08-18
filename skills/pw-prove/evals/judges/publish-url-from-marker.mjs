#!/usr/bin/env node
// Judge (case-30): capture the published URL from the PWPROVE_URL marker line, never from line 1.
//
// The old rule was `failure: output_contains` over `head -n1 /tmp/pw-prove-publish.out` and
// `the first line of stdout`. The correct answer explains WHY line 1 is wrong — npm and ffmpeg
// chatter reach it first — and the bare substring fired on the explanation.
//
// The repair is artifact-shaped, following `no-workers-in-command.mjs`: the negative applies to the
// EMITTED COMMAND. A shell block that takes the first line of the publish output is the defect; prose
// naming that mistake in order to avoid it is the correct answer.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

const blocks = [...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].trim().toLowerCase(), body: m[2] }));
const shell = blocks.filter((b) => b.lang === '' || /^(?:bash|sh|shell|zsh|console|shell-session)$/.test(b.lang));
const emitted = shell.map((b) => b.body).join('\n');

if (shell.length === 0) {
  console.error('FAIL: no shell block — this case is answered with the publish command, and none was emitted');
  process.exit(1);
}

// --- the capture ---------------------------------------------------------------------------------------
if (!/PWPROVE_URL/.test(emitted)) {
  console.error('FAIL: the emitted command never keys off the PWPROVE_URL marker line');
  process.exit(1);
}
// The marker has to be USED to select the line — naming it in a variable name is not a capture.
if (!/(?:sed\s+-n|grep|awk)[^\n]*PWPROVE_URL|PWPROVE_URL[^\n]*(?:sed\s+-n|grep|awk)/.test(emitted)) {
  console.error('FAIL: the marker is named but never used to select the line (no sed -n / grep / awk on it)');
  process.exit(1);
}
if (!/2>\s*[^\s&]|2>>|2>&1\s*\|\s*tee|--log|\.log\b/.test(emitted)) {
  console.error('FAIL: stderr is never sent to a log file, so the ffmpeg banner still merges into the capture');
  process.exit(1);
}

// --- the two empty-URL cases are distinguished -----------------------------------------------------------
const needs = [
  [/(?:\$\?|\bRC\b|exit code|status)/i, 'the answer never reads the exit code, so it cannot tell UNDELIVERED from a gate exit'],
  [/PWPROVE_PROOF_FILE/, 'the answer never names the PWPROVE_PROOF_FILE fallback for an UNDELIVERED publish'],
  [/(?:\b3\b[^\n]*\b6\b[^\n]*\b8\b|gate exit|exit (?:3|6|8|9))/i, 'the answer never distinguishes a gate exit (3, 6, 8, 9) from an undelivered publish'],
];
const missing = needs.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

// --- and never takes line 1 -------------------------------------------------------------------------------
const naive = [];
for (const b of shell) {
  for (const line of b.body.split('\n')) {
    // `head -n1` is fine AFTER a marker has selected the line — it is the classic
    // `sed -n 's/^PWPROVE_URL //p' | head -n1`. It is only wrong when it reads the raw output.
    // ANY PWPROVE_ marker counts, not just PWPROVE_URL: a correct answer captures the kept-file
    // fallback the same way, and requiring the URL marker specifically red-flagged that line.
    if (!/\bhead\s+-n?\s?1\b/.test(line)) continue;
    if (/PWPROVE_[A-Z_]+/.test(line) || /(?:sed\s+-n|grep|awk)/.test(line)) continue;
    naive.push(line.trim());
  }
}
if (naive.length) {
  console.error('FAIL: the emitted command takes the first line of the publish output, which npm/ffmpeg chatter owns:');
  for (const l of [...new Set(naive)].slice(0, 3)) console.error('   ' + l);
  process.exit(1);
}

console.log('PASS: the URL is captured from the PWPROVE_URL marker, stderr is logged, and both empty-URL cases are separated');
