#!/usr/bin/env node
// Judge (case-36): an explicit viewport: key is a project decision and outranks the ...devices spread beside it.
//
// SKILL.md Step 6 / code-rules.md § Viewport pin. clip-fidelity.mjs re-derives 'deliberate'
// from the config text and agrees with the declared verdict, exiting 0. The ABSENT test.use({ viewport })
// is correct: a deliberate viewport is respected and never pinned over, so a 1600x900 pin would make
// the proof run and the mutation check render at a size the project never uses. The recording is sized
// to the effective viewport, 1440x810 — not to the 1600x900 pin default.
// This is the DRY twin of case-22, whose wet fixture is void under #76; the premise here is stated in
// prose, so the verdict can be read today.
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
  /test\.use\(\s*\{\s*viewport/i,
  /\bpin\w*\b[^\n]{0,40}1600/i,
  /\b1600\s*[x×]\s*900\b[^\n]{0,40}\b(?:pin|use|set|apply|add)/i,
  /PW_PROVE_W=1600/,
]);
if (bad.length) {
  console.error("FAIL: the answer pins over the project's own deliberate viewport:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\b1440\s*[x×]\s*810\b|width:\s*1440/, "the answer never resolves the effective viewport to the config's own 1440x810"],
  [/deliberate/i, "the answer never names the `deliberate:` branch that produced the verdict"],
  [/exit(?:s|ed)?\s*0|\bagrees?\b/i, "the answer never reports that the audit agreed with the declared verdict and exited 0"],
  [/PW_PROVE_W=1440/, "the recording is not sized to 1440, so the film renders at a size the project never uses"],
  [/PW_PROVE_H=810/, "the recording is not sized to 810"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the project's deliberate viewport is respected, no pin is emitted, and the recording matches it");
