// ptg-run.mjs — the run ledger (issue #5): every shipped-script invocation leaves ONE
// machine-readable record, so a session transcript alone reconstructs the run and "audit the
// skill" is reading one file instead of mining transcripts.
//
// All five shipped scripts emit through this ONE helper: the four sibling PTG scripts import it
// directly; scan.mjs imports it best-effort across the skill boundary (a standalone scanner copy
// without this sibling skill still scans — it just leaves no record).
//
// On process exit the hook writes `PTG_RUN {json}` — schema version, script, phase, skill
// name/version (SKILL.md frontmatter), skill commit (best-effort), duration ms, exit code — to
// stdout, and appends the same line to the operator's ledger: ~/.ptg/ledger.jsonl, or $PTG_LEDGER
// so tests never touch the real one. Both writes are best-effort: telemetry must NEVER fail a run.
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention. Never writes into a
// target repo — the ledger lives in the operator's home directory.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 1;

// Skill identity comes from the INSTALLED files, not this repo: version from the SKILL.md
// frontmatter two levels up from the calling script, commit from `git -C <skill-dir>` — which is
// 'unknown' in a copied install, and that is fine: commit is best-effort by contract, version is
// the field stale-install drift detection leans on.
export function skillInfo(scriptUrl) {
  const skillDir = path.dirname(path.dirname(fileURLToPath(scriptUrl)));
  let version = 'unknown';
  try {
    const m = fs
      .readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
      .match(/^\s*version:\s*["']?([^"'\n]+?)["']?\s*$/m);
    if (m) version = m[1];
  } catch {
    /* no SKILL.md next to an ad-hoc copy */
  }
  let commit = 'unknown';
  try {
    const r = spawnSync('git', ['-C', skillDir, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    });
    if (r.status === 0) commit = r.stdout.trim();
  } catch {
    /* git absent */
  }
  return { skill: path.basename(skillDir), version, commit };
}

// Call ONCE at the top of a shipped script, BEFORE any argument validation, so even a usage-error
// exit leaves a record. Returns the skill info so preflight can print its version banner without
// resolving it twice.
export function ptgRun(scriptUrl, phase) {
  const start = Date.now();
  const info = skillInfo(scriptUrl);
  process.on('exit', (code) => {
    const line = `PTG_RUN ${JSON.stringify({
      schema: SCHEMA,
      script: path.basename(fileURLToPath(scriptUrl)),
      phase,
      skill: info.skill,
      version: info.version,
      commit: info.commit,
      // ts is not in the ticket's field list, but an undated ledger cannot answer "which week" —
      // the weekly audit (spec #4, user story 21) is the ledger's whole reason to exist.
      ts: new Date(start).toISOString(),
      duration_ms: Date.now() - start,
      exit: code,
    })}\n`;
    // fs.writeSync(1), not process.stdout.write: inside an 'exit' handler only synchronous I/O is
    // guaranteed to land, and stdout.write is async when stdout is a pipe.
    try {
      fs.writeSync(1, line);
    } catch {
      /* stdout closed — still try the ledger */
    }
    try {
      const ledger = process.env.PTG_LEDGER || path.join(os.homedir(), '.ptg', 'ledger.jsonl');
      fs.mkdirSync(path.dirname(ledger), { recursive: true });
      fs.appendFileSync(ledger, line);
    } catch {
      /* a ledger write failure must never fail a run */
    }
  });
  return info;
}
