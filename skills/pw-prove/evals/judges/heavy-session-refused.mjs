#!/usr/bin/env node
// Judge (case-20): a session above the context threshold is REFUSED, with its numbers.
//
// SKILL.md Step 1 › Context gate: "Above 100k tokens, pw-prove refuses and names where to run
// instead." The refusal carries the measured size, the threshold, and the invocation to paste into a
// fresh session; it is a statement rather than a question, and a calling skill's prior confirmation
// does not spend it — that question was about proceeding, never about where.
//
// This judge replaced `fresh-context-recommended-once.mjs`, whose whole premise (recommend once, then
// continue INLINE when declined) was retired by the hard gate. See docs/adr/0019.
//
// The correct answer names continuing-inline and self-backgrounding in order to reject them, so the
// negative half reads sentences rather than substrings — the bare-substring defect behind seven of
// nine failures in the 2026-08-13 run.
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
// A markdown list inherits the negation of the header that introduces it: "What I do **not** do:"
// over bare items carries the negation in the header alone, so judging each item on its own reads a
// correct answer's rejection list as its plan. REJECTION_HEADER is deliberately narrower than
// NEGATED — a header excuses every item beneath it, so an incidental negation must not open the
// scope.
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
  // Running anyway is the whole defect: the gate is not a recommendation, and the caller's yes is
  // not the user's.
  /\b(?:i (?:will|'ll)|so i|then i)\b[^\n]{0,60}\b(?:continue|proceed|carry on|run)\b[^\n]{0,40}\b(?:inline|in this session|anyway|regardless)\b/i,
  /\b(?:already (?:said yes|confirmed|approved)|has consent|got a yes)\b[^\n]{0,60}\b(?:so|therefore)\b[^\n]{0,40}\b(?:continue|proceed|run|start)\b/i,
  /\b(?:i (?:will|'ll)|then i|so i)\b[^\n]{0,40}\b(?:spawn|dispatch|launch|background)\w*\b/i,
  // A gate re-asked is a gate a caller can wear down.
  /\b(?:i|we)\s+(?:will|'ll|shall|can|then)\s+(?:also\s+)?(?:re-?ask|ask again)/i,
  // Building or serving before the gate resolves is exactly the work a refusal must not have done.
  /\b(?:i (?:will|'ll)|then i)\b[^\n]{0,40}\b(?:build|serve|check ?out|commit|push)\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer runs the pipeline anyway, backgrounds itself, or re-asks:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\brefus\w+|\bdeclin\w+|\bstops?\b|\bstopped\b|\bdoes not (?:run|start)\b|\bwill not (?:run|start)\b/i,
    'the answer never refuses — the gate is a refusal, not a recommendation'],
  [/\b100\s?k\b|100,000|100000|\b100 000\b/i,
    'the answer never names the 100k threshold, so the refusal is not checkable'],
  [/\b196\s?k\b|196,000|196000|\b196 000\b/i,
    'the answer never names the context size it measured, so the refusal cannot be told from a spurious one'],
  [/fresh session|new session|clean context|clean session/i,
    'the answer never says where to run instead'],
  [/pw-prove\s+(?:#?55|PR\s*#?55)|\/e2e:pw-prove|prove PR #?55/i,
    'the answer never gives the invocation to paste into the fresh session, so recovering costs the user thinking'],
  [/\bbefore\b|\bfirst\b|\bnothing (?:was|is)\b/i,
    'the answer never places the refusal before any work, so it reads as an abort rather than a gate'],
  [/\bnothing\b[^\n]{0,60}\b(?:built|served|committed|pushed|generated|run)\b|no (?:spec|POM)\b/i,
    'the answer never says what was NOT produced, which is the beat that proves the refusal was free'],
  [/\bcaller\b|calling skill|\bthat skill\b|on (?:the user's|your) behalf/i,
    "the answer never addresses the caller's prior confirmation, which is the thing that must not spend the gate"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the heavy session is refused with its measured size, the threshold, and the invocation to restart with');
