#!/usr/bin/env node
// Judge (case-33): a recon pass that produced no HAR is a stated deviation, never a silent fallback to hand-written mocks.
//
// SKILL.md Step 5 › HAR-first mocking. A spec replaying a missing HAR aborts every call under
// notFound: 'abort', which reads as a broken surface. The probe's close output reports either the
// written path with a byte count or a warning that no HAR landed, so that is what gets checked. The
// deviation is recorded as 'no api.har — <reason>' in the Assumptions block AND the completion report,
// and only what the scenario needs is hand-mocked. A missing HAR is never evidence that the surface
// makes no API calls.
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
  /\bI (?:write|add|use|keep|point)\b[^\n]{0,40}routeFromHAR/i,
  /\b(?:makes?|made|has|have)\s+no\s+(?:API|network|HTTP)\s+(?:calls|requests|traffic)/i,
  /\bI (?:re-?record|record)\b[^\n]{0,30}(?:silently|quietly)/i,
]);
if (bad.length) {
  console.error("FAIL: the answer replays a HAR that is not there, or reads its absence as proof of no API traffic:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\bprobe\b/i, "the answer never checks the probe's close output, which is what says whether a HAR landed"],
  [/routeFromHAR/, "the answer never names routeFromHAR, so it never says what it is declining to write"],
  [/re-?record|no api\.har|\bdeviation\b/i, "the answer takes neither route the step allows: re-record the pass, or declare `no api.har` as a deviation"],
  [/re-?record|hand-?mock|\bmock\b/i, "the answer offers neither of the two legitimate routes (re-record the pass, or hand-mock what the scenario needs)"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the missing HAR is checked at its source and declared, never silently replayed or read as an absence of API traffic");
