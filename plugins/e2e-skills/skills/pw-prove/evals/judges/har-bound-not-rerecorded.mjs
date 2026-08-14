#!/usr/bin/env node
// Judge (case-43): an unbound HAR matches nothing — bind it, do not re-record it.
//
// The old rule was `failure: output_contains` over `re-record`, `hand-write mocks for`,
// `widen the url filter`, `remove notFound`. The correct diagnosis names every one of them in the
// sentence that rules it out ("the recording is fine, so re-recording changes nothing"), which is
// what failed this class of case in the 2026-08-13 run.
//
// The repair is artifact-shaped for the positive half — the emitted command block must carry the
// bind and the exported HAR path — and negation-anchored for the negative half.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
const emitted = blocks.join('\n');

function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    // Double quotes only. An apostrophe is not a quote delimiter in English prose: pairing
    // "doesn't" with "you're" swallowed the negation between them and turned a correct answer red.
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|pointless|unnecessary|wrong)\b/i;
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

// --- the fix, as a command -------------------------------------------------------------------------
if (blocks.length === 0) {
  console.error('FAIL: no fenced block — this case is answered with a command, and none was emitted');
  process.exit(1);
}
const need = [
  [/har-scrub\.mjs\s+bind/, 'the emitted command never runs `har-scrub.mjs bind`'],
  [/--origin/, 'the bind never passes --origin, so the HAR stays unbound to the running server'],
  [/PW_PROVE_HAR/, 'the emitted command never exports PW_PROVE_HAR at the bound copy'],
];
const missing = need.filter(([re]) => !re.test(emitted));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}
// The literal port, or a variable that carries the effective origin. Demanding the literal
// red-flagged `--origin "$BASE_URL"`, which is the same binding written the durable way.
if (!/5199/.test(emitted) && !/--origin\s+["']?\$\{?(?:BASE_URL|PW_PROVE_BASE_URL|ORIGIN)\b/.test(emitted)) {
  console.error('FAIL: the bind origin is neither the running port (5199) nor an origin variable that carries it');
  process.exit(1);
}

// --- and none of the remedies that abandon the recording ----------------------------------------------
const bad = offenders(text, [
  /\bre-?record\w*\b/i,
  /\brecord the HAR again\b/i,
  /\bhand-?(?:write|roll)\w*\b[^\n]{0,40}\bmocks?\b/i,
  /\bwiden\b[^\n]{0,40}\b(?:url|URL) filter\b/i,
  /\bremov\w+\b[^\n]{0,30}notFound/i,
  /\bnotFound[^\n]{0,20}(?:to|→)\s*'?(?:fallback|continue)/i,
  /\bthe recording is (?:too )?short\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer abandons the canonical recording instead of binding it:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: the HAR is bound to the running origin and carried on PW_PROVE_HAR; nothing re-recorded');
