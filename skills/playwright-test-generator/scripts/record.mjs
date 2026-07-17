#!/usr/bin/env node
// record.mjs — film ONE generated spec as a watch-link proof: run it through the PROJECT Playwright,
// locate the per-spec video, and enforce the film-QA gate (contact sheet + duration/chapter floors)
// before any watch page exists to publish (SKILL Step 8).
//
// The video comes from a PER-SPEC `test.use({ video: ... })` in the spec itself — NEVER a global
// playwright.config edit (that would film the WHOLE suite on every run). This script does not add
// that line; SKILL Step 8 does, and only for a spec being generated for a watch link.
//
// The AGENT owns the server. record.mjs NEVER starts one: an auto-started `dev` can bind a sibling
// worktree on the WRONG branch (the same lesson baked into preflight.mjs). Point BASE_URL at a
// server you already started.
//
//   BASE_URL=http://localhost:4000 [PROOF_SHA=<commit>] [SCENARIOS=<n>] \
//     node record.mjs <spec-file.spec.ts> [out-name]
//
//   BASE_URL      required — the server you already started on this worktree's free port. Exported
//                 as BOTH PLAYWRIGHT_BASE_URL and SPEC_BASE_URL so either repo convention picks it up.
//   PROOF_SHA     optional — the commit under proof. For a localhost target record.mjs STOPs unless
//                 PROOF_SHA is an ancestor of HEAD: the worktree must actually be serving the code
//                 you claim to prove.
//   SCENARIOS     optional — the approved scenario count. Turns on the film floors: duration >=
//                 4s + 3s/scenario, and chapter count >= SCENARIOS (one titled chapter per
//                 scenario). Set it in PR-mode.
//   CONFIG        optional — passed to playwright as --config=<path> (multi-worktree repos whose
//                 default config hard-codes a sibling port/webServer).
//   PROJECT       optional — passed as --project=<name> to scope a config defining several projects.
//   FILM_TIMEOUT  optional — per-test timeout ms for the film run. Floored at
//                 max(FILM_TIMEOUT, 60000 + 60000*SCENARIOS): a film walks every scenario and holds
//                 each payoff, so a flat 60000 is far too tight for a multi-scenario live-backend
//                 film (a 5-chapter film needs ~300s; the floor gives 360s). Pass an explicit
//                 FILM_TIMEOUT only to raise it ABOVE the floor.
//   TITLE         optional — names the watch page.
//   PR_URL        optional — linked from the watch page's meta line. Defaults to the current
//                 branch's PR via `gh pr view`; set it explicitly on a detached HEAD or where gh is
//                 not authed.
//   <spec>        the ONE spec to film (it must carry the per-spec video use()).
//   [out-name]    label only — echoed in the summary so a caller can tell runs apart (default: the
//                 spec's basename).
//
// Exit 0 ONLY when the spec PASSED, a video exists, and the film-QA gate held. Run from the app root.
//   exit 3 = spec failed / no video      exit 4 = provenance STOP
//   exit 5 = film-QA gate (contact sheet / duration floor / chapter floor / bunched chapters) —
//            fix the film, re-run; NEVER publish past a 5.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ptgRun } from './ptg-run.mjs';

