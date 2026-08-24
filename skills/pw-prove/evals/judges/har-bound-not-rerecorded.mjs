#!/usr/bin/env node
// Judge (case-43): an unbound HAR matches nothing — bind it, do not re-record it.
//
// The old rule was `failure: output_contains` over `re-record`, `hand-write mocks for`,
// `widen the url filter`, `remove notFound`. The correct diagnosis names every one of them in the
// sentence that rules it out ("the recording is fine, so re-recording changes nothing"), which is
// what failed this class of case in the 2026-08-13 run.
//
// The repair is artifact-shaped for the positive half — the emitted command block must carry the
// bind and the exported HAR path — and negation-anchored for the negative half.
//
// Re-derived by #150 against the prompt the Step-7 rewrite left behind. Before that rewrite the
// agent ran `har-scrub.mjs bind` by hand and exported PW_PROVE_HAR itself; the bind is now a PHASE
// of `proof-run.mjs audit`, reached with --har/--origin/--bindings, and Step 7 says there is no
// documented raw fallback for it. Three assertions were re-derived:
//   - the required `har-scrub.mjs bind` block became a FORBIDDEN one, and the required command is
//     now the audit verb carrying --har and --origin. Demanding the old shape demanded a defect.
//   - the exit codes moved. The old `exit 4` / `exit 5` were har-scrub's own; the audit verb exits
//     5 for a bind that cannot be made safe and says which kind in `phases.har_bind.reason`, so the
//     assertion is on the reason rather than on a code the answer never sees.
//   - the PW_PROVE_HAR assignment stays, but its justification moved: the audit verb sets it for
//     its own run, and the agent carries it inline on film and mutate, which have no bind phase.
//     The path comes from `phases.har_bind.out`, so a reconstructed one is the new near-miss.
// The negative half — never re-record, never hand-mock, never relax notFound:'abort' — is unchanged
// and is still the case's centre.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
const emitted = blocks.join('\n');

function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    // Double quotes only. An apostrophe is not a quote delimiter in English prose: pairing
    // "doesn't" with "you're" swallowed the negation between them and turned a correct answer red.
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
// The tail of this alternation is this case's own vocabulary, which is why the cross-judge drift
// check excludes NEGATED and not the functions around it.
//
// A SINGLE NAMED ENTRY excuses the sentence here, because the case forbids abandoning THIS recording
// for THIS failure and the skill's rule for a *different* failure is "bind it or re-record". A
// recorded 2026-08-14 answer bound the HAR correctly, emitted the whole command block, and added
// "If a *particular* call aborts after this — as opposed to all of them — that one is a genuine
// recording miss and needs a re-record through the probe." The judge scored that correct sentence as
// abandoning the recording: the #71 family again, a clause matched against the wrong failure.
//
// It is scoped to a named single entry rather than to conditionals in general on purpose. A blanket
// `if` was tried first and swallowed the committed must-FAIL fixture's own offender ("If that still
// aborts I will remove notFound: 'abort'") — exactly the class this judge exists to catch.
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|pointless|unnecessary|wrong|that one)\b|\b(?:particular|single|individual|specific)\b[^\n]{0,40}\b(?:call|entry|endpoint|request|read|response)\b/i;
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
    const isHeader = /:[*_~\s]*$/.test(line) && REJECTION_HEADER.test(line);
    // An INDENTED non-item line is a wrapped continuation of the item above it, not a new scope.
    // Re-deriving three of these judges under #150 found a must-PASS twin failing because the
    // second line of a wrapped bullet under "What I explicitly do **not** do:" reset the header, so
    // the NEXT bullet's refusal read as the answer's plan. That is the #59 defect one level deeper
    // again: the list form was fixed by #66, the wrapped-item form was not.
    //
    // A header is never a continuation, however indented. Without that clause the fix would also
    // stop an INDENTED "things I will not do:" from OPENING a scope — narrowing what counts as a
    // refusal, when the whole point of this change is that it can only widen it.
    const isContinuation = /^\s/.test(raw) && !isItem && !isHeader;
    if (!isItem && !isContinuation) underRejectionHeader = isHeader;
    else if (underRejectionHeader) continue;
    for (const s of line.split(/(?<=[.!?;])\s+/)) {
      const sentence = s.trim();
      if (!sentence || NEGATED.test(sentence)) continue;
      for (const p of phrases) if (p.test(sentence)) out.push(sentence);
    }
  }
  return [...new Set(out)];
}

