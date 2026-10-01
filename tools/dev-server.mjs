// Local server: serves dist/ like Vercel (directory index, clean URLs) and runs /api/lead.
// A mock Telegram endpoint lets the full "confirmed by server" path be tested without real secrets:
//   TELEGRAM_BOT_TOKEN=test TELEGRAM_CHAT_ID=1 TELEGRAM_API_BASE=http://localhost:8787/__mock_tg node tools/dev-server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import handler from '../api/lead.js';

const ROOT = path.resolve(process.argv[2] || 'dist');
const PORT = Number(process.env.PORT || 8787);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain' };
export const received = [];

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/__mock_tg/')) {
    let b = ''; for await (const c of req) b += c;
    if (process.env.MOCK_TG_FAIL) { res.writeHead(500); return res.end('{"ok":false}'); }
    received.push(JSON.parse(b)); fs.appendFileSync('/tmp/mock-telegram.log', b + '\n');
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
  }
  if (url.pathname === '/api/lead') return handler(req, res);
  let p = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(path.join(ROOT, '404.html')).pipe(res); }
  const stat = fs.statSync(p), type = TYPES[path.extname(p)] || 'application/octet-stream';
  const range = req.headers.range;
  if (range && type === 'video/mp4') {
    const [s, e] = range.replace('bytes=', '').split('-'); const start = +s, end = e ? +e : stat.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return fs.createReadStream(p, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
