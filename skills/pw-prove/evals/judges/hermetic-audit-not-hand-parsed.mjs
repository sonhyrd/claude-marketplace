#!/usr/bin/env node
// Judge (case-28): the hermetic classification is READ from the audit summary — not re-run, not hand-parsed.
//
// The original rule was `failure: output_contains` over `parse the trace`, `unzip trace.zip`, `jq `,
// `hand-roll`. A correct answer says "rather than unzipping trace.zip and parsing it by hand, ...",
// and the bare substring cannot tell that from the thing it forbids. `jq ` was the worst of them:
// two characters of tool name and a space, hit by any sentence that mentions jq at all. The repair
// was artifact-shaped: the negative applies to the EMITTED COMMAND. A shell block that unzips a
// trace or pipes it through jq is the defect; prose naming either to reject it is not.
//
// Re-derived by #150 against the prompt the Step-7 rewrite left behind. Until that rewrite the
// agent RAN the classifier — this judge REQUIRED a shell block invoking `hermetic.mjs --spec`, and
// failed an answer that did not. Step 7 now says the audit verb already classified the run and
// "you do not invoke a classifier and you do not hand-write a trace parser", so that assertion had
// inverted: a correct answer emits no such command. Three assertions were re-derived:
//   - the required `hermetic.mjs --spec` block became a FORBIDDEN one. Running the classifier by
//     hand is now the defect, in the same family as hand-parsing the trace, and is judged the same
//     way — on the emitted command, so prose naming the module to explain the delegation passes.
//   - a new positive: the answer must read `phases.hermetic` from the audit summary. Without it
//     nothing distinguishes reading the run's own classification from inventing one.
//   - the in-spec round trip is now graded on the summary's own field name as well as on
//     `route.fetch`, because the summary is where the answer meets it.
// The verdict half — every live call and every in-spec round trip judged against the CARVE-OUT
// lines, an undeclared call failing a green run — is unchanged and is still the case's centre.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

const blocks = [...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].trim().toLowerCase(), body: m[2] }));
const shell = blocks.filter((b) => b.lang === '' || /^(?:bash|sh|shell|zsh|console|shell-session)$/.test(b.lang));
const emitted = shell.map((b) => b.body).join('\n');

function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    // Double quotes only. An apostrophe is not a quote delimiter in English prose: pairing
    // "doesn't" with "you're" swallowed the negation between them and turned a correct answer red.
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|unnecessary|pointless)\b/i;
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

// --- the classification is read, not re-run -----------------------------------------------------
if (!/phases\.hermetic|\bhermetic\b[^\n]{0,40}\bsummary\b|\bsummary\b[^\n]{0,40}\bhermetic\b/i.test(text)) {
  console.error("FAIL: the answer never reads phases.hermetic from the audit summary — the verb already classified this run");
  process.exit(1);
}
const reRun = shell.filter((b) => /hermetic\.mjs/.test(b.body));
if (reRun.length) {
  console.error('FAIL: the emitted command invokes the classifier by hand — the audit verb already ran it:');
  for (const b of reRun.slice(0, 2)) console.error('   ' + b.body.trim().split('\n')[0]);
  process.exit(1);
}

// --- the verdict ---------------------------------------------------------------------------------------
if (!/route\.fetch|in_spec_round_trips/.test(text)) {
  console.error('FAIL: the answer never names the in-spec round trips (route.fetch / in_spec_round_trips) a trace records as MOCKED');
  process.exit(1);
}
if (!/carve-?out/i.test(text)) {
  console.error('FAIL: the answer never reaches a verdict against the declared CARVE-OUT lines');
  process.exit(1);
}

if (!/\bundeclared\b/i.test(text)) {
  console.error('FAIL: the answer never reads the `undeclared` list, which is the mechanical half of the check');
  process.exit(1);
}
if (!/\bgreen\b|\bpass(?:ed|ing)?\b|\bfails? the run\b/i.test(text)) {
  console.error('FAIL: the answer never says an undeclared live call fails the run even though it is green');
  process.exit(1);
}

// --- and nothing hand-rolled -----------------------------------------------------------------------------
const handRolled = [];
for (const b of shell) {
  for (const line of b.body.split('\n')) {
    if (/\b(?:unzip|bsdtar|tar\s+-x)\b[^\n]*trace/i.test(line)) handRolled.push(line.trim());
    if (/\bjq\b/.test(line) && /trace|network|\.zip/i.test(line)) handRolled.push(line.trim());
    if (/\bnode\s+-e\b/.test(line)) handRolled.push(line.trim());
  }
}
if (handRolled.length) {
  console.error('FAIL: the emitted command hand-parses the trace instead of running the audit:');
  for (const l of [...new Set(handRolled)].slice(0, 3)) console.error('   ' + l);
  process.exit(1);
}
const bad = offenders(text, [
  /\bwrite (?:a|my own) (?:parser|script)\b/i,
  /\bhand-?roll\w*\b/i,
  /\bparse the trace\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer commits to parsing the trace by hand:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: phases.hermetic read from the audit summary; the in-spec round trips judged against the CARVE-OUT lines');