ptgRun(import.meta.url, 'film'); // run ledger (issue #5) — registered before validation

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const commandExists = (cmd) =>
  (process.env.PATH ?? '').split(path.delimiter).filter(Boolean).some((d) => {
    try {
      fs.accessSync(path.join(d, cmd), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });

const SPEC = process.argv[2];
if (!SPEC) {
  err('record.mjs: usage: BASE_URL=<url> node record.mjs <spec-file.spec.ts> [out-name]\n');
  process.exit(1);
}
const OUT = process.argv[3] || path.basename(SPEC).replace(/\.[^.]*$/, '');

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  err(
    'record.mjs: set BASE_URL to the server you already started on this worktree free port ' +
      '(see SKILL Step 3)\n',
  );
  process.exit(1);
}
const SCENARIOS = process.env.SCENARIOS; // undefined = floors off, except the absolute 4s minimum

// ffmpeg is NOT optional: the contact sheet IS the film-QA evidence (SKILL Step 8 screens the film
// from it). Fail fast BEFORE the slow test run; preflight.mjs PROBE_HOSTING=1 warns about this at
// Step 3.
if (!commandExists('ffmpeg')) {
  err(
    'record: STOP - ffmpeg not found. The contact sheet is the film-QA evidence; install ffmpeg ' +
      'and re-run.\n',
  );
  process.exit(5);
}

// --- provenance: for a localhost target, prove the worktree actually serves the code under proof --
const isLocalhost = /:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(BASE_URL);
const PROOF_SHA = process.env.PROOF_SHA;
if (isLocalhost && PROOF_SHA) {
  const ancestor = run('git', ['merge-base', '--is-ancestor', PROOF_SHA, 'HEAD']);
  if (ancestor.status !== 0) {
    const head = (run('git', ['rev-parse', '--short', 'HEAD']).stdout ?? '').trim();
    err(
      `record: STOP - the change under proof (${PROOF_SHA}) is NOT an ancestor of HEAD (${head}).\n`,
    );
    err(
      '        The worktree lacks the code, so the server you own cannot be serving it. Check out ' +
        'the branch, then re-run.\n',
    );
    process.exit(4);
  }
}

// --- run the ONE spec through the PROJECT Playwright ---------------------------------------------
// Browser + channel for the film come from the spec's own test.use({ channel: 'chrome' }) (SKILL
// Step 8) — do NOT force --project here (it can pin the bundled browser and blank an inline-PDF
// frame). Pass PROJECT=<name> only to scope a config that defines several projects; CONFIG=<path>
// when the default config is wrong for this worktree.
//
// Clear a stale test-results/ so the webm THIS run produces is the only candidate.
fs.rmSync('test-results', { recursive: true, force: true });

// --retries=0 overrides any project-config retries: a proof film must pass CLEAN on attempt 1 — a
// flaky film is a re-shoot, not a proof. Retries only multiply a failing film's cost, and multiple
// attempts each leave a video, making the webm pick below ambiguous (a real run nearly published the
// FAILED attempt's video under RESULT=passed). One attempt = one video = no ambiguity.
//
// Timeout floor: a multi-scenario live-backend film outlasts the flat 60000 default. The SCENARIOS
// the caller already passes for the chapter floor sizes it. An explicit FILM_TIMEOUT still wins if
// it asks for MORE.
const floor = 60000 + 60000 * Number(SCENARIOS ?? 0);
const timeout = Math.max(Number(process.env.FILM_TIMEOUT ?? 60000), floor);

// A marker file, not the spec's mtime, is the "newer than" reference — robust if the spec was
// written seconds before the run.
const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'record-')), 'marker');
fs.writeFileSync(marker, '');
const markerMtime = fs.statSync(marker).mtimeMs;

const pwArgs = ['--no-install', 'playwright', 'test', SPEC];
if (process.env.PROJECT) pwArgs.push(`--project=${process.env.PROJECT}`);
if (process.env.CONFIG) pwArgs.push(`--config=${process.env.CONFIG}`);
pwArgs.push(`--timeout=${timeout}`, '--retries=0', '--reporter=html', '--trace', 'retain-on-failure');

const test = spawnSync('npx', pwArgs, {
  stdio: 'inherit',
  // Export both base-URL conventions: stock configs read PLAYWRIGHT_BASE_URL, some repos read
  // SPEC_BASE_URL.
  env: { ...process.env, PLAYWRIGHT_BASE_URL: BASE_URL, SPEC_BASE_URL: BASE_URL },
});
const RC = test.status ?? 1;

