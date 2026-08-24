#!/usr/bin/env node
// Judge (case-52): a batch pays for one build, and the mutation check pays for its own.
//
// SKILL.md Step 3 › build phase and Step 7 › Mutation check. BUILD=reused with
// BUILD_REUSE_REASON=commit-and-tree-unchanged satisfies the gate exactly as BUILD=ok does — it is not
// a skipped or failed build, and forcing a rebuild to feel safe is waste. At Step 7 the mutation MUST
// rebuild (BUILD_REUSE=never) and restart the preview, because the proof target is a build and a
// mutated source file changes nothing in the standing artifact: a mutation run against the un-rebuilt
// artifact is green by construction, which is a false RED-less result. Mutation artifacts stay out of
// test-results/ via --output=/tmp/pw-prove-mutation.
//
// The POST-revert rebuild is deliberately NOT asserted here: #98 made it lazy (revert, mark the
// artifact stale, rebuild only when a later step needs the server — docs/adr/0020), and that rule is
// guarded by case-62 rather than folded in here. This judge's scope is the reuse verdict and the
// mutation's own forced rebuild, both unchanged.
// This closes the Step-7 mutation artifact-isolation gap REGISTRY.md names case-52 as the candidate for.
//
// Re-derived by #150 against the prompt the Step-7 rewrite left behind. Before that rewrite the
// agent assembled the mutation run itself — a `BUILD_REUSE=never` rebuild, a hand-rolled restart,
// and a runner call carrying `--output=/tmp/pw-prove-mutation`. `proof-run.mjs mutate` now owns all
// three, and Step 7 fixes the forced-no-reuse build and the isolated output BY CONSTRUCTION rather
// than by flag. Three assertions were re-derived:
//   - `BUILD_REUSE=never` and `--output` became UNREACHABLE. Neither appears on the mutate verb's
//     command line, so demanding them failed every correct answer. They are replaced by the verb
//     invocation and the four flags only the agent can supply.
//   - the isolation assertion moved from the flag to the property. What matters is that
//     `test-results/` is left standing, which the answer can now only say rather than spell.
//   - the restart is now the verb's, proven before any verdict is read, so `restart` is asserted
//     against the verb rather than against a stop-and-start the agent describes.
// The Step-3 half — a reuse accepted on its reason, not distrusted — is unchanged.
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
    // An INDENTED non-item line is a wrapped continuation of the item above it, not a new scope.
    // Re-deriving three of these judges under #150 found a must-PASS twin failing because the
    // second line of a wrapped bullet under "What I explicitly do **not** do:" reset the header, so
    // the NEXT bullet's refusal read as the answer's plan. That is the #59 defect one level deeper
    // again: the list form was fixed by #66, the wrapped-item form was not.
    const isContinuation = /^\s/.test(raw) && !isItem;
    if (!isItem && !isContinuation) underRejectionHeader = /:[*_~\s]*$/.test(line) && REJECTION_HEADER.test(line);
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
  // The two things the verb fixes by construction. Passing either is a usage error against the
  // module, and describing it as the agent's step is the prose the rewrite removed.
  /\bI (?:set|export|pass|force)\b[^\n]{0,30}BUILD_REUSE=never/i,
  /\bI (?:pass|add|give|set)\b[^\n]{0,30}--output\b/i,
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
  [/proof-run\.mjs["']?\s+mutate|\bmutate verb\b/i, "the mutation check never goes through the mutate verb, which is what forces the rebuild and proves the restart"],
  [/--build-command/, "the verb is never given the build script, so it has nothing to force the rebuild with"],
  [/--server-pid/, "the verb is never given the recorded PID, so it cannot stop the server holding the pre-mutation artifact"],
  [/--serve-command/, "the verb is never given how the server is started, so it cannot bring the rebuilt artifact up"],
  [/--server-log/, "the verb is never given the preview log, so the restart has nothing to be proven against"],
  [/restart/i, "the preview server is never restarted onto the rebuilt artifact"],
  [/prove[nds]?\b|unproven|\bexit 11\b/i, "the restart is never proven, so a predecessor still holding the port could supply the verdict"],
  [/green by construction|un-?rebuilt|standing artifact|would (?:always )?pass/i, "the answer never says why a mutation against the un-rebuilt artifact is worthless"],
  [/revert|git checkout --|git (?:restore|stash)|undo the mutation/i, "the mutation is never reverted"],
  [/isolat\w*|\bseparate\b|\bown output\b|untouched|left (?:alone|standing|as it stands)|\bnot cleared\b|never clears/i, "the answer never says the mutation run's artifacts are isolated from the delivered clips"],
  [/test-results/, "the answer never names test-results/, which is the directory the mutation run must leave standing"],
  [/\bstale\b/i, "the artifact is never marked stale after the revert, so the lazy rebuild has nothing making it safe"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the reuse is accepted on its reason, the mutate verb rebuilds and proves its restart, and its artifacts stay out of test-results/");
