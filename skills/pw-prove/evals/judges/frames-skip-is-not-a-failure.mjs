#!/usr/bin/env node
// Judge (case-38): an uninspected clip is the honest verdict — the run carries on and the report says so.
//
// SKILL.md Step 7. The frame extract is an inspection, not a gate, and a missing tool is not a
// failed test. The report must say 'uninspected — no video tooling' and must never describe frames
// that were never opened. Delivery is unaffected: publishing has its own tooling check and its own
// skip. Nothing is installed into the user's project.
//
// Re-derived by #150 against the prompt the Step-7 rewrite left behind. Before that rewrite the
// agent ran `clip-fidelity.mjs frames` by hand and read its exit 6; the film verb now extracts the
// frames as a closing phase, exits 0 anyway, and reports `"inspected": false` per clip. Three
// assertions were re-derived:
//   - `exit 6` became unreachable. A correct answer against the new body never sees that code, so
//     demanding it failed every correct answer. It is replaced by the summary field the answer
//     actually meets, `inspected: false`.
//   - `skip` as a bare word went with it. The verb does not report a skip; it reports an
//     uninspected clip and a passing run, so the assertion is now that the run is not failed.
//   - `hermetic` became WRONG rather than merely unreachable. The hermetic classification happens
//     in the AUDIT run, before anything is filmed, so an answer that carries on to it from here has
//     the order backwards. The forward step from a filming run is the mutation check.
// The uninspected/no-fabrication half — the case's centre — is unchanged.
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
    const isHeader = /:[*_~\s]*$/.test(line) && REJECTION_HEADER.test(line);
    // An INDENTED non-item line is a wrapped continuation of the item above it, not a new scope.
    // Re-deriving three of these judges under #150 found a must-PASS twin failing because the
    // second line of a wrapped bullet under "What I explicitly do **not** do:" reset the header, so
    // the NEXT bullet's refusal read as the answer's plan. That is the #59 defect one level deeper
    // again: the list form was fixed by #66, the wrapped-item form was not.
    //
    // A header is never a continuation, however indented. Without that clause the fix would also
    // stop an INDENTED "things I will not do:" from OPENING a scope — narrowing what counts as a
    // refusal, when the whole point of this change is that it can only widen it.
    const isContinuation = /^\s/.test(raw) && !isItem && !isHeader;
    if (!isItem && !isContinuation) underRejectionHeader = isHeader;
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
  /\b(?:install|npm i|apt-get install|brew install)\b[^\n]{0,30}(?:ffmpeg|ffprobe)/i,
  /\bretry\b[^\n]{0,30}(?:extract|frames)|re-?run[^\n]{0,20}(?:the )?(?:extract|frames)/i,
  /re-?film[^\n]{0,40}(?:frames?|extract|tooling)/i,
  /\bI (?:\w+ )?(?:fail|stop|abort|block)\b[^\n]{0,20}(?:the )?run\b/i,
]);
if (bad.length) {
  console.error("FAIL: the answer treats a missing tool as a failure, retries it, or installs into the user's project:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  // NOT `inspected: false` — the prompt supplies that field, so echoing it is not contact. What is
  // earned is the reason it is not a failure: the extract is an INSPECTION, not a gate.
  [/\binspection\b|\bnot a gate\b|\bno gate\b|\bnever gates?\b/i,
    "the answer never says the frame extract is an inspection rather than a gate, which is why a missing tool is not a failure"],
  // Deliberately NOT `\bpass\w*`: "the passing run", "the clips the run passed with" fire on it, so
  // it would be satisfied by any answer that mentions the run at all. The assertion is that the
  // answer says the missing tool does not FAIL this run — a claim it has to make on purpose.
  [/\bdoes ?n\S*\s+fail\b|\bnot a fail\w*|\bnever fails?\b|\bwithout failing\b|\bfail(?:s|ing)? nothing\b|\bnot a gate\b|\bcarry (?:straight )?on\b|\bcontinues?\b/i,
    "the answer never says the missing tool does not fail the run"],
  [/uninspected/i, "the report never says the clips are `uninspected` — a silent omission reads as a good clip"],
  [/mutation/i, "the run never carries on to the mutation check"],
  [/publish|deliver/i, "the answer never says delivery is unaffected"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the run still passes, it carries on to the mutation check, and the report says the clips are uninspected rather than good");
