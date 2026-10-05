import { build } from 'esbuild';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runtimeConfig, workerRpc } from '../../../scripts/runtime.mjs';

// Immutable bundle avoids Vite HMR reloads invalidating a measured frame-time sample.
const folder = path.resolve('packages/viewer/tests/build');
await build({ entryPoints: ['packages/viewer/tests/real-worker.tsx'], bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022', outdir: folder,
  alias: { '@mos/contracts': path.resolve('packages/contracts/src/index.ts') }, logLevel: 'warning' });
const config = await runtimeConfig();
const port = Number(process.env.REGISTER_VIEWER_TEST_PORT ?? 29991), baseUrl = `http://127.0.0.1:${port}`;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/rpc')) {
      if (req.method !== 'POST' || (req.headers.origin && req.headers.origin !== baseUrl) || req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); res.end(); return; }
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2 * 1024 * 1024) throw new Error('Request limit'); }
      const payload = JSON.parse(body), started=performance.now();console.log(`RPC ${payload.method} started`);
      const result = await workerRpc(config, payload.method, payload.params ?? {});console.log(`RPC ${payload.method} ${Math.round(performance.now()-started)} ms, ok=${result.ok}${result.ok?'':' code='+result.error?.code}`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(result)); return;
    }
    const pathname = new URL(req.url, baseUrl).pathname;
    if (pathname.endsWith('real-worker.js') || pathname.endsWith('real-worker.css')) {
      const file = pathname.endsWith('.css') ? 'real-worker.css' : 'real-worker.js';
      res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store' }); res.end(await readFile(path.join(folder, file))); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Register renderer verification</title><link rel="stylesheet" href="/real-worker.css"></head><body style="margin:0;background:#0a1424;color:#d8e4f3;font:12px sans-serif"><div id="root"></div><script type="module" src="/real-worker.js"></script></body></html>');
  } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: { code: 'TEST_TRANSPORT', message: error.message } })); }
});
server.listen(port, '127.0.0.1', () => console.log(`Immutable viewer integration server ${baseUrl}`));
