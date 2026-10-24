// Cloudflare Pages Function — NÃO é usada no GitHub Pages.
// Rota: POST /api  →  encaminha para o Apps Script injetando a chave secreta no servidor.
// Secrets (Cloudflare → Settings → Variables and Secrets → Encrypt):
//   APPS_SCRIPT_URL      = URL /exec do Apps Script
//   APPS_SCRIPT_API_KEY  = chave gerada por gerarNovaApiKey()/mostrarApiKey()
export async function onRequestPost({ request, env }) {
  if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_API_KEY) {
    return json({ ok: false, error: { code: 'config', message: 'Proxy não configurado.' } }, 500);
  }
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ ok: false, error: { code: 'origin', message: 'Origem não permitida.' } }, 403);
  }
  let body;
  try { body = await request.json(); } catch (e) {
    return json({ ok: false, error: { code: 'bad_request', message: 'JSON inválido.' } }, 400);
  }
  if (!body || typeof body !== 'object') return json({ ok: false, error: { code: 'bad_request', message: 'Requisição inválida.' } }, 400);
  body.apiKey = env.APPS_SCRIPT_API_KEY;
  const r = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body), redirect: 'follow'
  });
  const text = await r.text();
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
const json = (o, s) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
