#!/usr/bin/env node
// Throwaway stand-in for a Clips deployment, for scripts/ci/test-publish-proof.sh.
//
// It is the ONE seam in the publish check: publish-proof.mjs runs as a real subprocess over real
// ffmpeg and real fixture videos, and only the destination is swapped by pointing CLIPS_ORIGIN here.
// Every request is appended to $CAP/requests.jsonl as {method,url,headers,body} so the test can
// assert on what would have been sent.
//
//   CAP=<dir> STUB_MODE=ok|validation|unauthorized|error node clips-stub-server.mjs
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
    fs.appendFileSync(
      CAPTURE,
      `${JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body })}\n`,
    );

    const send = (status, payload) => {
      const text = JSON.stringify(payload);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(text);
    };

    if (MODE === 'validation') {
      // What the real action route answers a body that fails its schema: a 400 whose message the
      // route echoes verbatim because validation errors are parameter-shape only.
      return send(400, { error: 'Invalid action parameters: data: Required' });
    }
    if (MODE === 'unauthorized') return send(401, { error: 'Unauthorized' });
    if (MODE === 'error') return send(500, { error: 'Internal server error' });

    const id = 'rec_stub_1';
    return send(200, {
      recordingId: id,
      title: body?.title ?? '',
      status: 'ready',
      visibility: body?.visibility ?? 'public',
      shareUrl: `http://127.0.0.1:${server.address().port}/share/${id}`,
      chapters: body?.chapters ?? [],
    });
  });
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT ${server.address().port}\n`);
});
