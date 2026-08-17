#!/usr/bin/env node
// Judge (case-42): the recon HAR is already scrubbed at capture — nothing needs doing, and no second scrubber is hand-rolled.
//
// SKILL.md Step 3. probe.mjs hands the recording to the shipped scrubber on context close, so
// the file was never unscrubbed on disk and there is no scrub step to place. The reported line IS the
// evidence (3 secrets placeheld); a 'probe: REFUSED' line would have named surviving residue. Step 8
// runs --verify, which is a check that the capture-time scrub HELD, not the scrub itself.
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
  /\bI (?:write|hand-?roll|author|add)\b[^\n]{0,50}(?:node -e|python3?|scrubber|script)/i,
  /\bI (?:run|invoke|call)\b[^\n]{0,30}har-scrub[^\n]{0,40}(?:now|first|to scrub)/i,
  /\bI (?:defer|postpone|leave|wait)\b[^\n]{0,50}(?:commit|Step 8|later)/i,
]);
if (bad.length) {
  console.error("FAIL: the answer re-scrubs a recording that was already scrubbed at capture, or defers the scrub:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/^\s*nothing\b|\bnothing\b[^\n]{0,30}(?:to do|needs? doing|is the right)|\bno (?:further |additional |extra |second )?(?:action|step|work|scrub)\b|already scrubbed/im, "the answer never states the conclusion — that nothing needs doing here"],
  [/capture|on close|context close/i, "the answer never says the scrub already happened at capture time"],
  [/3 secret|placeheld/i, "the answer never reads the reported line, which is the evidence the scrub ran"],
  [/REFUSED/, "the answer never says what the failure line would have looked like, so the pass is unfalsifiable"],
  [/--verify/, "the answer never connects this to the Step-8 --verify check"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the capture-time scrub is read as done, its evidence is named, and no second scrub is invented");
