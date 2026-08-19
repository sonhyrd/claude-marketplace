#!/usr/bin/env node
// Judge (case-59): every scenario timing out on its first navigation is a whole-run signature — serialise once to diagnose, then report the finding.
//
// SKILL.md Step 7 › Verify. 'Every test times out at its first navigation' is a whole-run
// signature, not a spec defect. Confirm the origin is alive with a quick curl, then re-run the SAME
// spec unchanged with one worker as a DIAGNOSTIC that separates a concurrency problem from a spec
// problem — never as the mandated setting it used to be (docs/adr/0017 retired that). Against a built
// preview this signature has NO KNOWN CAUSE (the preview compiles nothing and was measured not to
// saturate), so a spec that then passes serialised is a finding to REPORT with its evidence, not a box
// ticked on the way to green. Must not heal locators, raise the test timeout, add waits, or count this
// against the 3 auto-fix attempts.
// 
// The flag spelling: SKILL.md 0.15.2 names '-j 1' (#67 removed the '--workers' string from the shipped
// surface). '-j' is Playwright's own shorthand for '--workers', so both spellings name the same option
// and this judge accepts either — the mined assertion predates #67 and says '--workers=1'.
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
  /\bI (?:heal|re-?snapshot|rewrite|fix)\b[^\n]{0,40}locator/i,
  /\bI (?:raise|increase|extend|lengthen|bump)\b[^\n]{0,40}(?:timeout|budget)/i,
  /\bI (?:add|insert|introduce)\b[^\n]{0,40}(?:wait|sleep|waitForTimeout)/i,
  /\bI (?:count|spend|use)\b[^\n]{0,50}(?:auto-?fix|fix loop|attempts?)/i,
  /\bI (?:pin|set|add)\b[^\n]{0,40}workers[^\n]{0,30}(?:config|proof config)/i,
]);
if (bad.length) {
  console.error("FAIL: the answer treats a whole-run signature as a spec defect and edits the spec to absorb it:");
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  [/-j\s*1|--workers[= ]?1/, "the answer never gives the serialised re-run command"],
  [/\bunchanged\b|\bsame spec\b/i, "the answer never says the spec is re-run unchanged"],
  [/diagnostic/i, "the answer never frames serialisation as a diagnostic rather than a fix"],
  [/\bcurl\b/i, "the origin is never confirmed alive before the re-run"],
  [/every (?:test|scenario)|all five|whole-?run|signature/i, "the answer never reads this as a whole-run signature"],
  [/no known cause|compiles nothing|does not saturate|not saturate/i, "the answer never states that this signature has no known cause against a built preview"],
  [/\bfinding\b/i, "a spec that passes serialised is never reported as a finding"],
  [/0017/, "the answer never cites the ADR that retired the mandate, so it reads as reinstating it"],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the signature is diagnosed once with a serialised re-run, and a serialised pass is reported as a finding rather than adopted");
