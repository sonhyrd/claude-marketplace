#!/usr/bin/env node
// Judge (case-61): scenarios that contend over one shared record serialise in the spec, not on the command line.
//
// SKILL.md Step 5 › Generate + docs/adr/0017. The contention is a property of THIS spec — two
// scenarios editing one record on a shared staging tenant — so it is fixed with
// test.describe.configure({ mode: 'serial' }) around the describe block that owns them, commented with
// the shared record as the reason, leaving the rest of the proof concurrent. A global --workers=1 would
// charge every other proof wall clock for one spec's data contention. What interferes is two
// scenarios contending for one record — the prompt says so, so the answer is not asked to diagnose
// it. Retries, waits and sleeps paper over the race rather than removing it.
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
  /\bI (?:\w+ )?(?:use|pass|add|reach for|set)\b[^\n]{0,40}(?:--workers|-j\s*1)/i,
  /\bI (?:\w+ )?(?:add|enable|set|configure)\b[^\n]{0,30}retries/i,
  /\bI (?:add|insert|introduce)\b[^\n]{0,40}(?:waitForTimeout|sleep|a wait)/i,
]);
if (bad.length) {
  console.error("FAIL: the answer papers over the race with a global flag, retries or sleeps:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/test\.describe\.configure/, "the answer never reaches for the mechanism that scopes serialisation to a spec"],
  [/mode:\s*['"]serial/, "the configure call never sets mode: 'serial'"],
  [/\/\/|comment|because|reason/i, "the reason is never recorded beside the configure line"],
  [/shared|same (?:job )?record|contend|contention/i, "the answer never names the shared record as the thing being contended for"],
  // There was a "rules out browser-context leakage" check here until #82, and it is gone rather than
  // widened. It existed because the OLD prompt named no cause, so ruling out the wrong one was
  // evidence the answer had diagnosed rather than guessed. #80's repaired premise states the cause
  // outright — two scenarios over one pre-existing record under a declared carve-out — which leaves
  // the answer nothing to rule out. It is an assertion that outlived its prompt, and it scored
  // case-61 0/3 across three answers that were right in every particular. See judges/README.md,
  // *An assertion is re-derived from the prompt it is about, never inherited across a repair*.
  [/rest of|other (?:three|3|scenarios)|remain\w* concurrent|still (?:run )?concurrent|full concurrency|at concurrency|keep\w* full parallelism|stay outside it/i, "the answer never keeps the rest of the proof concurrent"],
  // "a global override would make every future proof on this repo pay for this spec's carve-out" is
  // this fact, stated. It matched neither `globally` nor `every other proof`, which is the same
  // bare-substring family: the check was written against one answer's spelling of a shared idea.
  [/wall clock|every (?:other|future) (?:proof|spec|run)|\bglobal(?:ly)?\b|whole (?:run|suite|repo)|every other/i, "the answer never says why the command line is the wrong place"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the contention is serialised in the spec where it belongs, and the rest of the proof stays concurrent");
