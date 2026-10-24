// Junta HTML + CSS + JS + logo em UM arquivo: editor/dist/editor.html (abre direto no navegador).
import fs from 'node:fs';
const r = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const logo = r('./logo.b64').trim();
let html = r('./src/index.html');
html = html.replace('/*CSS*/', () => r('./src/style.css'))
  .replace('/*LOGO*/', () => logo)
  .replace('/*JS*/', () => r('./src/app.js').replace(/<\/script/gi, '<\\/script'));
fs.mkdirSync(new URL('../editor/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../editor/index.html', import.meta.url), html);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB');
