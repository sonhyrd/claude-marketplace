#!/usr/bin/env node
// Judge (case-54): exit 6 says the recording was DESTROYED by its own scrub — re-record it, never hand-substitute the placeholders back.
//
// SKILL.md Step 8. Exit 6 is its own verdict and is not residue (exit 3): nothing leaked, so
// re-running the scrubber cannot help. The cause is a learned secret short enough to occur inside
// ordinary content (a locale cookie such as i18n_redirected=en), whose substitution replaced the
// application's own text. The fix is to RE-RECORD the recon pass, or narrow what the capture treats as
// a secret; the HAR must not be staged. Hand-substituting the placeholders back is explicitly wrong —
// it rebinds only what the reader happens to notice. The earlier --verify said clean because a residue
// check asks whether a credential SURVIVED, and over-scrub leaves no credential behind.
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
  /\bI (?:re-?run|run)\b[^\n]{0,40}scrubber[^\n]{0,30}(?:to clear|again to)/i,
  /\bI (?:substitute|swap|put|restore|replace)\b[^\n]{0,50}(?:back|placeholders? back)/i,
  /\bI (?:stage|commit|keep)\b[^\n]{0,30}(?:the )?HAR/i,
  /\bthis is (?:residue|exit 3)\b/i,
]);
if (bad.length) {
  console.error("FAIL: the answer treats over-scrub as residue, hand-repairs the placeholders, or stages the wrecked HAR:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\bexit(?:s|ed)?\s*6\b|\bexit code 6\b/i, "the answer never names exit 6 as its own verdict"],
  [/\bexit(?:s|ed)?\s*3\b|\bresidue\b/i, "the answer never distinguishes this from residue, which is the confusion the case is about"],
  [/over-?scrub|destroyed|wrecked|replaced[^\n]{0,30}(?:content|text)/i, "the answer never says the recording was destroyed by its own scrub"],
  [/i18n|locale|short|ordinary content|common/i, "the answer never identifies the cause — a learned secret short enough to occur inside ordinary content"],
  [/re-?record/i, "the answer never re-records, which is the only fix that produces a trustworthy file"],
  [/\bnot (?:be )?staged?\b|\bdo(?:es)? not stage\b|\bnever staged?\b|\bwithhold/i, "the answer never withholds the HAR from staging"],
  [/\bclean\b/i, "the answer never explains why the earlier --verify reported clean"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: exit 6 is read as over-scrub rather than residue, the HAR is re-recorded rather than hand-repaired, and the earlier clean verify is explained");
