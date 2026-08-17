#!/usr/bin/env node
// Judge (case-45): the committed proof config must not inherit the project's development webServer.
//
// SKILL.md Step 7 › Proof run (ADR 0008). '...base' copies webServer too, so the proof run
// would boot the project's DEVELOPMENT server at 127.0.0.1:3000 — nothing is listening there, the
// preview is on 4173 — and the proof would not run against the built target at all. Migrate the
// committed config ONCE by adding 'webServer: undefined' after the spread, leave everything else
// untouched, and stage it with this run. Dropping Playwright's own readiness wait is safe precisely
// because pw-prove owns the server lifecycle and preflight.mjs already gated the three bring-up phases.
// This closes the gap batch 2 opened by retiring case-32, which REGISTRY.md calls the cheapest on the
// table to close.
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
  /\bI (?:edit|change|modify|touch|update)\b[^\n]{0,50}project'?s?[^\n]{0,20}playwright\.config/i,
  /\bI (?:rewrite|regenerate|recreate|replace)\b[^\n]{0,40}(?:the )?proof config/i,
  /\bI (?:set|force|export|pass)\b[^\n]{0,20}CI=1/i,
  /\bI (?:move|shift|re-?point|restart)\b[^\n]{0,50}(?:preview|server)[^\n]{0,30}3000/i,
]);
if (bad.length) {
  console.error("FAIL: the answer edits the project's own config, rewrites the proof config wholesale, or works around the inheritance:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/webServer:\s*undefined/, "the answer never adds `webServer: undefined`, so the inheritance survives"],
  [/\.\.\.base|spread/i, "the answer never identifies the `...base` spread as what copies webServer in"],
  [/3000/, "the answer never names the development port the config would boot"],
  [/4173/, "the answer never names the preview port the proof should actually run against"],
  [/\bstage|\bcommit/i, "the migrated config is never staged with this run"],
  [/preflight|bring-?up|lifecycle/i, "the answer never says why dropping Playwright's readiness wait is safe here"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the proof config's inherited webServer is dropped once, in place, and the project's own config is left alone");
