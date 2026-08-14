#!/usr/bin/env node
// Judge (b32): the Step-6 dwell must be inline in each test() — and a two-line dwell already passes.
//
// Turn 1 is the hit (a hoisted helper is exit 2; the fix is to inline it, not to conclude there is
// no dwell). Turn 2 is the JUSTIFIED twin: the dwell is already inline, merely wrapped across two
// lines, so the audit passes and reformatting it to appease the check is the false positive.
//
// The old rule was `turn_response_not_contains: reformat` on turn 2. The correct answer for turn 2
// is "the audit exits 0 — there is nothing to reformat", and that is the phrase that failed the case
// in the 2026-08-13 run. A negative assertion cannot be a bare substring over a sentence whose whole
// job is to reject the option it names.
//
// Two inputs, because this case has two turns and $EVAL_FINAL_MESSAGE carries only the last one:
//   $EVAL_TRANSCRIPT_PATH — the serialized session (skill-up hands script judges this under
//                           `environment.type: none`); both assistant turns are read from it.
//   $EVAL_FINAL_MESSAGE   — fallback; judged as the LAST turn, with turn 1 reported unjudged.
import { readFileSync, existsSync } from 'node:fs';

// --- input -------------------------------------------------------------------------------------------
const transcriptPath = process.env.EVAL_TRANSCRIPT_PATH || '';
const finalMessage = process.env.EVAL_FINAL_MESSAGE ?? '';
const argPath = process.argv[2] || '';

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b) => b?.type === 'text' || typeof b === 'string').map((b) => (typeof b === 'string' ? b : b.text ?? '')).join('\n');
  return '';
}

function assistantTurns(path) {
  const raw = readFileSync(path, 'utf8');
  let records;
  if (raw.trimStart().startsWith('[')) {
    records = JSON.parse(raw);
  } else {
    records = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line)); } catch { /* not a record */ }
    }
  }
  const turns = [];
  for (const rec of records) {
    const msg = rec?.message ?? rec;
    if (msg?.role !== 'assistant') continue;
    const t = textOf(msg.content);
    if (t.trim()) turns.push(t);
  }
  return turns;
}

let turns = [];
const path = transcriptPath || argPath;
if (path) {
  if (!existsSync(path)) {
    console.error(`FAIL: transcript does not exist: ${path}`);
    process.exit(1);
  }
  try {
    turns = assistantTurns(path);
  } catch (e) {
    console.error(`FAIL: could not read the transcript at ${path}: ${e.message}`);
    process.exit(1);
  }
  if (turns.length === 0) {
    console.error(`FAIL: ${path} holds no assistant turns — nothing to judge`);
    process.exit(1);
  }
} else if (finalMessage.trim()) {
  turns = [finalMessage];
} else {
  console.error('FAIL: no $EVAL_TRANSCRIPT_PATH and no $EVAL_FINAL_MESSAGE — nothing to judge');
  process.exit(1);
}

// --- the shared shape ---------------------------------------------------------------------------------
function commitments(t) {
  return t
    .replace(/```[^\n]*\n[\s\S]*?```/g, '\n')
    .replace(/^\s*>.*$/gm, '')
    .replace(/`[^`\n]*`/g, ' ')
    // Double quotes only. An apostrophe is not a quote delimiter in English prose: pairing
    // "doesn't" with "you're" swallowed the negation between them and turned a correct answer red.
    .replace(/[“"]([^"“”\n]{0,400})[”"]/g, ' ');
}
const NEGATED = /\b(?:would|risks?|worse|out of scope|not|never|no|nothing|none|nor|neither|don't|doesn't|didn't|cannot|can't|won't|wouldn't|shouldn't|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|decline\w*|forbidden|unnecessary|already)\b/i;
function offenders(t, phrases) {
  const out = [];
  for (const s of commitments(t).split(/(?<=[.!?;])\s+|\n+/)) {
    const line = s.trim();
    if (!line || NEGATED.test(line)) continue;
    for (const p of phrases) if (p.test(line)) out.push(line);
  }
  return [...new Set(out)];
}

const fail = (why, lines = []) => {
  console.error('FAIL: ' + why);
  for (const l of lines.slice(0, 3)) console.error('   ' + l);
  process.exit(1);
};

const last = turns[turns.length - 1];
const first = turns.length >= 2 ? turns[0] : null;

// --- turn 1: inline it, do not conclude there is none --------------------------------------------------
if (first) {
  // The wrong conclusion is checked first, because it is the more specific finding: an answer that
  // decides there is no dwell usually never mentions inlining either, and "no dwell here" is the
  // diagnosis worth reporting.
  //
  // Not routed through offenders(): this claim is negative by construction, so the negation filter
  // would swallow every instance of it. That filter belongs on options an answer might REJECT by
  // naming; a wrong conclusion is not one of those.
  const denied = commitments(first)
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\bthere is no dwell\b|\bno dwell (?:exists|is present)\b/i.test(s));
  if (denied.length) fail('turn 1 concludes there is no dwell instead of inlining the hoisted one', denied);
  if (!/(?:inline|in each test|into every test|in every test|per test\(\))/i.test(first)) {
    fail('turn 1 never says the dwell must be inlined into each test() body');
  }
}

// --- turn 2: it already passes, and nothing gets reformatted -------------------------------------------
if (!/(?:exit 0|exits 0|passes|passed|already satisfies|satisfies the audit|no change)/i.test(last)) {
  fail('the two-line dwell turn never reaches a pass verdict (exit 0 / already satisfies / no change)');
}
const churn = offenders(last, [
  /\breformat(?:ting|s|ted)?\b/i,
  /\bcollapse (?:it )?onto one line\b/i,
  /\bput it on a single line\b/i,
  /\bjoin(?:ing)? (?:it|the (?:two )?lines)\b/i,
]);
if (churn.length) fail('the two-line dwell turn proposes reformatting a dwell that already passes', churn);

console.log(
  first
    ? 'PASS: turn 1 inlines the hoisted dwell; turn 2 accepts the two-line dwell and reformats nothing'
    : 'PASS: the two-line dwell is accepted and nothing is reformatted (turn 1 unjudged — no transcript)',
);
