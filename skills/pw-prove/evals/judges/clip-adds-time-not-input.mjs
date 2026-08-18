#!/usr/bin/env node
// Judge (case-34): the filming law — PW_PROVE_CLIP may only ADD TIME, never change what the app is asked to do.
//
// code-rules.md § Clip Fidelity. The only PW_PROVE_CLIP-gated construct is page.waitForTimeout().
// Swapping fill() for a gated pressSequentially() drives a debounced field differently in the film
// than in CI; an UNGATED pressSequentially(value, { delay }) makes every CI run pay the sleep.
// Framing is bought with an ungated scrollIntoView({ block: 'center' }), not with
// scrollIntoViewIfNeeded(), which parks the element against the screen edge.
// The correct answer names pressSequentially in order to refuse it — the substring defect this
// judge is written around.
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
  /\bpressSequentially\b/,
  /\bscrollIntoViewIfNeeded\b/,
]);
if (bad.length) {
  console.error("FAIL: the answer changes what the app is asked to do in order to make the clip legible:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\.fill\(/, "the answer never fills the field atomically, which is the only input path CI also takes"],
  [/scrollIntoView\(\s*\{[^}]*block:\s*['"]center/, "framing is never bought with scrollIntoView({ block: 'center' })"],
  [/PW_PROVE_CLIP/, "the answer never names the PW_PROVE_CLIP gate"],
  [/waitForTimeout/, "the answer never names waitForTimeout, the one construct the gate may wrap"],
  [/\bungated\b|\bun-gated\b|\bnot gated\b|\bnever gated\b|outside[^\n]{0,24}gate/i, "the answer never says the scrollIntoView is ungated, so the framing would vanish in CI"],
  [/JUSTIFIED/, "the dwell carries no // JUSTIFIED: marker, so the Step-6 audit will reject it"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the clip is bought with time only — the fill stays atomic and the framing is ungated");
