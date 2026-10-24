/* Páginas públicas: início, catálogo, produto e serviços. */
(function () {
  'use strict';
  const SZ = window.SZ, $ = (s, r = document) => r.querySelector(s), esc = SZ.esc;
  const page = document.body.dataset.page;
  let SET = {};

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const skeleton = n => Array.from({ length: n }, () => '<div class="skel" aria-hidden="true"></div>').join('');
  const errBox = (msg, retry) => `<div class="errbox" role="alert"><p>${esc(msg)}</p><button class="btn" id="retry">Tentar novamente</button></div>`;
  const nav = [['index.html', 'Início', 'home'], ['catalogo.html', 'Catálogo', 'catalog'], ['catalogo.html?promo=1', 'Ofertas', 'offers'], ['servicos.html', 'Serviços', 'services']];

  async function layout() {
    SET = await SZ.settings();
    const phone = SET.TelefoneComercial, ig = String(SET.Instagram || '').replace(/^@/, '');
    $('#hdr').outerHTML = `<header class="hdr"><a class="skip" href="#main">Pular para o conteúdo</a><div class="wrap hdr-in">
      <a class="brand" href="index.html" aria-label="Safezone — página inicial"><img src="assets/img/logo.png" alt="Safezone" width="90" height="36"></a>
      <nav class="nav" id="nav" aria-label="Principal">${nav.map(([h, t, k]) => `<a href="${h}" ${k === page ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
      <form class="search" action="catalogo.html" role="search">${SZ.icon('search', 18)}<label class="sr" for="q">Pesquisar produtos</label><input id="q" name="q" type="search" placeholder="Pesquisar produtos, marcas, modelos…" autocomplete="off"></form>
      <button class="burger" id="burger" aria-label="Abrir menu" aria-expanded="false">${SZ.icon('menu', 22)}</button></div></header>`;
    $('#ftr').outerHTML = `<footer class="ftr"><div class="wrap ftr-in">
      <div><img src="assets/img/logo.png" alt="Safezone" width="120" height="47" style="height:44px;width:auto;margin-bottom:10px">
        <p>Hardware, peças selecionadas e serviços de informática.</p>
        ${SET.AvisoNFe ? `<span class="nfe">${esc(SET.AvisoNFe)}</span>` : ''}</div>
      <div><h3>Atendimento</h3><ul>
        <li><a href="${SZ.waUrl('Olá, Safezone! Gostaria de atendimento.', phone)}" target="_blank" rel="noopener">WhatsApp ${esc(fmtPhone(phone))}</a></li>
        ${ig ? `<li><a href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">Instagram @${esc(ig)}</a></li>` : ''}
        <li><a href="servicos.html">Solicitar orçamento</a></li></ul></div>
      <div><h3>Informações</h3>
        ${SET.InformacoesComerciais ? `<p>${esc(SET.InformacoesComerciais)}</p>` : ''}
        ${SET.FormasPagamento ? `<p><strong>Pagamento:</strong> ${esc(SET.FormasPagamento)}</p>` : ''}
        ${SET.PoliticaTroca ? `<p><strong>Trocas:</strong> ${esc(SET.PoliticaTroca)}</p>` : ''}
        ${!SET.InformacoesComerciais && !SET.FormasPagamento && !SET.PoliticaTroca ? '<p>Consulte disponibilidade e formas de pagamento pelo WhatsApp.</p>' : ''}</div>
      </div><div class="wrap ftr-bot"><span>© ${new Date().getFullYear()} ${esc(SET.NomeLoja || 'Safezone')}. Todos os direitos reservados.</span><a href="admin/">Área restrita</a></div></footer>
      <a class="wa-float" href="${SZ.waUrl('Olá, Safezone! Vim pelo site e gostaria de atendimento.', phone)}" target="_blank" rel="noopener" aria-label="Falar pelo WhatsApp">${SZ.icon('wa', 28)}</a>`;
    const b = $('#burger'); b.onclick = () => { const o = $('#nav').classList.toggle('open'); b.setAttribute('aria-expanded', o); };
    const q = new URLSearchParams(location.search).get('q'); if (q && $('#q')) $('#q').value = q;
  }
  const fmtPhone = p => { const d = SZ.phoneDigits(p); return d.length === 13 ? `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}` : '+' + d; };

  /* ------------------------------ início ------------------------------ */
  async function home() {
    const off = $('#offers'), rec = $('#recent');
    $('#cats').innerHTML = SZ.CATEGORIES.map(c => `<a class="cat" href="catalogo.html?cat=${encodeURIComponent(c)}">${SZ.icon(SZ.catIcon(c), 22)}<span>${esc(c)}</span></a>`).join('');
    off.innerHTML = skeleton(4); rec.innerHTML = skeleton(4);
    let list;
    try { list = await SZ.products(); } catch (e) { off.innerHTML = rec.innerHTML = ''; off.innerHTML = errBox(e.message); $('#retry').onclick = home; $('#offersSec').hidden = false; return; }
    const byId = id => list.find(p => p.id === id);
    SZ.bindInterest(document, byId, 'Site');
    const shop = list.filter(p => p.categoria !== SZ.SERVICE_CAT);
    const offers = shop.filter(p => p.disponivel && (p.destaque || p.selo)).sort((a, b) => (b.destaque - a.destaque) || (b.desconto - a.desconto)).slice(0, 8);
    $('#offersSec').hidden = !offers.length; off.innerHTML = offers.map(p => SZ.cardHtml(p, { phone: SET.TelefoneComercial })).join('');
    const recent = shop.slice().sort((a, b) => String(b.dataPublicacao).localeCompare(String(a.dataPublicacao))).slice(0, 8);
    rec.innerHTML = recent.length ? recent.map(p => SZ.cardHtml(p, { phone: SET.TelefoneComercial })).join('') : '<div class="empty">Em breve novos produtos por aqui. Fale com a gente pelo WhatsApp para consultar disponibilidade.</div>';
  }

  /* ----------------------------- catálogo ----------------------------- */
  async function catalog() {
    const grid = $('#grid'), qs = new URLSearchParams(location.search);
    const f = { q: $('#fq'), cat: $('#fcat'), cond: $('#fcond'), min: $('#fmin'), max: $('#fmax'), promo: $('#fpromo'), disp: $('#fdisp'), sort: $('#fsort') };
    f.cat.innerHTML = '<option value="">Todas as categorias</option>' + SZ.CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');
    f.q.value = qs.get('q') || ''; f.cat.value = qs.get('cat') || ''; f.cond.value = qs.get('cond') || ''; f.min.value = qs.get('min') || ''; f.max.value = qs.get('max') || '';
    f.promo.checked = qs.get('promo') === '1'; f.disp.checked = qs.get('disp') === '1'; f.sort.value = qs.get('sort') || 'recent';
    grid.innerHTML = skeleton(8);
    let list;
    try { list = await SZ.products(); } catch (e) { grid.innerHTML = errBox(e.message); $('#retry').onclick = catalog; return; }
    SZ.bindInterest(grid, id => list.find(p => p.id === id), 'Catálogo');
    function apply() {
      const q = norm(f.q.value).trim().split(/\s+/).filter(Boolean), min = SZ.money(f.min.value), max = SZ.money(f.max.value);
      let r = list.filter(p => {
        const hay = norm([p.nome, p.marca, p.modelo, p.descricaoCurta, p.descricaoCompleta, p.categoria].join(' '));
        if (q.some(w => hay.indexOf(w) < 0)) return false;
        if (f.cat.value && p.categoria !== f.cat.value) return false;
        if (f.cond.value && p.condicao !== f.cond.value) return false;
        if (f.promo.checked && !(p.selo || p.precoAnterior)) return false;
        if (f.disp.checked && !p.disponivel) return false;
        if (min != null && !isNaN(min) && p.precoAtual < min) return false;
        if (max != null && !isNaN(max) && p.precoAtual > max) return false;
        return true;
      });
      const s = f.sort.value;
      r.sort((a, b) => s === 'asc' ? a.precoAtual - b.precoAtual : s === 'desc' ? b.precoAtual - a.precoAtual : s === 'name' ? a.nome.localeCompare(b.nome, 'pt-BR') : String(b.dataPublicacao).localeCompare(String(a.dataPublicacao)));
      $('#count').textContent = r.length === 1 ? '1 produto encontrado' : `${r.length} produtos encontrados`;
      grid.innerHTML = r.length ? r.map(p => SZ.cardHtml(p, { phone: SET.TelefoneComercial })).join('') : `<div class="empty">${list.length ? 'Nenhum produto encontrado com esses filtros.' : 'Ainda não há produtos cadastrados.'}${list.length ? '<br><button class="btn btn-sm" id="clear" style="margin-top:12px">Limpar filtros</button>' : ''}</div>`;
      const c = $('#clear'); if (c) c.onclick = () => { f.q.value = f.cat.value = f.cond.value = f.min.value = f.max.value = ''; f.promo.checked = f.disp.checked = false; apply(); };
      const u = new URLSearchParams(); if (f.q.value) u.set('q', f.q.value); if (f.cat.value) u.set('cat', f.cat.value); if (f.cond.value) u.set('cond', f.cond.value); if (f.min.value) u.set('min', f.min.value); if (f.max.value) u.set('max', f.max.value); if (f.promo.checked) u.set('promo', '1'); if (f.disp.checked) u.set('disp', '1'); if (f.sort.value !== 'recent') u.set('sort', f.sort.value);
      history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : ''));
    }
    const d = SZ.debounce(apply, 150);
    Object.values(f).forEach(el => { el.addEventListener('input', d); el.addEventListener('change', apply); });
    $('#filters').addEventListener('submit', e => { e.preventDefault(); apply(); });
    $('#fbtn').onclick = () => { const o = $('#filters').classList.toggle('open'); $('#fbtn').setAttribute('aria-expanded', o); };
    apply();
  }

  /* ------------------------------ produto ------------------------------ */
  async function product() {
    const root = $('#pd'), id = new URLSearchParams(location.search).get('id');
    if (!id) { root.innerHTML = '<div class="empty">Produto não informado. <a href="catalogo.html" style="color:var(--neon2)">Ver catálogo</a></div>'; return; }
    root.innerHTML = '<div class="skel" style="aspect-ratio:1/1"></div><div class="skel" style="aspect-ratio:4/3"></div>';
    let p;
    try { p = await SZ.product(id); } catch (e) {
      root.innerHTML = e.code === 'NOT_FOUND' ? '<div class="empty">Este anúncio não está mais disponível. <a href="catalogo.html" style="color:var(--neon2)">Ver outros produtos</a></div>' : errBox(e.message);
      const r = $('#retry'); if (r) r.onclick = product; return;
    }
    document.title = `${p.nome} | Safezone`;
    const desc = (p.descricaoCurta || p.nome).slice(0, 160);
    [['meta[name=description]', desc], ['meta[property="og:title"]', document.title], ['meta[property="og:description"]', desc]].forEach(([s, v]) => { const m = $(s); if (m) m.setAttribute('content', v); });
    if (p.fotoPrincipal) { const m = $('meta[property="og:image"]'); if (m) m.setAttribute('content', p.fotoPrincipal); }
    const ld = document.createElement('script'); ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: p.nome, sku: p.id, brand: p.marca ? { '@type': 'Brand', name: p.marca } : undefined, description: desc, image: p.fotos, itemCondition: p.condicao === 'Seminovo' ? 'https://schema.org/UsedCondition' : 'https://schema.org/NewCondition', offers: { '@type': 'Offer', priceCurrency: 'BRL', price: p.precoAtual, availability: p.disponivel ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } });
    document.head.appendChild(ld);
    const svc = p.categoria === SZ.SERVICE_CAT, photos = p.fotos.length ? p.fotos : [];
    root.innerHTML = `<div><div class="gal-main" id="gmain">${photos[0] ? `<img id="gimg" src="${esc(SZ.thumb(photos[0], 1200))}" alt="${esc(p.nome)}" decoding="async">` : `<div class="noimg" style="height:100%">${SZ.icon(SZ.catIcon(p.categoria), 64)}</div>`}
        <span class="card-tags">${SZ.badgeHtml(p)}</span></div>
      ${photos.length > 1 ? `<div class="gal-thumbs" role="tablist" aria-label="Fotos do produto">${photos.map((u, i) => `<button data-i="${i}" aria-label="Foto ${i + 1}" aria-current="${i === 0}"><img src="${esc(SZ.thumb(u, 160))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>
      <div><div class="card-cat">${esc(p.categoria)}</div><h1>${esc(p.nome)}</h1>
        <div class="meta">${esc([p.marca, p.modelo].filter(Boolean).join(' · '))}</div>
        <div class="pd-box">${SZ.priceHtml(p)}
          <div class="facts">
            ${p.condicao ? `<div class="fact"><small>Condição</small>${esc(p.condicao)}</div>` : ''}
            ${p.conservacao ? `<div class="fact"><small>Conservação</small>${esc(p.conservacao)}</div>` : ''}
            <div class="fact"><small>Disponibilidade</small>${p.disponivel ? (svc ? 'Sob agendamento' : `${p.estoque} ${p.estoque === 1 ? 'unidade' : 'unidades'}`) : 'Esgotado'}</div>
            <div class="fact"><small>Código</small>${esc(p.id)}</div></div>
          ${p.disponivel ? `<a class="btn btn-pri" id="wa" href="${SZ.waUrl(SZ.waProductText(p), SET.TelefoneComercial)}" target="_blank" rel="noopener">${SZ.icon('wa', 20)} Tenho interesse — chamar no WhatsApp</a>` : '<span class="btn btn-ghost is-disabled">Produto indisponível</span>'}
          <div class="nf">${esc(SET.AvisoNFe || '')}</div></div>
        ${p.descricaoCompleta || p.descricaoCurta ? `<h2>Descrição</h2><div class="desc">${esc(p.descricaoCompleta || p.descricaoCurta)}</div>` : ''}
        ${p.especificacoes.length ? `<h2>Especificações técnicas</h2><table class="specs"><tbody>${p.especificacoes.map(s => `<tr><td>${esc(s.item)}</td><td>${esc(s.valor)}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
    $('#crumb').innerHTML = `<a href="index.html">Início</a> / <a href="catalogo.html">Catálogo</a> / <a href="catalogo.html?cat=${encodeURIComponent(p.categoria)}">${esc(p.categoria)}</a>`;
    const wa = $('#wa'); if (wa) wa.addEventListener('click', () => SZ.registerInterest(p, 'Detalhes'));
    root.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (!b) return; $('#gimg').src = SZ.thumb(photos[+b.dataset.i], 1200); $$('.gal-thumbs button').forEach(x => x.setAttribute('aria-current', x === b)); });
  }
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ------------------------------ serviços ------------------------------ */
  const SERVICES = [
    ['Formatação de computadores', 'Reinstalação do sistema para deixar o computador organizado e pronto para uso.', 'wrench'],
    ['Limpeza interna e externa', 'Limpeza de poeira e componentes para ajudar na refrigeração do equipamento.', 'fan'],
    ['Manutenção preventiva', 'Revisão geral do computador para evitar problemas antes que apareçam.', 'shield'],
    ['Diagnóstico de problemas', 'Avaliação para identificar a causa de travamentos, lentidão e falhas.', 'search'],
    ['Instalação de sistema e programas', 'Instalação de sistema operacional e de programas autorizados.', 'ssd'],
    ['Instalação e troca de componentes', 'Instalação e substituição de peças do seu computador.', 'board'],
    ['Upgrade de hardware', 'Atualização de memória, armazenamento, placa de vídeo e outras peças.', 'bolt'],
    ['Montagem e manutenção de PCs', 'Montagem de computadores e manutenção para o seu setup.', 'pcase']
  ];
  async function services() {
    $('#svcGrid').innerHTML = SERVICES.map(([n, d, ic]) => `<article class="svc">${SZ.icon(ic, 30)}<h3>${esc(n)}</h3><p>${esc(d)}</p>
      <a class="btn" href="${SZ.waUrl(SZ.waServiceText(n), SET.TelefoneComercial)}" target="_blank" rel="noopener">${SZ.icon('wa', 18)} Solicitar orçamento</a></article>`).join('');
    const box = $('#svcReg'); box.innerHTML = skeleton(2);
    try {
      const list = (await SZ.products()).filter(p => p.categoria === SZ.SERVICE_CAT);
      $('#svcRegSec').hidden = !list.length; box.innerHTML = list.map(p => SZ.cardHtml(p, { phone: SET.TelefoneComercial })).join('');
      SZ.bindInterest(box, id => list.find(p => p.id === id), 'Site');
    } catch (e) { $('#svcRegSec').hidden = true; }
  }

  /* ---------------------- orçamento de serviços (calculadora) ---------------------- */
  async function quote() {
    const sec = $('#qSec'); if (!sec || !window.SZQuote) return;
    let data; try { data = await SZ.call('getServicePricing'); } catch (e) { return; }
    const svcs = (data.servicos || []).filter(s => s.nome); if (!svcs.length) return;
    sec.hidden = false;
    const picked = new Set(), sel = {}; let unknown = false;
    const comps = t => (data.componentes || []).filter(c => c.tipo === t);
    const KINDS = [['gpu', 'Placa de vídeo', 'GPU'], ['cpu', 'Processador', 'CPU'], ['ram', 'Memória RAM', 'RAM'], ['mb', 'Placa-mãe', 'Placa-mae']];
    const CL = SZQuote.CLASS_LABEL, ORD = { Low: 0, Mid: 1, High: 2 };
    $('#qFields').innerHTML = KINDS.map(([k, label, tipo]) => {
      const list = comps(tipo).slice().sort((a, b) => (a.marca || '').localeCompare(b.marca || '') || ORD[a.classe] - ORD[b.classe] || a.preco - b.preco);
      const brands = [...new Set(list.map(c => c.marca || 'Outro'))];
      const groups = brands.map(b => `<optgroup label="${esc(b)}">${list.filter(c => (c.marca || 'Outro') === b).map(c => `<option value="${esc(c.id)}">${esc(c.nome)} · ${CL[c.classe] || ''}</option>`).join('')}</optgroup>`).join('');
      return `<label class="fld">${label}<select class="in" data-k="${k}"><option value="">${k === 'gpu' ? 'Não informar' : 'Não sei / não informar'}</option>${k === 'gpu' ? '<option value="none">Integrada (sem placa de vídeo dedicada)</option>' : ''}${groups}</select></label>`;
    }).join('');
    $('#qSvcs').innerHTML = svcs.map(s => `<button type="button" class="q-svc" data-id="${esc(s.id)}" aria-pressed="false"><span class="q-chk" aria-hidden="true"></span><span><b>${esc(s.nome)}</b>${s.descricao ? `<small>${esc(s.descricao)}</small>` : ''}</span></button>`).join('');
    function draw() {
      const chosen = svcs.filter(s => picked.has(s.id)), sum = $('#qSum');
      $('#qCfg').hidden = !chosen.some(s => s.modo !== 'unico');
      $('#qFields').hidden = unknown; $('#qUnkMsg').hidden = !unknown;
      $('#qUnk').setAttribute('aria-pressed', unknown); $('#qUnk').textContent = unknown ? 'Prefiro informar minha config' : 'Não sei minha config';
      if (!chosen.length) { sum.innerHTML = '<h3>Seu orçamento</h3><p class="q-help">Selecione ao menos um serviço para ver o valor.</p>'; return; }
      const q = SZQuote.build({ services: chosen, sel, unknown, faixas: data.faixas });
      const hint = q.needsConfig && !q.hasConfig && !unknown ? '<p class="q-help">Informe as peças ao lado para ver os valores, ou clique em <b>Não sei minha config</b>.</p>' : '';
      sum.innerHTML = `<h3>Seu orçamento</h3><ul class="q-lines">${q.lines.map(l => `<li><span>${esc(l.sv.nome)}</span><b>${l.valor != null ? (l.aprox ? 'cerca de ' : '') + SZQuote.brl(l.valor) : `<em>${esc(l.motivo || 'a combinar')}</em>`}</b></li>`).join('')}</ul>${hint}
        ${q.hasConfig && q.value > 0 ? `<div class="q-pc"><span>Valor estimado do PC</span><b>${SZQuote.brl(q.value)}</b>${q.clsLabel ? `<span class="q-cls q-${q.cls}">${esc(q.clsLabel)}</span>` : ''}</div>` : ''}
        ${q.total > 0 ? `<div class="q-total"><span>${q.approx || q.pending ? 'Total estimado' : 'Total'}</span><b>${SZQuote.brl(q.total)}</b></div>${q.pending ? '<p class="q-help">Itens a combinar não entram na soma.</p>' : ''}` : ''}
        <a class="btn btn-pri" id="qGo" target="_blank" rel="noopener" href="${SZ.waUrl(SZQuote.message(q, sel), SET.TelefoneComercial)}">${SZ.icon('wa', 18)} Entrar em contato</a>
        <p class="q-note">Valores estimados com base em preços de mercado das peças. A confirmação é feita no atendimento.</p>`;
    }
    $('#qSvcs').addEventListener('click', ev => { const b = ev.target.closest('.q-svc'); if (!b) return; const id = b.dataset.id; picked.has(id) ? picked.delete(id) : picked.add(id); b.setAttribute('aria-pressed', picked.has(id)); draw(); });
    $('#qFields').addEventListener('change', ev => { const s = ev.target.closest('select'); if (!s) return; const k = s.dataset.k; delete sel[k]; if (k === 'gpu') sel.noGpu = s.value === 'none'; if (s.value && s.value !== 'none') sel[k] = (data.componentes || []).find(c => c.id === s.value); draw(); });
    $('#qUnk').onclick = () => { unknown = !unknown; draw(); };
    draw();
  }

  (async function init() {
    await layout();
    ({ home, catalog, product, services }[page] || (() => {}))();
    if (page === 'services') quote();
  })();
})();
