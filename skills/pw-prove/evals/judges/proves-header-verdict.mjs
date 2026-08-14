#!/usr/bin/env node
// Judge (case-17): a missing header and a paraphrased header both block Step 7; the POM is exempt.
//
// SKILL.md Step 6 › PROVES-header audit: "A missing or paraphrased header blocks Step 7: add it, then
// proceed. **Exempt:** POM files." The correct answer quotes the paraphrase it is rejecting, so the
// forbidden string is in the right answer's mouth.
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
  /\bPeopleListPage\b[^\n]{0,60}\b(?:needs|requires|must (?:have|gain|add)|is missing)\b/i,
  /\badd\w*\b[^\n]{0,40}(?:PROVES)[^\n]{0,40}\b(?:to the )?(?:POM|Page Object|PeopleListPage)\b/i,
  /\bvalidates status input\b[^\n]{0,60}\b(?:is fine|acceptable|passes|sufficient|ok)\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer accepts a paraphrase or demands a header the POM does not owe:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/User can filter people by status/, "the answer never supplies the AC verbatim as the missing header"],
  [/PROVES/, "the answer never names the PROVES header"],
  [/paraphras\w+|verbatim|word[- ]for[- ]word|exact/i, "the answer never says the second header paraphrases rather than quotes its AC"],
  [/\bStep 7\b/, "the answer never says what this does to Step 7"],
  [/\bblock\w*|\bgat\w+|\bbefore Step 7\b/i, "the answer never says the findings BLOCK Step 7 — a header audit that only advises is not a gate"],
  [/PeopleListPage|POM|Page Object/, "the answer never gives a verdict for the POM file"],
  [/exempt|\bnot (?:a )?(?:finding|required)\b|no such comment is needed|carries no ACs/i, "the answer never states the POM exemption, so its missing header reads as a finding"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: both tests are blocked and corrected against the verbatim AC, and the POM is exempt');
