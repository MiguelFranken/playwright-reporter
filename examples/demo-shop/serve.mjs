// Minimal static file server for the Acme web shop (no dependencies).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const abs = path.join(root, path.normalize(file));
  if (!abs.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(abs);
    res.writeHead(200, { 'content-type': types[path.extname(abs)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another shard already serves the app; stay alive so Playwright's webServer wrapper is happy.
    console.log('demo app already running on http://127.0.0.1:4174');
    setInterval(() => {}, 60_000);
    return;
  }
  throw err;
});
server.listen(4174, '127.0.0.1', () => console.log('demo app on http://127.0.0.1:4174'));
