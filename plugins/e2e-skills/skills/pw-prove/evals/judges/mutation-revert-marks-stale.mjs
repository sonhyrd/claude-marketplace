#!/usr/bin/env node
// Judge (case-62): after the mutation verdict, revert now and rebuild later.
//
// SKILL.md Step 7 › Mutation check, step 4 (docs/adr/0020). The revert is unconditional and
// immediate; the rebuild is LAZY — mark the artifact stale, and let whichever later step next needs
// the server pay for it. Step 8 hygiene stops a stale server rather than rebuilding it, which is the
// common case: an observed run paid an 82-second rebuild for a server it stopped 142 seconds later.
//
// The retired rule — "rebuild and restart once more so nothing downstream runs against deliberately
// broken software" — is the thing a correct answer NAMES in order to reject, so the negative half
// reads sentences rather than substrings.
//
// Re-derived by #150 against the prompt the Step-7 rewrite left behind. Before that rewrite the
// agent performed the revert and wrote the marker itself; `proof-run.mjs mutate` now does both, and
// the revert has already happened whatever the exit code says. Two assertions were re-derived:
//   - the revert assertion is now satisfied by READING what the verb did rather than by planning
//     it, so a re-run of the revert by hand became a new negative alongside rebuilding on the spot.
//   - a new positive: the marker is only worth writing if it is honoured, so the answer has to
//     reach the exit-15 refusal that `audit` and `film` take while it stands. Without that, "mark
//     it stale" is a sentence with nothing behind it.
// The centre — the revert immediate, the rebuild lazy, Step 8 stopping rather than rebuilding — is
// unchanged.
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
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|rule[ds]? out|forbidden|unnecessary|pointless|wrong|retired|no longer)\b/i;
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

const bad = offenders(text, [
  // The retired rule, stated as a plan: rebuild/restart on the spot after the revert.
  /\b(?:revert|reverted|checkout --|restore)\b[^\n]{0,80}\b(?:rebuild|re-?build)\b/i,
  /\b(?:rebuild|re-?build)\b[^\n]{0,60}\b(?:once more|again|a second time|and restart)\b/i,
  /\b(?:i (?:will|'ll)|then i|so i)\b[^\n]{0,40}\brestart the preview\b/i,
  // Leaving the tree mutated is the other direction, and it is worse.
  /\b(?:i (?:will|'ll)|then i)\b[^\n]{0,50}\bleave\b[^\n]{0,30}\bmutation\b/i,
  // The verb already reverted, unconditionally and before the verdict was read. Doing it again by
  // hand is a step that no longer exists, and on a tree the verb already restored it is a no-op
  // dressed as diligence.
  /\bI (?:now |then )?(?:revert|restore|check ?out)\b[^\n]{0,40}(?:the )?(?:file|line|source|mutation)\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer rebuilds on the spot after the revert, or leaves the tree mutated:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

const checks = [
  // NOT bare `revert` / `stale` — the prompt reports `reverted: true` and `artifact: "stale"`, so
  // repeating them is not contact. What is earned is that the revert was UNCONDITIONAL and already
  // done, which is what makes re-running it by hand the mistake this case is about.
  [/unconditional\w*|already (?:reverted|happened|done)|before the verdict|whatever the (?:code|exit)/i,
    'the answer never says the revert was unconditional and already done, so it cannot tell doing it again from doing it'],
  [/\blaz(?:y|ily)\b|\bonly when\b|\bnext (?:step|run)\b|\bdefer\w*|\bwhichever\b/i,
    'the answer never says the rebuild is deferred to whatever next needs the server'],
  [/exit\s*15\b|\brefus\w*/i,
    'the marker is never honoured — audit and film refuse with exit 15 while it stands, and an unread marker changes nothing'],
  [/step ?8|hygiene/i,
    'the answer never reaches Step 8, where stopping a stale server is what makes the common case free'],
  [/\bstops?\b|\bstopped\b|\bkill\b/i,
    'the answer never stops the preview server, so the stale artifact is never disposed of'],
  [/reuse|unchanged tree|tree (?:looks|is) unchanged|fingerprint/i,
    'the answer never says why a marker is needed — the reuse check cannot see an artifact out of step with a restored tree'],
  [/preview server:|completion report|\breport\b/i,
    'the artifact state never reaches the report, so a reader cannot tell whether the build matches the source'],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the revert is immediate, the artifact is marked stale, and the rebuild is left to whatever next needs the server');
