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
    // Double quotes only. An apostrophe is not a quote delimiter in English prose: pairing
    // "doesn't" with "you're" swallowed the negation between them and turned a correct answer red.
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|unnecessary|pointless|wrong)\b/i;
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

// The decision is judged BEFORE the vocabulary. An answer that restarts the server has already
// failed this case, and reporting it as "never said SERVER_LOG" buries the finding.
const bad = offenders(text, [
  /\b(?:re-?)?allocat\w+\b[^\n]{0,25}\b(?:new|fresh|free|different|another)\b[^\n]{0,15}port/i,
  /\b(?:re-?)?allocat\w+\b[^\n]{0,15}port[^\n]{0,25}\b(?:new|fresh|free|different|another)\b/i,
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

const checks = [
  [/\b3001\b/, 'the answer never carries the announced port 3001 forward as the effective origin'],
  [/(?:SERVER_LOG|announced)/i, 'the answer never re-runs the serve phase with SERVER_LOG, so the port stays guessed rather than read'],
  [/(?:::1|ipv6|address family)/i, 'the answer never carries the announced [::1] address family'],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the announced port and address family are adopted; the server is left alone');
