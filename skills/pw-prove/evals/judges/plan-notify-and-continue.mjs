#!/usr/bin/env node
// Judge (case-7): PR-mode posts the plan and continues; only coverage-gap waits for approval.
//
// SKILL.md Step 4: "Post the plan as the audit trail and continue **immediately** to Step 5. Silence
// is consent ... Never wait, never enter a planning mode", against the coverage-gap approval gate.
// A correct answer lists the questions it will NOT ask (POM or flat? dirty worktree?) under a
// rejecting header, which is the #66 list-form defect, so offenders() is the filter that reads it.
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

const bad = offenders(text.search(/^[^\n]{0,20}\bcoverage[- ]gap\b/im) === -1 ? text : text.slice(0, text.search(/^[^\n]{0,20}\bcoverage[- ]gap\b/im)), [
  /\b(?:wait|await|pause|block)\w*\b[^\n]{0,40}\b(?:for )?(?:the )?(?:user|reply|response|approval|confirmation)\b/i,
  /\b(?:ask|confirm with|check with)\b[^\n]{0,30}\bthe user\b/i,
  /\benter\w*\b[^\n]{0,20}\bplan(?:ning)? mode\b/i,
  /\b(?:match|follow|mirror)\b[^\n]{0,30}\bflat\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer waits or asks in PR-mode, where silence is consent:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\bStep 5\b/, "the answer never says it continues to Step 5"],
  [/Assumptions/i, "the answer never posts the Assumptions block, which is the audit trail that replaces the questions"],
  [/\bPOM\b/, "the Assumptions block never states POM-always despite the flat siblings"],
  [/stash/i, "the Assumptions block never states the stash-and-restore of the dirty tree"],
  [/getByPlaceholder/, "the Assumptions block never resolves the label-less input to getByPlaceholder"],
  [/coverage[- ]gap/i, "the answer never addresses the coverage-gap branch"],
  [/coverage[- ]gap[\s\S]{0,400}\bapprov\w+/i, "the coverage-gap branch never stops for explicit approval before writing code"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: PR-mode posts the plan and continues to Step 5 unasked; coverage-gap stops for approval');
