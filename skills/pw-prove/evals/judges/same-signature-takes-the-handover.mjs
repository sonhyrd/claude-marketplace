#!/usr/bin/env node
// Judge (case-46): two attempts with an unchanged failure signature take the handover stop, not a third try.
//
// SKILL.md Step 7 › Failure handling › the no-progress checkpoint. The error class
// (TimeoutError) and the failing locator are both unchanged, so the edit changed nothing the app can
// see — that is a retry, not a fix. Invoke playwright-debugger against playwright-report/, then take
// the handover stop: a PR comment carrying the verdict, the spec and POM verbatim, the runner's failure
// output verbatim, the F-code diagnosis, the fixes already attempted, what was NOT produced, and the
// one change that would unblock a re-run. Stop a dev server this run started, sweep test-results/.
// Nothing is committed and nothing is pushed — a knowingly-failing spec on the branch is the defect the
// pipeline prevents — and no Proof page / Mutation / Committed / Pushed lines are emitted.
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
  /\bI (?:try|spend|take|use|attempt)\b[^\n]{0,40}(?:a )?third(?: attempt| try)?/i,
  /\bI (?:commit|push)\b/i,
  /\bI (?:heal|re-?snapshot|rewrite)\b[^\n]{0,40}locator[^\n]{0,30}again/i,
]);
if (bad.length) {
  console.error("FAIL: the answer spends another attempt, or lands a knowingly-failing spec on the branch:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/signature/i, "the answer never reasons about the failure signature, which is what decides this"],
  [/unchanged|identical|the same/i, "the answer never says the signature did not move"],
  [/playwright-debugger/i, "playwright-debugger is never invoked for the diagnosis"],
  [/gh pr comment/, "the handover never actually reaches the PR"],
  [/#?212/, "the PR comment never names the PR it belongs on"],
  [/verbatim/i, "the handover never says the spec, POM and failure output go over verbatim"],
  [/F-?\d|F-?code/i, "the handover carries no F-code diagnosis"],
  [/test-results/, "test-results/ is never swept"],
  [/\bnothing is committed\b|\bnot committed\b|\bno commit\b|\bnothing committed\b|\bcommit nothing\b/i, "the answer never states plainly that nothing is committed"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the unchanged signature ends the fix loop, the handover carries the full evidence, and nothing lands on the branch");
