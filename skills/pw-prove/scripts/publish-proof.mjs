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
// The pipeline is: probe each clip -> concatenate by STREAM COPY -> probe the result -> ONE
// JSON-RPC call carrying the video as a base64 data URL -> print the share URL the destination
// returns. Stream copy re-encodes nothing, so the Clip fidelity contract (docs/adr/0007) survives
// bit-for-bit and the cost is a byte copy rather than a transcode.
//
// Configuration is ONE environment variable (see clips.mjs):
//   CLIPS_MCP_TOKEN   an opaque bearer minted by the Clips deployment. It carries its own
//                     destination, subject and organization, so nothing else needs configuring.
// Optional, for testing and self-hosted deployments only:
//   PW_PROVE_CLIPS_ENDPOINT  the MCP endpoint, when the token's own `aud` should not be used.
// This script is vault-ignorant: it reads the variable out of its environment and spawns nothing.
//
// DELIVERY FAILURES DO NOT ARRIVE AS A STATUS CODE. Only a refused credential is an honest HTTP
// 401, and its body is not JSON-RPC at all. Everything after authentication — including a flat
// refusal — arrives at HTTP 200 with the failure written in the body. `res.ok` is therefore no
// evidence of anything, and clips.mjs classifies by parsing.
//
// FOUR gates run before anything leaves the machine, and a gate trip publishes NOTHING and names
// itself. They also WITHHOLD the local file — a gate means the artifact is *wrong*, not merely
// undelivered, and a video known to be wrong must never be handed over as evidence:
//   • EMPTY-RECORDING gate (exit 3) — per source clip, before concat. A dead screencast.start() or a
//     crashed page yields a sub-1KB webm with no readable video; publishing it proves nothing.
//   • TOKEN-LEAK gate (exit 6) — if $BEARER is set, refuse when it appears in the video bytes (each
//     source clip and the concatenated output), in any artifact listed in $SCAN, OR in the chapter
//     titles / title / description. The text half is not decoration: the ACs now travel as JSON to a
//     recording that is PUBLIC by default, so a credential pasted into an AC is a live leak path a
//     byte scan alone would miss.
//   • HOMOGENEITY gate (exit 8) — all source clips must agree on codec and dimensions, before concat.
//     Stream-copy concatenation of mismatched inputs produces corrupt output *without failing*: a
//     silent-always-pass in artifact form.
//   • DURATION-RECONCILIATION gate (exit 9) — the concatenated output against the sum of its inputs.
//     If they diverge, every chapter after the divergence points at the wrong footage — evidence that
//     reads as complete while being wrong.
// Both new gates read the probe data already gathered for the chapter offsets, so neither costs an
// additional subprocess.
//
// The OPPOSITE posture applies to delivery: a 500, a refused connection or a rejected credential does
// NOT fail the run (exit stays 0). The proof is the passing test plus the mutation verdict, and a run
// never fails over undelivered evidence. The concatenated video is kept at a stable path and that
// path is printed on a PWPROVE_PROOF_FILE marker line, so the proof can be attached by hand.
//
// One refusal takes that path without a destination being asked. The import action carries at most
// 67108864 decoded bytes inline, and a base64 data URL decodes to exactly the bytes on disk — so an
// oversized film is measured by `stat` and refused before the request is built, rather than encoded
// and uploaded to be rejected at the far end. It is Undelivered, never a gate: the film is fine, it
// is simply too big for this door, and it is kept.
//
// Prints the share URL as the FIRST stdout line, then repeats it on a MARKER line (progress goes to
// stderr; the trailing PWPROVE_RUN ledger line follows). Read the MARKER, not line 1 — a caller that
// adds `2>&1` puts npm/ffmpeg chatter on line 1 instead:
//   URL=$(node publish-proof.mjs manifest.json 2>&1 | sed -n 's/^PWPROVE_URL //p' | head -n1)
// When delivery fails there is no PWPROVE_URL; read PWPROVE_PROOF_FILE the same way.
//
// Exit codes: 0 published — or delivery failed and the run carries on with the kept file;
//             1 usage/manifest/configuration, 4 video tooling,
//             3/6/8/9 the four gates above, in the order they run.
// (Exit 2 is retired along with the fifth gate that used it: Clips assigns the recording identifier,
// so this script builds no object name and there is nothing left for that gate to refuse.)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  IMPORT_ACTION,
  NOT_DELEGABLE_REMEDY,
  callClipsAction,
  classifyClipsResponse,
  clipsConfig,
  postChapterComments,
} from './clips.mjs';
import { pwproveRun } from './pwprove-run.mjs';
import { probeVideo, run, videoTooling } from './video.mjs';

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

