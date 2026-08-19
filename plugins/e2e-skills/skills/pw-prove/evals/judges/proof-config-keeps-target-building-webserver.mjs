#!/usr/bin/env node
// Judge (case-64): an inherited webServer that BUILDS AND BOOTS the proof target is kept.
//
// SKILL.md Step 7 › Proof run, and Step 3 phase 5 where the decision is taken (ADR 0016, scoped).
// The sibling of `proof-config-drops-inherited-webserver.mjs`, on the other side of the boundary.
// There, nothing answers at the inherited entry's url, so the entry boots a development server and
// the proof config drops it. Here the proof target itself answers 200 at that url, so the entry is
// what produces the origin: keep it, remove the `webServer: undefined` line from the committed
// proof config once in place, and stage it. Keeping costs nothing because `reuseExistingServer`
// adopts the already-running server and the command never runs. Deleting it would leave the run
// with no origin at all, which is the defect this case exists to catch.
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

// The suppression is a TOKEN, not an action, so sentence-level negation cannot judge it: "a proof
// run must not boot its own server, so I add `webServer: undefined`" is a wrong answer whose
// sentence carries a negation that has nothing to do with the token. So the token is judged on the
// verb that GOVERNS it, inside a 16-character window, in both directions — an addition verb reaching
// the token is a commitment to suppress, unless a negator sits immediately before that verb. The
// rejection-header rule still applies, because a correct answer lists the suppression under "what I
// do not do".
// commitments() DELETES inline code, which is right for judging actions and blind to a judgement
// about a token: `webServer: undefined` would vanish before the scan saw it. So the token scan
// unwraps inline backticks instead of deleting them, and keeps everything else commitments() does.
function unwrapped(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`/g, ' ')
    .replace(/[\u201c"]([^"\u201c\u201d\n]{0,400})[\u201d"]/g, ' ');
}
const SUPPRESSION = /webServer:\s*undefined/i;
const ADD_GOVERNS = /\b(?:add|adds|adding|re-?add|re-?adds|re-?adding|keep|keeps|keeping|retain|retains|retaining|leave|leaves|leaving|set|sets|setting|insert|inserts|inserting|carry|carries|carrying|stays|remains)\b[^.;\n]{0,40}?webServer:\s*undefined/i;
const DROP_GOVERNS = /\b(?:remove|removes|removing|delete|deletes|deleting|drop|drops|dropping|strip|strips|stripping|omit|omits|omitting|takes? out|taking out|no longer|without)\b/i;
const NEGATOR_BEFORE = /\b(?:not|never|n['\u2019]t|avoid\w*|refus\w*|reject\w*|rather than|instead of)\b[\s\S]{0,16}$/i;

function suppressionLines(t) {
  const kept = [];
  let underRejectionHeader = false;
  for (const raw of unwrapped(t).split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const isItem = /^(?:[-*+]|\d+[.)])\s+/.test(line);
    if (!isItem) underRejectionHeader = /:[*_~\s]*$/.test(line) && REJECTION_HEADER.test(line);
    else if (underRejectionHeader) continue;
    if (SUPPRESSION.test(line)) kept.push(line);
  }
  return kept;
}

const suppressionCommitted = [];
let suppressionRefused = false;
for (const line of suppressionLines(text)) {
  for (const sentence of line.split(/(?<=[.!?;])\s+/)) {
    if (!SUPPRESSION.test(sentence)) continue;
    if (DROP_GOVERNS.test(sentence)) { suppressionRefused = true; continue; }
    const m = ADD_GOVERNS.exec(sentence);
    if (!m) continue;
    if (NEGATOR_BEFORE.test(sentence.slice(0, m.index))) { suppressionRefused = true; continue; }
    suppressionCommitted.push(sentence.trim());
  }
}
if (suppressionCommitted.length) {
  console.error('FAIL: the answer adds or retains `webServer: undefined`, which deletes the entry that builds and boots the proof target:');
  for (const s of suppressionCommitted.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const bad = offenders(text, [
  // The project's own config is never edited, on either branch.
  /\bI (?:edit|change|modify|touch|update)\b[^\n]{0,50}project'?s?[^\n]{0,20}playwright\.config/i,
  // A second origin instead of adopting the one already up.
  /\bI (?:start|boot|launch|spin up)\b[^\n]{0,40}(?:second|another|duplicate)\b[^\n]{0,20}server/i,
]);
if (bad.length) {
  console.error("FAIL: the answer edits the project's own config, or starts a second server instead of adopting the one already up:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

if (!suppressionRefused) {
  console.error('FAIL: the answer never commits to taking `webServer: undefined` out of the committed proof config');
  process.exit(1);
}

const checks = [
  [/\b(?:keep|keeps|keeping|kept|retain\w*|preserv\w*|leave\w*|left in place|survive\w*)\b/i,
    'the answer never commits to keeping the inherited webServer'],
  [/4173/,
    'the answer never names the origin the proof runs against, which is what the entry produces'],
  [/\bbuild\w*\b/i,
    'the answer never identifies the entry as the thing that builds and boots the proof target'],
  [/reuseExistingServer|adopt\w*|already[- ]running|existing server/i,
    'the answer never says why keeping the entry costs nothing — the running server is adopted, so the command never runs'],
  [/\bstage|\bcommit/i,
    'the migrated proof config is never staged with this run'],
  [/curl|answers|responds|responded|200/i,
    "the answer never rests the decision on what answers at the entry's url"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the inherited webServer that builds and boots the proof target is kept, the suppression is removed in place, and the project config is left alone');
