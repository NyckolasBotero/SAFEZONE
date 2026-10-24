/* Utilitários e cliente da API — compartilhado pelo site e pelo painel. */
(function () {
  'use strict';
  const C = window.SZ_CONFIG;
  const SZ = (window.SZ = window.SZ || {});

  /* ------------------------------- API ------------------------------- */
  class ApiError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  SZ.ApiError = ApiError;

  /* barra de progresso no topo: aparece enquanto houver chamadas em andamento */
  let pend = 0, barEl = null;
  function bar(on) {
    if (!barEl) { barEl = document.createElement('div'); barEl.id = 'szbar'; barEl.setAttribute('role', 'progressbar'); barEl.setAttribute('aria-label', 'Carregando'); barEl.innerHTML = '<i></i>'; document.body.appendChild(barEl); }
    barEl.classList.toggle('on', on);
  }
  SZ.call = async function (action, data, token) {
    pend++; if (document.body) bar(true);
    try { return await rawCall(action, data, token); } finally { pend--; if (!pend && barEl) bar(false); }
  };
  async function rawCall(action, data, token) {
    const url = C.proxyUrl || C.apiUrl;
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, data: data || {}, token }), redirect: 'follow' });
    } catch (e) { throw new ApiError('NETWORK', 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.'); }
    let j;
    try { j = await res.json(); } catch (e) { throw new ApiError('BAD_RESPONSE', 'Resposta inesperada do servidor. Tente novamente em instantes.'); }
    if (!j || !j.ok) throw new ApiError((j && j.error && j.error.code) || 'ERROR', (j && j.error && j.error.message) || 'Erro inesperado.');
    return j.data;
  }

  const cacheGet = (k, ttl) => { try { const o = JSON.parse(sessionStorage.getItem(k) || 'null'); if (o && Date.now() - o.t < ttl) return o.v; } catch (e) { /* sem cache */ } return null; };
  const cacheSet = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* sem cache */ } };

  SZ.products = async function (force) {
    if (!force) { const c = cacheGet('sz_products', 60000); if (c) return c; }
    const v = await SZ.call('listProducts'); cacheSet('sz_products', v); return v;
  };
  SZ.product = async function (id) {
    const c = cacheGet('sz_products', 60000); const hit = c && c.find(p => p.id === id); if (hit) return hit;
    return SZ.call('getProduct', { id });
  };
  const DEFAULT_SETTINGS = { NomeLoja: 'Safezone', TelefoneComercial: C.whatsapp, Instagram: '@' + C.instagram, AvisoNFe: 'A Safezone não emite Nota Fiscal Eletrônica (NF-e).', TelefoneProdutos: '', TelefoneServicos: '', CanalOfertas: 'https://whatsapp.com/channel/0029Vb8cMtg6LwHpBszDvc13' };
  SZ.defaultSettings = DEFAULT_SETTINGS;
  /** Números de atendimento por tipo; o que estiver vazio usa o número geral. */
  SZ.phones = S => { const g = (S && S.TelefoneComercial) || C.whatsapp; return { geral: g, produtos: (S && S.TelefoneProdutos) || g, servicos: (S && S.TelefoneServicos) || g }; };
  /** Mostra o que já está salvo no aparelho na hora e atualiza em segundo plano (só avisa se mudou). */
  const lsGet = k => { try { const o = JSON.parse(localStorage.getItem(k) || 'null'); return o && o.v !== undefined ? o : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* sem cache */ } };
  SZ.swr = function (key, fetcher, onData) {
    const c = lsGet('sz2_' + key); let shown = null;
    if (c) { shown = JSON.stringify(c.v); onData(c.v, true); }
    return fetcher().then(v => { lsSet('sz2_' + key, v); if (JSON.stringify(v) !== shown) onData(v, false); return v; })
      .catch(e => { if (!c) throw e; return c.v; });
  };
  SZ.productSWR = function (id, onData) {
    const l = lsGet('sz2_products'), hit = l && Array.isArray(l.v) ? l.v.find(p => p.id === id) : null;
    if (hit) onData(hit, true);
    return SZ.call('getProduct', { id }).then(v => { if (!hit || JSON.stringify(v) !== JSON.stringify(hit)) onData(v, false); })
      .catch(e => { if (!hit || e.code === 'NOT_FOUND') throw e; });
  };
  SZ.settings = async function () {
    const c = cacheGet('sz_settings', 300000); if (c) return Object.assign({}, DEFAULT_SETTINGS, c);
    try { const v = await SZ.call('getSettings'); cacheSet('sz_settings', v); return Object.assign({}, DEFAULT_SETTINGS, v); }
    catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  };

  /* ---------------------------- formatação ---------------------------- */
  SZ.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  SZ.brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  SZ.money = v => { if (v === '' || v == null) return null; let s = String(v).replace(/R\$|\s/g, ''); if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); const n = Number(s); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN; };
  SZ.dt = s => { if (!s) return '—'; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] : ''}` : s; };
  SZ.thumb = (u, w) => (u && /^https:\/\/lh3\.googleusercontent\.com\/d\//.test(u) && u.indexOf('=') < 0) ? `${u}=w${w}` : u;
  SZ.SERVICE_CAT = 'Serviços de informática';
  SZ.CATEGORIES = ['Placas de vídeo', 'Memórias RAM', 'Processadores', 'Placas-mãe', 'SSDs e HDs', 'Fontes de alimentação', 'Gabinetes', 'Coolers e refrigeração', 'Periféricos', 'Kits e componentes diversos', SZ.SERVICE_CAT];
  /** Mesma regra do backend (usada só na prévia do painel). */
  SZ.pricing = function (normal, promo, modo, manual) {
    normal = Number(normal) || 0; promo = (promo === '' || promo == null) ? null : Number(promo);
    let atual = normal, anterior = null, desc = 0, auto = '';
    if (promo != null && promo > 0 && promo < normal) { atual = promo; anterior = normal; auto = 'OFERTA'; desc = Math.round((1 - promo / normal) * 100); }
    else if (promo != null && promo > 0 && promo === normal) auto = 'OFERTA';
    let selo = auto; if (modo === 'none') selo = ''; else if (modo === 'manual') selo = String(manual || '');
    return { precoAtual: atual, precoAnterior: anterior, desconto: desc > 0 ? desc : 0, selo };
  };

  /* ------------------------------ ícones ------------------------------ */
  const IC = {
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    gpu: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="9" cy="12" r="2.5"/><circle cx="16" cy="12" r="2.5"/><path d="M5 17v2"/>',
    ram: '<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16v3M10 16v3M14 16v3M18 16v3"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="5" height="5"/><path d="M15 7h2M15 11h2M7 16h10"/>',
    ssd: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 14h.01M11 14h6"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    pcase: '<rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M9 17h6"/>',
    fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7 2 0 2 3-1 5M14 12c4 0 7 1 7 4 0 2-3 2-5-1M12 14c0 4-1 7-4 7-2 0-2-3 1-5M10 12c-4 0-7-1-7-4 0-2 3-2 5 1"/>',
    mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    wa: '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.3-1.5-2-1-.8.7a3.5 3.5 0 0 1-1.9-1.9l.7-.8-1-2z"/>',
    bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
    shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    ig: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'
  };
  SZ.icon = (n, size) => `<svg class="ic" width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || IC.box}</svg>`;
  SZ.catIcon = c => ({ 'Placas de vídeo': 'gpu', 'Memórias RAM': 'ram', 'Processadores': 'cpu', 'Placas-mãe': 'board', 'SSDs e HDs': 'ssd', 'Fontes de alimentação': 'power', 'Gabinetes': 'pcase', 'Coolers e refrigeração': 'fan', 'Periféricos': 'mouse', 'Kits e componentes diversos': 'box', [SZ.SERVICE_CAT]: 'wrench' }[c] || 'box');

  /* ----------------------------- WhatsApp ----------------------------- */
  SZ.phoneDigits = s => String(s || C.whatsapp).replace(/\D/g, '');
  SZ.waUrl = (text, phone) => `https://wa.me/${SZ.phoneDigits(phone)}?text=${encodeURIComponent(text)}`;
  SZ.waProductText = p => `Olá, Safezone! Tenho interesse no produto: ${p.nome}.\n\nValor anunciado: ${SZ.brl(p.precoAtual)}. Condição: ${p.condicao || 'não informada'}. Código do anúncio: ${p.id}.\n\nGostaria de mais informações sobre disponibilidade e formas de pagamento.`;
  SZ.waServiceText = nome => `Olá, Safezone! Gostaria de solicitar um orçamento do serviço: ${nome}.\n\nPode me passar mais informações?`;
  SZ.clientId = () => { try { let c = localStorage.getItem('sz_cid'); if (!c) { c = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('sz_cid', c); } return c; } catch (e) { return ''; } };
  /** Registra "interesse recebido" (NÃO é venda). Não bloqueia a abertura do WhatsApp. */
  SZ.registerInterest = function (p, origem) {
    try {
      const url = C.proxyUrl || C.apiUrl;
      fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'registerInterest', data: { id: p.id, origem: origem || 'Site', clientId: SZ.clientId(), requestId: Math.random().toString(36).slice(2) + Date.now().toString(36) } }) }).catch(() => {});
    } catch (e) { /* o contato pelo WhatsApp continua funcionando */ }
  };

  /* ------------------------------ cartões ------------------------------ */
  SZ.badgeHtml = p => {
    if (!p.selo) return '';
    const c = p.selo.cor ? ` style="--bc:${SZ.esc(p.selo.cor)}"` : '';
    return `<span class="badge b-${SZ.esc(p.selo.estilo || 'solido')}"${c}>${SZ.esc(p.selo.texto)}</span>`;
  };
  SZ.priceHtml = p => {
    if (!(p.precoAtual > 0) && p.categoria === SZ.SERVICE_CAT) return '<div class="price"><span class="now now-sm">Sob consulta</span></div>';
    return `<div class="price">${p.precoAnterior ? `<span class="old">${SZ.brl(p.precoAnterior)}</span>` : ''}<span class="now">${SZ.brl(p.precoAtual)}</span>${p.desconto ? `<span class="off">-${p.desconto}%</span>` : ''}</div>`;
  };
  SZ.cardHtml = (p, opts) => {
    opts = opts || {}; const href = `produto.html?id=${encodeURIComponent(p.id)}`;
    const svc = p.categoria === SZ.SERVICE_CAT;
    const img = p.fotoPrincipal ? `<img src="${SZ.esc(SZ.thumb(p.fotoPrincipal, 640))}" alt="${SZ.esc(p.nome)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${SZ.esc(p.fotoPrincipal)}'">` : `<div class="noimg">${SZ.icon(SZ.catIcon(p.categoria), 40)}</div>`;
    return `<article class="card ${p.disponivel ? '' : 'is-out'}" data-id="${SZ.esc(p.id)}">
      <a class="card-img" href="${href}" aria-label="Ver detalhes de ${SZ.esc(p.nome)}">${img}
        <span class="card-tags">${SZ.badgeHtml(p)}</span>
        ${p.condicao ? `<span class="chip cond-${p.condicao === 'Novo' ? 'new' : 'used'}">${SZ.esc(p.condicao)}</span>` : ''}
        ${!p.disponivel ? '<span class="out-mark">Indisponível</span>' : ''}
      </a>
      <div class="card-body">
        <div class="card-cat">${SZ.esc(p.categoria)}</div>
        <h3 class="card-title"><a href="${href}">${SZ.esc(p.nome)}</a></h3>
        <div class="card-sub">${SZ.esc([p.marca, p.modelo].filter(Boolean).join(' · '))}</div>
        <p class="card-desc">${SZ.esc(p.descricaoCurta)}</p>
        ${SZ.priceHtml(p)}
        <div class="card-stock">${p.disponivel ? (svc ? 'Disponível sob agendamento' : (p.estoque <= 3 ? `Últimas ${p.estoque} un.` : 'Em estoque')) : 'Esgotado'}</div>
        <div class="card-actions">
          ${p.disponivel ? `<a class="btn btn-pri" data-interest="${SZ.esc(p.id)}" href="${SZ.waUrl(SZ.waProductText(p), opts.phones ? (svc ? opts.phones.servicos : opts.phones.produtos) : opts.phone)}" target="_blank" rel="noopener">${SZ.icon('wa', 18)} Tenho interesse</a>` : `<span class="btn btn-ghost is-disabled">Indisponível</span>`}
          <a class="btn btn-ghost" href="${href}">Detalhes</a>
        </div>
      </div></article>`;
  };
  /** Delegação: registra o interesse e deixa o link do WhatsApp abrir normalmente. */
  SZ.bindInterest = function (root, byId, origem) {
    root.addEventListener('click', ev => {
      const a = ev.target.closest('[data-interest]'); if (!a) return;
      const p = byId(a.dataset.interest); if (p) SZ.registerInterest(p, origem);
    });
  };

  /** Estrelas (1 a 5), acessíveis. */
  SZ.stars = n => { n = Math.max(0, Math.min(5, Math.round(Number(n) || 0))); return `<span class="stars" role="img" aria-label="${n} de 5 estrelas">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`; };
  /** Nome para exibir no site: primeiro nome + inicial do último (ex.: "Ana P."), sem expor o nome completo. */
  SZ.shortName = n => { const w = String(n || '').trim().split(/\s+/).filter(Boolean); return w.length > 1 ? `${w[0]} ${w[w.length - 1].charAt(0).toUpperCase()}.` : (w[0] || ''); };
  const ytId = u => { const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{6,15})/.exec(u); return m ? m[1] : ''; };
  const driveId = u => { const m = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,80})/.exec(u); return m ? m[1] : ''; };
  /** Player de vídeo sem controles, mudo e em loop (YouTube, Drive ou arquivo direto). */
  SZ.videoHtml = v => {
    const t = SZ.esc(v.titulo || ''), yid = ytId(v.url), did = driveId(v.url);
    let inner;
    if (yid) inner = `<iframe data-src="https://www.youtube-nocookie.com/embed/${yid}?autoplay=1&mute=1&loop=1&playlist=${yid}&controls=0&modestbranding=1&playsinline=1&rel=0" title="${t || 'Vídeo'}" allow="autoplay; encrypted-media; picture-in-picture" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    else if (did) inner = `<video muted loop playsinline preload="metadata" data-drive="${did}" src="https://drive.google.com/uc?export=download&id=${did}"></video>`;
    else inner = `<video muted loop playsinline preload="metadata" src="${SZ.esc(v.url)}"></video>`;
    return `<div class="fb-v">${inner}${t ? `<span class="fb-vt">${t}</span>` : ''}</div>`;
  };
  /** Liga os vídeos: toca só o que está na tela; se o Drive recusar o arquivo, usa o player do Drive. */
  SZ.wireVideos = root => {
    root.addEventListener('error', ev => {
      const v = ev.target; if (!(v instanceof HTMLVideoElement) || !v.dataset.drive) return;
      const f = document.createElement('iframe'); f.src = `https://drive.google.com/file/d/${v.dataset.drive}/preview`; f.setAttribute('allow', 'autoplay'); f.title = 'Vídeo'; v.replaceWith(f);
    }, true);
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      const el = e.target;
      if (el.tagName === 'VIDEO') { if (e.isIntersecting) { const p = el.play(); if (p && p.catch) p.catch(() => {}); } else el.pause(); }
      else if (el.tagName === 'IFRAME' && e.isIntersecting && !el.src && el.dataset.src) el.src = el.dataset.src;
    }), { threshold: 0.4 });
    root.querySelectorAll('video,iframe[data-src]').forEach(el => io.observe(el));
  };

  SZ.toast = function (msg, kind) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.className = 'toast show ' + (kind || ''); t.textContent = msg; clearTimeout(SZ.toast.t); SZ.toast.t = setTimeout(() => t.classList.remove('show'), 3600);
  };
  SZ.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
})();