// A gate trip means the artifact is WRONG, not undelivered — so it withholds the file as well as the
// publish. The unlink is unconditional and covers the stable path itself: a good proof left there by
// an earlier run would otherwise be offered as this run's evidence.
const gate = (code, name, ...lines) => {
  try {
    fs.unlinkSync(PROOF_FILE);
  } catch {
    /* nothing concatenated yet, or nothing left behind — either way the file is now absent */
  }
  err(`publish-proof: GATE ${name} — ${lines[0]}\n`);
  for (const extra of lines.slice(1)) err(`            ${extra}\n`);
  err('publish-proof: nothing was published, and no local file is offered — this artifact is wrong, '
    + 'not merely undelivered.\n');
  process.exit(code);
};

// Delivery is the opposite posture: undelivered evidence never fails a run. The proof is the passing
// test plus the mutation verdict, so the exit code stays 0 and the operator gets a file to attach.
//
// `headline` names WHICH kind of undelivered this is. Everything that reaches the destination and
// comes back wrong is a publish that failed; a film refused locally for its size failed at nothing,
// because it was never sent — and calling that a failure sends an operator looking for an outage.
const undelivered = (message, headline = 'publish failed') => {
  err(`publish-proof: ${headline} — ${message}\n`);
  err('publish-proof: the run STAYS ALIVE — the proof is the passing test plus the mutation verdict, '
    + 'not its delivery.\n');
  err(`publish-proof: the concatenated proof is at ${PROOF_FILE} — attach it to the PR by hand.\n`);
  out(`PWPROVE_PROOF_FILE ${PROOF_FILE}\n`);
  process.exit(0);
};

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

// ============================================================ the text that travels as JSON
// Built here, before any work, because the TOKEN-LEAK gate scans it: the PR link, the spec path and
// the mutation verdict travel WITH the recording, since met outside the PR a bare video says a test
// passed but not which change it proves, nor that the test can fail at all.
const descriptionLines = [];
if (manifest.prUrl) descriptionLines.push(`PR: ${manifest.prUrl}`);
if (manifest.spec) descriptionLines.push(`Spec: ${manifest.spec}`);
if (manifest.mutation) descriptionLines.push(`Mutation: ${manifest.mutation}`);
const description = descriptionLines.join('\n');
const title = manifest.title || 'E2E proof';

// ============================================================ configuration
const CLIPS = clipsConfig();
if (!CLIPS.ok) stop(1, `${CLIPS.reason}.`);

// ============================================================ video tooling
// Probe by RUNNING the tool: a `command -v` hit says a name resolves, not that it executes. The
// measurement itself lives in `video.mjs`, shared with `clip-fidelity.mjs frames` — one copy of the
// container-lies fallback, because a second copy would be the one that trusts `format=duration`.
const tooling = videoTooling();
if (!tooling.ok) {
  stop(4, `${tooling.tool} is not runnable — install ffmpeg, then retry. (${tooling.reason})`);
}

// `unreadable` decides what an unprobeable file MEANS, which differs by caller and is not ffprobe's
// call to make: a source clip ffprobe cannot open is a broken recording (a gate, named as such), while
// the concatenated output failing to probe is this machine's tooling misbehaving (exit 4). Without the
// hook every corrupt clip would exit 4 and no gate would be named for a defect that is squarely a
// recording defect.
const probe = (file, unreadable = (why) => stop(4, why)) => probeVideo(file, unreadable);

// ============================================================ GATE: token leak (the text half)
// Runs first of all the gates, because it needs no probe and no concatenation: if a credential is
// sitting in an AC there is nothing to gain by measuring video before refusing.
const BEARER = process.env.BEARER;
const needle = BEARER ? Buffer.from(BEARER, 'utf8') : null;
const LEAK_REMEDY =
  'Seed auth out-of-band (env + addInitScript / gitignored storageState), scrub it, then retry.';
