#!/usr/bin/env node
// Judge: the proof-run COMMAND must carry no --workers flag (ADR 0017).
// Naming the flag in prose to explain its absence is correct and must pass, which is
// why this cannot be an output_contains rule: the assertion is positional, not lexical.
// Reads $EVAL_FINAL_MESSAGE (skill-up script-judge contract). Exit 0 = PASS.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
const blocks = [...text.matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/g)].map((m) => m[1]);
const runs = blocks.filter((b) => /playwright test/.test(b));

if (runs.length === 0) {
  console.error('FAIL: no fenced block containing `playwright test` — nothing to judge');
  process.exit(1);
}
const offenders = runs.filter((b) => /--workers/.test(b));
if (offenders.length) {
  console.error('FAIL: --workers present in the proof-run command:');
  for (const b of offenders) {
    for (const line of b.split('\n')) if (line.includes('--workers')) console.error('   ' + line.trim());
  }
  process.exit(1);
}
// Positive half: the command must still be the proof-run shape.
const need = ['PW_PROVE_CLIP=1', 'PW_PROVE_W', 'PW_PROVE_H', '--config', '--project=chromium'];
const missing = need.filter((n) => !runs.some((b) => b.includes(n)));
if (missing.length) {
  console.error('FAIL: proof-run command missing: ' + missing.join(', '));
  process.exit(1);
}
console.log('PASS: no --workers in the command; proof-run shape intact');
