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
// Re-derived by #150 against the prompt the Step-7 rewrite left behind. Before that rewrite the
// agent extracted the frames itself, cleared `test-results/` itself and re-ran the Step-6 audit
// itself; the film verb now does all three, and the re-film is the same `proof-run.mjs film`
// command. Three assertions were re-derived:
//   - `rm -rf test-results` became WRONG rather than merely unreachable. The verb clears the
//     directory, so an answer that clears it by hand is describing a step the body removed. It is
//     replaced by the assertion that the re-film goes through the verb.
//   - the clip-fidelity assertion stays, but it is now satisfied by naming the verb's PRECONDITION
//     rather than a hand-run command, and a hand-run one is a new negative.
//   - the re-film count is now READ from the summary (`films` / `publish_with_warning`) rather than
//     recalled, so an answer that reaches "publish with a warning" through the summary is credited.
// The diagnose-before-re-film half — the case's centre — is unchanged.
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

// The two steps the film verb absorbed. Both are ARTIFACT-shaped: a shell block that clears the
// results directory or runs the fidelity audit beside the verb is the defect, and prose naming
// either to explain that the verb owns it is not. Judging the prose here would fail every correct
// answer, which is the #59 defect the rest of this file already guards against.
// Every fence is matched WITH its language tag, then filtered. Matching only shell fences leaves
// the closing ``` of a ```ts block reading as the opener of the next one, which swallows the prose
// between them and judges it as a command — it failed this judge's own must-PASS twin.
const emitted = [...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)]
  .filter((m) => m[1].trim() === '' || /^(?:bash|sh|shell|zsh|console|shell-session)$/i.test(m[1].trim()))
  .map((m) => m[2])
  .join('\n');
const usurped = [];
for (const line of emitted.split('\n')) {
  if (/\brm\s+-rf?\s+[^\n]*test-results\b/i.test(line)) usurped.push(line.trim());
  if (/clip-fidelity\.mjs/.test(line)) usurped.push(line.trim());
}
if (usurped.length) {
  console.error('FAIL: the emitted command does by hand what the film verb owns — clearing test-results/ and running the fidelity precondition:');
  for (const l of [...new Set(usurped)].slice(0, 3)) console.error('   ' + l);
  process.exit(1);
}

const checks = [
  [/clip 1|clips? 1|clip 2/i, "the answer never says what each frame shows, which is the inspection itself"],
  [/\boff-?frame\b|\bframe edge\b|\bagainst the (?:right )?edge\b/i, "clip 3 is never diagnosed — it is re-filmed without a cause"],
  [/scrollIntoView\(\s*\{[^}]*block:\s*['"]center/, "the fix is never the scrollIntoView({ block: 'center', inline: 'center' })"],
  [/inline:\s*['"]center/, "the fix never centres horizontally, which is the axis clip 3 is cut off on"],
  [/\bungated\b|\bun-gated\b|\bnot gated\b|\bnever gated\b|outside[^\n]{0,24}gate/i, "the answer never says the fix is ungated, so it would not run in CI"],
  [/committed spec|\bspec\b/i, "the answer never says the fix lands in the committed spec"],
  [/clip-fidelity|fidelity (?:audit|precondition)|JUSTIFIED/i, "the fidelity precondition is never named, so a dropped JUSTIFIED marker goes unnoticed"],
  [/proof-run\.mjs["']?\s+film|\bfilm verb\b|\bthe same film\b/i, "the re-film never goes back through the film verb, which is what clears test-results/, re-runs the precondition and counts the attempt"],
  [/\bwarning\b/i, "a still-illegible clip is never published with an explicit warning"],
  [/\bpublish/i, "the answer never publishes, so a bad clip is being treated as a failed test"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the clip is diagnosed, fixed ungated in the committed spec, re-filmed ONCE through the film verb, and published with a warning if still bad");
