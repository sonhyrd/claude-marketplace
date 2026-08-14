#!/usr/bin/env node
// Judge (case-58): `arg` is JSON data serialised into the call — a selector string arrives as the string, and a DOM node cannot travel at all.
//
// SKILL.md Step 4 recon / probe.mjs. In {"fn":…,"arg":…} the arg is JSON data serialised into
// the call. So "document.querySelector('tr[data-id=\"7\"]')" arrives as that STRING, and
// getComputedStyle would be handed text; a real DOM node cannot be sent through JSON at all. Do the
// selection inside fn and pass only data — {"fn":"(sel) => getComputedStyle(document.querySelector(sel)).backgroundColor","arg":"tr[data-id=\"7\"]"} —
// or ask the whole question as one string expression. Do NOT abandon the {fn, arg} form (it does pass
// its argument and does return the function's value), do NOT switch to the named-map form for this (its
// values are plain expressions and take no argument), and do NOT introduce a page-handle concept the
// probe does not have.
// The complement of case-57: there the FORM was wrong, here the form is right and the ARGUMENT is wrong.
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
  /\bI (?:abandon|drop|avoid|stop using)\b[^\n]{0,40}(?:the )?\{?fn/i,
  /\bI (?:switch|move|change)\b[^\n]{0,40}named-?map/i,
  /\bI (?:pass|send|use)\b[^\n]{0,40}(?:a )?(?:page |element )?handle/i,
  /\bI (?:send|pass)\b[^\n]{0,40}(?:the )?(?:element|node) as the arg/i,
]);
if (bad.length) {
  console.error("FAIL: the answer abandons a form that works, or invents a handle the probe does not have:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\bJSON\b/, "the answer never says arg is JSON data, which is the whole reason the plan fails"],
  [/\bstring\b/i, "the answer never says the selector arrives as the string itself"],
  [/getComputedStyle/, "the answer never connects this to what getComputedStyle would be handed"],
  [/inside (?:the )?fn|within (?:the )?fn|do the selection|select it inside|select inside|(?:lookup|look it up) in the page|querySelector\(sel\)/i, "the answer never moves the selection inside fn, which is the fix"],
  [/"arg"\s*:\s*"[^"]+"|\barg\b[^\n]{0,40}(?:tr\[data-id|JSON-serialisable|plain data)/i, "the answer never passes JSON-serialisable data as the arg"],
  [/\bno\b|\bnot\b|\bwrong\b|\breject\w*|\brefus\w*/i, "the answer never actually answers the question it was asked, which is whether the batch is right"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the arg is understood as JSON data, the selection moves inside fn, and the {fn, arg} form is kept");
