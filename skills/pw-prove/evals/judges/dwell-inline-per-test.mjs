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
// #71 found four more of that same class in this one file, each hidden behind the one in front of
// it, and each is annotated where it is fixed: block-versus-turn (the segmentation below),
// clause-versus-actor (`narrated`), phrase-versus-paraphrase (the `collapse` pattern) and
// substring-versus-verdict (`HYPOTHETICAL`). Two of the four ran the OTHER way and passed a
// skill-free baseline arm, which would have retired the case for zero uplift. When you touch a rule
// here, add both halves of a fixture — the offence and the correct answer that names it to reject it.
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

// A turn is a CONVERSATION turn, not an assistant text block. Since #60 gave every behavior case a
// placement line, the agent's first assistant block is routinely a one-line preamble — "I'll load
// the skill first." — emitted before it calls the Skill tool, and the substantive answer arrives in
// a later block of the SAME turn. Indexing blocks read that preamble as turn 1, so the turn-1 check
// failed on every run of a case whose answer was correct in all three iterations (#71).
//
// This is the sixth appearance of one defect: a judge matching on the wrong unit — lexical (#59),
// positional (#63), under a list header (#66), across a hard line wrap (#64), title-versus-body
// (#77), and here block-versus-turn. So group first, judge second.
//
// Three groupings, in order of trust:
//   1. the `turn` field, where skill-up's own serialization provides one ({role, content, turn});
//   2. `promptId`, which a Claude Code session file stamps on EVERY record belonging to one user
//      prompt — the conversation turn by construction, and the shape you get triaging a retained
//      transcript by hand;
//   3. otherwise, the count of USER PROMPTS seen so far.
// Under (3) two record kinds wear `role: "user"` without being a prompt, and either one would split
// a turn in half and leave the preamble alone in its own: a tool result, and the SKILL INJECTION —
// which arrives as user text ("Base directory for this skill: …" followed by the whole body) marked
// `isMeta`. Both are excluded.
function isUserPrompt(rec, msg) {
  if (rec?.isMeta === true || msg?.isMeta === true) return false;
  const content = msg?.content;
  if (typeof content === 'string') return content.trim() !== '';
  if (!Array.isArray(content)) return false;
  if (content.some((b) => b?.type === 'tool_result')) return false;
  const t = textOf(content);
  return t.trim() !== '' && !/^Base directory for this skill:|<(?:skill|system-reminder|command-name|local-command)\b/i.test(t.trim());
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
  const groups = new Map();
  const order = [];
  let userSeen = 0;
  for (const rec of records) {
    const msg = rec?.message ?? rec;
    if (msg?.role === 'user') {
      if (isUserPrompt(rec, msg)) userSeen += 1;
      continue;
    }
    if (msg?.role !== 'assistant') continue;
    const t = textOf(msg.content);
    if (!t.trim()) continue;
    const declared = rec?.turn ?? msg?.turn ?? rec?.promptId ?? msg?.promptId;
    const key = declared === undefined || declared === null ? `#${userSeen}` : `t${declared}`;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(t);
  }
  return order.map((k) => groups.get(k).join('\n\n'));
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
// The verdict has to be one the answerer REACHES, so it is read per sentence and a hypothetical is
// not one. A bare substring over the whole turn scored a skill-free baseline arm a PASS on "If I ran
// something and told you it passed, I'd be inventing the result" — a sentence that declines to give
// a verdict, matched on the word `passed` inside it (#71). Sentences are split off the RAW turn
// rather than commitments(), because a correct answer often writes the verdict in backticks and
// commitments() strips those spans.
const VERDICT = /(?:exit 0|exits 0|passes|passed|already satisfies|satisfies the audit|no change)/i;
const HYPOTHETICAL = /\bif (?:I|we|it|that|this|you)\b|\bI['’]d be\b|\bwe['’]d be\b|\bhypothetical\w*\b|\bspeculat\w+\b|\bsuppose\b|\bimagin\w+\b/i;
const verdicts = last
  .split(/(?<=[.!?;])\s+|\n+/)
  .map((s) => s.trim())
  .filter((s) => VERDICT.test(s) && !HYPOTHETICAL.test(s));
if (verdicts.length === 0) {
  fail('the two-line dwell turn never reaches a pass verdict (exit 0 / already satisfies / no change)');
}
// A sentence that REPORTS what earlier runs or other agents already did is a citation, not a plan.
// `clip-fidelity.mjs`'s own doc comment records this exact history — the unbraced branch once
// searched from the newline, "eleven sessions hit it and four agents worked around it by joining the
// two lines" — and a correct answer quotes that history in order to name the move it is avoiding
// ("That's the move to avoid here"). Two of the three iterations in the #71 re-characterization did
// precisely that and were red-flagged for it.
//
// So this is the #59 defect one unit further out: the offending clause is scoped by its ACTOR, not
// by the clause. NEGATED cannot reach it — the rejection lives in the *next* sentence — and
// REJECTION_HEADER cannot either, since neither line is a list item. Kept judge-local and kept
// deliberately narrow: it excuses only a counted group of other agents/sessions/runs/versions, and
// only when the answerer is not also the subject, so "I joined the two lines" is still an offence.
// It is applied AFTER offenders() rather than inside it, because commitments()/offenders() are one
// text copied across every judgment-call judge and must stay byte-identical (judges/README.md).
const THIRD_PARTY_ACTOR = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|some|many|other|others|earlier|previous|prior|past)\s+(?:agents?|sessions?|runs?|iterations?|users?|people|versions?)\b/i;
const FIRST_PERSON = /\b(?:I|we|my|our|us|let['’]s)\b/;
const narrated = (s) => THIRD_PARTY_ACTOR.test(s) && !FIRST_PERSON.test(s);

// The mirror image, and the same #71 baseline arm found it: NEGATED excuses any sentence carrying
// `would`, which is there for "reformatting it would be churn" — a rejection. But "I would resolve
// that by … collapsing each pair onto one line" is a first-person conditional COMMITMENT wearing the
// same word, and the excuse swallowed it whole. So a churn phrase inside a stated intent by the
// ANSWERER, with no refusal anywhere in the sentence, is an offence whatever NEGATED says. Judge-
// local for the same reason as `narrated`: offenders() is one text copied across every judge.
// A refusal binds its own CLAUSE, not the whole sentence. The recorded arm wrote "I'd resolve that
// by reading the audit source rather than guessing, then either collapse each pair onto one line or
// brace the block" — the `rather than` rejects *guessing*, and the churn sits in a clause after the
// comma. Testing the refusal over the whole sentence hands the answer an excuse it never claimed,
// which is #59's scope error one level down. So the refusal is read from the clause the churn phrase
// actually lands in, and a sentence with no clause break keeps the sentence-wide reading — that is
// what keeps "I would not reformat it" and "I'd leave it rather than collapse the lines" excused.
const INTENT = /\b(?:I|we)\s*(?:['’]d|['’]ll|\s+would|\s+will|\s+am going to|\s+are going to|\s+plan to|\s+intend to)\b/i;
const REFUSAL = /\b(?:not|never|no|nothing|none|rather than|instead of|without|avoid\w*|refus\w*|reject\w*|declin\w*|unnecessary|already|don['’]?t|doesn['’]?t|won['’]?t|wouldn['’]?t|shouldn['’]?t|can['’]?t|cannot)\b/i;
const clauseOf = (s, p) => {
  const m = p.exec(s);
  if (!m) return s;
  const before = s.slice(0, m.index);
  const cut = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf(' — '));
  return cut === -1 ? s : s.slice(cut);
};
const intended = (s, p) => INTENT.test(s) && !narrated(s) && !REFUSAL.test(clauseOf(s, p));

const CHURN = [
  /\breformat(?:ting|s|ted)?\b/i,
  // The object between the verb and the target is free text. `collapse (?:it )?onto one line` only
  // matched a one-word object, and the #71 baseline arm wrote "either collapse each pair onto one
  // line or brace the block" — the churn this case exists to catch, worded three words wider, which
  // scored the skill-free arm a PASS and would have retired the case for zero uplift.
  /\bcollaps(?:e|es|ing|ed)\b[^.!?;]{0,40}?\b(?:onto|into|on|to)\s+(?:one|a single|a|the same)\s+line\b/i,
  /\bput it on a single line\b/i,
  /\bjoin(?:ing)? (?:it|the (?:two )?lines)\b/i,
];

const stated = commitments(last)
  .split(/(?<=[.!?;])\s+|\n+/)
  .map((s) => s.trim())
  .filter((s) => s && CHURN.some((p) => p.test(s) && intended(s, p)));

const churn = [...new Set([...offenders(last, CHURN).filter((s) => !narrated(s)), ...stated])];
if (churn.length) fail('the two-line dwell turn proposes reformatting a dwell that already passes', churn);

console.log(
  first
    ? 'PASS: turn 1 inlines the hoisted dwell; turn 2 accepts the two-line dwell and reformats nothing'
    : 'PASS: the two-line dwell is accepted and nothing is reformatted (turn 1 unjudged — no transcript)',
);
