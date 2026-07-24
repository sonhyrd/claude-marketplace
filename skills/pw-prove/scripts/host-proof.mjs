#!/usr/bin/env node
// Publish ONE proof page for a whole pw-prove run: every per-AC clip of the Step-7 proof run,
// uploaded under a single key prefix, plus a self-contained index.html that plays them in order
// with an AC rail. The PR gets ONE link instead of N bare .webm links (docs/adr/0009).
//
//   node host-proof.mjs <manifest.json> <project> <key-prefix>
//     <manifest.json>  the run's clips + page meta (schema below)
//     <project>        per-project folder, usually the repo short name (e.g. nuxt-hyrd-chrysus)
//     <key-prefix>     folder under the project for THIS run, e.g. proof/pr2974-cb2a58f
//
// Manifest (only `clips[].ac` and `clips[].file` are required):
//   {
//     "title":    "PR #2974 — cookie consent text authoring",
//     "prUrl":    "https://github.com/org/repo/pull/2974",
//     "spec":     "tests/e2e/cookie-consent-text-authoring.spec.ts",
//     "mutation": "RED — dropping the .trim() fails the wire-contract scenario",
//     "clips": [
//       { "ac": "<AC verbatim>", "scenario": "<the spec's test title>", "file": "test-results/…/video.webm" }
//     ]
//   }
//
// Every object goes up through host-video.mjs, so the three publish gates are unchanged and apply
// to EVERY clip: degenerate key (exit 2), empty/broken recording (exit 3), token leak (exit 6).
// A gate that trips on any clip aborts the whole page — a proof page with a hole in it is worse
// than no page. $BEARER and $SCAN pass through untouched.
//
// The page references its clips RELATIVELY (`./<slug>.webm`), so it carries no bucket domain and
// keeps working if the bucket or its public host ever changes. Every clip also stays individually
// linkable as `<page-url>#<slug>` — the AC table in the PR comment uses those anchors.
//
// Prints the page URL as the FIRST stdout line (per-clip URLs go to stderr; the trailing
// PWPROVE_RUN ledger line follows) so callers can do:
//   URL=$(node host-proof.mjs manifest.json myproj proof/pr42-abc1234 | head -n1)
// Needs wrangler authenticated (`npx wrangler whoami`). Exits non-zero if a gate trips or an
// upload fails.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pwproveRun } from './pwprove-run.mjs';

pwproveRun(import.meta.url, 'publish'); // run ledger — registered before the gates

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST_VIDEO = path.join(HERE, 'host-video.mjs');

const [MANIFEST, PROJECT, PREFIX] = process.argv.slice(2);
if (!MANIFEST || !PROJECT || !PREFIX) {
  err('host-proof.mjs: usage: host-proof.mjs <manifest.json> <project> <key-prefix>\n');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
} catch (e) {
  err(`host-proof: STOP — cannot read manifest '${MANIFEST}': ${e.message}\n`);
  process.exit(1);
}

const clips = Array.isArray(manifest.clips) ? manifest.clips : [];
if (clips.length === 0) {
  err('host-proof: STOP — the manifest lists no clips. A proof page with no clip proves nothing.\n');
  process.exit(1);
}
for (const [i, c] of clips.entries()) {
  if (!c || typeof c.ac !== 'string' || !c.ac.trim() || typeof c.file !== 'string' || !c.file) {
    err(`host-proof: STOP — clips[${i}] needs both an "ac" string and a "file" path.\n`);
    process.exit(1);
  }
}

// Slug = the clip's object name AND its deep-link anchor. Derived from the AC so the URL is
// readable, deduped by suffix so two ACs that slugify the same never overwrite each other's webm.
const seen = new Map();
const slugify = (s, i) => {
  const words = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Cut at a word boundary, not mid-word: `…-through-the-existi` reads like a truncation bug in a
  // URL a reviewer sees. Fall back to the hard slice for a single word longer than the cap.
  const capped = words.length <= 48 ? words : words.slice(0, 48).replace(/-[^-]*$/, '');
  const base = capped.replace(/-+$/g, '') || words.slice(0, 48) || `ac-${i + 1}`;
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
};

