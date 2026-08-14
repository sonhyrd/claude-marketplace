#!/usr/bin/env node
// Judge (case-11): greenfield bootstraps a PINNED runner — the never-auto-install rule is not a stop.
//
// SKILL.md Step 5b item 0: "Add @playwright/test with the project's package manager so it lands
// **pinned** ... (a pinned dep is not the npx-floated install the 'never auto-install' rule forbids)".
// The correct answer quotes that rule in order to scope it, so a substring rule on
// "never auto-install" or "--no-install" red-flags the right answer.
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
  /\b(?:i (?:will|'ll|am going to)|so i|therefore i)\b[^\n]{0,50}\b(?:stop|skip|refuse|decline|abort)\w*/i,
  /\bnpx\s+(?:-y\s+)?(?:playwright|@playwright\/test)\s+test\b(?![^\n]*--no-install)/,
  /\bfloat\w*\b[^\n]{0,30}\bversion\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer refuses to bootstrap, or floats the runner version:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/@playwright\/test/, "the answer never adds @playwright/test"],
  [/\b(?:pnpm add -D|npm i(?:nstall)? -D|npm i(?:nstall)? --save-dev|yarn add -D|bun add -d)\b|package manager|dev(?:elopment)? depend|devDependencies|dev-?dep/i, "the runner is never added as a dev dependency through the project package manager, so it is not pinned"],
  [/\bpinned\b|--save-exact|\bexact\b/i, "the answer never says the dependency is pinned, which is the whole distinction from the forbidden npx float"],
  [/playwright install(?: chromium)?/i, "the answer never runs `npx playwright install chromium`"],
  [/playwright\.config/, "the answer never authors a playwright config"],
  [/testDir/, "the authored config never sets testDir"],
  [/baseURL/, "the authored config never sets baseURL from the resolved dev URL"],
  [/webServer/, "the authored config never carries a webServer block running the project own dev command"],
  [/tsconfig/, "the answer never adds an e2e tsconfig for the TypeScript typecheck"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the greenfield runner is bootstrapped as a pinned dev dependency, with a config and a tsconfig');
