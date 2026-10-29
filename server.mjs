import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const port = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Port mora biti cijeli broj od 1 do 65535.');
  process.exit(1);
}
const projectRoot = dirname(fileURLToPath(import.meta.url));
const root = await realpath(args.includes('--dist') ? resolve(projectRoot, 'dist') : projectRoot);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method not allowed');
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname.replace(/^\/+/, '') || 'index.html';
    if (relative.split('/').some(part => part.startsWith('.')) || relative.includes('\\')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const candidate = resolve(root, relative);
    if (!candidate.startsWith(root + sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const target = await realpath(candidate);
    if (!target.startsWith(root + sep) || !(await stat(target)).isFile()) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': mime[extname(target)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error instanceof URIError ? 400 : 500;
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(status === 404 ? 'Not found' : status === 400 ? 'Bad request' : 'Server error');
  }
});
server.on('error', error => {
  console.error(`Pokretanje servera nije uspjelo: ${error.message}`);
  process.exit(1);
});
server.listen(port, '0.0.0.0', () => console.log(`Teretana server je pokrenut na portu ${port}${args.includes('--dist') ? ' (dist)' : ''}.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