// --- locate the per-spec video (+ optional chapters sidecar) produced by THIS run -----------------
// Sub-second fs mtimes (APFS/ext4) keep the "newer than the marker" test honest. chapters.json is
// the film spec's cue sidecar (SKILL Step 8); the chapter floor below makes it mandatory when
// SCENARIOS is set.
function findNewer(dir, name) {
  const found = [];
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === name || (name.startsWith('*') && e.name.endsWith(name.slice(1)))) {
        try {
          if (fs.statSync(p).mtimeMs > markerMtime) found.push(p);
        } catch {
          /* raced with cleanup */
        }
      }
    }
  };
  walk(dir);
  // --retries=0 plus the test-results/ wipe above mean exactly ONE candidate should exist, so this
  // picks the same file the shell's `find … | head -1` did. Sorting rather than taking traversal
  // order makes the tie-break deterministic if that invariant ever breaks.
  return found.sort()[0] ?? '';
}

const WEBM = findNewer('test-results', '*.webm');
const CH = findNewer('test-results', 'chapters.json');
fs.rmSync(path.dirname(marker), { recursive: true, force: true });

const nonEmpty = (f) => {
  try {
    return f !== '' && fs.statSync(f).size > 0;
  } catch {
    return false;
  }
};

if (!(RC === 0 && nonEmpty(WEBM))) {
  if (RC !== 0) {
    err('record: the proof FAILED - the spec did not pass (see the test output above). No watch link.\n');
    if (nonEmpty(WEBM)) err(`record: a failure video is at ${WEBM} - it shows what broke.\n`);
  } else {
    err('record: the spec passed but no video was produced. Does it carry the per-spec test.use video block?\n');
  }
  process.exit(3);
}

// ============================================================ film-QA gate
// Every gate below is non-skippable; every failure is exit 5 and names its own gate.
const stop = (gate, detail) => {
  err(`record: STOP - film-QA gate (${gate}): ${detail}\n`);
  process.exit(5);
};

// Duration comes first — the contact sheet's sampling rate derives from it. ffprobe is the happy
// path; a live-recorded webm often carries NO duration metadata, in which case we do a null decode
// and read the last `time=HH:MM:SS.xx` stamp ffmpeg printed. One function, one return type: the
// fallback is visibly a fallback.
function filmDurationSeconds(webm) {
  const probed = (run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).stdout ?? '').trim();
  if (probed !== '' && !probed.startsWith('N/A')) return Number(probed);

  const decode = run('ffmpeg', ['-nostats', '-i', webm, '-f', 'null', '-']);
  const stamps = [...`${decode.stdout ?? ''}${decode.stderr ?? ''}`.matchAll(/time=([0-9:][0-9:.]*)/g)];
  if (!stamps.length) return 0;

  const parts = stamps[stamps.length - 1][1].split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

const durSeconds = filmDurationSeconds(WEBM);
const DUR_INT = Math.floor((Number.isFinite(durSeconds) ? durSeconds : 0) + 0.5);

// Contact sheet: 30 frames spanning the WHOLE film, tiled on one image — the film-QA evidence SKILL
// Step 8 LOOKs at before publishing (blank lead? chapters seekable? payoff on the final tile?
// feature actually shown?). Sampling every duration/30s puts the last tile within ~d/30s of the end,
// so the >=3s payoff hold (SKILL Step 8) guarantees the success frame survives into it. There is no
// separate poster: the final tile IS the final-frame evidence, and the watch page opens on the video.
const CONTACT = WEBM.replace(/\.webm$/, '.contact.png');
const sheetFps = (30 / Math.max(DUR_INT, 1)).toFixed(6);
const sheet = run('ffmpeg', [
  '-y', '-i', WEBM,
  '-vf', `fps=${sheetFps},scale=480:-2,tile=5x6`,
  '-frames:v', '1', CONTACT,
], { stdio: 'ignore' });
if (sheet.status !== 0 || !nonEmpty(CONTACT)) {
  stop('contact sheet', `could not extract the contact sheet from ${WEBM}. Re-film, then retry.`);
}

