#!/usr/bin/env node
// Judge (case-12): the app will not boot — stop with the six-beat report, and never run the old spec.
//
// SKILL.md Pipeline Overview › Stop reports, beats 1–6, and beat 5 in particular: a prior spec must be
// reported as NOT run and NOT green. The correct answer names the pre-existing spec and the Step-8
// tail in order to refuse both, which is exactly what a substring rule cannot separate.
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
  /\b(?:run|execut|invok)\w*\b[^\n]{0,40}(?:e2e\/)?onboarding\.spec\.ts/i,
  /\b(?:generat|writ|author|scaffold)\w*\b[^\n]{0,30}\b(?:the )?(?:spec|POM|Page Object)\b/i,
  /\b(?:edit|patch|modify|fix|change)\w*\b[^\n]{0,30}nuxt\.config/i,
  /\b(?:report|mark)\w*\b[^\n]{0,30}\bgreen\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer proceeds against a server that never bound:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

// The delivery tail is what distinguishes a shipped proof from a reported non-delivery, so a stop
// that borrows it is indistinguishable from a run that delivered. Judged on the lines themselves.
const tail = ["Proof page:","Committed:","Pushed:","PR comment:"].filter((l) => text.includes(l));
if (tail.length) {
  console.error('FAIL: the stop report emits the Step-8 delivery tail, which no stop may carry: ' + tail.join(', '));
  process.exit(1);
}

const checks = [
  [/\bSTOP\w*|\bstopp?(?:ed|ing)\b/i, "the answer never stops"],
  [/\bStep 3\b/, "the verdict line never names the Step it stopped at"],
  [/runtime-flags\.generated/, "the blocker evidence never quotes the dev-server error verbatim"],
  [/\bexit 3\b|preflight/i, "the blocker evidence never names the preflight STOP"],
  [/\b(?:no|never|not|nothing)\b[^\n]{0,60}(?:spec|POM|Page Object)/i, "the report never states that no spec or POM was produced"],
  [/onboarding\.spec\.ts/, "the report never accounts for the pre-existing spec, so a reader cannot tell it was left alone"],
  [/\bunblock\w*|\bre-?run\b|\brestore\b|\bremove the import\b/i, "the report never says how to unblock the run"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the run stops at Step 3 with the six-beat report, the old spec is untouched, and no delivery tail is emitted');
