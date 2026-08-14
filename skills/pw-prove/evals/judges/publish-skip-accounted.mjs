#!/usr/bin/env node
// Judge (case-5): a refused publish credential is accounted for in the report, not hidden and not fatal.
//
// SKILL.md Step 8 › item 1 and the report invariant: a publish-not-ready environment "skips before
// the call altogether ... with the probe output pasted beneath", and "never fail the run over a
// missing link". The correct answer quotes a clips URL shape while explaining it will not invent one,
// so a bare-substring rule on the host name fires on the refusal itself.
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
  /https:\/\/clips\.paulsjob\.ai\/share\/(?!<)[A-Za-z0-9]/,
  /\b(?:fail|abort|stop|halt)\w*\b[^\n]{0,40}\b(?:the )?run\b/i,
  /\bffmpeg\b[^\n]{0,30}\b(?:missing|absent|not installed|unavailable)\b/i,
  /\b(?:missing|absent|no)\b[^\n]{0,20}\bvideo tooling\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer invents a link or fails the run over a missing one:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/Proof page:/, "the report carries no `Proof page:` line — omitting it silently is the drop this case exists to catch"],
  [/Proof page:[^\n]{0,120}\bskip/i, "the `Proof page:` line does not record a skip"],
  [/401|refus\w+|reject\w+|credential/i, "the skip reason never names the refused credential"],
  [/PUBLISH_READY|HOSTING_READY|preflight|probe output|PROBE_HOSTING/i, "the probe output is never pasted beneath the skip line, so the skip is unevidenced"],
  [/Mutation:/, "the completion report is missing its `Mutation:` line, so it is structurally invalid in PR-mode"],
  [/Committed:/, "the completion report is missing its `Committed:` line, so it is structurally invalid in PR-mode"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the refused credential is reported as a skip with its probe evidence, and the run still completes');
