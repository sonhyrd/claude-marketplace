#!/usr/bin/env node
// Judge (case-20): recommend a clean context once, then continue inline — never self-background.
//
// SKILL.md Step 1 › Mode: "open by recommending a fresh session or a background agent ... Continue
// inline if they decline or do not answer; never self-background or spawn an agent on your own."
// The correct answer names self-backgrounding in order to refuse it.
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
  /\b(?:i (?:will|'ll)|then i|so i)\b[^\n]{0,40}\b(?:spawn|dispatch|launch|background)\w*\b/i,
  /\b(?:spawn|launch|dispatch)\w*\b[^\n]{0,30}\b(?:a )?(?:background |sub)?agent\b[^\n]{0,30}\b(?:myself|on my own|automatically)\b/i,
  /\b(?:stop|abort|halt|refus\w+|wait)\w*\b[^\n]{0,50}\b(?:declin|no answer|silence|does ?n)/i,
  /\b(?:i|we)\s+(?:will|'ll|shall|can|then)\s+(?:also\s+)?(?:re-?ask|ask again)/i,
]);
if (bad.length) {
  console.error('FAIL: the answer backgrounds itself or stops when the recommendation is declined:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\brecommend\w*|\bsuggest\w*|\badvis\w*/i, "the answer never makes the recommendation"],
  [/fresh session|new session|clean context|background agent/i, "the recommendation never names a fresh session or a background agent"],
  [/\bbefore\b|\bfirst\b|\bopen\w*\b/i, "the answer never places the recommendation before the pipeline starts"],
  [/\binline\b|\bcontinue\w*\b|\bproceed\w*\b/i, "the answer never says the run continues in the current session when the recommendation is declined"],
  [/declin\w+|no answer|does ?n[o']?t answer|silence|no reply/i, "the answer never addresses the decline / no-answer branch"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the clean-context recommendation is offered once and the run continues inline when it is declined');
