#!/usr/bin/env node
// Judge (b06): a contradicted profile entry is REWRITTEN in the file, not merely reported.
//
// Step 1 has always required the `CONTRADICTED` Assumptions line, so an answer that reports the
// disagreement and moves on looks complete and reads well. It is the exact regression this case
// guards: the report reaches a human once, the file reaches every later run, and a profile that is
// only ever read rots monotonically while each run re-pays to rediscover the same lie.
//
// So the decision sentence is a WRITE against the profile — and the answer must still run on what
// Step 3 observed, because a write-back that also adopts the stale claim proves the wrong half.
//
// The must-PASS twin names the report-only option in order to refuse it ("reporting the
// contradiction is not enough on its own"), which is why the negative pass is negation-aware
// rather than a bare substring rule — the #57 defect this harness exists for.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

// --- what the answer COMMITS to ---------------------------------------------------------------------
// Fenced blocks, block quotes, inline code and quoted spans are the answer reporting what it was
// GIVEN, or quoting the thing it refuses — not its own plan, so a negative assertion skips them.
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

// --- the decision ------------------------------------------------------------------------------------
// A write against the profile is the whole case, so it is asserted as a pair: a writing verb, and
// the profile as its object. Either alone is satisfied by prose that never touches the file.
const WRITE_VERB = /\b(?:rewrit\w*|re-writ\w*|writ\w*|updat\w*|correct\w*|replac\w*|amend\w*|edit\w*|overwrit\w*|fix(?:es|ed|ing)?\b)/i;
const PROFILE_OBJECT = /(?:\.pw-prove\/profile\.md|\bprofile\b|## ?Auth\b)/i;
const writesBack = commitments(text)
  .split(/\n|(?<=[.!?;])\s+/)
  .some((s) => WRITE_VERB.test(s) && PROFILE_OBJECT.test(s) && !/\bnot\b|\bnever\b|\bwithout\b/i.test(s));

const checks = [
  [() => /\bcontradict\w*/i.test(text), 'the answer never names the contradiction (no CONTRADICTED verdict)'],
  [() => /\bassumption/i.test(text), 'the answer never carries an Assumptions line'],
  [() => writesBack, 'the answer never writes the correction back to .pw-prove/profile.md — reporting it is not the loop'],
  [() => /\bstamp\w*|\bsha\b|[0-9a-f]{7}\b|\b20\d\d-\d\d-\d\d\b/i.test(text), 'the corrected entry carries no stamp (date · sha7 · step)'],
  [() => /\b(?:ui|form|browser)\b[^\n]{0,40}\blog(?:in|ged)?\b|\blog(?:in|ged)?\b[^\n]{0,40}\b(?:ui|form)\b/i.test(text),
    'the answer never says the run continues on what Step 3 observed (the UI login form)'],
];
const missing = checks.filter(([ok]) => !ok());
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

const bad = offenders(text, [
  // Adopting the disproven claim — the other half of the failure, and the more dangerous one.
  /\bdev-login\b[^\n]*\b(?:works?|use|using|drive|driving|rung of choice)\b/i,
  /\b(?:use|using|drive|driving|try|trying)\b[^\n]*\bdev-login\b/i,
  // Reporting instead of writing, stated affirmatively as the plan.
  /\b(?:leave|leaving|keep|keeping)\b[^\n]*\bprofile\b[^\n]*\bas[- ]is\b/i,
  /\bprofile\b[^\n]*\b(?:untouched|unchanged|alone)\b/i,
  /\bonly\b[^\n]*\breport\b[^\n]*\bcontradict/i,
]);
if (bad.length) {
  console.error('FAIL: the answer leaves the profile carrying the disproven claim:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: contradiction reported AND written back, stamped, run continues on the observation');
