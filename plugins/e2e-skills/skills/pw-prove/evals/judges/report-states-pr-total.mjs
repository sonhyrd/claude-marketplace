#!/usr/bin/env node
// Judge (case-63): the completion report's `ACs:` line states the PR's total, not the run's delta.
//
// SKILL.md Step 8 › completion report + report invariant. A PR proven across several runs accreted
// 13 ACs; this run wrote 3 scenarios and re-filmed 10 carried ones. The line must carry THREE
// numbers — new, carried, total — because the two-number shape `3 of 13` is what let a run's delta
// (`3 of 7`) be read as the PR's total, and no reader could tell the difference.
//
// The must-PASS twin names the delta ("3 new") in order to distinguish it from the total, so a
// judge keyed on the bare substring "3" would pass the very answer this case exists to fail.
// Reads $EVAL_FINAL_MESSAGE, or a path argument when triaging one captured answer by hand.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

// The report line, wherever it sits — a fenced skeleton, a table row, or bare prose.
const acLines = text
  .split(/\n/)
  .map((l) => l.replace(/^[\s>|*+-]*/, '').trim())
  .filter((l) => /^ACs\b/i.test(l));

if (acLines.length === 0) {
  console.error('FAIL: no `ACs:` line in the report — the run never states how much of the PR it proved');
  process.exit(1);
}

const has = (re) => acLines.some((l) => re.test(l));
const NEW = /(?:\b3\b[^\n]{0,24}\bnew\b|\bnew\b[^\n]{0,24}\b3\b)/i;
const CARRIED = /(?:\b10\b[^\n]{0,24}\bcarried\b|\bcarried\b[^\n]{0,24}\b10\b)/i;
const TOTAL = /(?:\b13\b[^\n]{0,24}\btotal\b|\btotal\b[^\n]{0,24}\b13\b|\bof\b\s*13\b)/i;

// The defect itself: a total taken from the run's delta rather than the Step-2 AC table.
const deltaTotal = acLines.find((l) => /(?:\bof\b|\/)\s*(?:3|7)\b(?![\d.])/i.test(l) && !/\b13\b/.test(l));
if (deltaTotal) {
  console.error("FAIL: the total is the run's delta, not the PR's AC count: " + deltaTotal);
  process.exit(1);
}

const missing = [];
if (!has(NEW)) missing.push('the 3 scenarios this run wrote, labelled as new');
if (!has(CARRIED)) missing.push('the 10 scenarios carried from earlier runs');
if (!has(TOTAL)) missing.push("the PR's total of 13 ACs");
if (missing.length) {
  console.error('FAIL: the `ACs:` line omits ' + missing.join('; ') + ':');
  for (const l of acLines.slice(0, 3)) console.error('   ' + l);
  process.exit(1);
}

console.log('PASS: the ACs line states 3 new, 10 carried, 13 total — the run\'s delta is distinguishable from the PR');