// Chapters: count + strictly non-decreasing timestamps. A bunched or out-of-order chapter list is
// unseekable, which defeats the point of having chapters at all. Returns null for "malformed" —
// unparseable, not an array, or timestamps that go backwards — so one gate covers all three.
// Also reports the offset span (last - first) for the bunched-offsets gate below.
function readChapters(file) {
  if (!nonEmpty(file)) return { count: 0, raw: '[]', span: 0 };
  const raw = fs.readFileSync(file, 'utf8').replace(/\n+$/, ''); // as `$(cat …)` would give it
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].t < parsed[i - 1].t) return null;
  }
  const span = parsed.length ? parsed[parsed.length - 1].t - parsed[0].t : 0;
  return { count: parsed.length, raw, span };
}

const chapters = readChapters(CH);
if (chapters === null) {
  stop(
    'chapters',
    `${CH} is malformed or its timestamps go backwards. Fix the film spec's chapter() helper, re-run.`,
  );
}
const CH_COUNT = chapters.count;

// Bunched offsets (the ":0:11" incident class): every chapter stamped at ~the same offset makes the
// rail N buttons that all seek to one frame. Window = 3s — one payoff hold; a real multi-chapter
// film spends >=3s in its final chapter alone, so a healthy list always spans more than one hold.
// Offsets bunching means the spec collected timestamps after the run instead of anchoring each
// chapter when it starts on screen (SKILL Step 8 film-spec contract).
if (CH_COUNT >= 2 && chapters.span < 3) {
  stop(
    'bunched chapters',
    `${CH_COUNT} chapters all within ${chapters.span.toFixed(1)}s of each other — unseekable. ` +
      "Anchor each chapter's t when the chapter starts on screen (SKILL Step 8), re-film.",
  );
}

// Floors. Absolute: a proof shorter than 4s shows nothing. With SCENARIOS: 4s + 3s per approved
// scenario, and one titled chapter per scenario — a film that covers fewer scenarios than the spec
// is a defective proof.
let minSeconds = 4;
if (SCENARIOS) {
  minSeconds = 4 + 3 * Number(SCENARIOS);
  if (CH_COUNT < Number(SCENARIOS)) {
    stop(
      'chapter floor',
      `${CH_COUNT} chapter(s) < ${SCENARIOS} approved scenario(s). One titled chapter per ` +
        'scenario; write the chapters.json sidecar.',
    );
  }
}
if (DUR_INT < minSeconds) {
  stop(
    'duration floor',
    `${DUR_INT}s < ${minSeconds}s (4s + 3s x ${SCENARIOS ?? 0} scenarios). The film is too short ` +
      "to show every scenario's payoff.",
  );
}

// ============================================================ watch page
// ONE self-contained page — the webm inlined as a data URI — so the watch link is a single HTML
// object (title + clickable chapters), not a bare .webm a reviewer opens with no context.
//
// ponytail: base64-inlining is fine for a seconds-long proof clip. If clips ever run to many MB,
// switch to sibling files + a directory upload. The empty/broken-webm guard is above, so a page is
// only ever built around a real, passing video.
//
// The film is shot at 1600x900 (SKILL Step 8), so the page must let it PAINT at that size: a column
// capped at a text-column width downscales the film ~2x and the app's own UI text goes unreadable —
// the proof stops proving. Layout: 100svh flex column, header + chapter rail fixed, the video takes
// every remaining pixel (height:100%, width:auto — the intrinsic 16:9 keeps it letterbox-free and
// scrolls nothing off-screen).
const WATCH = WEBM.replace(/\.webm$/, '.watch.html');
const TITLE = process.env.TITLE || OUT;

// Meta line = what a reviewer needs before hitting play: the PR, the runtime, the scenario count,
// the spec that produced it. `gh pr view` resolves the current branch's PR; PR_URL overrides it
// (detached HEAD, or no gh).
const PR_URL =
  process.env.PR_URL ||
  (run('gh', ['pr', 'view', '--json', 'url', '-q', '.url']).stdout ?? '').trim();

const DUR_MMSS = `${Math.floor(DUR_INT / 60)}:${String(DUR_INT % 60).padStart(2, '0')}`;
const videoDataUri = `data:video/webm;base64,${fs.readFileSync(WEBM).toString('base64')}`;

