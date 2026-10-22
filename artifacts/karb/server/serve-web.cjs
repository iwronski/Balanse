const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'dist-web');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Run build:web before serve:web');
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1) throw new Error('PORT must be set');
http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  // Never turn an API failure or missing asset into an HTML success response.
  if (name === '/api' || name.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
  let file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (path.extname(name)) { res.writeHead(404); res.end(); return; }
    file = path.join(root, 'index.html');
  }
  res.writeHead(200, {
    'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`Karb web listening on ${port}`));
