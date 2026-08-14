#!/usr/bin/env node
// Judge (case-51): SERVE_CAUSE=no-announcement plus a printed crash is the server or the build output — not a port to hunt for.
//
// SKILL.md Step 3 › Bring the environment up. The log names no listening origin, so the port
// could never be read, and the printed crash makes this the server or the built output rather than a
// port guessed wrong. Act on the server's own error: the preview command is pointed at an output path
// that does not exist, so confirm what the build actually produced and start the project's own preview
// command against that output. Do not hunt a shifted port, try other loopback forms or ports, re-run
// the serve phase on a longer budget, or re-run the build phase — it passed, and its failure would have
// been reported as exit 5 with its own standard error.
// Distinct from case-50, which owns the no-log cause and the announced origin.
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

const bad = offenders(text, [
  /\bI (?:try|check|scan|probe|test)\b[^\n]{0,40}(?:other ports?|another port|different ports?|port range)/i,
  /\bI (?:try|use|switch)\b[^\n]{0,40}(?:127\.0\.0\.1|localhost|\[::1\]|loopback)[^\n]{0,20}instead/i,
  /\bI (?:re-?run|retry|extend|raise|increase)\b[^\n]{0,40}(?:serve phase|budget|timeout|longer)/i,
  /\bI (?:re-?run|redo|repeat)\b[^\n]{0,30}the build/i,
]);
if (bad.length) {
  console.error("FAIL: the answer hunts a port or re-runs a phase instead of acting on the crash the server printed:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/no-announcement/, "the answer never reads the cause code it was given"],
  [/Cannot find module|\.output\/server|output path|build output|artifact/i, "the answer never engages with the server's own error, which is the finding"],
  [/\bbuild\b/i, "the answer never asks what the build actually produced"],
  [/preview/i, "the answer never restarts the project's own preview command against the real output"],
  [/BUILD=ok|already passed|passed/i, "the answer never uses the fact that the build phase already passed"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the no-announcement cause is read as a server fault and the crash is acted on, with no port hunting");
