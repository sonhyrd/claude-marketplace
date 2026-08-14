#!/usr/bin/env node
// Judge (case-53): the probe's vocabulary: an empty shell is a console question, and a batch sent first is not a failure.
//
// SKILL.md Step 3 › Recon. The autostart is normal sequencing — 'send' starts a daemon when
// none is listening, and the batch it printed IS the answer, not a fault to re-run. An authenticated
// page rendering an empty shell usually said why in the console, so the console verb is the question.
// Two values come back in ONE eval via the named-map object form; three separate evals is the shape to
// avoid. The viewport request is REFUSED: there is no viewport verb, the effective viewport is resolved
// in Step 4 from the project's Playwright config and pinned in the committed spec, and recon at a
// viewport the proof never uses is recon against a different rendering. No throwaway _recon.spec.ts
// answers any of the three.
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
  /\bI (?:re-?run|retry|re-?send|restart)\b[^\n]{0,50}(?:because|since)[^\n]{0,30}(?:daemon|autostart)/i,
  /\bI (?:write|create|scaffold|add)\b[^\n]{0,50}(?:_recon|throwaway|temporary)[^\n]{0,20}spec/i,
  /\bI (?:send|use|add)\b[^\n]{0,30}(?:a )?viewport (?:verb|command|cmd)/i,
  /\bI (?:send|use|split)\b[^\n]{0,30}three (?:separate )?evals?/i,
]);
if (bad.length) {
  console.error("FAIL: the answer re-runs a healthy autostart, invents a verb the probe lacks, or falls back to a throwaway spec:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/autostart|started a daemon|daemon/i, "the answer never addresses the autostart, which is the thing that looks like a fault and is not"],
  [/normal|expected|ordinary|not a (?:fault|failure|problem)/i, "the answer never says the autostart is normal sequencing"],
  [/"cmd"\s*:\s*"console"|\bconsole\b/i, "the console question is never asked, and that is where an empty authenticated shell says why"],
  [/__APP__\.tenant/, "the tenant value is never asked for"],
  [/location\.href/, "the URL is never asked for"],
  [/one eval|single eval|named-?map|one batch|same eval/i, "the two values are never gathered in one eval, which is the form the case is about"],
  [/\bno viewport verb\b|\bthere is no\b[^\n]{0,30}viewport|\brefus\w*/i, "the viewport request is never refused"],
  [/Step 4|playwright\.config|committed spec/i, "the answer never says where the effective viewport actually comes from"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the autostart is read as normal, the console and named-map eval carry the questions, and the viewport request is refused");
