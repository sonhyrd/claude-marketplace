#!/usr/bin/env node
// Publish a whole pw-prove run to Paul Clips as ONE chaptered recording, and print its share link.
// Manifest in, one share URL out — no bucket, no hand-built page, no per-clip link table.
//
//   node publish-proof.mjs <manifest.json>
//
// Manifest (unchanged from the page era — only `clips[].ac` and `clips[].file` are required):
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
// `clips[]` order is CHAPTER order: each clip becomes one chapter titled with its AC verbatim, at
// an offset that is the cumulative MEASURED duration of the clips before it — probed, never assumed,
// because a chapter marker computed from a guess points at the wrong footage.
//
// The pipeline is: probe each clip -> concatenate by STREAM COPY -> probe the result -> mint a
// short-lived scoped token -> ONE POST carrying the video as a base64 data URL -> print the share
// URL the destination returns. Stream copy re-encodes nothing, so the Clip fidelity contract
// (docs/adr/0007) survives bit-for-bit and the cost is a byte copy rather than a transcode.
//
// Configuration is two environment variables:
//   CLIPS_ORIGIN      required — the Clips deployment, e.g. https://clips.paulsjob.ai
//   CLIPS_A2A_SECRET  required — the organization-level signing secret. Minting is HMAC-SHA256 via
//                     node:crypto alone, so no dependency lands in a user's repository.
//   CLIPS_ORG         optional — organization id / domain hint for the token's claims. Defaults to
//                     the origin's hostname, which is right for a single-org deployment.
//   CLIPS_SUBJECT     optional — the caller identity the token asserts (`sub`). Defaults to
//                     pw-prove@<origin hostname>.
// The token is minted PER PUBLISH with a five-minute life and a single import scope, so nothing
// long-lived sits on disk and a captured bearer authorises only this one action.
//
// Prints the share URL as the FIRST stdout line, then repeats it on a MARKER line (progress goes to
// stderr; the trailing PWPROVE_RUN ledger line follows). Read the MARKER, not line 1 — a caller that
// adds `2>&1` puts npm/ffmpeg chatter on line 1 instead:
//   URL=$(node publish-proof.mjs manifest.json 2>&1 | sed -n 's/^PWPROVE_URL //p' | head -n1)
//
// Exit codes: 1 usage/manifest/configuration, 4 video tooling, 7 publish failed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clipsConfig, mintImportToken } from './clips.mjs';
import { pwproveRun } from './pwprove-run.mjs';

pwproveRun(import.meta.url, 'publish'); // run ledger — registered before any validation

const out = (s) => process.stdout.write(s);
const err = (s) => process.stderr.write(s);
const stop = (code, message) => {
  err(`publish-proof: STOP — ${message}\n`);
  process.exit(code);
};

// The concatenated video lands at ONE stable path, not a fresh temp dir per run: when a publish
// fails for transport reasons the operator needs a file they can attach by hand, and a path that
// moves every run is a path nobody can be told about in advance.
const PROOF_FILE = path.join(os.tmpdir(), 'pw-prove-proof.webm');

// ============================================================ manifest
const [MANIFEST] = process.argv.slice(2);
if (!MANIFEST) {
  err('publish-proof.mjs: usage: publish-proof.mjs <manifest.json>\n');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
} catch (e) {
  stop(1, `cannot read manifest '${MANIFEST}': ${e.message}`);
}

const clips = Array.isArray(manifest.clips) ? manifest.clips : [];
if (clips.length === 0) stop(1, 'the manifest lists no clips. A recording with no chapter proves nothing.');
for (const [i, c] of clips.entries()) {
  if (!c || typeof c.ac !== 'string' || !c.ac.trim() || typeof c.file !== 'string' || !c.file) {
    stop(1, `clips[${i}] needs both an "ac" string and a "file" path.`);
  }
}

// ============================================================ configuration
const CLIPS = clipsConfig();
if (!CLIPS.ok) stop(1, `${CLIPS.reason} — publishing needs both.`);

// ============================================================ video tooling
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// Probe by RUNNING the tool: a `command -v` hit says a name resolves, not that it executes.
for (const tool of ['ffprobe', 'ffmpeg']) {
  const r = run(tool, ['-version']);
  if (r.error || r.status !== 0) {
    stop(4, `${tool} is not runnable — install ffmpeg, then retry. (${r.error?.message ?? `exit ${r.status}`})`);
  }
}

