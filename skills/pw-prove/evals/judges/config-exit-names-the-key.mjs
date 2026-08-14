#!/usr/bin/env node
// Judge (case-44): preflight exit 4 is a CONFIGURATION failure — set the named key and re-run the
// same two phases.
//
// The old rule was `failure: output_contains` over `rebuild`, `exit 5`, `SERVE_CAUSE`, `poll budget`.
// The correct answer names every one of them to rule them out: "this is not exit 5, there is no
// SERVE_CAUSE to read, and no rebuild is warranted — the build never ran". A bare substring reads
// that as the failure it was written to catch.
//
// The repair anchors the negative on the DECISION SENTENCE: a forbidden remedy counts only where the
// answer proposes it, and a sentence carrying a negation is the answer rejecting it.
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
    // Double quotes only. An apostrophe is not a quote delimiter in English prose: pairing
    // "doesn't" with "you're" swallowed the negation between them and turned a correct answer red.
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|unnecessary|irrelevant|wrong)\b/i;
function offenders(t, phrases) {
  const out = [];
  for (const s of commitments(t).split(/(?<=[.!?;])\s+|\n+/)) {
    const line = s.trim();
    if (!line || NEGATED.test(line)) continue;
    for (const p of phrases) if (p.test(line)) out.push(line);
  }
  return [...new Set(out)];
}

// --- act on the named key ---------------------------------------------------------------------------
if (!/NUXT_PUBLIC_AUTH_URL/.test(text)) {
  console.error('FAIL: the answer never names NUXT_PUBLIC_AUTH_URL — the key exit 4 handed it');
  process.exit(1);
}
if (!/(?:re-?run|run (?:it|the) (?:phase|command|gate) again|preflight\.mjs config build)/i.test(text)) {
  console.error('FAIL: the answer never re-runs the same two phases after setting the key');
  process.exit(1);
}

// --- and answers this phase's failure, not another one ------------------------------------------------
const bad = offenders(text, [
  /\brebuild(?:ing|s)?\b/i,
  /\bexit 5\b/i,
  /\bSERVE_CAUSE\b/,
  /\bpoll budget\b/i,
  /\bREADY_TIMEOUT\b/,
  /\b(?:wait longer|increase the (?:timeout|budget))\b/i,
  /\b(?:slow|unresponsive) server\b/i,
  /\b(?:kill|restart) (?:the )?(?:port|server)\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer reaches for a remedy that answers a different phase\'s failure:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

// A value invented for a key the run cannot source is the other half of the contract.
const invented = offenders(text, [/NUXT_PUBLIC_AUTH_URL\s*=\s*(?:https?:\/\/|["'][^"'\n]+["'])/i]);
if (invented.length) {
  console.error('FAIL: the answer invents a value for a key it cannot source:');
  for (const s of invented.slice(0, 2)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: exit 4 read as configuration — the named key is set and the same two phases re-run');
