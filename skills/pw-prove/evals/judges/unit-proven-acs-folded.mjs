#!/usr/bin/env node
// Judge (case-29): ACs a unit test in the diff already proves are folded, with their row kept.
//
// SKILL.md Step 2 item 6: "read the test files in it ... Fold those into the ONE scenario that proves
// the wiring ... Folding is never silent. The folded AC keeps its row with 'already covered: <test
// file>' in the Proven-by column."
//
// THE UNIT IS A TABLE ROW, NOT A SENTENCE (#77). A folded AC and an unfolded one are the same
// English: both name trimming, dropping empty locales and key removal. They differ only in what the
// AC's row carries in the **Proven-by** column — `already covered: <test file>` or an E2E scenario.
// The previous rule fired on scenario TITLES (`/\bscenario\b[^\n]{0,60}\btrim\w*/i` and friends) and
// so red-flagged the correct answer three times out of three in the 2026-08-14 run: the surviving
// wiring scenario is *supposed* to name the behaviour, because "the UI reaches the function and its
// output leaves on the wire" is trimming, observed at the browser layer. A heading states the
// subject; the table two lines below settles the question. So this judge reads the table.
//
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

// --- the table reader -----------------------------------------------------------------------------
// A pipe table is a run of consecutive `|`-led lines. Cells lose their inline code and emphasis, so
// `already covered: \`tests/unit/customScripts.test.ts\`` and its unbackticked twin are one fact.
const cells = (line) =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.replace(/[`*_~]/g, ' ').replace(/\s+/g, ' ').trim());

function tables(t) {
  const out = [];
  let cur = null;
  for (const raw of t.split(/\n/)) {
    const line = raw.trim();
    if (line.startsWith('|')) {
      (cur ??= []).push(line);
      continue;
    }
    if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

const isSeparator = (row) => row.every((c) => /^:?-{2,}:?$/.test(c) || c === '');

// SKILL.md's own worked example wraps a Proven-by cell across two table lines — `already covered:` on
// one, the test file on the next, every other cell blank. That continuation row is the SAME AC, so a
// reader that treats it as a row of its own reads the file name as an AC with no Proven-by (the #64
// line-wrap defect, one layer down). Rows carrying a single non-empty cell are merged upward.
function rowsOf(lines) {
  const parsed = lines.map(cells).filter((r) => !isSeparator(r));
  if (parsed.length < 2) return null;
  const header = parsed[0];
  const provenBy = header.findIndex((h) => /proven\s*[-\s]?by/i.test(h));
  if (provenBy < 0) return null;
  let ac = header.findIndex((h) => /^ac\b|acceptance/i.test(h));
  if (ac < 0) ac = 0;
  const rows = [];
  for (const row of parsed.slice(1)) {
    const filled = row.filter((c) => c !== '').length;
    if (filled === 1 && rows.length) {
      const prev = rows[rows.length - 1];
      row.forEach((c, i) => { if (c) prev.cells[i] = (prev.cells[i] + ' ' + c).trim(); });
      prev.ac = prev.cells[ac] ?? '';
      prev.proven = prev.cells[provenBy] ?? '';
      continue;
    }
    if (!filled) continue;
    rows.push({ cells: row.slice(), ac: row[ac] ?? '', proven: row[provenBy] ?? '' });
  }
  return rows.length ? rows : null;
}

const acRows = tables(text).map(rowsOf).filter(Boolean).flat();
if (!acRows.length) {
  console.error('FAIL: the answer produces no AC table with a Proven-by column, so whether an AC was folded cannot be read off the table at all');
  process.exit(1);
}

const FOLDED = /already covered/i;
const COVERING_TEST = /customScripts\.test\.ts/i;
const BROWSER = /\b(?:e2e|scenario)\b/i;

// The three behaviours the diff's unit test proves. Each is looked up in the AC column; the verdict
// is taken from that row's Proven-by cell, never from a scenario title or any other prose.
const MATRIX = [
  ['whitespace is trimmed', /\btrim\w*|whitespace|padd\w+/i],
  ['empty locales are dropped', /(?:drop|remov|exclud|omit|prun|strip)\w*[^\n]{0,60}(?:empt|blank)|(?:empt|blank)\w*[^\n]{0,60}(?:drop|remov|exclud|omit|prun|strip)/i],
  ['an all-empty key is removed', /\bkeys?\b[^\n]{0,60}(?:remov|drop|delet|prun)|(?:remov|drop|delet|prun)\w*[^\n]{0,60}\bkeys?\b/i],
];

const failures = [];
for (const [name, re] of MATRIX) {
  const matching = acRows.filter((r) => re.test(r.ac));
  if (!matching.length) {
    failures.push(`the AC table has no row for ${name} — deleting a row is not folding`);
    continue;
  }
  const folded = matching.filter((r) => FOLDED.test(r.proven));
  if (!folded.length) {
    const proven = matching.map((r) => r.proven).filter(Boolean).join(' / ') || '(empty)';
    failures.push(
      BROWSER.test(proven)
        ? `${name} keeps a browser scenario in the Proven-by column [${proven}] instead of \`already covered:\` — a unit test already proves that matrix`
        : `no AC row for ${name} carries \`already covered:\` in the Proven-by column [${proven}], so the fold is silent`,
    );
    continue;
  }
  if (!folded.some((r) => COVERING_TEST.test(r.proven))) {
    failures.push(`the folded row for ${name} never names the test file that covers it in the Proven-by column`);
  }
}

// Everything folded and nothing left is the opposite failure: the fold exists to keep the ONE
// scenario that proves the wiring, so the table must still buy at least one browser scenario.
if (!acRows.some((r) => BROWSER.test(r.proven))) {
  failures.push('no AC row is proven by a browser scenario, so nothing is left to prove the wiring');
}

if (failures.length) {
  console.error('FAIL: the AC table does not fold the unit-proven matrix:');
  for (const f of failures) console.error('   ' + f);
  process.exit(1);
}

// The table settles the fold. These say the answer reached it by reading the diff rather than by
// luck, and that the browser-layer behaviours were named as the things that stay.
const checks = [
  [/customScripts\.test\.ts/, 'the answer never reads the unit test file the diff ships'],
  [/\bfold\w*/i, 'the answer never says it folds the unit-proven ACs'],
  [/buildUpsert/, 'the answer never names the pure function whose matrix is folded'],
  [/\bwir\w+/i, 'the answer never keeps the one scenario that proves the wiring'],
  [/\b(?:request|wire|network|payload|persist\w*|flag|DOM)\b/i, 'the answer never keeps the browser-layer behaviours a unit test cannot see as their own scenarios'],
];
const missing = checks.filter(([re]) => !re.test(text));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log(`PASS: every unit-proven AC row carries \`already covered:\` in the Proven-by column, over ${acRows.length} AC rows, with the wiring scenario kept`);
