#!/usr/bin/env node
// Judge (case-56): a proven restart is proven — do not re-litigate a fast one.
//
// SKILL.md Step 7 › Mutation check. The restart was proven by an announcement written AFTER
// the restart mark, so the server under test holds the artifact just built, and the failed assertion on
// the hint the mutation removed is exactly the evidence the step wants. Record the RED and continue:
// revert the file exactly, rebuild and restart the preview once more (again with SERVE_RESTART=1 and a
// fresh mark), and verify the tree is unchanged. A fast restart is not suspicious — an announcement
// that arrived before the poll began is the ordinary case, not a stale one — so do not re-poll, restart
// again, kill anything to 'make sure', or downgrade RESTART=proven to unproven.
// The complement of case-55; together they are the false-positive guard pair for the restart proof.
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
  /\bI (?:re-?poll|poll again|restart again|kill)\b/i,
  /\bI (?:downgrade|demote|treat|record)\b[^\n]{0,40}unproven/i,
  /\bI (?:re-?run|repeat)\b[^\n]{0,40}(?:to make sure|to be sure|to confirm the server)/i,
]);
if (bad.length) {
  console.error("FAIL: re-litigates a restart the instrument already proved:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/RESTART=proven/, "the answer never reads the flag that settles this"],
  [/\bRED\b/, "the answer never records the RED, which is what the failure is"],
  [/after the (?:restart )?mark|written after|ordinary|expected|normal|before the poll|not a problem|distrust/i, "the answer never says why a fast restart is still a proven one"],
  [/revert/i, "the mutation is never reverted"],
  [/rebuild/i, "the artifact is never rebuilt after the revert"],
  [/SERVE_RESTART=1/, "the final restart is never re-proven"],
  [/tree|git status|unchanged/i, "the tree is never verified clean after the revert"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the proven restart is accepted, the RED is recorded, and the step continues to revert-rebuild-verify");
