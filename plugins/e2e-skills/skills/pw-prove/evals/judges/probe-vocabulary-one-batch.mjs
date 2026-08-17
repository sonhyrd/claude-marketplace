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

// A check below may be a regexp over the whole answer, or a predicate when the fact it is about is
// not expressible as one span of text. #82 repaired three of them against recorded 2026-08-14
// answers that were correct in every particular and went red on spelling alone — the bare-substring
// family, in its "the value is right and the characters are not" form.
//
// Three recorded answers state one fact in three word orders, and the old pattern — the word
// *viewport* sitting near the word *no* — read only the first of them:
//
//   "there is deliberately no `viewport` among them"        the absent verb, negation before noun
//   "The 390px viewport question I'm not sending"           the refusal, first person
//   "The 390px viewport is not sent."                       the refusal, passive, no first person
//
// So the unit is the LINE, which is what makes it about the viewport request rather than about
// something else; and within it the test is order-free — a negation, applied either to the act of
// sending or to the existence of the verb. Requiring a fixed adjacency is requiring a word order.
const REFUSES_THE_VIEWPORT = (t) =>
  t.split(/\n/).some((line) => {
    if (!/\bviewports?\b|\b390\s*-?\s*px\b/i.test(line)) return false;
    if (/\brefus\w*|\breject\w*|\bdeclin\w*/i.test(line)) return true;
    if (!/\b(?:not|never|no|none|isn'?t|aren'?t|won'?t|don'?t|doesn'?t|cannot|can'?t|lacks?|without)\b/i.test(line)) return false;
    return /\b(?:sent|send|sending|issue[ds]?|issuing|ask|asked|asking|run|running|request(?:ed|ing|s)?)\b/i.test(line)
        || /\b(?:verbs?|commands?|cmds?|vocabulary)\b/i.test(line);
  });

const checks = [
  [/autostart|started a daemon|daemon/i, "the answer never addresses the autostart, which is the thing that looks like a fault and is not"],
  // There was a second autostart check here — the answer had to SAY the autostart was "normal" /
  // "expected" / "not a fault" — and #82 deleted it rather than widening it. It is case-61's
  // vestigial clause in this judge: #79's repaired prompt states the environment is settled
  // ("nothing about the environment is in question"), so an answer that labels the autostart is
  // restating the premise, and one that simply proceeds from a daemon that is up has read it
  // correctly. What is actually measurable — that the answer does not re-run or restart — is the
  // first `offenders()` pattern above, and that pattern is untouched. Two rounds of widening the
  // vocabulary had already landed here; a third would be fitting the judge to its fixtures.
  // See judges/README.md, *An assertion is re-derived from the prompt it is about*.
  [/"cmd"\s*:\s*"console"|\bconsole\b/i, "the console question is never asked, and that is where an empty authenticated shell says why"],
  // Optional chaining is the same value. `window.__APP__?.tenant` reads the tenant off `__APP__`
  // exactly as `window.__APP__.tenant` does — guarded, which on a shell that may not have booted
  // the global yet is the better probe, not a different question. Bracket access is the same value
  // too. The check is about which value comes back, so it must not be about which dot spells it.
  [/__APP__\s*(?:\??\.\s*tenant\b|\[\s*['"]tenant['"]\s*\])/, "the tenant value is never asked for"],
  [/location\.href/, "the URL is never asked for"],
  [/one eval|single eval|named-?map|one batch|same eval/i, "the two values are never gathered in one eval, which is the form the case is about"],
  [REFUSES_THE_VIEWPORT, "the viewport request is never refused"],
  [/Step 4|playwright\.config|committed spec/i, "the answer never says where the effective viewport actually comes from"],
];
const missing = checks.filter(([m]) => !(typeof m === 'function' ? m(text) : m.test(text)));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log("PASS: the autostart is not re-run, the console and named-map eval carry the questions, and the viewport request is refused");