if (needle) {
  const fields = [
    ['the recording title', title],
    ['the description (PR / spec / mutation)', description],
    ...clips.map((c, i) => [`chapter ${i + 1}'s criterion (clips[${i}].ac)`, c.ac]),
    // `scenario` became publishable text the moment it started supplying the chapter label. A field
    // that is sent to a public recording and NOT scanned here is exactly the hole this gate exists
    // to close, so it is listed even though it is usually a bare test title.
    ...clips.map((c, i) => [`chapter ${i + 1}'s label (clips[${i}].scenario)`, c.scenario]),
  ];
  for (const [where, text] of fields) {
    if (typeof text === 'string' && text.includes(BEARER)) {
      gate(6, 'TOKEN-LEAK', `the auth token ($BEARER) appears in ${where}.`,
        'That text is sent as JSON to a recording that is PUBLIC by default, so publishing would leak it.',
        LEAK_REMEDY);
    }
  }
}

// ============================================================ probe + GATE: empty/broken recording
// Size is checked BEFORE the probe: a 1-byte "video" makes ffprobe fail, and a tooling error (exit 4)
// would then mask the recording defect the gate exists to name.
const probed = clips.map((c, i) => {
  if (!fs.existsSync(c.file)) stop(4, `clips[${i}] names a file that does not exist: '${c.file}'`);
  const file = path.resolve(c.file);
  const bytes = fs.statSync(file).size;
  if (bytes < 1024) {
    gate(3, 'EMPTY-RECORDING', `clips[${i}] '${c.file}' is only ${bytes}B (< 1KB).`,
      'That is a broken or empty screencast, not a proof. Re-run the proof spec, then retry.');
  }
  const p = probe(file, (why) =>
    gate(3, 'EMPTY-RECORDING', `clips[${i}] '${c.file}' cannot be read as video — ${why}`,
      'A recording no tool can open proves nothing. Re-run the proof spec, then retry.'));
  if (!p.codec || !(p.seconds > 0) || !p.width || !p.height) {
    gate(3, 'EMPTY-RECORDING',
      `clips[${i}] '${c.file}' carries no readable video (${p.seconds.toFixed(3)}s, ${p.width}x${p.height}, `
        + `codec '${p.codec}').`,
      'A recording nothing can play proves nothing. Re-run the proof spec, then retry.');
  }
  err(`publish-proof: clip ${i + 1}/${clips.length} ${p.seconds.toFixed(3)}s ${p.width}x${p.height} ${p.codec}\n`);
  return p;
});

// ============================================================ GATE: token leak (the byte half)
// Binary-safe literal search over the raw bytes: decoding a webm as UTF-8 first would mangle the byte
// sequences a token could be hiding in. This is the equivalent of `LC_ALL=C grep -qF`.
const scanBytes = (file, where) => {
  if (!needle) return;
  let haystack;
  try {
    if (!fs.statSync(file).isFile()) return;
    haystack = fs.readFileSync(file);
  } catch {
    return; //                                       an unreadable scan target is not a leak finding
  }
  if (haystack.includes(needle)) {
    gate(6, 'TOKEN-LEAK', `the auth token ($BEARER) appears in the bytes of ${where} ('${file}').`,
      'The recording is public by default, so publishing it would leak the credential.', LEAK_REMEDY);
  }
};
if (needle) {
  for (const [i, p] of probed.entries()) scanBytes(p.file, `clip ${i + 1}`);
  for (const f of (process.env.SCAN ?? '').split(/\s+/).filter(Boolean)) scanBytes(f, 'a $SCAN artifact');
}

// ============================================================ GATE: homogeneity
// Stream copy muxes the inputs' existing packets into one container without decoding them, so it
// cannot reconcile a disagreement: a clip at another codec or another size produces output that plays
// wrong (or not at all) while ffmpeg exits 0. Reads the probe data already gathered above.
const shape = (p) => `${p.codec} ${p.width}x${p.height}`;
const oddClip = probed.findIndex((p) => shape(p) !== shape(probed[0]));
if (oddClip > 0) {
  gate(8, 'HOMOGENEITY',
    `clips[${oddClip}] is ${shape(probed[oddClip])} but clips[0] is ${shape(probed[0])}.`,
    'Stream-copy concatenation of mismatched inputs yields a corrupt video WITHOUT failing, so this is '
      + 'refused before concatenation runs.',
    'Re-record the odd clip at the same viewport, or drop it from the manifest.');
}

// Chapter offsets are the CUMULATIVE measured durations, in manifest order — the order a reviewer
// watches, which is AC order.
//
// A chapter title is a LABEL: it renders as a scrubber tooltip, in tooltip-sized space. An
// acceptance criterion is a sentence — the run that prompted this carried titles of 54 to 167
// characters, which overlaid the video and clipped. So the title is the scenario name (the test's
// own title, which is already short) and the criterion verbatim goes to a timestamped comment,
// where there is room to wrap. `ac` remains the source of truth for both; nothing is paraphrased.
const CHAPTER_LABEL_MAX = 60;

