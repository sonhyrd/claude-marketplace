#!/usr/bin/env node
// Throwaway stand-in for a Clips MCP endpoint, for scripts/ci/test-publish-proof.sh.
//
// It is the ONE seam in the publish check: publish-proof.mjs and preflight.mjs run as real
// subprocesses over real ffmpeg and real fixture videos, and only the destination is swapped by
// pointing PW_PROVE_CLIPS_ENDPOINT here. Every request is appended to $CAP/requests.jsonl as
// {method,url,headers,body} so the test can assert on what would have been sent.
//
//   CAP=<dir> STUB_MODE=ok|validation|unauthorized|unknown-tool|unknown-tool-prefixed|error|garbled \
//     STUB_ENCODING=json|sse node clips-stub-server.mjs
//
// The modes are the shapes the live deployment was MEASURED to produce (2026-08-05/06), and the
// split between them is the whole point of the check:
//
//   ok                     200, a JSON-RPC result whose text block is the action's own JSON
//   validation             200, `isError: true` — the action was REACHED and rejected the arguments
//   unknown-tool           200, `isError: true`, "Unknown tool: …" — the callable catalog lacks it
//   unknown-tool-prefixed  the same refusal wearing the "Error: " prefix the wrapper uses elsewhere
//   unauthorized           401, and the body is NOT JSON-RPC at all: no `result`, no `jsonrpc`
//   error                  500, a plain body — the destination fell over
//   garbled                200, a body that is not JSON-RPC at all — the ONE mode that is not a
//                          measured shape. It stands for the next unmodelled response, and exists so
//                          the client's 'unexpected' fallthrough stays reachable under both encodings
//
// Only `unauthorized` carries a non-2xx status that means "refused". Everything after auth arrives
// at HTTP 200, so a caller keyed on the status code passes vacuously — which is what this fixture
// exists to make a test failure rather than a live-run surprise.
//
// STUB_ENCODING is a SECOND AXIS, orthogonal to STUB_MODE: it decides how a response the stub has
// already chosen is written on the wire, and nothing about which response that is.
//
//   json  (default)  the body is plain `application/json` — every existing case is unchanged
//   sse              the SAME body as one `text/event-stream` frame: `event: message`, then the
//                    JSON on a `data:` line
//
// It is an axis rather than an `ok-sse` mode because on the live deployment the wire encoding is
// independent of the outcome, and a mode value would bake in the assumption that only successes
// ever arrive as a stream.
//
// Measured, like the modes: the live deployment answers some responses as plain JSON and others as
// the `event: message` / `data: {…}` frame carried here, with the identical JSON-RPC body, on the
// same endpoint and the same bearer within one session. The frame appears in six recorded session
// transcripts across pw-prove 0.27.0 through 0.35.0 — first recorded as FR23 at 0.27.0, where it
// read as a flaky destination because it cleared on the next publish. The bodies themselves are not
// quoted: they carry a live share link and a vault lease id.
//
// Prints `PORT <n>` as its first stdout line once listening, then serves until killed.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const CAP = process.env.CAP || process.cwd();
const MODE = process.env.STUB_MODE || 'ok';
const ENCODING = process.env.STUB_ENCODING || 'json';
const CAPTURE = path.join(CAP, 'requests.jsonl');

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = { unparseable: raw.slice(0, 200) };
    }
    // Only CALLS are captured. The readiness poll GETs this same server (it asks whether anything
    // answers, not what), and counting that as an outbound call would turn "exactly one request"
    // into a number that depends on how long the server took to boot.
    if (req.method === 'POST') {
      fs.appendFileSync(
        CAPTURE,
        `${JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body })}\n`,
      );
    }

    // One body, two wire encodings. `sse` writes exactly the bytes the live deployment was measured
    // to send: one `event: message` frame whose `data:` line carries the identical JSON.
    const send = (status, payload) => {
      const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
      if (ENCODING === 'sse') {
        res.writeHead(status, { 'Content-Type': 'text/event-stream' });
        res.end(`event: message\ndata: ${json}\n\n`);
        return;
      }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(json);
    };
    const id = body?.id ?? null;
    // A tool result is a JSON-RPC result carrying content blocks — the action's own JSON travels
    // as the text of one block, which is how the agent-native MCP wrapper surfaces it.
    const toolResult = (payload) =>
      send(200, {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false },
      });
    const toolError = (text) =>
      send(200, {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text }], isError: true },
      });

    const action = body?.params?.name ?? '';
    const args = body?.params?.arguments ?? {};

    if (MODE === 'unauthorized') {
      // The measured shape: an honest 401 whose body is not JSON-RPC. A parser that reaches
      // straight for `result.content[0].text` throws here rather than reporting a refusal.
      return send(401, { error: 'Unauthorized', message: 'Missing or invalid bearer token' });
    }
    if (MODE === 'error') {
      // Deliberately echoes the credential it was sent. Real deployments do this in error bodies,
      // and every failure path in the client ends in an excerpt of a foreign body printed into a
      // run log — so this mode is what proves the client refuses to repeat the bearer.
      return send(500, { error: 'Internal server error', received: req.headers.authorization ?? '' });
    }
    if (MODE === 'garbled') {
      // Prose where a JSON-RPC envelope belongs. Under `sse` it travels as the `data:` payload, so
      // the client unwraps the frame successfully and STILL has nothing it can parse — which is the
      // fallthrough this mode exists to keep reachable.
      return send(200, 'the destination is having a think about it');
    }
    if (MODE === 'unknown-tool') return toolError(`Unknown tool: ${action}`);
    // The same refusal as `unknown-tool`, wearing the `Error: ` prefix this wrapper puts on its
    // other tool errors. Which of the two a deployment sends is the server's to change, and a
    // client that recognises only one reports a non-delegable action as a usable credential.
    if (MODE === 'unknown-tool-prefixed') return toolError(`Error: Unknown tool: ${action}`);
    if (MODE === 'validation') {
      // Verbatim from the live deployment. The scripts must NOT match this sentence — they classify
      // by exclusion and echo it — so it lives here only to be echoed back at them.
      return toolError('Error: Invalid action parameters — url: Supply exactly one of `url` or `data`.');
    }

    if (action === 'add-comment') {
      return toolResult({ commentId: `cmt_stub_${Math.random().toString(36).slice(2, 8)}` });
    }
    const recordingId = 'rec_stub_1';
    const shareUrl = `http://127.0.0.1:${server.address().port}/share/${recordingId}`;
    // THE LIVE SHAPE, and it is not the obvious one. The deployment returns NO structuredContent and
    // NO JSON in the content block — the block is human prose, and the only machine-readable link is
    // the `_meta` open-link hint. An earlier version of this stub answered with a top-level
    // `recordingId`/`shareUrl`, so the test asserting "a real id is parsed out of the success
    // envelope" passed against a fiction while the real publish reported Undelivered and posted no
    // comments. A stub that is easier to parse than the server is a stub that hides the bug.
    // Measured against clips.paulsjob.ai on 2026-08-06.
    return send(200, {
      jsonrpc: '2.0',
      id,
      result: {
        _meta: {
          'agent-native/openLink': {
            label: 'Open imported clip in Clips',
            view: 'recording',
            webUrl: shareUrl,
          },
        },
        content: [
          {
            type: 'text',
            text: `${args?.title ?? 'Untitled'} — imported (${(args?.chapters ?? []).length} chapters)`,
          },
        ],
        isError: false,
      },
    });
  });
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT ${server.address().port}\n`);
});
