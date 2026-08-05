#!/usr/bin/env node
// Throwaway stand-in for a Clips MCP endpoint, for scripts/ci/test-publish-proof.sh.
//
// It is the ONE seam in the publish check: publish-proof.mjs and preflight.mjs run as real
// subprocesses over real ffmpeg and real fixture videos, and only the destination is swapped by
// pointing PW_PROVE_CLIPS_ENDPOINT here. Every request is appended to $CAP/requests.jsonl as
// {method,url,headers,body} so the test can assert on what would have been sent.
//
//   CAP=<dir> STUB_MODE=ok|validation|unauthorized|unknown-tool|error node clips-stub-server.mjs
//
// The five modes are the five shapes the live deployment was MEASURED to produce (2026-08-05/06),
// and the split between them is the whole point of the check:
//
//   ok           200, a JSON-RPC result whose single text block is the action's own JSON
//   validation   200, `isError: true` — the action was REACHED and rejected the arguments
//   unknown-tool 200, `isError: true`, "Unknown tool: …" — the token's callable catalog lacks it
//   unauthorized 401, and the body is NOT JSON-RPC at all: no `result`, no `jsonrpc`
//   error        500, a plain body — the destination fell over
//
// Only `unauthorized` carries a non-2xx status that means "refused". Everything after auth arrives
// at HTTP 200, so a caller keyed on the status code passes vacuously — which is what this fixture
// exists to make a test failure rather than a live-run surprise.
//
// Prints `PORT <n>` as its first stdout line once listening, then serves until killed.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const CAP = process.env.CAP || process.cwd();
const MODE = process.env.STUB_MODE || 'ok';
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

    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
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
    if (MODE === 'unknown-tool') return toolError(`Unknown tool: ${action}`);
    if (MODE === 'validation') {
      // Verbatim from the live deployment. The scripts must NOT match this sentence — they classify
      // by exclusion and echo it — so it lives here only to be echoed back at them.
      return toolError('Error: Invalid action parameters — url: Supply exactly one of `url` or `data`.');
    }

    if (action === 'add-comment') {
      return toolResult({ commentId: `cmt_stub_${Math.random().toString(36).slice(2, 8)}` });
    }
    const recordingId = 'rec_stub_1';
    return toolResult({
      recordingId,
      title: args?.title ?? '',
      status: 'ready',
      visibility: args?.visibility ?? 'public',
      shareUrl: `http://127.0.0.1:${server.address().port}/share/${recordingId}`,
      chapters: args?.chapters ?? [],
    });
  });
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT ${server.address().port}\n`);
});
