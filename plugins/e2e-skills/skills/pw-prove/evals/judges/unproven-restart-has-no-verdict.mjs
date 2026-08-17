#!/usr/bin/env node
// Judge (case-55): a mutation-check restart that cannot be proven has no verdict to read.
//
// SKILL.md Step 7 › Mutation check + Step 3 › the restart proof. RESTART=unproven says the
// process answering 36495 is not the one just started, so the run under test is the PREVIOUS artifact —
// a failure against it is evidence about a stale server, not about whether the spec guards the change.
// Fix the bring-up first: find and kill whatever holds 36495 (the previous preview server, which did
// not die), restart the preview, and re-run the serve phase with SERVE_RESTART=1 and the mark until it
// reports RESTART=proven / SERVE=ok. Then re-run the guarding test and take the verdict from THAT run.
// Do not record RED, do not report 'the spec guards the change', do not proceed to revert-and-rebuild,
// and do not treat the 128s loading splash as a slow application to wait out.
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
  /\bI (?:record|report|take|call|log)\b[^\n]{0,30}(?:this |it )?(?:as )?(?:the )?RED/i,
  /\bI (?:proceed|move on|continue)\b[^\n]{0,40}(?:revert|rebuild)/i,
  /\bI (?:raise|increase|extend|lengthen)\b[^\n]{0,40}timeout/i,
  /\bthe spec guards the change\b/i,
]);
if (bad.length) {
  console.error("FAIL: the answer reads a verdict off a run whose server was never proven fresh:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/RESTART=unproven/, "the answer never reads the flag that invalidates the run"],
  [/36495/, "the answer never names the port that is being held"],
  [/previous|stale|old|did not die/i, "the answer never identifies what is answering as the previous server"],
  [/\bkill\b|\bpkill\b|\blsof\b|\bfuser\b/i, "nothing is done about the process holding the port"],
  [/SERVE_RESTART=1/, "the serve phase is never re-run with the restart proof"],
  [/RESTART=proven/, "the answer never says what it is waiting to see"],
  [/re-?run[^\n]{0,40}(?:guarding )?test|take the verdict/i, "the guarding test is never re-run against the proven server"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the unproven restart voids the run, the bring-up is fixed first, and the verdict is taken from a proven server");