const KEY_PREFIX = PREFIX.replace(/^\/+|\/+$/g, '');

// One host-video.mjs child per object: the gates, the content types and the ledger record all stay
// in the one place that owns publishing. Its stdout line 1 is the public URL.
function publish(file, key) {
  const r = spawnSync('node', [HOST_VIDEO, file, PROJECT, key], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 2], // the child's stderr (wrangler chatter + gate messages) passes through
  });
  if (r.status !== 0) {
    err(`host-proof: STOP — publishing '${file}' failed (host-video exit ${r.status}). No page.\n`);
    process.exit(r.status ?? 1);
  }
  return (r.stdout ?? '').split('\n')[0].trim();
}

const published = clips.map((c, i) => {
  const slug = c.slug ? slugify(c.slug, i) : slugify(c.ac, i);
  const url = publish(c.file, `${KEY_PREFIX}/${slug}.webm`);
  err(`host-proof: clip ${i + 1}/${clips.length} -> ${url}\n`);
  return { ...c, slug, url };
});

// ============================================================ the page
// One self-contained HTML: an AC rail across the bottom, one <video> stage that swaps source as you
// move through it, auto-advance to the next AC when a clip ends — so the whole run watches as one
// pass without concatenating anything (no ffmpeg, no second run; docs/adr/0006 stands).
//
// Clips are recorded at the effective viewport (1600x900 by default, docs/adr/0007), so the stage
// must let the video PAINT at that size: a text-column-width page downscales it ~2x and the app's
// own UI text goes unreadable, which is the defect 0007 exists to prevent. Layout: 100svh flex
// column, header + rail fixed, video takes every remaining pixel (height:100%, width:auto).
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const TITLE = manifest.title || `${PROJECT} — E2E proof`;

// `gh pr view` resolves the current branch's PR; manifest.prUrl overrides it (detached HEAD, no gh,
// or a run whose PR is not the checked-out branch's).
const ghPrUrl = () => {
  try {
    return (spawnSync('gh', ['pr', 'view', '--json', 'url', '-q', '.url'], { encoding: 'utf8' })
      .stdout ?? '').trim();
  } catch {
    return '';
  }
};
const PR_URL = manifest.prUrl || ghPrUrl();

const CSS =
  ':root{color-scheme:dark light}*{box-sizing:border-box}body{margin:0;height:100svh;display:flex;flex-direction:column;gap:14px;padding:18px 24px 20px;font:15px/1.5 system-ui,sans-serif;background:#0b0d10;color:#e6e8eb}header{flex:0 0 auto}h1{font-size:19px;font-weight:600;margin:0 0 2px}.meta{margin:0;font-size:13px;color:#9aa4af;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.meta a{color:#7cc4ff;text-decoration:none}.meta a:hover{text-decoration:underline}.meta code{font:12px/1.5 ui-monospace,monospace;color:#7d8894}.sep{color:#39414a}.now{flex:0 0 auto;font-size:13px;color:#9aa4af;margin:0;min-height:20px}.now b{color:#e6e8eb;font-weight:600}.stage{flex:1 1 auto;min-height:0;display:flex;justify-content:center}video{height:100%;width:auto;max-width:100%;aspect-ratio:auto 16/9;border-radius:12px;background:#000;box-shadow:0 12px 40px rgba(0,0,0,.5)}ol{flex:0 0 auto;list-style:none;display:flex;gap:8px;overflow-x:auto;margin:0;padding:2px 0}li{flex:0 0 auto;display:flex;align-items:center;gap:8px;max-width:34ch;padding:7px 12px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid #232a31;border-radius:999px;background:#151a1f;cursor:pointer}li:hover{background:#1c232a;border-color:#33404b}li.on{background:#16281d;border-color:#2ec26b;color:#eafff2}li .n{color:#7d8894;font-variant-numeric:tabular-nums}li.on .n{color:#2ec26b}';

