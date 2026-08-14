#!/usr/bin/env node
// Judge (case-48): `import.meta.dev` folds to false in the production build, so the `?token=` rung is
// compiled out — record it ABSENT and descend to seeding both client-storage keys.
//
// The old rule was `failure: output_contains` over the bare string `?token=`. A correct answer cannot
// avoid that string: explaining WHY the rung is absent means naming the rung. So the negative moves
// to the ARTIFACT — the emitted seeding code — and to the one sentence that would commit the run to
// using it. Prose that names `?token=` in order to rule it out is in the clear.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);

function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    // Double quotes only. An apostrophe is not a quote delimiter in English prose: pairing
    // "doesn't" with "you're" swallowed the negation between them and turned a correct answer red.
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|absent|compiled out|unavailable|useless|dead)\b/i;
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

// --- the seed the answer actually plans --------------------------------------------------------------
const checks = [
  [/auth\.token/, 'the answer never seeds auth.token'],
  [/auth\.user/, 'the answer never seeds auth.user — a credential-only seed renders an empty shell'],
  [/(?:addInitScript|localStorage)/i, 'the answer never says how the storage is seeded (addInitScript / localStorage)'],
  [/(?:import\.meta\.dev|dev-?guard|compiled out|folded to false|absent)/i, 'the answer never reads the import.meta.dev guard as the reason the rung is gone'],
  [/assumption/i, 'the answer never records the skipped rung in the Assumptions block'],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

// --- the artifact must not use the rung that is not there ----------------------------------------------
// A fenced block is the code the run would execute. `?token=` there is the defect regardless of what
// the prose around it says.
// Tied to a navigation, not to the bare string: an answer may legitimately show the guarded source
// line it grepped, or the URL shape it is ruling out. Only code that GOES there is the defect.
const inArtifact = [];
for (const b of blocks) {
  for (const line of b.split('\n')) {
    if (/\?token=/.test(line) && /\b(?:goto|navigate|visit|open|curl|page\.url)\b/i.test(line)) inArtifact.push(line.trim());
  }
}
if (inArtifact.length) {
  console.error('FAIL: the emitted code uses the ?token= rung that the production build compiled out:');
  for (const l of [...new Set(inArtifact)].slice(0, 3)) console.error('   ' + l);
  process.exit(1);
}
// The same commitment stated in prose rather than code.
const navigates = offenders(text, [/\b(?:goto|navigat\w+|visit|open|load)\b[^\n]{0,90}\?token=/i]);
if (navigates.length) {
  console.error('FAIL: the answer plans to navigate with the dev-only ?token= parameter:');
  for (const s of navigates.slice(0, 2)) console.error('   ' + s);
  process.exit(1);
}

const bad = offenders(text, [
  /\bre-?enabl\w+\b[^\n]{0,60}\bguard\b/i,
  /\b(?:edit|patch|modify|change)\b[^\n]{0,40}\b(?:the app'?s? (?:source|config)|the source|the composable)\b/i,
  /\bruntime flag\b/i,
  /\b(?:fall back to|bring up|start) (?:a )?dev(?:elopment)? server\b/i,
  /\b(?:raise|increase) the timeout\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer changes the app under proof instead of descending a rung:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: the dev-guarded rung is recorded absent; both storage keys are seeded and declared');
