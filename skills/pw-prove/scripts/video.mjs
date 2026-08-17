// video.mjs — the one place a Proof clip is measured. Shared by `publish-proof.mjs` (chapter
// offsets, the empty-recording and duration-reconciliation gates) and `clip-fidelity.mjs frames`
// (the Step-7 frame the agent looks at), following the `clips.mjs` / `pwprove-run.mjs` precedent:
// a library, not an entry point, so it registers no run-ledger line of its own.
//
// It exists because BOTH callers need the same measurement, and the measurement is not the one-liner
// it looks like. A live-recorded webm frequently carries NO duration in its container metadata, so a
// second copy of this logic would inevitably be the copy that trusts `format=duration` and reads
// `N/A` as zero — which for the publish path is a chapter marker pointing at the wrong footage, and
// for the frame path is a frame grabbed from the boot screen.
//
// Zero dependencies, Node stdlib only. `ffprobe`/`ffmpeg` stay subprocesses.
import { spawnSync } from 'node:child_process';

/** One subprocess convention for every video call: text out, and a buffer big enough for a probe. */
export const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/**
 * Is the video tooling actually usable? Probes by RUNNING each tool: a `command -v` hit says a name
 * resolves, not that it executes. Returns `{ ok: true }` or `{ ok: false, tool, reason }` — what the
 * ABSENCE means is the caller's call, and it differs: publish stops, the frame extract skips.
 */
export function videoTooling(tools = ['ffprobe', 'ffmpeg']) {
  for (const tool of tools) {
    const r = run(tool, ['-version']);
    if (r.error || r.status !== 0) {
      return { ok: false, tool, reason: r.error?.message ?? `exit ${r.status}` };
    }
  }
  return { ok: true };
}

/**
 * Seconds of playable video, by decoding the file to null and reading ffmpeg's LAST `time=` stamp.
 *
 * THE CONTAINER LIES — that is the whole reason this exists. A webm written by a live screen
 * recording is muxed without knowing when it will end, so its container frequently declares no
 * duration at all. Trusting `format=duration` there yields nothing, and "nothing" silently reads as
 * a zero-length clip. Decoding is slower and always right, so it is the fallback, never the first
 * move. Returns 0 only when the file decodes to no frames at all.
 */
export function decodedSeconds(file) {
  const decode = run('ffmpeg', ['-nostats', '-i', file, '-f', 'null', '-']);
  const stamps = [...`${decode.stdout ?? ''}${decode.stderr ?? ''}`.matchAll(/time=([0-9:][0-9:.]*)/g)];
  if (!stamps.length) return 0;
  const parts = stamps[stamps.length - 1][1].split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

/**
 * One probe per file answers everything either caller needs: duration (with the fallback above),
 * codec, dimensions and whether the recording carries audio.
 *
 * `unreadable` decides what an unprobeable file MEANS, which differs by caller and is not ffprobe's
 * call to make: a source clip publish cannot open is a broken recording (a gate, named as such),
 * the concatenated output failing to probe is this machine's tooling misbehaving, and a clip the
 * frame extract cannot read is one missing frame in an inspection that never fails the run.
 *
 * `durationSource` says WHICH of the two answers this is — `'container'` or `'decoded'` — so a
 * caller can state it rather than leaving the reader to guess whether the number was measured.
 */
export function probeVideo(file, unreadable = (why) => { throw new Error(why); }) {
  const r = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name,width,height',
    '-show_entries', 'format=duration',
    '-of', 'json',
    file,
  ]);
  if (r.status !== 0) {
    return unreadable(`ffprobe cannot read '${file}': ${(r.stderr ?? '').trim() || `exit ${r.status}`}`);
  }
  let json;
  try {
    json = JSON.parse(r.stdout ?? '{}');
  } catch (e) {
    return unreadable(`ffprobe returned unparseable output for '${file}': ${e.message}`);
  }
  const streams = Array.isArray(json.streams) ? json.streams : [];
  const video = streams.find((s) => s.codec_type === 'video') ?? {};
  const raw = json.format?.duration;
  const parsed = raw === undefined || raw === 'N/A' ? NaN : Number(raw);
  const declared = Number.isFinite(parsed) && parsed > 0;
  return {
    file,
    seconds: declared ? parsed : decodedSeconds(file),
    durationSource: declared ? 'container' : 'decoded',
    codec: video.codec_name ?? '',
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}