// The rail drives the stage: click (or #slug on load, or a clip ending) selects an AC, which swaps
// the source, updates the caption and rewrites the hash so the current clip is always linkable.
//
// An AC is untrusted text — it comes from a diff, a ticket or a PR body. So it reaches the DOM as
// textContent, never innerHTML, and `<` is \u-escaped inside the JSON blob so an AC containing
// `</script>` cannot close the script element it is embedded in.
const CLIPS_JSON = JSON.stringify(
  published.map((p) => ({ slug: p.slug, ac: p.ac, scenario: p.scenario ?? '' })),
).replace(/</g, '\\u003c');

const PLAYER_JS =
  `const C=${CLIPS_JSON};` +
  'const v=document.getElementById("v"),ol=document.getElementById("ch"),now=document.getElementById("now");' +
  'let cur=-1;' +
  'const span=(cls,text)=>{const s=document.createElement("span");if(cls)s.className=cls;s.textContent=text;return s};' +
  'const items=C.map((c,n)=>{const li=document.createElement("li");' +
  'li.append(span("n",n+1),span("",c.ac));' +
  'li.title=c.ac;li.onclick=()=>sel(n,true);ol.appendChild(li);return li});' +
  'function sel(n,play){if(n<0||n>=C.length)return;cur=n;const c=C[n];' +
  'v.src="./"+c.slug+".webm";v.load();if(play)v.play().catch(()=>{});' +
  'items.forEach((li,i)=>li.classList.toggle("on",i===n));' +
  'items[n].scrollIntoView({block:"nearest",inline:"nearest"});' +
  'const b=document.createElement("b");b.textContent=(n+1)+"/"+C.length;' +
  'now.replaceChildren(b,document.createTextNode(" \\u2014 "+c.ac+(c.scenario?" \\u00b7 "+c.scenario:"")));' +
  'history.replaceState(null,"","#"+c.slug)}' +
  'v.onended=()=>{if(cur+1<C.length)sel(cur+1,true)};' +
  'const start=C.findIndex(c=>"#"+c.slug===location.hash);' +
  'sel(start<0?0:start,false);';

const prLink = PR_URL
  ? `<a href="${esc(PR_URL)}" target="_blank" rel="noopener">View the PR &#8599;</a><span class="sep">&middot;</span>`
  : '';
const specBit = manifest.spec ? `<span class="sep">&middot;</span><code>${esc(manifest.spec)}</code>` : '';
const mutationBit = manifest.mutation
  ? `<span class="sep">&middot;</span>Mutation: ${esc(manifest.mutation)}`
  : '';

const html =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  `<title>${esc(TITLE)}</title><style>${CSS}</style></head>` +
  `<body><header><h1>${esc(TITLE)}</h1><p class="meta">` +
  `${prLink}${published.length} scenario${published.length === 1 ? '' : 's'}${specBit}${mutationBit}` +
  '</p></header><p class="now" id="now"></p><div class="stage">' +
  '<video id="v" controls playsinline preload="metadata"></video>' +
  `</div><ol id="ch"></ol><script>${PLAYER_JS}</script></body></html>`;

// Staged in a temp dir, never in the target repo: the page is a published artifact, not a file the
// user has to clean up after (the run's own hygiene sweep has enough to do).
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-prove-page-'));
const pageFile = path.join(stage, 'index.html');
fs.writeFileSync(pageFile, html);

const pageUrl = publish(pageFile, `${KEY_PREFIX}/index.html`);
try {
  fs.rmSync(stage, { recursive: true, force: true });
} catch {
  /* a temp dir that outlives the run is not worth failing over */
}

err(`host-proof: page -> ${pageUrl} (${published.length} clip(s))\n`);
out(`${pageUrl}\n`);
