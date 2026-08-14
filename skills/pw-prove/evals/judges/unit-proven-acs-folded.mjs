#!/usr/bin/env node
// Judge (case-29): ACs a unit test in the diff already proves are folded, with their row kept.
//
// SKILL.md Step 2 item 6: "read the test files in it ... Fold those into the ONE scenario that proves
// the wiring ... Folding is never silent. The folded AC keeps its row with 'already covered: <test
// file>' in the Proven-by column." The correct answer names the three behaviours in order to fold
// them, so a substring rule on "trim" cannot tell a folded row from a browser scenario.
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
  /\bscenario\b[^\n]{0,60}\btrim\w*/i,
  /\btrim\w*[^\n]{0,60}\bscenario\b/i,
  /\bscenario\b[^\n]{0,60}\bdrop\w*\b[^\n]{0,20}\bempty\b/i,
  /\bscenario\b[^\n]{0,60}\bkey removal\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer buys a browser scenario for a matrix the unit test already proves:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/customScripts\.test\.ts/, "the answer never reads the unit test file the diff ships"],
  [/\bfold\w*/i, "the answer never folds the unit-proven ACs"],
  [/already covered/i, "the folded rows never carry `already covered:` in the Proven-by column, so the fold is silent"],
  [/already covered[^\n]{0,60}customScripts\.test\.ts/i, "the `already covered:` marker never names the test file that covers the folded ACs"],
  [/buildUpsert/, "the answer never names the pure function whose matrix is folded"],
  [/\bwir\w+/i, "the answer never keeps the one scenario that proves the wiring"],
  [/\b(?:request|wire|network|payload|persist\w*|flag|DOM)\b/i, "the answer never keeps the browser-layer behaviours a unit test cannot see as their own scenarios"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the unit-proven matrix is folded into the wiring scenario, its rows kept and marked already covered');
