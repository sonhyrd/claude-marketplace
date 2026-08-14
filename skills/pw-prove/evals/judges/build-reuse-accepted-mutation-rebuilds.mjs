#!/usr/bin/env node
// Judge (case-52): a batch pays for one build, and the mutation check pays for its own.
//
// SKILL.md Step 3 › build phase and Step 7 › Mutation check. BUILD=reused with
// BUILD_REUSE_REASON=commit-and-tree-unchanged satisfies the gate exactly as BUILD=ok does — it is not
// a skipped or failed build, and forcing a rebuild to feel safe is waste. At Step 7 the mutation MUST
// rebuild (BUILD_REUSE=never) and restart the preview, because the proof target is a build and a
// mutated source file changes nothing in the standing artifact: a mutation run against the un-rebuilt
// artifact is green by construction, which is a false RED-less result. Revert, then rebuild and restart
// once more so nothing downstream runs against deliberately broken software. Mutation artifacts stay
// out of test-results/ via --output=/tmp/pw-prove-mutation.
// This closes the Step-7 mutation artifact-isolation gap REGISTRY.md names case-52 as the candidate for.
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
  /\bI (?:force|trigger|run)\b[^\n]{0,40}rebuild[^\n]{0,40}(?:to be safe|to feel safe|anyway|just in case)/i,
  /\bI (?:treat|read|count)\b[^\n]{0,40}(?:as a )?(?:skipped|failed) build/i,
  /\bI (?:leave|keep)\b[^\n]{0,40}(?:the )?mutation[^\n]{0,30}test-results/i,
]);
if (bad.length) {
  console.error("FAIL: the answer distrusts a legitimate reuse, or lets the mutation run pollute test-results/:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/BUILD=reused/, "the answer never reads the reuse verdict it was given"],
  [/commit-and-tree-unchanged|BUILD_REUSE_REASON/, "the answer never uses the reason, which is what makes the reuse legitimate rather than lucky"],
  [/\blegitimate\b|\bvalid\b|\bpass(?:es)?\b|\bsatisfie[sd]\b|\bas (?:good as|by) BUILD=ok\b/i, "the answer never accepts the reuse as a pass"],
  [/BUILD_REUSE=never/, "the mutation never forces its own rebuild, so it would run against the standing artifact"],
  [/restart/i, "the preview server is never restarted onto the rebuilt artifact"],
  [/green by construction|un-?rebuilt|standing artifact|would (?:always )?pass/i, "the answer never says why a mutation against the un-rebuilt artifact is worthless"],
  [/revert/i, "the mutation is never reverted"],
  [/--output/, "the mutation run's artifacts are never isolated with --output"],
  [/pw-prove-mutation|\/tmp\//, "the answer never names where the mutation artifacts go"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the reuse is accepted on its reason, the mutation rebuilds and restarts, and its artifacts stay out of test-results/");
