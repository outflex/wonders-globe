import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.env.SERVE_ROOT || process.cwd());
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const port = Number(process.env.PORT || 4173);
createServer(async (request,response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    // Also exercise the project subpath used by GitHub Pages.
    if (pathname.startsWith('/wonders-globe/')) pathname = pathname.slice('/wonders-globe'.length);
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache' });
    response.end(body);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port,'127.0.0.1', () => console.log(`Terra: http://127.0.0.1:${port}`));
