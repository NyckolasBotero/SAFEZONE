// Servidor de teste: arquivos estáticos + Apps Script simulado em /__api
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { makeEnv } from './mock_env.mjs';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const seed = [['Login', 'Senha', 'Acesso'], ['dono@safezone.com', 'SenhaForte123', 'Aba Adm'], ['vendas@safezone.com', 'Outra12345', 'Vendas']];
let env = makeEnv(seed);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__api') { let b = ''; req.on('data', c => b += c); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(env.raw(b)); }); return; }
  if (req.url === '/__reset') { env = makeEnv(seed); res.writeHead(200); res.end('reset'); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(8790, '127.0.0.1', () => console.log('listening 8790'));
