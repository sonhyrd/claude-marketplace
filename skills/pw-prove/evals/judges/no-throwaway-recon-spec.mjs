#!/usr/bin/env node
// Judge (case-15): recon goes through probe.mjs — the test runner is not a REPL.
//
// The old rule was `failure: output_contains` over `_recon.spec.ts` and `run it through npx playwright
// test`. A correct refusal has to NAME the throwaway spec it is refusing, so the substring rule
// red-flagged the right answer.
//
// The repair is artifact-shaped, in the shape `no-workers-in-command.mjs` already uses: the negative
// applies to the EMITTED BLOCK. A fenced block that writes a `_recon.spec.ts` or runs one through
// `npx playwright test` is the defect; prose naming either in order to reject it is not.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

// Language tag kept: a ```ts block quoting the teammate's suggested spec is the answer showing what
// it refuses, while a shell block is the answer running something. Judging them alike would rebuild
// the defect this judge exists to remove.
const blocks = [...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].trim().toLowerCase(), body: m[2] }));
const shellBlocks = blocks.filter((b) => b.lang === '' || /^(?:bash|sh|shell|zsh|console|shell-session)$/.test(b.lang));

function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    // Double quotes only. An apostrophe is not a quote delimiter in English prose: pairing
    // "doesn't" with "you're" swallowed the negation between them and turned a correct answer red.
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|decline\w*|forbidden|rule[ds]? out)\b/i;
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

// --- the answer reaches for the probe, and knows what a browserless host does --------------------------
const checks = [
  [/probe\.mjs/, 'the answer never reaches for probe.mjs'],
  [/exit 2/i, 'the answer never says the probe refuses cleanly (exit 2) in a browserless environment'],
  [/(?:source read|reading the source|heal loop|fall(?:s|ing)? back)/i, 'the answer never names the browserless fallback (source reading + the heal loop)'],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

// --- and emits no throwaway spec ------------------------------------------------------------------------
// A shell block that runs the test runner, or any block that CREATES a throwaway spec file, is the
// answer taking the route it was asked to refuse.
const THROWAWAY = [
  /npx\s+playwright\s+test/,
  /(?:cat\s*>|tee|touch|printf[^\n]*>)\s*[^\n]*(?:_recon\.spec\.ts|zz-debug)/,
];
const emitted = [];
for (const b of shellBlocks) for (const t of THROWAWAY) {
  const line = b.body.split('\n').find((l) => t.test(l));
  if (line) emitted.push(line.trim());
}
if (emitted.length) {
  console.error('FAIL: the answer emits a throwaway recon spec or runs one through the test runner:');
  for (const l of [...new Set(emitted)].slice(0, 3)) console.error('   ' + l);
  process.exit(1);
}

const bad = offenders(text, [
  /\bwrite\b[^\n]{0,40}\bthrowaway spec\b/i,
  /\b(?:write|create|add)\b[^\n]{0,40}_recon\.spec\.ts/i,
  /\brun (?:it|that|the spec) through npx playwright test\b/i,
  /\b(?:float|install)\w*\b[^\n]{0,40}\bplaywright\b/i,
]);
if (bad.length) {
  console.error('FAIL: the answer commits to the throwaway-spec route:');
  for (const s of bad.slice(0, 3)) console.error('   ' + s);
  process.exit(1);
}

console.log('PASS: recon goes through probe.mjs; no throwaway spec is emitted or run');
