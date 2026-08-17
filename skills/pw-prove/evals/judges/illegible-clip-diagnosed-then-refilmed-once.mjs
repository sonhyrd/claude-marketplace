#!/usr/bin/env node
// Judge (case-37): an illegible clip is DIAGNOSED and fixed in the committed spec, re-audited, re-filmed ONCE, and published with a warning if still bad.
//
// SKILL.md Step 7. Stating what each frame shows IS the inspection. The subject against the
// frame edge diagnoses as element-off-frame; the fix is the UNGATED scrollIntoView({ block: 'center',
// inline: 'center' }) in the COMMITTED spec — never in the proof config, never behind PW_PROVE_CLIP,
// because the filming law says the variable may only add time. Moving a dwell can drop its
// // JUSTIFIED: marker, so the Step-6 audit re-runs on the edited spec and must exit 0 BEFORE
// re-filming. Re-film once; a still-illegible clip is PUBLISHED with an explicit warning, because a
// bad clip is not a failed test.
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
  /PW_PROVE_CLIP[^\n]{0,80}scrollIntoView|scrollIntoView[^\n]{0,80}PW_PROVE_CLIP/i,
  /\b(?:add|put|place|set)\b[^\n]{0,50}proof config/i,
  /re-?film[^\n]{0,40}(?:again|twice|a second time|repeatedly|until)/i,
  /\bfail(?:s|ing)? the run\b|\bstop the run\b/i,
]);
if (bad.length) {
  console.error("FAIL: the answer gates the framing fix, puts it in the wrong file, or re-films more than once:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/clip 1|clips? 1|clip 2/i, "the answer never says what each frame shows, which is the inspection itself"],
  [/\boff-?frame\b|\bframe edge\b|\bagainst the (?:right )?edge\b/i, "clip 3 is never diagnosed — it is re-filmed without a cause"],
  [/scrollIntoView\(\s*\{[^}]*block:\s*['"]center/, "the fix is never the scrollIntoView({ block: 'center', inline: 'center' })"],
  [/inline:\s*['"]center/, "the fix never centres horizontally, which is the axis clip 3 is cut off on"],
  [/\bungated\b|\bun-gated\b|\bnot gated\b|\bnever gated\b|outside[^\n]{0,24}gate/i, "the answer never says the fix is ungated, so it would not run in CI"],
  [/committed spec|\bspec\b/i, "the answer never says the fix lands in the committed spec"],
  [/clip-fidelity/i, "the Step-6 audit is never re-run on the edited spec, so a dropped JUSTIFIED marker goes unnoticed"],
  [/rm -rf test-results|clear[^\n]{0,20}test-results/i, "test-results/ is never cleared, so the old clips survive the re-film"],
  [/\bwarning\b/i, "a still-illegible clip is never published with an explicit warning"],
  [/\bpublish/i, "the answer never publishes, so a bad clip is being treated as a failed test"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the clip is diagnosed, fixed ungated in the committed spec, re-audited, re-filmed once, and published with a warning if still bad");
