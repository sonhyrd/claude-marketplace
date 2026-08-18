#!/usr/bin/env node
// Judge (case-8): the Step-8 tail after publishing — hygiene, commit, push, comment, and a valid report.
//
// SKILL.md Step 8 items 2–5 and the report invariant. The correct answer names the litter it deletes
// beside the proof config it KEEPS, so a substring rule on "playwright.proof.config.ts" cannot tell
// the deletion from the exemption; the negative belongs on the decision sentence.
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
  /\b(?:delet|remov|sweep|clean|rm)\w*\b[^\n]{0,60}playwright\.proof\.config/i,
  /playwright\.proof\.config[^\n]{0,40}\b(?:is |as )?(?:litter|deleted|removed|swept)\b/i,
  /\b(?:ask|confirm with|check with)\b[^\n]{0,30}\bthe user\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer sweeps away a deliverable or stops to ask:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/test-results/, "the hygiene sweep never deletes the test-results/ litter"],
  [/playwright-report/, "the hygiene sweep never deletes the playwright-report/ litter"],
  [/pw-prove-mutation/, "the hygiene sweep never removes /tmp/pw-prove-mutation, so the mutation run leaves its artifacts behind"],
  [/playwright\.proof\.config/, "the answer never says what happens to playwright.proof.config.ts, which is a deliverable and not litter"],
  [/\b(?:preview|dev)\b[^\n]{0,20}server/i, "the answer never stops the server this run started"],
  [/auto-imports|components\.d\.ts|codegen churn/i, "the answer never reverts the codegen churn"],
  [/har-scrub|--verify|scrub/i, "the answer never proves the HAR clean before staging it"],
  [/\bcommit\w*/i, "the answer never commits the spec + POM + HAR"],
  [/\bpush\w*/i, "the answer never pushes the branch"],
  [/gh pr comment/, "the answer never posts the share link as a PR comment with gh pr comment"],
  [/ACs:/, "the report skeleton has no `ACs:` line"],
  [/Mutation:/, "the report skeleton has no `Mutation:` line"],
  [/Proof page:/, "the report skeleton has no `Proof page:` line"],
  [/Committed:/, "the report skeleton has no `Committed:` line"],
  [/Pushed:/, "the report skeleton has no `Pushed:` line"],
  [/PR comment:/, "the report skeleton has no `PR comment:` line"],
  [/gh pr create/, "the no-PR branch never creates a pull request to comment on"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the tail runs unasked, the proof config survives the sweep, and the report skeleton is structurally valid');
