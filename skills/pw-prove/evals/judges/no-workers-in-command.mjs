#!/usr/bin/env node
// Judge (case-60): the filming run is `proof-run.mjs film`, and it carries no --workers flag (ADR 0017).
//
// Naming the flag in prose to explain its absence is correct and must pass, which is why this cannot
// be an output_contains rule: the assertion is positional, not lexical. The negative is scoped to the
// EMITTED COMMAND for the same reason.
//
// Re-derived by #150 against the prompt the Step-7 rewrite left behind. Before that rewrite the
// filming run was a raw `npx playwright test --config … --project=chromium --reporter=html` line the
// agent assembled, and this judge REQUIRED that shape — so once Step 7 replaced it with the film
// verb, a correct answer failed here for emitting the command the body now prescribes. Two
// assertions were re-derived rather than inherited:
//   - the positive shape is the film verb's flags, not the runner's. PW_PROVE_CLIP and
//     PW_PROVE_W/PW_PROVE_H are no longer on the command line at all — the verb sets them from
//     `--verdict` — so demanding them was demanding a defect.
//   - a raw `playwright test` block for the filming run became a NEW negative. Step 7 says there is
//     no raw-runner fallback anywhere in it, so emitting one is the drift the removal exists to
//     prevent, not a harmless equivalent.
// The `--workers` assertion itself is unchanged and is still the case's centre.
//
// Reads $EVAL_FINAL_MESSAGE (skill-up script-judge contract). Exit 0 = PASS.
import { readFileSync } from 'node:fs';

const text = process.env.EVAL_FINAL_MESSAGE ?? (process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '');
if (!text.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no path argument — nothing to judge');
  process.exit(1);
}

// Every fence is matched WITH its language tag, then filtered. Matching only shell fences leaves
// the closing ``` of a ```ts block reading as the opener of the next one, which swallows the prose
// between them and judges it as a command.
const blocks = [...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)]
  .filter((m) => m[1].trim() === '' || /^(?:bash|sh|shell|zsh|console|shell-session)$/i.test(m[1].trim()))
  .map((m) => m[2]);
// --- and no raw runner invocation standing in for the verb ---------------------------------------
// The ONE sanctioned raw invocation in Step 7 is the serialised diagnostic, which is not this
// question and would carry a worker override anyway. Any other `playwright test` block here is the
// second copy the rewrite deleted. Checked FIRST, because an answer that emitted one has also
// emitted no film verb, and "you assembled the runner yourself" is the more useful verdict than
// "you emitted nothing".
const raw = blocks.filter((b) => /playwright\s+test\b/.test(b) && !/proof-run\.mjs/.test(b));
if (raw.length) {
  console.error('FAIL: a raw `playwright test` invocation stands in for the film verb — Step 7 has no raw-runner fallback:');
  for (const b of raw.slice(0, 2)) console.error('   ' + b.trim().split('\n')[0]);
  process.exit(1);
}

const films = blocks.filter((b) => /proof-run\.mjs["']?\s+film\b/.test(b));

if (films.length === 0) {
  console.error('FAIL: no fenced block invoking `proof-run.mjs film` — the filming run IS that verb, and Step 7 keeps no raw fallback');
  process.exit(1);
}

// --- no worker override, in any spelling ---------------------------------------------------------
const offenders = films.filter((b) => /--workers\b|(?:^|\s)-j(?:\s|=)/.test(b));
if (offenders.length) {
  console.error('FAIL: a worker override is present in the filming command:');
  for (const b of offenders) {
    for (const line of b.split('\n')) if (/--workers\b|(?:^|\s)-j(?:\s|=)/.test(line)) console.error('   ' + line.trim());
  }
  process.exit(1);
}

// --- the positive half: the film verb's own shape -------------------------------------------------
const emitted = films.join('\n');
const need = [
  [/--config\b/, 'the film verb is invoked without --config, so it has no proof config to film through'],
  [/--test-dir\b/, 'the film verb is invoked without --test-dir, so the spec set cannot resolve'],
  [/--base\b/, 'the film verb is invoked without --base, so the merge base the spec set comes from is unstated'],
  [/--project-config\b/, "the film verb is invoked without --project-config, so the fidelity precondition has no project config to read"],
  [/--verdict\b/, 'the film verb is invoked without --verdict, so the effective viewport is not the one Step 4 decided'],
  [/PW_PROVE_HAR\s*=\s*\S/, 'PW_PROVE_HAR is not carried inline — the film verb has no bind phase, and unset here every recorded read aborts on the run that gets published'],
];
const missing = need.filter(([re]) => !re.test(emitted));
if (missing.length) {
  console.error('FAIL: ' + missing.map(([, why]) => why).join('; '));
  process.exit(1);
}

console.log('PASS: the filming run is the film verb, with no worker override and no raw-runner fallback');
