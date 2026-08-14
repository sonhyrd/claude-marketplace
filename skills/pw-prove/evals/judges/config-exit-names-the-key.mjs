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
// A markdown list inherits the negation of the header that introduces it. "What I explicitly do
// **not** do:" over bare items ("Re-allocate a fresh free port and restart.") carries the negation in
// the header alone, so judging each item on its own reads a correct answer's rejection list as its
// plan. That is the #59 defect in list form, and it failed a recorded 2026-08-14 answer that was
// right in every particular. A non-item line re-decides the scope; a blank line does not end a list.
//
// REJECTION_HEADER is deliberately NARROWER than NEGATED, and inverts that filter's bias on purpose:
// NEGATED is broad because it excuses one sentence, while a header excuses every item beneath it, so
// an incidental negation ("Nothing answers on 3000, so here is the plan:") must not open the scope.
// It wants an explicit refusal — "do not do", "won't", "ruled out" — and tolerates the markdown
// emphasis a model puts between the verb and its negation ("do **not** do").
const REJECTION_HEADER = /\b(?:do|does|did|will|would|shall|should|can|could|must|am|are|is)\b[\s*_~]{0,4}\bnot\b|\b(?:do|does|did|wo|would|should|could|can|must)n['\u2019]?t\b|\bnever\b|\bavoid\w*|\brefus\w*|\breject\w*|\brul(?:e|ed|ing)s? out\b|\bforbidden\b|\bout of scope\b|\brather than\b|\binstead of\b/i;
function offenders(t, phrases) {
  const out = [];
  let underRejectionHeader = false;
  for (const raw of commitments(t).split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const isItem = /^(?:[-*+]|\d+[.)])\s+/.test(line);
    if (!isItem) underRejectionHeader = /:[*_~\s]*$/.test(line) && REJECTION_HEADER.test(line);
    else if (underRejectionHeader) continue;
    for (const s of line.split(/(?<=[.!?;])\s+/)) {
      const sentence = s.trim();
      if (!sentence || NEGATED.test(sentence)) continue;
      for (const p of phrases) if (p.test(sentence)) out.push(sentence);
    }
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
