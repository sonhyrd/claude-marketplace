#!/usr/bin/env node
// Judge (case-16): a route already in the pomInventory is EXTENDED, an uncovered one gets a fresh POM.
//
// SKILL.md Step 5: "Route already has a Page Object → extend that class, never scaffold a second POM
// for the same route. A duplicate ships only with a stated justification line ... An uncovered route
// with no POM still gets a fresh one." The correct answer says what it will not create, so the
// negative anchors on the decision sentence rather than on the class name.
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
  /\b(?:creat|scaffold|author|writ|add|generat)\w*\b[^\n]{0,40}\b(?:a )?(?:new|second|additional|separate)\b[^\n]{0,40}(?:CheckoutPage|checkout)/i,
  /\b(?:new|second|another)\b[^\n]{0,20}CheckoutPage\b/i,
  /checkout-page\.v2|CheckoutFormPage\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer scaffolds a second Page Object for a route that already has one:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\bextend\w*|\badd(?:ing)? (?:the |these )?(?:locators?|methods?)\b/i, "the answer never extends the existing CheckoutPage"],
  [/tests\/pages\/checkout-page\.ts|CheckoutPage/, "the answer never names the existing CheckoutPage the pomInventory already maps to /checkout"],
  [/coupon/i, "the answer never places the coupon-field locator"],
  [/ProfilePage|\/profile/i, "the answer never covers the uncovered /profile route"],
  [/\/profile[\s\S]{0,300}\b(?:new|fresh|create|scaffold|author)\b|\b(?:new|fresh|create|scaffold|author)\w*\b[^\n]{0,60}ProfilePage/i, "the answer never authors a fresh Page Object for /profile — extend-do-not-duplicate is not a reason to leave an uncovered route without one"],
  [/justif\w+/i, "the answer never states that a duplicate POM ships only with a justification line in the Assumptions block"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the covered route extends its existing POM and the uncovered route gets a fresh one');
