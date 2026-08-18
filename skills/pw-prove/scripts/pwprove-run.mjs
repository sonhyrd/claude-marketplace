// pwprove-run.mjs — the run ledger: every shipped-script invocation leaves ONE
// machine-readable record, so a session transcript alone reconstructs the run and "audit the
// skill" is reading one file instead of mining transcripts.
//
// The shipped scripts emit through this ONE helper: the sibling pw-prove scripts import it directly.
//
// On process exit the hook writes `PWPROVE_RUN {json}` — schema version, script, phase, skill
// name/version (SKILL.md frontmatter), skill commit (best-effort), session id and its provenance,
// duration ms, exit code — to stdout, and appends the same line to the operator's ledger:
// ~/.ptg/ledger.jsonl, or $PWPROVE_LEDGER so tests never touch the real one. Both writes are
// best-effort: telemetry must NEVER fail a run.
//
// Zero dependencies, Node stdlib only, per the shipped-scripts convention. Never writes into a
// target repo — the ledger lives in the operator's home directory (the session nonce in $TMPDIR).
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// schema 2 adds session/session_src. Schema-1 lines in an existing ledger stay valid and simply
// carry no session — a reader must switch on `schema`, never assume the field is there.
const SCHEMA = 2;

// A session goes stale after this much idle. Only the nonce fallback uses it; a host-provided id
// lives exactly as long as the host says it does.
const SESSION_IDLE_MS = 30 * 60 * 1000;

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

// One pw-prove proof is several processes (preflight, then probe many times, then clip-fidelity,
// then publish-proof), so "how many times was this skill used" is unanswerable from a per-process
// record alone. Resolve a session id, cheapest and most trustworthy source first:
//
//   env    — $PWPROVE_SESSION, an explicit override. Tests and non-Claude hosts set this.
//   host   — $CLAUDE_CODE_SESSION_ID, the agent runtime's own id. Exact by construction.
//   nonce  — a $TMPDIR file keyed by cwd, reused while it stays warm (see SESSION_IDLE_MS).
//   none   — nothing worked; 'unknown'. Telemetry never fails a run, and never blocks one either.
//
// The nonce is a fallback, not a peer: it is keyed by working directory, so two agents proving the
// same checkout at the same time share one id, and one agent proving two checkouts gets two. That
// is wrong in exactly the ways a host-provided id is right — which is why the host wins.
export function sessionInfo(cwd = process.cwd()) {
  const override = process.env.PWPROVE_SESSION;
  if (override) return { session: override, session_src: 'env' };
  const host = process.env.CLAUDE_CODE_SESSION_ID;
  if (host) return { session: host, session_src: 'host' };
  try {
    const key = createHash('sha256').update(cwd).digest('hex').slice(0, 12);
    const dir = os.tmpdir();
    // $TMPDIR pointing at a directory that does not exist is common enough in containers, and the
    // cost of being wrong here is every process minting its own session.
    fs.mkdirSync(dir, { recursive: true });
    const nonce = path.join(dir, `pwprove-session-${key}`);
    let session;
    try {
      // Warm nonce: the last run in this cwd was recent, so this process is part of that session.
      if (Date.now() - fs.statSync(nonce).mtimeMs <= SESSION_IDLE_MS) {
        session = fs.readFileSync(nonce, 'utf8').trim() || undefined;
      }
    } catch {
      /* no nonce yet, or unreadable — fall through and mint one */
    }
    if (!session) {
      session = randomUUID();
      fs.writeFileSync(nonce, `${session}\n`, { mode: 0o600 });
    } else {
      // Touch, so the idle window slides with activity instead of expiring mid-proof.
      fs.utimesSync(nonce, new Date(), new Date());
    }
    return { session, session_src: 'nonce' };
  } catch {
    return { session: 'unknown', session_src: 'none' };
  }
}

// Call ONCE at the top of a shipped script, BEFORE any argument validation, so even a usage-error
// exit leaves a record. Returns the skill info so preflight can print its version banner without
// resolving it twice.
export function pwproveRun(scriptUrl, phase) {
  const start = Date.now();
  const info = skillInfo(scriptUrl);
  // Resolved at START, not in the exit handler: the nonce's idle window must be measured from when
  // work began, or a long probe would look like a gap and split one proof across two sessions.
  const sess = sessionInfo();
  process.on('exit', (code) => {
    const line = `PWPROVE_RUN ${JSON.stringify({
      schema: SCHEMA,
      script: path.basename(fileURLToPath(scriptUrl)),
      phase,
      skill: info.skill,
      version: info.version,
      commit: info.commit,
      session: sess.session,
      session_src: sess.session_src,
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
      const ledger = process.env.PWPROVE_LEDGER || path.join(os.homedir(), '.ptg', 'ledger.jsonl');
      fs.mkdirSync(path.dirname(ledger), { recursive: true });
      fs.appendFileSync(ledger, line);
    } catch {
      /* a ledger write failure must never fail a run */
    }
  });
  return info;
}
