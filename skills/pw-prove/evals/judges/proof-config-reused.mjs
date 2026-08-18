#!/usr/bin/env node
// Judge (case-24): a committed proof config is reused verbatim and survives the hygiene sweep.
//
// SKILL.md Step 7 item 2: "Present (a previous run committed it) → use it as-is. Do **not** rewrite,
// re-derive or refresh it", and Step 8 hygiene keeps it. The correct answer names the rewrite and the
// deletion in order to refuse both.
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
  /\b(?:rewrit|regenerat|re-?deriv|refresh|overwrit|re-?creat|update|patch)\w*\b[^\n]{0,50}proof config/i,
  /proof config[^\n]{0,50}\b(?:rewritten|regenerated|refreshed|overwritten|updated)\b/i,
  /\b(?:delet|remov|sweep|rm)\w*\b[^\n]{0,60}playwright\.proof\.config/i,
]);
if (bad.length) {
  console.error('FAIL: the answer rewrites or sweeps away a committed proof config:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\breus\w*|\bas[- ]is\b|\bverbatim\b|\buntouched\b|\bunchanged\b/i, "the answer never says the existing proof config is reused untouched"],
  [/--config\s+e2e\/playwright\.proof\.config\.ts/, "the proof run never passes --config e2e/playwright.proof.config.ts"],
  [/PW_PROVE_CLIP=1/, "the proof run never sets PW_PROVE_CLIP=1"],
  [/PW_PROVE_W=1600/, "the proof run never carries PW_PROVE_W=1600"],
  [/PW_PROVE_H=900/, "the proof run never carries PW_PROVE_H=900"],
  [/test-results|playwright-report|litter/i, "the answer never scopes the hygiene deletion to the run litter"],
  [/Generated/, "the answer never says what the completion report Generated block does with the proof config"],
  [/Generated[\s\S]{0,400}\b(?:omit|exclude|leave out|no line|not listed|does ?n)|\b(?:omit|exclude|leave out|no line|not listed|does ?n)[\s\S]{0,200}Generated/i, "the Generated block never omits the proof-config line, which this run did not create"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the committed proof config is reused verbatim, survives hygiene, and is absent from the Generated block');