// The CSS and player JS stay on ONE line each, byte for byte what the shell version emitted, so the
// port can be proven with an empty diff. Reformatting them is now a safe, isolated edit — which was
// the point: in a template literal a single quote is just a single quote, where the shell would have
// eaten it. Reflow freely once the golden diff has served its purpose.
const CSS =
  ':root{color-scheme:dark light}*{box-sizing:border-box}body{margin:0;height:100svh;display:flex;flex-direction:column;gap:14px;padding:18px 24px 20px;font:15px/1.5 system-ui,sans-serif;background:#0b0d10;color:#e6e8eb}header{flex:0 0 auto}h1{font-size:19px;font-weight:600;margin:0 0 2px}.meta{margin:0;font-size:13px;color:#9aa4af;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.meta a{color:#7cc4ff;text-decoration:none}.meta a:hover{text-decoration:underline}.meta code{font:12px/1.5 ui-monospace,monospace;color:#7d8894}.sep{color:#39414a}.stage{flex:1 1 auto;min-height:0;display:flex;justify-content:center}video{height:100%;width:auto;max-width:100%;border-radius:12px;background:#000;box-shadow:0 12px 40px rgba(0,0,0,.5)}ol{flex:0 0 auto;list-style:none;display:flex;gap:8px;overflow-x:auto;margin:0;padding:2px 0}li{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:13px;white-space:nowrap;border:1px solid #232a31;border-radius:999px;background:#151a1f;cursor:pointer}li:hover{background:#1c232a;border-color:#33404b}li.on{background:#16281d;border-color:#2ec26b;color:#eafff2}li .t{color:#7d8894;font-variant-numeric:tabular-nums}li.on .t{color:#2ec26b}';

// Chapter rail: each cue seeks the video; the active cue highlights as playback passes it.
const PLAYER_JS =
  `const C=${chapters.raw};` +
  'const v=document.getElementById("v"),ol=document.getElementById("ch");' +
  'const mmss=s=>Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0");' +
  'const items=C.map(c=>{const li=document.createElement("li");' +
  'li.innerHTML=`<span class="t">${mmss(c.t)}</span><span>${c.name}</span>`;' +
  'li.onclick=()=>{v.currentTime=c.t;v.play()};ol.appendChild(li);return li});' +
  'v.ontimeupdate=()=>{let i=-1;C.forEach((c,n)=>{if(v.currentTime>=c.t-0.15)i=n});' +
  'items.forEach((li,n)=>li.classList.toggle("on",n===i))};';

const prLink = PR_URL
  ? `<a href="${PR_URL}" target="_blank" rel="noopener">View the PR &#8599;</a><span class="sep">&middot;</span>`
  : '';

// No trailing newline — the shell built this with `printf '%s'` throughout, and the golden diff is
// byte-exact.
fs.writeFileSync(
  WATCH,
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${TITLE}</title><style>${CSS}</style></head>` +
    `<body><header><h1>${TITLE}</h1><p class="meta">` +
    `${prLink}${DUR_MMSS}<span class="sep">&middot;</span>${CH_COUNT} chapters` +
    `<span class="sep">&middot;</span><code>${SPEC}</code>` +
    '</p></header><div class="stage">' +
    `<video id="v" controls playsinline preload="metadata" src="${videoDataUri}"></video>` +
    `</div><ol id="ch"></ol><script>${PLAYER_JS}</script></body></html>`,
);

err(`record: watch page -> ${WATCH} (${chapters.raw === '[]' ? 'no chapters' : 'with chapters'})\n`);
err(
  'record: LOOK at the contact sheet before publishing (SKILL Step 8): no blank lead, chapters ' +
    'seekable, payoff on the final tile, feature actually shown.\n',
);

out('---record---\n');
out(`SPEC=${SPEC}\n`);
out(`OUT=${OUT}\n`);
out('RESULT=passed\n');
out(`WEBM=${WEBM}\n`);
out(`CONTACT=${CONTACT}\n`);
out(`DURATION=${DUR_INT}s\n`);
out(`CHAPTERS=${CH_COUNT}\n`);
out(`WATCH=${WATCH}\n`);
process.exit(0);