// --- the fix, as a command -------------------------------------------------------------------------
if (blocks.length === 0) {
  console.error('FAIL: no fenced block — this case is answered with a command, and none was emitted');
  process.exit(1);
}
const need = [
  // The optional closing quote is load-bearing. A recorded 2026-08-14 answer put the skill base in a
  // variable and wrote `node "$SB/scripts/proof-run.mjs" audit …` — the correct invocation, quoted
  // the way a path in a variable has to be — and `\.mjs\s+audit` did not match across the quote.
  // Judging the shell quoting rather than the subcommand is the same wrong-unit family as #71.
  [/proof-run\.mjs["']?\s+audit/, 'the emitted command never re-invokes `proof-run.mjs audit`, which is where the bind phase lives'],
  [/--har\b/, 'the audit verb is invoked without --har, so the bind phase is skipped again and every read aborts again'],
  [/--origin/, 'the bind never passes --origin, so the HAR stays unbound to the running server'],
];
const missing = need.filter(([re]) => !re.test(emitted));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}
// The bind has no raw fallback. Running the scrubber by hand is the second copy Step 7 deleted, and
// like every other negative here it is judged on the EMITTED COMMAND — prose naming the module to
// explain that the verb delegates to it is correct and must pass.
const byHand = emitted.split('\n').filter((l) => /har-scrub\.mjs["']?\s+bind/.test(l));
if (byHand.length) {
  console.error('FAIL: the emitted command runs the bind by hand — it is a phase of the audit verb, and Step 7 keeps no raw fallback for it:');
  for (const l of [...new Set(byHand)].slice(0, 2)) console.error('   ' + l.trim());
  process.exit(1);
}
// The export is a COMMITMENT, not a second artifact, so it is read from the whole answer rather
// than from the fenced blocks alone. A recorded 2026-08-14 answer emitted the bind as a block and
// then wrote `PW_PROVE_HAR="$PWD/.pw-prove/reports.api.har"` in the sentence beneath it, telling
// the operator to carry it on every runner invocation — the thing this check exists to see — and
// failed for putting it one line outside a fence. That is the #71 defect in another surface:
// judging the markdown rather than the commitment.
//
// It still has to be an ASSIGNMENT with a value. `PW_PROVE_HAR was unset` is a diagnosis, and an
// answer that only ever names the variable has not told anyone to set it.
if (!/(?:export\s+)?PW_PROVE_HAR\s*=\s*\S/.test(text)) {
  console.error('FAIL: the answer never assigns PW_PROVE_HAR at the bound copy — naming the variable is not setting it');
  process.exit(1);
}
// The literal port, or a variable that carries the effective origin. Demanding the literal
// red-flagged `--origin "$BASE_URL"`, which is the same binding written the durable way.
if (!/5199/.test(emitted) && !/--origin\s+["']?\$\{?(?:BASE_URL|PW_PROVE_BASE_URL|ORIGIN)\b/.test(emitted)) {
  console.error('FAIL: the bind origin is neither the running port (5199) nor an origin variable that carries it');
  process.exit(1);
}

// --- and none of the remedies that abandon the recording ----------------------------------------------
const bad = offenders(text, [
  /\bre-?record\w*\b/i,
  /\brecord the HAR again\b/i,
  /\bhand-?(?:write|roll)\w*\b[^\n]{0,40}\bmocks?\b/i,
  /\bwiden\b[^\n]{0,40}\b(?:url|URL) filter\b/i,
  /\bremov\w+\b[^\n]{0,30}notFound/i,
  /\bnotFound[^\n]{0,20}(?:to|→)\s*'?(?:fallback|continue)/i,
  /\bthe recording is (?:too )?short\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer abandons the canonical recording instead of binding it:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: the HAR is bound through the audit verb and carried on PW_PROVE_HAR; nothing re-recorded');
