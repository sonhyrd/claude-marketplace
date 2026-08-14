#!/usr/bin/env node
// Judge (case-57): a string expression is EVALUATED, so arrow-function source yields a function object — nothing was ever called.
//
// SKILL.md Step 4 recon / probe.mjs. Sending {"cmd":"eval","expression":"(row) => row.status"}
// evaluates that string as an expression: the value is a function object, and no argument was ever
// passed. So 'undefined' is a fact about the question, not about the application — recording 'the row
// has no status' would be a finding with no contact with the page. Re-ask with the argument form the
// probe documents, {"fn":"(row) => row.status","arg":{"id":7}}, whose value is what fn RETURNED for
// that arg, or with a self-contained string expression that does its own lookup in the page. Do not
// reach for the test runner or a throwaway spec, and do not conclude the probe cannot answer questions
// that take an argument.
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
  /\bI (?:record|report|note|conclude)\b[^\n]{0,50}(?:row has no status|no status|status is undefined)/i,
  /\bI (?:write|create|scaffold|use)\b[^\n]{0,50}(?:_recon|throwaway|temporary|a) spec/i,
  /\bI (?:reach for|use|run)\b[^\n]{0,40}(?:the )?test runner/i,
  /\bthe probe cannot\b[^\n]{0,40}argument/i,
]);
if (bad.length) {
  console.error("FAIL: the answer treats a malformed question as an answer about the application, or abandons the probe:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/\bexpression\b/i, "the answer never engages with how a string expression is treated"],
  [/function object|evaluat\w+|never (?:called|invoked)|not (?:called|invoked)|no argument/i, "the answer never explains that the source evaluated to a function nobody called"],
  [/"fn"|\bfn\b/, "the answer never reaches for the {fn, arg} form the probe documents"],
  [/"arg"|\barg\b/, "the answer never passes an argument"],
  [/undefined/, "the answer never accounts for the undefined it was given"],
  [/self-contained|does its own lookup|looks? up|document\.|querySelector/i, "the answer never offers the second legitimate route — a self-contained expression that does its own lookup"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the undefined is diagnosed as a malformed question and re-asked in the argument form, not recorded as a fact about the app");
