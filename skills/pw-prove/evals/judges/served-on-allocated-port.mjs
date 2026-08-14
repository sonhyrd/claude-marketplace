#!/usr/bin/env node
// Judge (w01, WET): the server the run actually brought up, read off what the run left behind.
//
// Every other judge here reads the model's prose. This one reads the RUN — `serve.log`, which only
// exists because a real `node script/serve-ssr.mjs` process wrote it, and `serve-summary.txt`, which
// only carries `SERVE=ok` because preflight.mjs reached an origin that answered. The fixture's
// packaged serve command hard-codes `PORT=4100`; SKILL.md Step 3 bullet 1 says such a command is
// "never invoked verbatim — read the command it runs and supply `PORT` yourself". A run that obeyed
// that leaves a log announcing some OTHER port, and a run that did not leaves 4100. That is the one
// bit its dry twin `case-50` cannot observe: case-50 grades an answer about a pasted log.
//
// The workspace root is the judge's cwd under skill-up (`judge.type: script` runs in the case
// workspace). $PWPROVE_JUDGE_ROOT overrides it, which is how the fixture pairs in
// scripts/ci/test-eval-judges.sh point this judge at a recorded workspace instead of the repo.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A judge with no input must never report a pass: with neither variable set, skill-up ran nothing
// and there is no run to read. The artifacts are the evidence, but the input is the proof there
// was a run at all.
const finalMessage = process.env.EVAL_FINAL_MESSAGE ?? '';
const transcript = process.env.EVAL_TRANSCRIPT_PATH ?? '';
if (!finalMessage.trim() && !transcript.trim()) {
  console.error('FAIL: no $EVAL_FINAL_MESSAGE and no $EVAL_TRANSCRIPT_PATH — there is no run to judge');
  process.exit(1);
}

const root = process.env.PWPROVE_JUDGE_ROOT ?? process.cwd();
const read = (name) => {
  const p = join(root, name);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

// The fixture's own serve script prints `ssr server listening on http://localhost:<port>`, and the
// port in it is `process.env.PORT || 4100`. Any framework's announcement has the same shape, so the
// match is on the origin rather than on that sentence.
const ANNOUNCED = /\b(?:listening|ready|local|server)\b[^\n]{0,40}?\bhttps?:\/\/(?:\[[0-9a-f:]+\]|[a-z0-9.-]+):(\d{2,5})\b/i;
const HARD_CODED_PORT = 4100;

const log = read('serve.log');
if (log === null || !log.trim()) {
  console.error('FAIL: no serve.log in the workspace — nothing was brought up, so there is no origin to read');
  process.exit(1);
}
const announced = ANNOUNCED.exec(log);
if (!announced) {
  console.error('FAIL: serve.log names no listening origin — the preview server never announced itself:');
  for (const line of log.trim().split('\n').slice(-3)) console.error('   ' + line);
  process.exit(1);
}
const servedPort = Number(announced[1]);

if (servedPort === HARD_CODED_PORT) {
  console.error(
    `FAIL: the server came up on ${HARD_CODED_PORT} — the packaged serve command was invoked verbatim ` +
      'rather than run with a PORT the agent allocated',
  );
  process.exit(1);
}

const summary = read('serve-summary.txt');
if (summary === null || !summary.trim()) {
  console.error('FAIL: no serve-summary.txt in the workspace — the serve phase of the bring-up gate was never run');
  process.exit(1);
}
if (!/^SERVE=ok$/m.test(summary)) {
  const verdict = /^SERVE=\S+/m.exec(summary);
  console.error(`FAIL: the serve phase did not pass (${verdict ? verdict[0] : 'no SERVE= line at all'})`);
  process.exit(1);
}

const baseUrl = /^BASE_URL=(\S+)/m.exec(summary);
if (!baseUrl) {
  console.error('FAIL: the serve summary carries no BASE_URL= line — the effective origin was never recorded');
  process.exit(1);
}
const carriedPort = Number((/:(\d{2,5})(?:\/|$)/.exec(baseUrl[1]) ?? [])[1]);
if (carriedPort !== servedPort) {
  console.error(
    `FAIL: the recorded origin ${baseUrl[1]} does not carry the port the server answered on (${servedPort}) — ` +
      'the origin that answered is the one every later step reads',
  );
  process.exit(1);
}

console.log(`PASS: the run served the built target on port ${servedPort}, not the packaged ${HARD_CODED_PORT},`);
console.log(`      and carried that exact origin forward as ${baseUrl[1]} with SERVE=ok.`);
