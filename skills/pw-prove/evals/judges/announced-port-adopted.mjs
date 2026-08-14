#!/usr/bin/env node
// Judge (case-50): the framework announced its own port — read it, do not fight it.
//
// The old rule was `failure: output_contains` over `allocate a new free port`, `try port 3000 again`,
// `the server is broken`, `restart on 3000`. The correct answer names those to rule them out ("the
// server is not broken and there is no reason to restart on 3000 — it told us it moved to 3001"), so
// the substring rule cannot separate the diagnosis from the remedy.
//
// The repair anchors the negative on the DECISION SENTENCE, and keeps the positive half — the
// announced port, SERVER_LOG, and the address family — as a plain presence check, which was never
// the broken part.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/[“"']([^"“”'\n]{0,400})[”"']/g, ' ');
}
const NEGATED = /\b(?:not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|unnecessary|pointless|wrong)\b/i;
function offenders(t, phrases) {
  const out = [];
  for (const s of commitments(t).split(/(?<=[.!?;])\s+|\n+/)) {
    const line = s.trim();
    if (!line || NEGATED.test(line)) continue;
    for (const p of phrases) if (p.test(line)) out.push(line);
  }
  return [...new Set(out)];
}

const checks = [
  [/\b3001\b/, 'the answer never adopts the announced port 3001'],
  [/(?:SERVER_LOG|announced)/i, 'the answer never reads the port out of the server log (SERVER_LOG / announced)'],
  [/(?:::1|ipv6|address family)/i, 'the answer never carries the announced [::1] address family'],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

const bad = offenders(text, [
  /\ballocate (?:a )?new (?:free )?port\b/i,
  /\b(?:try|retry|reclaim|claim) (?:port )?3000 again\b/i,
  /\b(?:the )?server is (?:broken|down|absent|dead)\b/i,
  /\brestart(?:ing)? (?:it |the server )?on 3000\b/i,
  /\bkill (?:it|the server)[^\n]*\b3000\b/i,
  /\brebuild(?:ing)?\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer fights the announced port instead of reading it:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: the announced port and address family are adopted; the server is left alone');