// One probe per file answers everything downstream needs: chapter offsets, the reported dimensions,
// and whether the recording carries audio at all.
function probe(file) {
  const r = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name,width,height',
    '-show_entries', 'format=duration',
    '-of', 'json',
    file,
  ]);
  if (r.status !== 0) stop(4, `ffprobe cannot read '${file}': ${(r.stderr ?? '').trim() || `exit ${r.status}`}`);
  let json;
  try {
    json = JSON.parse(r.stdout ?? '{}');
  } catch (e) {
    stop(4, `ffprobe returned unparseable output for '${file}': ${e.message}`);
  }
  const streams = Array.isArray(json.streams) ? json.streams : [];
  const video = streams.find((s) => s.codec_type === 'video') ?? {};
  const raw = json.format?.duration;
  const parsed = raw === undefined || raw === 'N/A' ? NaN : Number(raw);
  return {
    file,
    seconds: Number.isFinite(parsed) && parsed > 0 ? parsed : decodedSeconds(file),
    codec: video.codec_name ?? '',
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

// A live-recorded webm often carries NO duration in its container metadata. Decoding it to /dev/null
// and reading ffmpeg's last `time=` stamp is the fallback the film path already uses — visibly a
// fallback, one return type.
function decodedSeconds(file) {
  const decode = run('ffmpeg', ['-nostats', '-i', file, '-f', 'null', '-']);
  const stamps = [...`${decode.stdout ?? ''}${decode.stderr ?? ''}`.matchAll(/time=([0-9:][0-9:.]*)/g)];
  if (!stamps.length) return 0;
  const parts = stamps[stamps.length - 1][1].split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

const probed = clips.map((c, i) => {
  if (!fs.existsSync(c.file)) stop(4, `clips[${i}] names a file that does not exist: '${c.file}'`);
  const p = probe(path.resolve(c.file));
  err(`publish-proof: clip ${i + 1}/${clips.length} ${p.seconds.toFixed(3)}s ${p.width}x${p.height} ${p.codec}\n`);
  return p;
});

// Chapter offsets are the CUMULATIVE measured durations, in manifest order — the order a reviewer
// watches, which is AC order.
const chapters = [];
let cursor = 0;
for (const [i, c] of clips.entries()) {
  chapters.push({ startMs: Math.round(cursor * 1000), title: c.ac });
  cursor += probed[i].seconds;
}
const inputSeconds = cursor;

// ============================================================ concatenate (stream copy)
// The concat demuxer with `-c copy` muxes the existing packets into one container: no decode, no
// encode, no frame touched. Playwright's per-test webms share a codec and viewport, so this is a
// byte copy rather than a processing pass.
const listFile = path.join(os.tmpdir(), `pw-prove-concat-${process.pid}.txt`);
fs.writeFileSync(
  listFile,
  probed.map((p) => `file '${p.file.replace(/'/g, "'\\''")}'\n`).join(''),
);
const concat = run('ffmpeg', [
  '-y', '-nostdin',
  '-f', 'concat', '-safe', '0', '-i', listFile,
  '-c', 'copy',
  PROOF_FILE,
]);
try {
  fs.unlinkSync(listFile);
} catch {
  /* a stray list file is not worth failing over */
}
if (concat.status !== 0) {
  stop(4, `ffmpeg could not concatenate the clips: ${(concat.stderr ?? '').trim().split('\n').slice(-3).join(' ')}`);
}

const proof = probe(PROOF_FILE);
err(
  `publish-proof: concatenated ${clips.length} clip(s) -> ${PROOF_FILE} ` +
    `(${proof.seconds.toFixed(3)}s, sum of inputs ${inputSeconds.toFixed(3)}s)\n`,
);

// ============================================================ the one request
// The PR link, the spec path and the mutation verdict travel WITH the recording: met outside the PR,
// a bare video says a test passed but not which change it proves, nor that the test can fail at all.
const descriptionLines = [];
if (manifest.prUrl) descriptionLines.push(`PR: ${manifest.prUrl}`);
if (manifest.spec) descriptionLines.push(`Spec: ${manifest.spec}`);
if (manifest.mutation) descriptionLines.push(`Mutation: ${manifest.mutation}`);

const body = {
  data: `data:video/webm;base64,${fs.readFileSync(PROOF_FILE).toString('base64')}`,
  title: manifest.title || 'E2E proof',
  description: descriptionLines.join('\n'),
  chapters,
  durationMs: Math.round(proof.seconds * 1000),
  width: proof.width,
  height: proof.height,
  hasAudio: proof.hasAudio,
  source: 'Playwright proof',
  visibility: 'public',
};

let res;
let text = '';
try {
  res = await fetch(CLIPS.actionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mintImportToken(CLIPS)}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  text = await res.text();
} catch (e) {
  err(`publish-proof: publish failed — ${CLIPS.origin} unreachable (${e.message})\n`);
  err(`publish-proof: the concatenated proof is at ${PROOF_FILE}\n`);
  process.exit(7);
}

if (!res.ok) {
  err(`publish-proof: publish failed — HTTP ${res.status} from ${CLIPS.origin}: ${text.slice(0, 400)}\n`);
  err(`publish-proof: the concatenated proof is at ${PROOF_FILE}\n`);
  process.exit(7);
}

let result;
try {
  result = JSON.parse(text);
} catch {
  result = null;
}
const shareUrl = typeof result?.shareUrl === 'string' ? result.shareUrl : '';
if (!shareUrl) {
  err(`publish-proof: publish returned no shareUrl: ${text.slice(0, 400)}\n`);
  err(`publish-proof: the concatenated proof is at ${PROOF_FILE}\n`);
  process.exit(7);
}

err(`publish-proof: ${chapters.length} chapter(s) published -> ${shareUrl}\n`);
for (const [i, ch] of chapters.entries()) {
  err(`publish-proof: chapter ${i + 1} @${ch.startMs}ms -> ${shareUrl}?t=${Math.round(ch.startMs / 1000)}\n`);
}
out(`${shareUrl}\n`);
out(`PWPROVE_URL ${shareUrl}\n`);