function chapterLabel(clip, index) {
  const raw = (typeof clip.scenario === 'string' && clip.scenario.trim()) || clip.ac || `Scenario ${index + 1}`;
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= CHAPTER_LABEL_MAX) return collapsed;
  // Cut on a word boundary when there is one near the limit — a label severed mid-word reads as
  // corruption rather than as truncation.
  const cut = collapsed.slice(0, CHAPTER_LABEL_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > CHAPTER_LABEL_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const chapters = [];
const narration = [];
let cursor = 0;
for (const [i, c] of clips.entries()) {
  const startMs = Math.round(cursor * 1000);
  chapters.push({ startMs, title: chapterLabel(c, i) });
  narration.push({ startMs, content: c.ac });
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
  // The partial output goes with it. ffmpeg that died mid-mux leaves a truncated video at the STABLE
  // path, and a path an operator has been told to attach by hand must never hold a half-written file.
  try {
    fs.unlinkSync(PROOF_FILE);
  } catch {
    /* nothing was written — the path is already clear */
  }
  stop(4, `ffmpeg could not concatenate the clips: ${(concat.stderr ?? '').trim().split('\n').slice(-3).join(' ')}`);
}

const proof = probe(PROOF_FILE);
err(
  `publish-proof: concatenated ${clips.length} clip(s) -> ${PROOF_FILE} ` +
    `(${proof.seconds.toFixed(3)}s, sum of inputs ${inputSeconds.toFixed(3)}s)\n`,
);

// ============================================================ GATE: duration reconciliation
// The chapter offsets are cumulative INPUT durations, so the output must total the same. If it does
// not, every chapter after the divergence points at the wrong footage — and a reviewer sent to the
// wrong second reads it as the criterion failing.
//
// The tolerance is a container-rounding allowance and nothing more. It grows PER CLIP, not per second:
// rounding accrues once per input muxed, so a fraction of a percent of the total would hand a 40-minute
// run tens of seconds of slack — enough to swallow an entire missing clip while the gate stayed quiet.
// A stream copy of well-formed inputs lands exact (a measured 34.680s clip concatenated with itself
// reported 69.360s), so this is deliberately tight.
const drift = Math.abs(proof.seconds - inputSeconds);
const tolerance = 0.75 + 0.05 * probed.length;
if (drift > tolerance) {
  gate(9, 'DURATION-RECONCILIATION',
    `the concatenated video reports ${proof.seconds.toFixed(3)}s but its inputs sum to `
      + `${inputSeconds.toFixed(3)}s (off by ${drift.toFixed(3)}s, tolerance ${tolerance.toFixed(3)}s).`,
    'Chapter markers computed from the inputs would point at the wrong footage, so this publishes '
      + 'nothing.',
    'Usually one input is truncated or its container duration lies — re-record the clips, then retry.');
}

// The bytes that would ACTUALLY be sent, scanned last: concatenation copies packets, and a container
// this script did not write is not a container it gets to vouch for.
scanBytes(PROOF_FILE, 'the concatenated proof');

// ============================================================ the destination's inline ceiling
// The import action refuses more than 64 MiB of video carried inline, and a base64 data URL decodes
// to exactly the bytes sitting on disk — so `stat` answers the question before a single byte is
// encoded. Encoding first would spend the base64 pass and the upload to learn what the filesystem
// already knew.
//
// This is NOT a fifth gate, and the difference is the point. Every gate above says the artifact is
// WRONG and withholds the file with it. This says the opposite: the film is fine, it is simply too
// big for this door — so it takes the Undelivered path, keeps the file, and the run stays green.
// Withholding it would destroy the only copy of good evidence at the moment the operator needs it.
const INLINE_BYTE_CEILING = 67_108_864; // 64 MiB decoded — the import action's documented cap
const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
const filmBytes = fs.statSync(PROOF_FILE).size;
if (filmBytes > INLINE_BYTE_CEILING) {
  // Both numbers, exact: an operator told only "too large" cannot tell whether dropping one scenario
  // would clear it or whether the run is nowhere near.
  undelivered(
    `the concatenated film is ${mib(filmBytes)} (${filmBytes} bytes), over the `
      + `${mib(INLINE_BYTE_CEILING)} (${INLINE_BYTE_CEILING} bytes) the import action carries inline. `
      + 'Nothing was encoded and nothing was sent.',
    'not delivered',
  );
}

// ============================================================ the one request
const body = {
  data: `data:video/webm;base64,${fs.readFileSync(PROOF_FILE).toString('base64')}`,
  title,
  description,
  chapters,
  durationMs: Math.round(proof.seconds * 1000),
  width: proof.width,
  height: proof.height,
  hasAudio: proof.hasAudio,
  source: 'Playwright proof',
  visibility: 'public',
};

let response;
try {
  response = await callClipsAction(CLIPS, IMPORT_ACTION, body, 180_000);
} catch (e) {
  undelivered(`${CLIPS.endpoint} unreachable (${e.message})`);
}

// The outcome is READ OUT OF THE BODY, never off the status code. A refusal here is an HTTP 200
// carrying an error, so `response.status === 200` would be a vacuous success check — and the one
// status that does mean refusal (401) carries a body with no JSON-RPC result to parse at all.
// Named one outcome at a time rather than as "not a success": a refused credential, an action this
// token may not call, and an action that rejected the film are three different problems with three
// different remedies, and one generic sentence sends an operator to the wrong one.
const { outcome, detail, payload } = classifyClipsResponse(response.status, response.text);
switch (outcome) {
  case 'ok':
    break;
  case 'rejected':
    undelivered(`${CLIPS.endpoint} refused the credential — ${detail}`);
    break;
  case 'not-delegable':
    undelivered(`${CLIPS.endpoint} will not run ${IMPORT_ACTION} for this credential ("${detail}") — `
      + `${NOT_DELEGABLE_REMEDY}.`);
    break;
  default:
    undelivered(`${CLIPS.endpoint} rejected the publish — ${detail}`);
}

const shareUrl = typeof payload?.shareUrl === 'string' ? payload.shareUrl : '';
if (!shareUrl) {
  undelivered(`the destination returned no shareUrl: ${response.text.slice(0, 400)}`);
}

// The share URL is what a reviewer opens; the per-chapter deep links are NOT built on it. On
// /share/<id> the `t` parameter is the agent-access token, not a timestamp — a deep link built there
// opens at the top and drops the offset silently, so a reviewer sent to one criterion watches the run
// from the beginning and reads it as the wrong evidence. /embed/<id> is the route that parses `t` as
// seconds, so the per-chapter links are built from the returned recording id against this origin.
//
// When the destination returns no usable id there is nothing honest to build, and a link that opens
// at the wrong moment is worse than no link — so the offsets are reported without one.
const recordingId = typeof payload?.recordingId === 'string' ? payload.recordingId : '';
const deepLink = recordingId
  ? (seconds) => `${CLIPS.origin}/embed/${recordingId}?t=${seconds}`
  : null;

// The narration, as timestamped comments. Deliberately AFTER the film is published and its id is in
// hand: the recording is the proof, the comments are its captions, and a caption that fails to post
// must not cost a reviewer the link. Reported, never fatal.
if (recordingId) {
  const { posted, failed, firstError } = await postChapterComments(CLIPS, recordingId, narration);
  if (posted) err(`publish-proof: ${posted} timestamped comment(s) attached\n`);
  if (failed) {
    err(
      `publish-proof: ${failed} of ${narration.length} comment(s) could not be attached (${firstError}). `
        + 'The film and its chapter markers are published and correct; the per-scenario text is what is '
        + 'missing, so the criteria are in the chapter labels only. A not-delegable failure here '
        + "means the comment action is absent from this credential's callable catalog.\n",
    );
  }
} else {
  err('publish-proof: no recordingId returned, so no timestamped comments were attached — the '
    + 'criteria are in the chapter labels only.\n');
}

err(`publish-proof: ${chapters.length} chapter(s) published -> ${shareUrl}\n`);
if (!deepLink) {
  err('publish-proof: the destination returned no recordingId, so no per-chapter deep links are '
    + 'offered — the chapters are still markers on the share page.\n');
}
for (const [i, ch] of chapters.entries()) {
  const seconds = Math.round(ch.startMs / 1000);
  const target = deepLink ? ` -> ${deepLink(seconds)}` : '';
  err(`publish-proof: chapter ${i + 1} @${ch.startMs}ms${target}\n`);
}
out(`${shareUrl}\n`);
out(`PWPROVE_URL ${shareUrl}\n`);
