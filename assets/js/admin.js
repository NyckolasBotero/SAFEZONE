/* Painel administrativo Safezone. A segurança real fica no Apps Script; aqui só controlamos a interface. */
(function () {
  'use strict';
  const SZ = window.SZ, esc = SZ.esc, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');
  const A = { user: null, token: null, perms: [], view: 'vendas', sub: 'indicadores' };
  const SALE_ST = ['Interesse recebido', 'Em negociação', 'Venda concluída', 'Cancelada'];
  const ACCESS = ['Aba Adm', 'Vendas', 'Produtos', 'Configurações'];
  const nn = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const today = () => new Date().toISOString().slice(0, 10);

  /* ------------------------------ sessão ------------------------------ */
  const store = { get() { try { return JSON.parse(sessionStorage.getItem('sz_sess') || 'null'); } catch (e) { return null; } }, set(v) { try { sessionStorage.setItem('sz_sess', JSON.stringify(v)); } catch (e) { /* sem storage */ } }, clear() { try { sessionStorage.removeItem('sz_sess'); } catch (e) { /* sem storage */ } } };
  function setUser(u, token) {
    A.user = u; A.token = token; A.perms = String(u.acesso || '').split(/[,;|]/).map(nn).filter(Boolean);
  }
  const can = a => A.user && (A.user.isAdmin || A.perms.indexOf(a) >= 0);
  async function api(action, data) {
    try { return await SZ.call(action, data, A.token); }
    catch (e) { if (e.code === 'SESSION') { store.clear(); A.token = null; showLogin(e.message); } throw e; }
  }
  const fail = e => { if (e.code !== 'SESSION') SZ.toast(e.message || 'Erro inesperado.', 'err'); };

  function showLogin(msg) {
    app.innerHTML = `<div class="login"><div class="login-box">
      <img src="../assets/img/logo.png" alt="Safezone"><h1>Painel administrativo</h1><p class="sub">Acesso restrito a usuários autorizados.</p>
      <form id="lf" novalidate>
        <label class="fld">E-mail<input id="lu" class="in" type="text" autocomplete="username" required maxlength="120"></label>
        <label class="fld">Senha<input id="lp" class="in" type="password" autocomplete="current-password" required maxlength="200"></label>
        <div class="formerr" id="le" role="alert">${esc(msg || '')}</div>
        <button class="btn btn-pri" id="lb" type="submit">Entrar</button></form></div></div>`;
    $('#lu').focus();
    $('#lf').addEventListener('submit', async ev => {
      ev.preventDefault(); const u = $('#lu').value.trim(), p = $('#lp').value, b = $('#lb'), er = $('#le');
      if (!u || !p) { er.textContent = 'Informe e-mail e senha.'; return; }
      b.disabled = true; b.textContent = 'Entrando…'; er.textContent = '';
      try {
        const r = await SZ.call('login', { login: u, password: p });
        setUser(r.usuario, r.token); store.set({ token: r.token, user: r.usuario, exp: r.expiraEm }); boot();
      } catch (e) { er.textContent = e.message; $('#lp').value = ''; b.disabled = false; b.textContent = 'Entrar'; }
    });
  }

  async function restore() {
    const s = store.get();
    if (!s || !s.token || s.exp < Date.now()) { store.clear(); return showLogin(); }
    setUser(s.user, s.token);
    try { const me = await api('me'); setUser(me, s.token); boot(); } catch (e) { if (e.code !== 'SESSION') showLogin(e.message); }
  }

  /* ------------------------------ estrutura ------------------------------ */
  const TABS = [['vendas', 'Vendas', 'box', () => can('vendas')], ['adm', 'Adm', 'shield', () => A.user.isAdmin], ['produtos', 'Produtos', 'cpu', () => can('produtos')], ['valores', 'Valores Serviços', 'board', () => can('configuracoes')], ['contatos', 'Contatos', 'wa', () => can('configuracoes')], ['feedbacks', 'Feedbacks', 'star', () => can('vendas') || can('produtos')], ['config', 'Configurações', 'wrench', () => can('configuracoes')]];
  const SUBS = [['indicadores', 'Indicadores'], ['logins', 'Logins'], ['postagem', 'Postagem de vendas'], ['ofertas', 'Agenda de ofertas'], ['layouts', 'Criação de layouts']];
  function boot() {
    const first = TABS.find(t => t[3]());
    if (!first) { store.clear(); return showLogin('Seu usuário não tem acesso a nenhuma área do painel.'); }
    app.innerHTML = `<div class="shell"><aside class="side" aria-label="Menu do painel"><a class="brand" href="../index.html" title="Ver o site"><img src="../assets/img/logo.png" alt="Safezone"></a><div id="nav" style="display:contents"></div>
      <div class="me"><b>${esc(A.user.nome || A.user.login)}</b>${esc(A.user.isAdmin ? 'Administrador' : A.user.acesso || 'Usuário')}<br><button class="btn btn-sm btn-ghost" id="out" style="margin-top:8px">Sair</button></div></aside>
      <main class="main" id="view" tabindex="-1"></main></div>`;
    $('#out').onclick = async () => { try { await SZ.call('logout', {}, A.token); } catch (e) { /* encerra local de qualquer forma */ } store.clear(); A.token = null; A.user = null; showLogin('Você saiu do painel.'); };
    window.onhashchange = route; route();
  }
  function route() {
    const [v, s] = location.hash.replace(/^#\/?/, '').split('/');
    let t = TABS.find(x => x[0] === v && x[3]()) || TABS.find(x => x[3]());
    A.view = t[0]; if (A.view === 'adm') A.sub = SUBS.some(x => x[0] === s) ? s : 'indicadores';
    renderNav(); const el = $('#view');
    ({ vendas: salesView, adm: admView, produtos: productsView, valores: valuesView, contatos: contactsView, feedbacks: feedbacksView, config: settingsView }[A.view])(el);
  }
  function renderNav() {
    $('#nav').innerHTML = TABS.filter(t => t[3]()).map(t => `<button class="nv" data-go="${t[0]}" aria-current="${A.view === t[0]}">${SZ.icon(t[2], 18)} ${t[1]}</button>${t[0] === 'adm' && A.view === 'adm' ? `<div class="sub">${SUBS.map(s => `<button class="nv" data-go="adm/${s[0]}" aria-current="${A.sub === s[0]}">${s[1]}</button>`).join('')}</div>` : ''}`).join('');
    $$('#nav [data-go]').forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.go; });
  }

  /* -------------------------------- modal -------------------------------- */
  function dlg(o) {
    const d = document.createElement('dialog'); d.className = 'dlg ' + (o.cls || '');
    d.innerHTML = `<div class="dlg-h"><h2>${esc(o.title)}</h2><button class="btn btn-sm btn-ghost" data-x aria-label="Fechar">${SZ.icon('x', 16)}</button></div><div class="dlg-b">${o.body}</div><div class="dlg-f">${o.footer || ''}</div>`;
    document.body.appendChild(d); d.showModal();
    const close = () => { d.close(); d.remove(); };
    d.addEventListener('cancel', ev => { ev.preventDefault(); close(); }); $('[data-x]', d).onclick = close;
    return { el: d, close };
  }
  const pillSale = s => `<span class="pill ${s === 'Venda concluída' ? 'ok' : s === 'Cancelada' ? 'bad' : s === 'Em negociação' ? 'warn' : 'mute'}">${esc(s)}</span>`;
  const loadingHtml = '<div class="ld" role="status" aria-live="polite"><p><span class="spin" aria-hidden="true"></span> Carregando…</p><div class="ln"></div><div class="ln"></div><div class="ln"></div></div>';
  const errHtml = (e, id) => `<div class="errbox" role="alert"><p>${esc(e.message)}</p><button class="btn" id="${id}">Tentar novamente</button></div>`;

  /* -------------------------------- vendas -------------------------------- */
  function salesView(el) {
    el.innerHTML = `<h1>Vendas</h1><p class="lead">Acompanhe contatos e vendas registradas.</p>
      <div class="note info"><b>Importante:</b> tocar em “Tenho interesse” só registra um <b>interesse recebido</b>. Os valores financeiros abaixo contam apenas registros marcados como <b>Venda concluída</b>.</div>
      <div class="bar"><label class="fld">De<input class="in" type="date" id="sf"></label><label class="fld">Até<input class="in" type="date" id="st"></label>
        <label class="fld">Situação<select class="in" id="ss"><option value="">Todas</option>${SALE_ST.map(s => `<option>${s}</option>`).join('')}</select></label>
        <label class="fld">Produto<input class="in" id="sp" placeholder="Nome do produto"></label><label class="fld">Código<input class="in" id="sc" placeholder="V-… ou SZ-…"></label>
        <button class="btn" id="sgo">Filtrar</button><span class="grow"></span><button class="btn btn-pri" id="snew">Registrar venda</button></div>
      <div id="sbody">${loadingHtml}</div>`;
    const get = () => ({ from: $('#sf').value, to: $('#st').value, status: $('#ss').value, produto: $('#sp').value.trim(), codigo: $('#sc').value.trim() });
    async function load() {
      const b = $('#sbody'); b.innerHTML = loadingHtml;
      try {
        const r = await api('listSales', get()), rs = r.resumo;
        b.innerHTML = `<div class="cards"><div class="stat hl"><small>Vendas concluídas</small><b>${rs.concluidas}</b></div><div class="stat hl"><small>Valor total concluído</small><b>${SZ.brl(rs.valorConcluidas)}</b></div>
          <div class="stat"><small>Contatos em aberto</small><b>${rs.contatos}</b><em>interesse + negociação</em></div><div class="stat"><small>Registros no filtro</small><b>${rs.registros}</b></div></div>
          ${r.vendas.length ? `<div class="tw"><table class="tbl rs"><thead><tr><th>ID</th><th>Data</th><th>Produto</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th><th>Situação</th><th>Origem</th><th></th></tr></thead><tbody>
          ${r.vendas.map(v => `<tr data-id="${esc(v.idVenda)}"><td data-l="ID">${esc(v.idVenda)}</td><td data-l="Data">${SZ.dt(v.data)}</td><td data-l="Produto">${esc(v.nomeProduto)}<br><small style="color:var(--mute)">${esc(v.idAnuncio)}${v.observacoes ? ' · ' + esc(v.observacoes) : ''}</small></td>
          <td class="num" data-l="Qtd">${v.quantidade}</td><td class="num" data-l="Unitário">${SZ.brl(v.valorUnitario)}</td><td class="num" data-l="Total">${SZ.brl(v.valorTotal)}</td>
          <td data-l="Situação"><select class="in" data-st aria-label="Situação">${SALE_ST.map(s => `<option ${s === v.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td data-l="Origem">${esc(v.origem)}</td>
          <td><button class="btn btn-sm" data-edit>Editar</button></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">Nenhum registro ainda. Os contatos pelo botão “Tenho interesse” aparecerão aqui como “Interesse recebido”.</div>'}`;
        b.onchange = async ev => { const s = ev.target.closest('[data-st]'); if (!s) return; const id = s.closest('tr').dataset.id; s.disabled = true;
          try { await api('updateSale', { idVenda: id, status: s.value }); SZ.toast('Situação atualizada.'); load(); } catch (e) { fail(e); load(); } };
        b.onclick = ev => { const e = ev.target.closest('[data-edit]'); if (e) saleModal(r.vendas.find(v => v.idVenda === e.closest('tr').dataset.id)); };
      } catch (e) { b.innerHTML = errHtml(e, 'sretry'); $('#sretry').onclick = load; }
    }
    function saleModal(v) {
      const m = dlg({ title: 'Editar ' + v.idVenda, cls: 'sm', body: `<div class="pf-cols"><label class="fld full">Situação<select class="in" id="e_st">${SALE_ST.map(s => `<option ${s === v.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="fld">Quantidade<input class="in" id="e_q" type="number" min="1" step="1" value="${v.quantidade}"></label><label class="fld">Valor unitário (R$)<input class="in" id="e_u" inputmode="decimal" value="${String(v.valorUnitario).replace('.', ',')}"></label>
        <label class="fld full">Observações<textarea class="in" id="e_o" maxlength="500">${esc(v.observacoes)}</textarea></label></div>`,
        footer: '<button class="btn" data-x2>Cancelar</button><button class="btn btn-pri" id="e_go">Salvar</button>' });
      $('[data-x2]', m.el).onclick = m.close;
      $('#e_go', m.el).onclick = async () => { const b = $('#e_go', m.el); b.disabled = true;
        try { await api('updateSale', { idVenda: v.idVenda, status: $('#e_st', m.el).value, quantidade: $('#e_q', m.el).value, valorUnitario: $('#e_u', m.el).value, observacoes: $('#e_o', m.el).value }); SZ.toast('Registro atualizado.'); m.close(); load(); }
        catch (e) { fail(e); b.disabled = false; } };
    }
    async function newModal() {
      let prods = []; try { prods = await api('listAllProducts'); } catch (e) { try { prods = await SZ.products(); } catch (e2) { /* segue vazio */ } }
      if (!prods.length) return SZ.toast('Cadastre um anúncio antes de registrar uma venda.', 'err');
      const m = dlg({ title: 'Registrar venda', cls: 'sm', body: `<div class="pf-cols"><label class="fld full">Produto<select class="in" id="n_p">${prods.map(p => `<option value="${esc(p.id)}" data-pr="${p.precoAtual}">${esc(p.nome)} — ${esc(p.id)}</option>`).join('')}</select></label>
        <label class="fld">Quantidade<input class="in" id="n_q" type="number" min="1" step="1" value="1"></label><label class="fld">Valor unitário (R$)<input class="in" id="n_u" inputmode="decimal"></label>
        <label class="fld full">Situação<select class="in" id="n_s">${SALE_ST.map(s => `<option ${s === 'Venda concluída' ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="fld full">Observações<textarea class="in" id="n_o" maxlength="500"></textarea></label></div>`,
        footer: '<button class="btn" data-x2>Cancelar</button><button class="btn btn-pri" id="n_go">Registrar</button>' });
      const setPr = () => { const o = $('#n_p', m.el).selectedOptions[0]; $('#n_u', m.el).value = String(o.dataset.pr).replace('.', ','); }; setPr(); $('#n_p', m.el).onchange = setPr;
      $('[data-x2]', m.el).onclick = m.close;
      $('#n_go', m.el).onclick = async () => { const b = $('#n_go', m.el); b.disabled = true;
        try { await api('createSale', { idAnuncio: $('#n_p', m.el).value, quantidade: $('#n_q', m.el).value, valorUnitario: $('#n_u', m.el).value, status: $('#n_s', m.el).value, observacoes: $('#n_o', m.el).value }); SZ.toast('Venda registrada.'); m.close(); load(); }
        catch (e) { fail(e); b.disabled = false; } };
    }
    $('#sgo').onclick = load; $('#snew').onclick = newModal; load();
  }

  /* ------------------------------- produtos ------------------------------- */
  const PF = { photos: [], id: null, rid: '', trash: [], art: null };
  const BUILTIN = [['premium', 'Layout 01 · Produto premium'], ['oferta', 'Layout 02 · Super oferta'], ['seminovo', 'Layout 03 · Seminovo selecionado'], ['gamer', 'Layout 04 · Setup gamer'], ['minimal', 'Layout 05 · Oferta minimalista'], ['servicos', 'Layout 06 · Divulgação de serviços']];
  const ART_FMT = [['portrait', 'Feed 1080×1350'], ['square', 'Quadrado 1080×1080'], ['story', 'Stories 1080×1920'], ['banner', 'Banner 1200×628']];
  /** Gera a arte do anúncio usando o editor em uma página oculta (nada é baixado). */
  const Art = {
    fr: null, pend: {}, ready: null,
    init() {
      if (this.fr) return; const f = document.createElement('iframe');
      f.src = '../editor/index.html'; f.title = 'Gerador de artes'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1280px;height:800px;border:0;visibility:hidden';
      document.body.appendChild(f); this.fr = f; let res; this.ready = new Promise(r => { res = r; });
      window.addEventListener('message', ev => {
        if (ev.origin !== location.origin || ev.source !== f.contentWindow || !ev.data) return;
        if (ev.data.type === 'sz:ready') res();
        if (ev.data.type === 'sz:rendered') { const w = this.pend[ev.data.reqId]; if (!w) return; delete this.pend[ev.data.reqId]; ev.data.error ? w.no(new Error(ev.data.error)) : w.ok(ev.data.dataUrl); }
      });
    },
    async render(config, product, photo) {
      this.init();
      await Promise.race([this.ready, new Promise((_, no) => setTimeout(() => no(new Error('O gerador de artes não carregou. Recarregue a página.')), 25000))]);
      const reqId = 'a' + Math.random().toString(36).slice(2);
      return new Promise((ok, no) => {
        this.pend[reqId] = { ok, no };
        this.fr.contentWindow.postMessage({ type: 'sz:render', reqId, config, product, photo }, location.origin);
        setTimeout(() => { if (this.pend[reqId]) { delete this.pend[reqId]; no(new Error('Tempo esgotado ao gerar a arte.')); } }, 45000);
      });
    }
  };
  const driveId = u => { const m = /\/d\/([A-Za-z0-9_-]{10,80})/.exec(String(u || '')); return m ? m[1] : ''; };
  const parseSpecs = t => String(t || '').split(/\r?\n/).map(l => { const i = l.indexOf(':'); return i > 0 ? { item: l.slice(0, i).trim(), valor: l.slice(i + 1).trim() } : (l.trim() ? { item: l.trim(), valor: '' } : null); }).filter(Boolean);
  function productsView(el) {
    el.innerHTML = `<h1>${A.view === 'adm' ? 'Postagem de vendas' : 'Produtos'}</h1><p class="lead">Cadastre, edite, publique e despublique anúncios. Marque vários para trocar o layout das artes de uma vez.</p>
      <div class="bar"><label class="fld"><span class="sr">Buscar</span><input class="in" id="pq" placeholder="Buscar por nome, código ou categoria"></label>
        <label class="fld"><span class="sr">Situação</span><select class="in" id="pst"><option value="">Todas as situações</option><option>Publicado</option><option>Rascunho</option><option>Despublicado</option></select></label>
        <label class="fld"><span class="sr">Categoria</span><select class="in" id="pcat"><option value="">Todas as categorias</option>${SZ.CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
        <span class="grow"></span><button class="btn btn-pri" id="pnew">+ Novo anúncio</button></div>
      <div class="bulk" id="pbulk" hidden></div><div id="pbody">${loadingHtml}</div>`;
    let list = [], shown = []; const sel = new Set();
    const bulk = () => {
      const b = $('#pbulk'); b.hidden = !sel.size; if (!sel.size) return;
      b.innerHTML = `<b>${sel.size} selecionado${sel.size > 1 ? 's' : ''}</b><button class="btn btn-sm btn-pri" id="bl">Aplicar layout</button><button class="btn btn-sm" id="bo">Criar oferta com a seleção</button><button class="btn btn-sm btn-ghost" id="bx">Limpar seleção</button>`;
      $('#bx').onclick = () => { sel.clear(); draw(); };
      $('#bl').onclick = () => bulkArt(list.filter(p => sel.has(p.id)), { mode: 'choose', done: load });
      $('#bo').onclick = () => { A.offerIds = [...sel]; location.hash = '#/adm/ofertas'; };
    };
    const draw = () => {
      const q = nn($('#pq').value), st = $('#pst').value, ct = $('#pcat').value, b = $('#pbody');
      shown = list.filter(p => (!st || p.status === st) && (!ct || p.categoria === ct) && (!q || nn([p.nome, p.id, p.categoria, p.subcategoria, p.marca, p.modelo].join(' ')).indexOf(q) >= 0));
      const allOn = shown.length && shown.every(p => sel.has(p.id));
      b.innerHTML = shown.length ? `<div class="tw"><table class="tbl rs"><thead><tr><th class="ck"><input type="checkbox" id="pall" aria-label="Selecionar todos os anúncios listados" ${allOn ? 'checked' : ''}></th><th></th><th>Anúncio</th><th>Categoria</th><th class="num">Preço</th><th class="num">Estoque</th><th>Situação</th><th></th></tr></thead><tbody>
        ${shown.map(p => `<tr data-id="${esc(p.id)}" class="${sel.has(p.id) ? 'sel' : ''}"><td class="ck"><input type="checkbox" data-sel aria-label="Selecionar ${esc(p.nome)}" ${sel.has(p.id) ? 'checked' : ''}></td><td>${p.fotoPrincipal ? `<img class="thumb" src="${esc(SZ.thumb(p.fotoPrincipal, 96))}" alt="" loading="lazy">` : `<span class="thumb" style="display:grid;place-items:center;color:var(--mute)">${SZ.icon(SZ.catIcon(p.categoria), 20)}</span>`}</td>
        <td data-l="Anúncio"><b>${esc(p.nome)}</b><br><small style="color:var(--mute)">${esc(p.id)} ${p.condicao ? '· ' + esc(p.condicao) : ''}${p.layoutArte ? ' · arte ' + esc(layName(p.layoutArte)) : ''}</small></td><td data-l="Categoria">${esc(p.categoria)}${p.subcategoria ? `<br><small style="color:var(--mute)">${esc(p.subcategoria)}</small>` : ''}</td>
        <td class="num" data-l="Preço">${SZ.brl(p.precoAtual)}${p.ofertaAtiva ? `<br><small style="color:var(--neon2)">Oferta: ${esc(p.ofertaAtiva.nome)}</small>` : p.selo ? `<br><small style="color:var(--neon2)">${esc(p.selo.texto)}</small>` : ''}</td><td class="num" data-l="Estoque">${p.estoque}</td>
        <td data-l="Situação"><span class="pill ${p.status === 'Publicado' ? 'ok' : p.status === 'Rascunho' ? 'mute' : 'warn'}">${esc(p.status)}</span></td>
        <td><div class="acts"><button class="btn btn-sm" data-ed>Editar</button><button class="btn btn-sm" data-tg>${p.status === 'Publicado' ? 'Despublicar' : 'Publicar'}</button></div></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${list.length ? 'Nenhum anúncio com esses filtros.' : 'Nenhum anúncio cadastrado ainda. Clique em “Novo anúncio” para começar.'}</div>`;
      bulk();
    };
    async function load() {
      $('#pbody').innerHTML = loadingHtml;
      try { list = await api('listAllProducts'); [...sel].forEach(id => { if (!list.some(p => p.id === id)) sel.delete(id); }); draw(); } catch (e) { $('#pbody').innerHTML = errHtml(e, 'pretry'); $('#pretry').onclick = load; }
    }
    $('#pq').oninput = draw; $('#pst').onchange = draw; $('#pcat').onchange = draw; $('#pnew').onclick = () => productForm(null, load);
    $('#pbody').onchange = ev => {
      if (ev.target.id === 'pall') { shown.forEach(p => ev.target.checked ? sel.add(p.id) : sel.delete(p.id)); draw(); return; }
      const c = ev.target.closest('[data-sel]'); if (!c) return; const id = c.closest('tr').dataset.id; c.checked ? sel.add(id) : sel.delete(id);
      c.closest('tr').classList.toggle('sel', c.checked); const all = $('#pall'); if (all) all.checked = shown.length && shown.every(p => sel.has(p.id)); bulk();
    };
    $('#pbody').onclick = async ev => {
      const tr = ev.target.closest('tr[data-id]'); if (!tr) return; const p = list.find(x => x.id === tr.dataset.id);
      if (ev.target.closest('[data-ed]')) productForm(p, load);
      if (ev.target.closest('[data-tg]')) { const to = p.status === 'Publicado' ? 'Despublicado' : 'Publicado';
        try { await api('setProductStatus', { id: p.id, status: to }); SZ.sessionBust(); SZ.toast(to === 'Publicado' ? 'Anúncio publicado.' : 'Anúncio despublicado.'); load(); } catch (e) { fail(e); } }
    };
    load();
  }
  const layName = k => { const [t, id] = String(k).split(':'); return t === 'b' ? ((BUILTIN.find(x => x[0] === id) || [])[1] || id).replace(/^Layout \d+ · /, '') : 'personalizado'; };

  /** Aplica/refaz a arte de vários anúncios de uma vez (layout novo, ou o mesmo layout com preços atuais). */
  async function bulkArt(prods, o) {
    let cloud = []; try { cloud = await api('listLayouts'); if (!Array.isArray(cloud)) cloud = []; } catch (e) { /* só padrão */ }
    const keep = o.mode === 'keep', withArt = prods.filter(p => p.layoutArte);
    const opts = `<optgroup label="Layouts padrão">${BUILTIN.map(([k, t]) => `<option value="b:${k}">${t}</option>`).join('')}</optgroup>${cloud.length ? `<optgroup label="Meus layouts (ex.: Natal)">${cloud.map(c => `<option value="c:${esc(c.id)}">${esc(c.nome)}${c.formato ? ' · ' + esc(c.formato) : ''}</option>`).join('')}</optgroup>` : ''}`;
    const m = dlg({ title: keep ? 'Atualizar artes dos anúncios' : 'Aplicar layout em lote', body: `<div class="pf-cols">
      <p class="full">${keep ? `Refaz a arte de <b>${withArt.length}</b> anúncio(s) que já têm layout, com os preços de hoje (incluindo ofertas no ar).${prods.length > withArt.length ? ` ${prods.length - withArt.length} sem arte serão ignorados.` : ''}` : `Troca a arte de <b>${prods.length}</b> anúncio(s). Cada arte usa a foto, o nome e o preço do próprio anúncio.`}</p>
      ${keep ? '' : `<label class="fld full">Layout<select class="in" id="b_lay">${opts}</select></label><label class="fld full" id="b_fmt_r">Formato (layouts padrão)<select class="in" id="b_fmt">${ART_FMT.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>`}
      <div class="full note info">Mantenha esta janela aberta até terminar. Cada anúncio leva alguns segundos. A arte antiga é apagada do Drive; a foto original é preservada.</div>
      <div class="full" id="b_prog" aria-live="polite"></div></div>`,
      footer: '<button class="btn" id="b_x">Fechar</button><button class="btn btn-pri" id="b_go">Aplicar</button>' });
    const E = id => $('#' + id, m.el); let stop = false;
    if (!keep) { const f = () => { E('b_fmt_r').hidden = !E('b_lay').value.startsWith('b:'); }; E('b_lay').onchange = f; f(); }
    E('b_x').onclick = () => { stop = true; m.close(); };
    E('b_go').onclick = async () => {
      const targets = keep ? withArt : prods; if (!targets.length) { E('b_prog').textContent = 'Nenhum anúncio com arte para atualizar.'; return; }
      E('b_go').disabled = true; const bad = []; let ok = 0;
      const lay = keep ? '' : (E('b_lay').value.startsWith('b:') ? E('b_lay').value + ':' + E('b_fmt').value : E('b_lay').value);
      for (let i = 0; i < targets.length && !stop; i++) {
        const p = targets[i], sel = keep ? p.layoutArte : lay;
        E('b_prog').innerHTML = `<span class="spin"></span> ${i + 1} de ${targets.length}: ${esc(p.nome)}`;
        try {
          const src = (p.fotos || []).find(u => u && u !== p.fotoArte); if (!src) throw new Error('sem foto original');
          let cfg; if (sel.startsWith('b:')) { const [, id, fm] = sel.split(':'); cfg = { builtin: id, fmt: fm || 'portrait' }; }
          else { const c = cloud.find(x => 'c:' + x.id === sel); if (!c || !c.configuracao || !c.configuracao.els) throw new Error('layout não encontrado'); cfg = c.configuracao; }
          const prod = { nome: p.nome, categoria: p.categoria, marca: p.marca, modelo: p.modelo, descricaoCurta: p.descricaoCurta, precoNormal: p.precoNormal, precoPromocional: p.precoPromocionalEfetivo != null ? p.precoPromocionalEfetivo : p.precoPromocional,
            condicao: p.condicao, conservacao: p.conservacao, especificacoes: p.especificacoes, seloModo: p.seloModo, seloManual: p.seloManual || '' };
          let step = 'gerando a arte';
          try {
            const u = await Art.render(cfg, prod, src); step = 'enviando a imagem ao Drive';
            var up = await api('uploadImage', { mimeType: 'image/jpeg', base64: u.split(',')[1] }); step = 'salvando o anúncio';
            var r = await api('saveProductArt', { id: p.id, layoutArte: sel, fotoArte: up.url });
          } catch (e) { e.message = `${step}: ${e.message}`; throw e; }
          const old = driveId(r && r.antiga); if (old) api('deleteImage', { fileId: old }).catch(() => {}); ok++;
        } catch (e) { bad.push(`${p.nome}: ${e.message || 'falhou'}`); }
      }
      SZ.sessionBust(); E('b_go').hidden = true;
      E('b_prog').innerHTML = `<div class="note ${bad.length ? 'warn' : 'info'}"><b>${ok} arte(s) atualizada(s).</b>${bad.length ? `<br>${bad.length} com problema:<br>${bad.slice(0, 8).map(esc).join('<br>')}` : ''}</div>`;
      E('b_x').textContent = 'Concluir'; if (o.done) o.done();
    };
  }
  SZ.sessionBust = () => { try { sessionStorage.removeItem('sz_products'); } catch (e) { /* ok */ } };

  async function resizeImage(file, max) {
    const url = URL.createObjectURL(file);
    try {
      const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Não foi possível abrir ' + file.name)); i.src = url; });
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.88).split(',')[1];
    } finally { URL.revokeObjectURL(url); }
  }

  /** Subcategorias (Configurações) e regras de margem — carregadas uma vez por sessão do painel. */
  let rulesP = null;
  function loadRules(force) {
    if (force) rulesP = null;
    return rulesP || (rulesP = Promise.all([SZ.call('getSettings').catch(() => ({})), api('getPricingRules').catch(() => null)]).then(([st, r]) => { A.subc = SZ.subcats(st.Subcategorias); if (r) A.rules = r; }));
  }
  function productForm(p, done) {
    const isNew = !p; PF.id = p ? p.id : null; PF.rid = 'r' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    PF.photos = p ? p.fotos.map(u => ({ url: u, art: !!p.fotoArte && u === p.fotoArte })) : []; PF.trash = []; PF.art = null; let CLOUD_LAY = [];
    const PRESET = ['OFERTA', 'SUPER OFERTA', 'OPORTUNIDADE', 'DESTAQUE'];
    const seloSel = !p ? 'auto' : p.seloModo === 'none' ? 'none' : p.seloModo === 'manual' ? (PRESET.indexOf(p.seloManual) >= 0 ? p.seloManual : 'custom') : 'auto';
    const dp = p && p.dataPublicacao ? String(p.dataPublicacao).replace(' ', 'T').slice(0, 16) : '';
    const v = p || {};
    const m = dlg({ title: isNew ? 'Novo anúncio' : 'Editar anúncio', body: `<div class="pf"><div><div class="pf-cols">
      <label class="fld full">Nome do produto *<input class="in" id="f_nome" maxlength="140" value="${esc(v.nome)}"></label>
      <label class="fld">Código / ID<input class="in" id="f_id" value="${esc(p ? p.id : 'Gerado automaticamente')}" readonly></label>
      <label class="fld">Categoria *<select class="in" id="f_cat"><option value="">Selecione…</option>${SZ.CATEGORIES.map(c => `<option ${c === v.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="fld">Subcategoria<select class="in" id="f_sub"></select><span class="help">Tipo do produto (ex.: Teclados). Usado nas ofertas por tipo. A lista fica em Configurações.</span></label>
      <label class="fld">Custo (R$)<input class="in" id="f_custo" inputmode="decimal" value="${p && p.custo != null ? String(p.custo).replace('.', ',') : ''}" placeholder="Quanto você pagou"><span class="help" id="f_custoh">Só você vê. Sem custo, o produto fica fora das ofertas automáticas.</span></label>
      <label class="fld">Marca<input class="in" id="f_marca" maxlength="60" value="${esc(v.marca)}"></label><label class="fld">Modelo<input class="in" id="f_modelo" maxlength="80" value="${esc(v.modelo)}"></label>
      <label class="fld full">Descrição curta<input class="in" id="f_dc" maxlength="220" value="${esc(v.descricaoCurta)}"><span class="help">Aparece no card do catálogo (até 220 caracteres).</span></label>
      <label class="fld full">Descrição completa<textarea class="in" id="f_dl" maxlength="4000">${esc(v.descricaoCompleta)}</textarea></label>
      <label class="fld full">Especificações técnicas<textarea class="in" id="f_esp" maxlength="3000" placeholder="Uma por linha, no formato Item: Valor&#10;Memória: 8 GB GDDR6&#10;Conexão: USB + XLR">${esc(v.especificacoesTexto)}</textarea></label>
      <label class="fld">Condição *<select class="in" id="f_cond"><option value="">Selecione…</option><option ${v.condicao === 'Novo' ? 'selected' : ''}>Novo</option><option ${v.condicao === 'Seminovo' ? 'selected' : ''}>Seminovo</option></select><span class="help">Não se aplica a serviços.</span></label>
      <label class="fld">Estado de conservação<input class="in" id="f_cons" maxlength="200" value="${esc(v.conservacao)}" placeholder="Ex.: Excelente, sem marcas de uso"></label>
      <label class="fld">Preço de venda (R$) *<input class="in" id="f_pn" inputmode="decimal" value="${p && p.precoNormal != null ? String(p.precoNormal).replace('.', ',') : ''}" placeholder="1.299,90"></label>
      <label class="fld">Preço promocional (R$)<input class="in" id="f_pp" inputmode="decimal" value="${p && p.precoPromocional != null ? String(p.precoPromocional).replace('.', ',') : ''}"><span class="help" id="f_pph"></span></label>
      <label class="fld">Estoque *<input class="in" id="f_est" type="number" min="0" step="1" value="${p ? p.estoque : ''}"></label>
      <label class="fld">Situação do anúncio<select class="in" id="f_st">${['Rascunho', 'Publicado', 'Despublicado'].map(s => `<option ${s === (v.status || 'Rascunho') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="fld">Selo promocional<select class="in" id="f_selo"><option value="auto">Automático (pelas regras de preço)</option><option value="none">Sem selo</option>${PRESET.map(s => `<option>${s}</option>`).join('')}<option value="custom">Texto personalizado…</option></select></label>
      <label class="fld" id="f_sc_r" hidden>Texto do selo<input class="in" id="f_sc" maxlength="24" value="${esc(seloSel === 'custom' ? v.seloManual : '')}"></label>
      <label class="fld">Cor do selo<input class="in" id="f_scor" type="color" value="${esc(v.seloCor || '#39ff14')}"></label>
      <label class="fld">Estilo do selo<select class="in" id="f_sest">${[['solido', 'Sólido'], ['contorno', 'Contorno'], ['vidro', 'Vidro']].map(([k, t]) => `<option value="${k}" ${k === (v.seloEstilo || 'solido') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="fld">Data de publicação<input class="in" id="f_dp" type="datetime-local" value="${esc(dp)}"><span class="help">Vazio = publica ao ativar.</span></label>
      <label class="chk full"><input type="checkbox" id="f_dest" ${v.destaque ? 'checked' : ''}> Destaque na página inicial</label>
      <label class="fld full">Observações internas<textarea class="in" id="f_obs" maxlength="1000">${esc(v.observacoes)}</textarea><span class="help">Não aparecem no site.</span></label>
      <div class="fld full artbox"><b>Arte promocional do anúncio</b>
        <div class="pf-cols"><label class="fld">Layout da arte<select class="in" id="f_lay"></select></label><label class="fld" id="f_fmt_r" hidden>Formato<select class="in" id="f_fmt">${ART_FMT.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label></div>
        <span class="help">Escolha um layout e a arte é criada sozinha com a foto, o nome e o preço deste anúncio, e vira a imagem principal. Para criar ou alterar layouts, use Adm → Criação de layouts. A arte usa a primeira foto que não seja arte.</span>
        <div><button class="btn btn-sm" type="button" id="f_artbtn" style="margin-top:8px">Pré-visualizar arte</button> <span id="f_artst" class="help"></span></div><img id="f_artimg" alt="Prévia da arte" hidden style="max-width:240px;border-radius:12px;margin-top:8px;border:1px solid var(--line2)"></div>
      <div class="fld full">Fotos (a primeira é a principal)<div class="photos" id="f_ph"></div>
        <input type="file" id="f_file" accept="image/jpeg,image/png,image/webp" multiple hidden><div><button class="btn btn-sm" type="button" id="f_add" style="margin-top:8px">+ Adicionar fotos</button> <span id="f_up" class="help"></span></div></div>
      <div class="fld full formerr" id="f_err" role="alert" style="text-align:left"></div></div></div>
      <div class="prev"><h3>Prévia no catálogo</h3><div id="f_prev"></div></div></div>`,
      footer: `${isNew ? '' : '<button class="btn btn-danger" id="f_del" style="margin-right:auto">Excluir anúncio</button>'}<button class="btn" data-x2>Cancelar</button><button class="btn btn-pri" id="f_save">Salvar anúncio</button>` });
    const E = id => $('#' + id, m.el); E('f_selo').value = seloSel; $('[data-x2]', m.el).onclick = m.close;

    const selo = () => { const s = E('f_selo').value; return s === 'auto' ? { modo: 'auto' } : s === 'none' ? { modo: 'none' } : s === 'custom' ? { modo: 'manual', texto: E('f_sc').value.trim() } : { modo: 'manual', texto: s }; };
    function preview() {
      costHint();
      E('f_sc_r').hidden = E('f_selo').value !== 'custom';
      const cat = E('f_cat').value, svc = cat === SZ.SERVICE_CAT, n = SZ.money(E('f_pn').value), pr = SZ.money(E('f_pp').value), s = selo();
      const ok = !isNaN(n) && !isNaN(pr), pc = SZ.pricing(ok ? n || 0 : 0, ok ? pr : null, s.modo, s.texto), est = Number(E('f_est').value) || 0;
      E('f_pph').textContent = !ok ? '' : pr != null && pr > (n || 0) ? 'Atenção: o promocional não pode ser maior que o preço de venda.' : pr != null && pr === n ? 'Preços iguais: aparece só o selo, sem desconto.' : pc.desconto ? `Desconto de ${pc.desconto}% calculado automaticamente.` : '';
      E('f_prev').innerHTML = SZ.cardHtml({ id: PF.id || 'NOVO', nome: E('f_nome').value || 'Nome do produto', categoria: cat || 'Categoria', marca: E('f_marca').value, modelo: E('f_modelo').value, descricaoCurta: E('f_dc').value, condicao: E('f_cond').value, precoAtual: pc.precoAtual, precoAnterior: pc.precoAnterior, desconto: pc.desconto,
        selo: pc.selo ? { texto: pc.selo, cor: E('f_scor').value === '#39ff14' ? '' : E('f_scor').value, estilo: E('f_sest').value } : null, estoque: est, disponivel: svc || est > 0, fotoPrincipal: PF.photos[0] ? PF.photos[0].url : '' });
    }
    function drawSub() {
      const cat = E('f_cat').value, cur = E('f_sub').value || v.subcategoria || '', L = (A.subc && A.subc[cat]) || [];
      const all = cur && L.indexOf(cur) < 0 ? L.concat([cur]) : L;
      E('f_sub').innerHTML = `<option value="">${all.length ? 'Sem subcategoria' : 'Nenhuma cadastrada para esta categoria'}</option>` + all.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
    }
    function costHint() {
      const n = SZ.money(E('f_pn').value), c = SZ.money(E('f_custo').value), pr = SZ.money(E('f_pp').value), R = A.rules || { margem: 20 }, h = E('f_custoh');
      if (c == null || isNaN(c)) { h.textContent = 'Só você vê. Sem custo, o produto fica fora das ofertas automáticas.'; return; }
      let t = `Preço sugerido pela sua margem de ${R.margem}%: ${SZ.brl(Math.round(c * (1 + R.margem / 100) * 100) / 100)}.`;
      if (n > 0) t += ` Margem atual: ${(Math.round((n / c - 1) * 1000) / 10).toString().replace('.', ',')}%.`;
      if (pr > 0 && pr < c) t += ' ATENÇÃO: o promocional está abaixo do custo.';
      h.textContent = t;
    }
    function drawPhotos() {
      E('f_ph').innerHTML = PF.photos.map((f, i) => `<div class="ph ${i === 0 ? 'main' : ''}" data-i="${i}"><img src="${esc(SZ.thumb(f.url, 200))}" alt="Foto ${i + 1}">${f.art ? '<span class="tag">ARTE</span>' : i === 0 ? '<span class="tag">PRINCIPAL</span>' : ''}${f.art ? '<div class="tools"><span class="help" style="padding:6px">gerada pelo layout</span></div>' : '<div class="tools"><button type="button" data-a="star" title="Tornar principal" aria-label="Tornar principal">★</button><button type="button" data-a="l" aria-label="Mover para a esquerda">◀</button><button type="button" data-a="r" aria-label="Mover para a direita">▶</button><button type="button" data-a="x" aria-label="Remover">✕</button></div>'}</div>`).join('') || '<span class="help">Nenhuma foto. Adicione pelo menos uma para publicar.</span>';
      preview();
    }
    E('f_ph').onclick = async ev => {
      const b = ev.target.closest('[data-a]'); if (!b) return; const i = +b.closest('.ph').dataset.i, a = b.dataset.a, L = PF.photos; if (L[i] && L[i].art) return;
      const ai = L.findIndex(f => f.art), lo = ai === 0 ? 1 : 0;
      if (a === 'star' && i > lo) L.splice(lo, 0, L.splice(i, 1)[0]);
      if (a === 'l' && i > lo) [L[i - 1], L[i]] = [L[i], L[i - 1]];
      if (a === 'r' && i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]];
      if (a === 'x') { const f = L.splice(i, 1)[0]; if (f.fresh && f.fileId) api('deleteImage', { fileId: f.fileId }).catch(() => {}); }
      drawPhotos();
    };
    E('f_add').onclick = () => E('f_file').click();
    E('f_file').onchange = async ev => {
      const files = [...ev.target.files].slice(0, 12 - PF.photos.length); ev.target.value = ''; if (!files.length) return;
      const up = E('f_up'); let n = 0;
      for (const f of files) {
        n++; up.innerHTML = `<span class="spin"></span> Enviando ${n} de ${files.length}…`;
        try {
          if (!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error(`${f.name}: use JPG, PNG ou WEBP.`);
          const b64 = await resizeImage(f, 1600), r = await api('uploadImage', { mimeType: 'image/jpeg', base64: b64 });
          PF.photos.push({ url: r.url, fresh: true, fileId: r.fileId, local: 'data:image/jpeg;base64,' + b64 }); drawPhotos();
        } catch (e) { fail(e); }
      }
      up.textContent = '';
    };
    m.el.addEventListener('input', preview); m.el.addEventListener('change', preview); drawPhotos();
    drawSub(); E('f_cat').addEventListener('change', () => { E('f_sub').value = ''; v.subcategoria = ''; drawSub(); });
    loadRules().then(() => { drawSub(); preview(); });

    /* ----- arte promocional ----- */
    const layOpts = () => `<option value="">Sem arte — usar apenas as fotos</option><optgroup label="Layouts padrão">${BUILTIN.map(([k, t]) => `<option value="b:${k}">${t}</option>`).join('')}</optgroup>${CLOUD_LAY.length ? `<optgroup label="Meus layouts">${CLOUD_LAY.map(c => `<option value="c:${esc(c.id)}">${esc(c.nome)}${c.formato ? ' · ' + esc(c.formato) : ''}</option>`).join('')}</optgroup>` : ''}`;
    let layInit = v.layoutArte || '';
    const [lb, lk, lf] = String(layInit).split(':');
    E('f_lay').innerHTML = layOpts(); E('f_lay').value = layInit && layInit.startsWith('b:') ? 'b:' + lk : layInit; if (lb === 'b' && lf) E('f_fmt').value = lf;
    const layFmt = () => { E('f_fmt_r').hidden = !E('f_lay').value.startsWith('b:'); };
    api('listLayouts').then(l => { CLOUD_LAY = Array.isArray(l) ? l : []; const cur = E('f_lay').value; E('f_lay').innerHTML = layOpts(); E('f_lay').value = cur; if (layInit.startsWith('c:') && !cur) E('f_lay').value = layInit; layFmt(); }).catch(() => { /* só padrão */ });
    layFmt();
    const layVal = () => { const x = E('f_lay').value; return x.startsWith('b:') ? x + ':' + E('f_fmt').value : x; };
    const artProduct = () => { const s = selo(), n = SZ.money(E('f_pn').value), pr = SZ.money(E('f_pp').value); return { nome: E('f_nome').value.trim() || 'Produto', categoria: E('f_cat').value, marca: E('f_marca').value, modelo: E('f_modelo').value, descricaoCurta: E('f_dc').value,
      precoNormal: isNaN(n) ? null : n, precoPromocional: isNaN(pr) ? null : pr, condicao: E('f_cond').value, conservacao: E('f_cons').value, especificacoes: parseSpecs(E('f_esp').value), seloModo: s.modo, seloManual: s.texto || '' }; };
    function artConfig(sel) {
      if (sel.startsWith('b:')) { const [, id, fm] = sel.split(':'); return { builtin: id, fmt: fm || 'portrait' }; }
      const c = CLOUD_LAY.find(x => 'c:' + x.id === sel); if (!c || !c.configuracao || !c.configuracao.els) throw new Error('Layout não encontrado. Escolha outro layout.');
      return c.configuracao;
    }
    /** Gera a arte (ou reaproveita a última igual). Devolve um data URL JPEG. */
    async function makeArt() {
      const sel = layVal(), src = PF.photos.find(f => !f.art);
      if (!src) throw new Error('Adicione a foto do produto: a arte é montada sobre ela.');
      const prod = artProduct(), photo = src.local || src.url, sig = JSON.stringify([sel, prod, src.url, CLOUD_LAY.length]);
      if (PF.art && PF.art.sig === sig) return PF.art.dataUrl;
      const dataUrl = await Art.render(artConfig(E('f_lay').value.startsWith('b:') ? sel : E('f_lay').value), prod, photo);
      PF.art = { sig, dataUrl }; return dataUrl;
    }
    E('f_lay').onchange = () => { layFmt(); PF.art = null; E('f_artimg').hidden = true; E('f_artst').textContent = ''; };
    E('f_fmt').onchange = () => { PF.art = null; E('f_artimg').hidden = true; };
    E('f_artbtn').onclick = async () => {
      if (!E('f_lay').value) { E('f_artst').textContent = 'Escolha um layout primeiro.'; return; }
      const b = E('f_artbtn'); b.disabled = true; E('f_artst').innerHTML = '<span class="spin"></span> Gerando arte…';
      try { const u = await makeArt(); E('f_artimg').src = u; E('f_artimg').hidden = false; E('f_artst').textContent = 'Pronta. Ela é enviada ao salvar o anúncio.'; }
      catch (e) { E('f_artst').textContent = e.message || 'Não foi possível gerar a arte.'; }
      b.disabled = false;
    };

    function validate(d) {
      const er = [], svc = d.categoria === SZ.SERVICE_CAT;
      if (d.nome.length < 2) er.push('Informe o nome do produto.'); if (!d.categoria) er.push('Escolha a categoria.');
      if (!svc && !d.condicao) er.push('Escolha a condição: Novo ou Seminovo.');
      const n = SZ.money(d.precoNormal), p = SZ.money(d.precoPromocional);
      if (isNaN(n) || (!svc && !(n > 0))) er.push('Informe um preço de venda válido (ex.: 1.299,90).');
      const cu = SZ.money(d.custo); if (isNaN(cu) || (cu != null && cu < 0)) er.push('Custo inválido (ex.: 850,00).');
      if (isNaN(p) || (p != null && p <= 0)) er.push('Preço promocional inválido.'); else if (p != null && n != null && !isNaN(n) && p > n) er.push('O preço promocional não pode ser maior que o preço de venda.');
      if (!svc && (d.estoque === '' || !(Number(d.estoque) >= 0) || Math.floor(Number(d.estoque)) !== Number(d.estoque))) er.push('Informe o estoque (número inteiro, 0 ou mais).');
      if (d.seloModo === 'manual' && !d.seloManual) er.push('Digite o texto do selo personalizado.');
      if (d.status === 'Publicado' && !PF.photos.length) er.push('Adicione ao menos uma foto para publicar.');
      if (E('f_lay').value && !PF.photos.some(f => !f.art)) er.push('Para gerar a arte, adicione a foto do produto.');
      return er;
    }
    E('f_save').onclick = async () => {
      const s = selo(), dpv = E('f_dp').value;
      const d = { requestId: PF.rid, id: PF.id || undefined, nome: E('f_nome').value.trim(), categoria: E('f_cat').value, marca: E('f_marca').value, modelo: E('f_modelo').value, descricaoCurta: E('f_dc').value, descricaoCompleta: E('f_dl').value, especificacoes: E('f_esp').value,
        condicao: E('f_cond').value, conservacao: E('f_cons').value, custo: E('f_custo').value, subcategoria: E('f_sub').value, precoNormal: E('f_pn').value, precoPromocional: E('f_pp').value, estoque: E('f_est').value, status: E('f_st').value, seloModo: s.modo, seloManual: s.texto || '',
        seloCor: E('f_scor').value === '#39ff14' ? '' : E('f_scor').value, seloEstilo: E('f_sest').value, destaque: E('f_dest').checked, dataPublicacao: dpv ? dpv.replace('T', ' ') : '', observacoes: E('f_obs').value,
        fotoPrincipal: PF.photos[0] ? PF.photos[0].url : '', fotosAdicionais: PF.photos.slice(1).map(f => f.url) };
      const er = validate(d), box = E('f_err'); box.innerHTML = er.map(x => '• ' + esc(x)).join('<br>');
      if (er.length) { box.scrollIntoView({ block: 'nearest' }); return; }
      const b = E('f_save'); b.disabled = true; b.textContent = 'Salvando…';
      try {
        const old = PF.photos.find(f => f.art), keep = PF.photos.filter(f => !f.art), sel = E('f_lay').value;
        if (sel) {
          b.textContent = 'Gerando arte…'; const u = await makeArt(); b.textContent = 'Enviando arte…';
          const up = await api('uploadImage', { mimeType: 'image/jpeg', base64: u.split(',')[1] });
          PF.photos = [{ url: up.url, fresh: true, fileId: up.fileId, art: true }].concat(keep); PF.art = null;
          if (old) PF.trash.push(old.url);
          d.layoutArte = layVal(); d.fotoArte = up.url;
        } else { PF.photos = keep; if (old) PF.trash.push(old.url); d.layoutArte = ''; d.fotoArte = ''; }
        d.fotoPrincipal = PF.photos[0] ? PF.photos[0].url : ''; d.fotosAdicionais = PF.photos.slice(1).map(f => f.url);
        b.textContent = 'Salvando…';
        const r = await api('saveProduct', d);
        PF.trash.forEach(u => { const id = driveId(u); if (id) api('deleteImage', { fileId: id }).catch(() => {}); }); PF.trash = []; SZ.sessionBust(); SZ.toast(isNew ? `Anúncio criado (${r.id}).` : 'Anúncio atualizado.'); m.close(); done(); }
      catch (e) { box.textContent = e.message || 'Erro ao salvar.'; b.disabled = false; b.textContent = 'Salvar anúncio'; }
    };
    if (!isNew) E('f_del').onclick = async () => {
      if (!confirm(`Excluir o anúncio “${p.nome}”?\n\nEle sai do site e do painel. Vendas e layouts antigos continuam registrados.`)) return;
      try { await api('deleteProduct', { id: p.id }); SZ.sessionBust(); SZ.toast('Anúncio excluído.'); m.close(); done(); } catch (e) { fail(e); }
    };
  }

  /* ------------------------------ agenda de ofertas ------------------------------ */
  const dtLocal = d => { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
  const fmtDt = s => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : ''; };
  const pct = n => String(n).replace('.', ',') + '%';
  const MOTIVO = { sem_custo: 'sem custo cadastrado', sem_preco: 'sem preço', sem_espaco: 'sem espaço acima do custo' };
  async function offersView(el) {
    el.innerHTML = `<h1>Agenda de ofertas</h1><p class="lead">Programe ofertas por categoria, tipo de produto ou itens escolhidos. Elas entram e saem do ar sozinhas nas datas definidas, sem mexer em cada anúncio.</p><div id="obody">${loadingHtml}</div>`;
    await loadRules(true);
    const R = A.rules || { margem: 20, descMax: 10, margemMin: 0 };
    let offers = [];
    const draw = () => {
      $('#obody').innerHTML = `<div class="note info">Suas regras: margem de lucro <b>${pct(R.margem)}</b> · desconto máximo <b>${pct(R.descMax)}</b> · margem mínima sobre o custo <b>${pct(R.margemMin)}</b>. A oferta nunca passa do desconto máximo nem fica abaixo do custo. Produtos sem custo cadastrado ficam de fora. Para alterar as regras, vá em Configurações.</div>
        <div class="bar"><span class="grow"></span><button class="btn btn-pri" id="onew">+ Nova oferta</button></div>
        ${offers.length ? `<div class="tw"><table class="tbl rs"><thead><tr><th>Oferta</th><th>Aplica em</th><th class="num">Desconto</th><th>Período</th><th>Situação</th><th class="num">Itens</th><th></th></tr></thead><tbody>${offers.map(o => `<tr data-id="${esc(o.id)}">
          <td data-l="Oferta"><b>${esc(o.nome)}</b></td><td data-l="Aplica em">${o.escopo === 'todos' ? 'Todos os produtos' : o.escopo === 'categoria' ? esc(o.categoria) + (o.subcategoria ? ' › ' + esc(o.subcategoria) : '') : o.ids.length + ' produto(s) escolhido(s)'}</td>
          <td class="num" data-l="Desconto">${pct(o.percentual)}</td><td data-l="Período">${fmtDt(o.inicio)}<br><small style="color:var(--mute)">até ${fmtDt(o.fim)}</small></td>
          <td data-l="Situação"><span class="pill ${o.estado === 'No ar' ? 'ok' : o.estado === 'Agendada' ? 'warn' : 'mute'}">${esc(o.estado)}</span></td>
          <td class="num" data-l="Itens">${o.aplicados}${o.aplicados !== o.produtos ? `<small style="color:var(--mute)"> de ${o.produtos}</small>` : ''}</td>
          <td><div class="acts"><button class="btn btn-sm" data-ed>Editar</button><button class="btn btn-sm" data-art>Atualizar artes</button><button class="btn btn-sm" data-pz>${o.status === 'Pausada' ? 'Reativar' : 'Pausar'}</button><button class="btn btn-sm btn-danger" data-del>Excluir</button></div></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">Nenhuma oferta programada. Clique em “Nova oferta”.</div>'}`;
      $('#onew').onclick = () => offerForm(null);
    };
    async function load() { try { offers = await api('listOffers'); draw(); if (A.offerIds) { const ids = A.offerIds; A.offerIds = null; offerForm(null, ids); } } catch (e) { $('#obody').innerHTML = errHtml(e, 'oretry'); $('#oretry').onclick = load; } }
    $('#obody').onclick = async ev => {
      const tr = ev.target.closest('tr[data-id]'); if (!tr) return; const o = offers.find(x => x.id === tr.dataset.id); if (!o) return;
      if (ev.target.closest('[data-ed]')) offerForm(o);
      if (ev.target.closest('[data-pz]')) { try { await api('saveOffer', { ...o, percentual: o.percentual, status: o.status === 'Pausada' ? 'Ativa' : 'Pausada' }); SZ.sessionBust(); load(); } catch (e) { fail(e); } }
      if (ev.target.closest('[data-del]') && confirm(`Excluir a oferta “${o.nome}”? Os preços voltam ao normal.`)) { try { await api('deleteOffer', { id: o.id }); SZ.sessionBust(); SZ.toast('Oferta excluída.'); load(); } catch (e) { fail(e); } }
      if (ev.target.closest('[data-art]')) { try { const all = await api('listAllProducts'); bulkArt(all.filter(p => o.idsAfetados.indexOf(p.id) >= 0), { mode: 'keep' }); } catch (e) { fail(e); } }
    };
    async function offerForm(o, preIds) {
      let prods = []; try { prods = await api('listAllProducts'); } catch (e) { return fail(e); }
      prods = prods.filter(p => p.categoria !== SZ.SERVICE_CAT);
      const now = new Date(), end = new Date(now.getTime() + 7 * 864e5), ids = new Set(o ? o.ids : preIds || []);
      const v = o || { nome: '', escopo: preIds ? 'produtos' : 'categoria', categoria: '', subcategoria: '', percentual: '', inicio: dtLocal(now), fim: dtLocal(end), status: 'Ativa' };
      const m = dlg({ title: o ? 'Editar oferta' : 'Nova oferta', cls: 'wide', body: `<div class="pf-cols">
        <label class="fld full">Nome da oferta *<input class="in" id="o_nome" maxlength="80" value="${esc(v.nome)}" placeholder="Ex.: Semana dos teclados, Natal Safezone"></label>
        <label class="fld">Aplicar em *<select class="in" id="o_esc"><option value="categoria">Uma categoria ou tipo de produto</option><option value="produtos">Produtos escolhidos</option><option value="todos">Todos os produtos</option></select></label>
        <label class="fld">Desconto (%) *<input class="in" id="o_pct" inputmode="decimal" value="${esc(String(v.percentual).replace('.', ','))}" placeholder="Ex.: 10"><span class="help">Limitado ao desconto máximo (${pct(R.descMax)}) e ao custo.</span></label>
        <label class="fld" id="o_cat_r">Categoria<select class="in" id="o_cat"><option value="">Selecione…</option>${SZ.CATEGORIES.filter(c => c !== SZ.SERVICE_CAT).map(c => `<option ${c === v.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="fld" id="o_sub_r">Tipo de produto (subcategoria)<select class="in" id="o_sub"></select></label>
        <div class="fld full" id="o_ids_r">Produtos<input class="in" id="o_q" placeholder="Filtrar a lista"><div class="picklist" id="o_ids"></div><span class="help" id="o_cnt"></span></div>
        <label class="fld">Início *<input class="in" type="datetime-local" id="o_ini" value="${esc(v.inicio)}"></label>
        <label class="fld">Fim *<input class="in" type="datetime-local" id="o_fim" value="${esc(v.fim)}"></label>
        <div class="full"><button class="btn" id="o_prev" type="button">Ver prévia dos preços</button></div>
        <div class="full" id="o_pv" aria-live="polite"></div><div class="full formerr" id="o_err" role="alert"></div></div>`,
        footer: '<button class="btn" id="o_x">Cancelar</button><button class="btn btn-pri" id="o_save">Salvar oferta</button>' });
      const E = id => $('#' + id, m.el); E('o_esc').value = v.escopo; E('o_x').onclick = m.close;
      const subOpts = () => { const L = (A.subc && A.subc[E('o_cat').value]) || []; const cur = E('o_sub').value || v.subcategoria || ''; E('o_sub').innerHTML = '<option value="">Todos os tipos da categoria</option>' + L.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join(''); };
      const drawIds = () => { const q = nn(E('o_q').value); E('o_ids').innerHTML = prods.filter(p => ids.has(p.id) || !q || nn(p.nome + ' ' + p.categoria + ' ' + p.subcategoria).indexOf(q) >= 0).map(p => `<label class="chk"><input type="checkbox" data-id="${esc(p.id)}" ${ids.has(p.id) ? 'checked' : ''}> ${esc(p.nome)} <small style="color:var(--mute)">${esc(p.categoria)}${p.subcategoria ? ' › ' + esc(p.subcategoria) : ''}${p.custo == null ? ' · sem custo' : ''}</small></label>`).join('') || '<span class="help">Nenhum produto.</span>'; E('o_cnt').textContent = ids.size + ' selecionado(s)'; };
      const vis = () => { const e = E('o_esc').value; E('o_cat_r').hidden = E('o_sub_r').hidden = e !== 'categoria'; E('o_ids_r').hidden = e !== 'produtos'; };
      subOpts(); drawIds(); vis(); E('o_esc').onchange = () => { vis(); E('o_pv').innerHTML = ''; }; E('o_cat').onchange = () => { E('o_sub').value = ''; v.subcategoria = ''; subOpts(); E('o_pv').innerHTML = ''; };
      E('o_q').oninput = drawIds; E('o_ids').onchange = ev => { const c = ev.target.closest('[data-id]'); if (!c) return; c.checked ? ids.add(c.dataset.id) : ids.delete(c.dataset.id); E('o_cnt').textContent = ids.size + ' selecionado(s)'; };
      const body = () => ({ id: o ? o.id : undefined, nome: E('o_nome').value.trim(), escopo: E('o_esc').value, categoria: E('o_cat').value, subcategoria: E('o_sub').value, ids: [...ids], percentual: E('o_pct').value, inicio: E('o_ini').value.replace('T', ' '), fim: E('o_fim').value.replace('T', ' '), status: o ? o.status : 'Ativa' });
      E('o_prev').onclick = async () => {
        E('o_err').textContent = ''; E('o_pv').innerHTML = '<span class="spin"></span> Calculando…';
        try {
          const r = await api('previewOffer', body()), lim = r.itens.filter(x => x.ok && x.limite).length, sc = r.itens.filter(x => !x.ok).length;
          E('o_pv').innerHTML = `<div class="note info"><b>${r.aplicados} de ${r.total}</b> produto(s) recebem a oferta${lim ? ` · ${lim} com desconto limitado pelas suas regras` : ''}${sc ? ` · ${sc} ficam de fora` : ''}.</div>
            <div class="tw" style="max-height:300px;overflow:auto"><table class="tbl"><thead><tr><th>Produto</th><th class="num">Preço</th><th class="num">Custo</th><th class="num">Fica por</th><th class="num">Desc.</th><th class="num">Margem</th></tr></thead><tbody>${r.itens.map(x => `<tr><td>${esc(x.nome)}${x.manual != null ? `<br><small style="color:var(--mute)">promoção manual atual: ${SZ.brl(x.manual)}</small>` : ''}</td><td class="num">${SZ.brl(x.normal)}</td><td class="num">${x.custo != null ? SZ.brl(x.custo) : '—'}</td>
            ${x.ok ? `<td class="num"><b>${SZ.brl(x.novoPreco)}</b></td><td class="num">${pct(x.pct)}${x.limite ? `<br><small style="color:var(--mute)">limite: ${esc(x.limite)}</small>` : ''}</td><td class="num">${pct(x.margemApos)}</td>` : `<td colspan="3" style="color:var(--mute)">fora: ${esc(MOTIVO[x.motivo] || x.motivo)}</td>`}</tr>`).join('') || '<tr><td colspan="6">Nenhum produto neste alvo.</td></tr>'}</tbody></table></div>`;
        } catch (e) { E('o_pv').innerHTML = ''; E('o_err').textContent = e.message; }
      };
      let subst = o ? o.substituir !== false : true;
      const askSubst = n => new Promise(res => {
        const q = dlg({ title: 'Produtos com promoção manual', body: `<p><b>${n} produto(s)</b> desta oferta já têm uma promoção manual. Quando a oferta programada entrar em vigor, o que fazer?</p><p class="help">Ao terminar a vigência, a promoção manual continua como está.</p>`,
          footer: '<button class="btn" id="q_keep">Manter a promoção manual</button><button class="btn btn-pri" id="q_sub">Substituir pela oferta programada</button>' });
        $('#q_sub', q.el).onclick = () => { q.close(); res(true); }; $('#q_keep', q.el).onclick = () => { q.close(); res(false); };
      });
      E('o_save').onclick = async () => {
        const b = E('o_save'); b.disabled = true; E('o_err').textContent = '';
        try {
          const pv = await api('previewOffer', body());
          if (pv.comManual > 0) subst = await askSubst(pv.comManual);
          await api('saveOffer', { ...body(), substituir: subst }); SZ.sessionBust(); SZ.toast('Oferta salva. Ela entra no ar na data de início.'); m.close(); load(); } catch (e) { E('o_err').textContent = e.message; b.disabled = false; }
      };
    }
    load();
  }

  /* ---------------------------------- adm ---------------------------------- */
  function admView(el) { ({ indicadores: indicatorsView, logins: usersView, postagem: productsView, ofertas: offersView, layouts: layoutsView }[A.sub])(el); }

  function indicatorsView(el) {
    el.innerHTML = `<h1>Indicadores</h1><p class="lead">Dados reais do sistema. Sem registros, os números ficam zerados.</p>
      <div class="bar"><label class="fld">De<input class="in" type="date" id="if"></label><label class="fld">Até<input class="in" type="date" id="it"></label>
        <label class="fld">Categoria<select class="in" id="ic"><option value="">Todas</option>${SZ.CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select></label><button class="btn" id="igo">Aplicar</button></div><div id="ibody">${loadingHtml}</div>`;
    async function load() {
      const b = $('#ibody'); b.innerHTML = loadingHtml;
      try {
        const d = await api('dashboard', { from: $('#if').value, to: $('#it').value, categoria: $('#ic').value });
        const empty = !d.totalAnuncios && !d.novosContatos && !d.vendasConcluidas;
        const mx = Math.max(1, ...d.produtosComMaisInteresse.map(x => x.total)), mc = Math.max(1, ...d.desempenhoPorCategoria.map(x => x.contatos));
        b.innerHTML = `${empty ? '<div class="note info">Ainda não há dados. Cadastre anúncios em “Postagem de vendas” e registre vendas na aba “Vendas” para ver os indicadores.</div>' : ''}
        <div class="cards"><div class="stat"><small>Total de anúncios</small><b>${d.totalAnuncios}</b></div><div class="stat"><small>Anúncios ativos</small><b>${d.anunciosAtivos}</b></div><div class="stat"><small>Esgotados</small><b>${d.esgotados}</b></div><div class="stat"><small>Em promoção</small><b>${d.emPromocao}</b></div>
          <div class="stat"><small>Novos contatos</small><b>${d.novosContatos}</b><em>interesse recebido</em></div><div class="stat hl"><small>Vendas concluídas</small><b>${d.vendasConcluidas}</b></div><div class="stat hl"><small>Valor das vendas concluídas</small><b>${SZ.brl(d.valorVendasConcluidas)}</b></div>
          <div class="stat"><small>Mais visualizados</small><b style="font-size:14px;margin-top:10px">Indisponível</b><em>sem contagem de visualizações</em></div></div>
        <div class="two"><div class="panel"><h2>Produtos com maior interesse</h2><div class="bars">${d.produtosComMaisInteresse.map(x => `<div class="bar-r"><span>${esc(x.nome)}</span><span>${x.total}</span><div class="tr"><i style="width:${x.total / mx * 100}%"></i></div></div>`).join('') || '<span class="help" style="color:var(--mute)">Sem registros no período.</span>'}</div></div>
          <div class="panel"><h2>Desempenho por categoria</h2><div class="bars">${d.desempenhoPorCategoria.map(x => `<div class="bar-r"><span>${esc(x.categoria)} <small style="color:var(--mute)">· ${x.vendas} venda(s) · ${SZ.brl(x.valor)}</small></span><span>${x.contatos}</span><div class="tr"><i style="width:${x.contatos / mc * 100}%"></i></div></div>`).join('') || '<span class="help" style="color:var(--mute)">Sem registros no período.</span>'}</div></div></div>
        <div id="gv"></div><div class="panel"><h2>Atividade recente no painel</h2><div class="feed">${d.atividadeRecente.map(a => `<div><b>${esc(a.operacao)}</b> · ${esc(a.usuario)} · ${SZ.dt(a.dataHora)}${a.registro ? ' · ' + esc(a.registro) : ''} <span class="pill ${a.resultado === 'OK' ? 'ok' : 'bad'}">${esc(a.resultado)}</span></div>`).join('') || 'Nenhuma atividade registrada.'}</div></div>`;
        turn();
      } catch (e) { b.innerHTML = errHtml(e, 'iretry'); $('#iretry').onclick = load; }
    }
    async function turn() {
      const g = $('#gv'); if (!g) return; g.innerHTML = `<div class="panel"><h2>Giro de estoque e espaço para ofertas</h2>${loadingHtml}</div>`;
      try {
        const t = await api('turnover'), cat = $('#ic').value; let f = '';
        const draw = () => {
          const L = t.itens.filter(i => (!cat || i.categoria === cat) && (!f || i.classe === f));
          g.innerHTML = `<div class="panel"><h2>Giro de estoque e espaço para ofertas</h2>
            <p class="help" style="margin:0 0 10px">Sua estratégia: o que gira muito pode ter preço menor (volume); o que gira pouco mantém preço/margem maior. ${esc(t.criterios)} Margem de lucro alvo: ${pct(t.regras.margem)} · desconto máximo: ${pct(t.regras.descMax)}.</p>
            <div class="cards">${t.categorias.filter(c => !cat || c.categoria === cat).map(c => `<div class="stat"><small>${esc(c.categoria)}</small><b>${c.vendas30}</b><em>vendas em 30 dias · ${c.estoque} em estoque · ${c.alto} alto giro · ${c.baixo} baixo giro</em></div>`).join('') || '<span class="help">Sem produtos publicados.</span>'}</div>
            <div class="bar"><label class="fld">Giro<select class="in" id="gf"><option value="">Todos</option>${['Alto giro', 'Giro médio', 'Baixo giro'].map(x => `<option ${x === f ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
            ${L.length ? `<div class="tw"><table class="tbl rs"><thead><tr><th>Produto</th><th>Giro</th><th class="num">Vendas 30d</th><th class="num">Estoque</th><th class="num">Dias de estoque</th><th class="num">Margem</th><th class="num">Folga p/ oferta</th><th>Sugestão</th></tr></thead><tbody>${L.map(i => `<tr><td data-l="Produto"><b>${esc(i.nome)}</b><br><small style="color:var(--mute)">${esc(i.categoria)}${i.subcategoria ? ' › ' + esc(i.subcategoria) : ''}</small></td>
              <td data-l="Giro"><span class="pill ${i.classe === 'Alto giro' ? 'ok' : i.classe === 'Baixo giro' ? 'warn' : 'mute'}">${esc(i.classe)}</span></td><td class="num" data-l="Vendas 30d">${i.vendas30}</td><td class="num" data-l="Estoque">${i.estoque}</td><td class="num" data-l="Dias de estoque">${i.diasDeEstoque == null ? '—' : i.diasDeEstoque}</td>
              <td class="num" data-l="Margem">${i.margemAtual == null ? '<small style="color:var(--mute)">sem custo</small>' : pct(i.margemAtual)}</td><td class="num" data-l="Folga p/ oferta">${i.folgaOferta == null ? '—' : pct(i.folgaOferta)}</td><td data-l="Sugestão">${esc(i.sugestao)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhum produto neste filtro.</div>'}</div>`;
          $('#gf').onchange = ev => { f = ev.target.value; draw(); };
        };
        draw();
      } catch (e) { g.innerHTML = ''; }
    }
    $('#igo').onclick = load; load();
  }

  function usersView(el) {
    el.innerHTML = `<h1>Logins</h1><p class="lead">Usuários autorizados e histórico de acessos. Senhas nunca são exibidas.</p>
      <div class="bar"><span class="grow"></span><button class="btn btn-pri" id="unew">+ Novo usuário</button></div><div id="ubody">${loadingHtml}</div>
      <div class="panel" style="margin-top:22px"><h2>Histórico de acessos administrativos</h2><div id="uaud">${loadingHtml}</div></div>`;
    let users = [];
    async function load() {
      try {
        users = await api('listUsers');
        $('#ubody').innerHTML = `<div class="tw"><table class="tbl rs"><thead><tr><th>Nome</th><th>Login</th><th>Acesso</th><th>Status</th><th>Criado em</th><th>Último acesso</th><th></th></tr></thead><tbody>
          ${users.map(u => `<tr data-l="${esc(u.login)}"><td data-l="Nome">${esc(u.nome || '—')}</td><td data-l="Login">${esc(u.login)}</td><td data-l="Acesso">${esc(u.acesso)}</td><td data-l="Status"><span class="pill ${u.status === 'Ativo' ? 'ok' : 'bad'}">${esc(u.status)}</span></td><td data-l="Criado em">${SZ.dt(u.criadoEm)}</td><td data-l="Último acesso">${SZ.dt(u.ultimoAcesso)}</td>
          <td><div class="acts"><button class="btn btn-sm" data-ed>Editar</button><button class="btn btn-sm" data-tg>${u.status === 'Ativo' ? 'Desativar' : 'Ativar'}</button><button class="btn btn-sm" data-rv>Revogar sessões</button></div></td></tr>`).join('')}</tbody></table></div>`;
      } catch (e) { $('#ubody').innerHTML = errHtml(e, 'uretry'); $('#uretry').onclick = load; }
      try {
        const a = await api('listAudit', { apenasAcessos: true, limit: 60 });
        $('#uaud').innerHTML = a.length ? `<div class="tw"><table class="tbl rs"><thead><tr><th>Data</th><th>Usuário</th><th>Evento</th><th>Resultado</th></tr></thead><tbody>${a.map(x => `<tr><td data-l="Data">${SZ.dt(x.dataHora)}</td><td data-l="Usuário">${esc(x.usuario)}</td><td data-l="Evento">${esc(x.operacao)}</td><td data-l="Resultado"><span class="pill ${x.resultado === 'OK' ? 'ok' : 'bad'}">${esc(x.resultado)}</span></td></tr>`).join('')}</tbody></table></div>` : '<span class="help" style="color:var(--mute)">Nenhum acesso registrado.</span>';
      } catch (e) { $('#uaud').textContent = e.message; }
    }
    function form(u) {
      const isNew = !u, has = a => u && String(u.acesso).split(/[,;|]/).map(s => s.trim()).indexOf(a) >= 0;
      const m = dlg({ title: isNew ? 'Novo usuário' : 'Editar usuário', cls: 'sm', body: `<div class="pf-cols"><label class="fld full">E-mail / login *<input class="in" id="u_l" maxlength="120" value="${esc(u ? u.login : '')}" ${isNew ? '' : 'readonly'} autocomplete="off"></label>
        <label class="fld full">Nome<input class="in" id="u_n" maxlength="80" value="${esc(u ? u.nome : '')}"></label>
        <label class="fld full">${isNew ? 'Senha *' : 'Nova senha'}<input class="in" id="u_p" type="password" autocomplete="new-password" maxlength="200" placeholder="${isNew ? 'Mínimo de 8 caracteres' : 'Deixe vazio para manter a atual'}"></label>
        <div class="fld full">Permissões<div class="chkg">${ACCESS.map(a => `<label class="chk"><input type="checkbox" value="${a}" ${has(a) ? 'checked' : ''}> ${a}</label>`).join('')}</div><span class="help">“Aba Adm” libera a área administrativa completa.</span></div>
        <label class="fld full">Status<select class="in" id="u_s"><option ${!u || u.status === 'Ativo' ? 'selected' : ''}>Ativo</option><option ${u && u.status === 'Inativo' ? 'selected' : ''}>Inativo</option></select></label>
        <div class="formerr full" id="u_e" role="alert" style="text-align:left"></div></div>`, footer: '<button class="btn" data-x2>Cancelar</button><button class="btn btn-pri" id="u_go">Salvar</button>' });
      $('[data-x2]', m.el).onclick = m.close;
      $('#u_go', m.el).onclick = async () => {
        const b = $('#u_go', m.el); b.disabled = true;
        try { await api('saveUser', { login: $('#u_l', m.el).value, nome: $('#u_n', m.el).value, password: $('#u_p', m.el).value, acesso: $$('input[type=checkbox]:checked', m.el).map(c => c.value).join(', '), status: $('#u_s', m.el).value }); SZ.toast('Usuário salvo.'); m.close(); load(); }
        catch (e) { $('#u_e', m.el).textContent = e.message; b.disabled = false; }
      };
    }
    $('#unew').onclick = () => form(null);
    $('#ubody').onclick = async ev => {
      const tr = ev.target.closest('tr[data-l]'); if (!tr) return; const u = users.find(x => x.login === tr.dataset.l);
      if (ev.target.closest('[data-ed]')) form(u);
      if (ev.target.closest('[data-tg]')) { try { await api('saveUser', { login: u.login, nome: u.nome, acesso: u.acesso, status: u.status === 'Ativo' ? 'Inativo' : 'Ativo' }); SZ.toast('Status atualizado.'); load(); } catch (e) { fail(e); } }
      if (ev.target.closest('[data-rv]')) { if (!confirm(`Encerrar todas as sessões de ${u.login}?`)) return; try { await api('revokeSessions', { login: u.login }); SZ.toast('Sessões revogadas.'); } catch (e) { fail(e); } }
    };
    load();
  }

  function layoutsView(el) {
    el.innerHTML = `<h1>Criação de layouts</h1><p class="lead">Suba 1 foto, escolha um layout e exporte a arte. Selecione um anúncio cadastrado para preencher tudo automaticamente.</p><iframe class="edframe" id="edf" src="../editor/index.html" title="Editor de artes"></iframe>`;
    const fr = $('#edf');
    const send = m => fr.contentWindow && fr.contentWindow.postMessage(m, location.origin);
    async function sync() {
      try { const l = await api('listAllProducts'); send({ type: 'sz:products', products: l }); } catch (e) { /* editor segue manual */ }
      try { const c = await api('listLayouts'); send({ type: 'sz:cloud', layouts: c }); } catch (e) { /* sem layouts na nuvem */ }
    }
    fr.addEventListener('load', sync);
    window.onmessage = async ev => {
      if (ev.origin !== location.origin || ev.source !== fr.contentWindow || !ev.data) return; const d = ev.data;
      if (d.type === 'sz:layout-save') { try { await api('saveLayout', { id: d.id, nome: d.name, formato: d.formato, configuracao: d.state }); SZ.toast('Layout salvo na nuvem.'); sync(); } catch (e) { fail(e); } }
      if (d.type === 'sz:layout-delete') { try { await api('deleteLayout', { id: d.id }); SZ.toast('Layout excluído.'); sync(); } catch (e) { fail(e); } }
    };
  }

  /* ------------------------------ valores dos serviços ------------------------------ */
  async function valuesView(el) {
    el.innerHTML = `<h1>Valores Serviços</h1><p class="lead">Defina quanto cobrar por cada serviço. No site, o cliente soma os serviços e informa as peças do PC para ver o valor.</p><div id="vbody">${loadingHtml}</div>`;
    let D;
    try { D = await api('adminServicePricing'); } catch (e) { $('#vbody').innerHTML = errHtml(e, 'vretry'); $('#vretry').onclick = () => valuesView(el); return; }
    const TYPES = [['GPU', 'Placas de vídeo'], ['CPU', 'Processadores'], ['RAM', 'Memória RAM'], ['Placa-mae', 'Placas-mãe']];
    const MODES = [['percentual', '% do valor do PC'], ['classe', 'Valor por classe (Low / Mid / High)'], ['unico', 'Valor único']];
    const S = { tipo: 'GPU', q: '' }; let fx = D.faixas; const f2 = v => v == null ? '' : String(v).replace('.', ',');
    D.servicos.forEach(x => { x._k = Math.random(); });
    const svcRow = (x, i) => `<tr data-i="${i}"><td data-l="Serviço"><input class="in" data-f="nome" maxlength="80" value="${esc(x.nome)}" aria-label="Nome do serviço"></td>
      <td data-l="Como cobrar"><select class="in" data-f="modo" aria-label="Como cobrar">${MODES.map(([k, t]) => `<option value="${k}" ${x.modo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td data-l="Valores">${x.modo === 'unico' ? `<label class="vl">Valor (R$)<input class="in" data-f="precoUnico" inputmode="decimal" value="${f2(x.precoUnico)}"></label>`
        : x.modo === 'classe' ? `<div class="v3">${[['precoLow', 'Low end'], ['precoMid', 'Mid end'], ['precoHigh', 'High end']].map(([k, t]) => `<label class="vl">${t} (R$)<input class="in" data-f="${k}" inputmode="decimal" value="${f2(x[k])}"></label>`).join('')}</div>`
        : `<label class="vl">Parte do percentual (%)<input class="in" data-f="parte" inputmode="decimal" value="${f2(x.parte == null ? 100 : x.parte)}"></label>`}</td>
      <td data-l="Ativo"><label class="chk"><input type="checkbox" data-f="ativo" ${x.ativo !== false ? 'checked' : ''}> No site</label></td><td><button class="btn btn-sm" data-del="1" type="button">Remover</button></td></tr>`;
    function draw() {
      const rows = D.componentes.map((c, i) => [c, i]).filter(([c]) => c.tipo === S.tipo && (!S.q || nn(c.nome + ' ' + c.marca).indexOf(nn(S.q)) >= 0));
      $('#vbody').innerHTML = `<div class="note info">Deixe um valor vazio para aparecer <b>“a combinar”</b> no site. Nada é inventado: o que você não preencher não é cobrado.</div>
      <section class="panel"><h2>1. Percentual sobre o valor do PC</h2><p class="q-help" style="margin:0 0 12px">Somando o preço de mercado das peças que o cliente informar, o serviço cobrado por <b>% do valor do PC</b> segue estas faixas.</p>
        <div class="pf-cols" id="vfx"><label class="fld">Até (R$)<input class="in" data-x="limite1" inputmode="decimal" value="${f2(fx.limite1)}"></label><label class="fld">cobra (%)<input class="in" data-x="pct1" inputmode="decimal" value="${f2(fx.pct1)}"></label>
        <label class="fld">Até (R$)<input class="in" data-x="limite2" inputmode="decimal" value="${f2(fx.limite2)}"></label><label class="fld">cobra (%)<input class="in" data-x="pct2" inputmode="decimal" value="${f2(fx.pct2)}"></label>
        <label class="fld full">Acima disso cobra (%)<input class="in" data-x="pct3" inputmode="decimal" value="${f2(fx.pct3)}" style="max-width:200px"></label></div></section>
      <section class="panel"><h2>2. Serviços e valores</h2><div class="tw"><table class="tbl rs" id="vsv"><thead><tr><th>Serviço</th><th>Como cobrar</th><th>Valores</th><th>Ativo</th><th></th></tr></thead><tbody>${D.servicos.map(svcRow).join('') || '<tr><td colspan="5">Nenhum serviço. Adicione abaixo.</td></tr>'}</tbody></table></div>
        <p style="margin:12px 0 0"><button class="btn" id="vaddS" type="button">+ Adicionar serviço</button></p>
        <p class="q-help" style="margin-top:10px"><b>% do valor do PC:</b> valor = preço das peças × percentual da faixa × “parte do percentual” (100 = o percentual inteiro). <b>Por classe:</b> o PC é Low, Mid ou High pela <b>placa de vídeo</b> (ou pelo processador, se não tiver placa dedicada).</p></section>
      <section class="panel"><h2>3. Peças: classe e preço de mercado</h2>
        <div class="note info">Os preços iniciais são <b>aproximados</b> (mercado brasileiro) e servem de ponto de partida. Ajuste a classe (Low, Mid ou High) e o preço de cada peça como preferir. Regra sugerida para placas de vídeo: <b>Low</b> até GTX 1080, <b>Mid</b> até RTX 3060, <b>High</b> acima.</div>
        <div class="bar"><label class="fld"><span class="sr">Tipo</span><select class="in" id="vtp">${TYPES.map(([k, t]) => `<option value="${k}" ${k === S.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="fld grow" style="max-width:320px"><span class="sr">Buscar</span><input class="in" id="vq" placeholder="Buscar peça…" value="${esc(S.q)}"></label><span class="grow"></span><button class="btn" id="vaddC" type="button">+ Adicionar peça</button></div>
        <div class="tw"><table class="tbl rs" id="vcp"><thead><tr><th>Peça</th><th>Marca</th><th>Classe</th><th class="num">Preço (R$)</th><th>Ativo</th><th></th></tr></thead><tbody>
        ${rows.map(([c, i]) => `<tr data-i="${i}"><td data-l="Peça"><input class="in" data-f="nome" maxlength="100" value="${esc(c.nome)}" aria-label="Nome da peça"></td><td data-l="Marca"><input class="in" data-f="marca" maxlength="30" value="${esc(c.marca)}" style="min-width:90px" aria-label="Marca"></td>
        <td data-l="Classe"><select class="in" data-f="classe" aria-label="Classe">${['Low', 'Mid', 'High'].map(k => `<option ${c.classe === k ? 'selected' : ''}>${k}</option>`).join('')}</select></td>
        <td class="num" data-l="Preço"><input class="in" data-f="preco" inputmode="decimal" value="${f2(c.preco)}" style="max-width:120px;text-align:right" aria-label="Preço"></td>
        <td data-l="Ativo"><input type="checkbox" data-f="ativo" ${c.ativo !== false ? 'checked' : ''} aria-label="Ativo no site"></td><td><button class="btn btn-sm" data-del="1" type="button">Remover</button></td></tr>`).join('') || '<tr><td colspan="6">Nenhuma peça neste filtro.</td></tr>'}</tbody></table></div></section>
      <div class="savebar"><span id="verr" class="formerr" role="alert" style="text-align:left"></span><button class="btn btn-pri" id="vsave" type="button">Salvar valores</button></div>`;
      bind();
    }
    const num = v => { const t = String(v == null ? '' : v).trim(); return t === '' ? null : SZ.money(t); };
    function bind() {
      $('#vtp').onchange = ev => { S.tipo = ev.target.value; draw(); };
      $('#vq').oninput = ev => { S.q = ev.target.value; clearTimeout(bind.t); bind.t = setTimeout(() => { draw(); const q = $('#vq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
      $('#vfx').oninput = ev => { const k = ev.target.dataset.x; if (k) fx[k] = ev.target.value; };
      $('#vaddS').onclick = () => { D.servicos.push({ id: '', nome: 'Novo serviço', descricao: '', modo: 'unico', precoUnico: null, precoLow: null, precoMid: null, precoHigh: null, parte: 100, ativo: true }); draw(); const r = $$('#vsv tbody tr').pop(); if (r) { const i = $('input', r); i.focus(); i.select(); } };
      $('#vaddC').onclick = () => { D.componentes.unshift({ id: '', tipo: S.tipo, marca: S.tipo === 'GPU' ? 'NVIDIA' : S.tipo === 'CPU' ? 'AMD' : 'Outro', nome: '', classe: 'Mid', preco: null, ativo: true }); S.q = ''; draw(); const r = $('#vcp tbody tr input'); if (r) r.focus(); };
      const edit = (tbl, arr, rerender) => {
        tbl.addEventListener('input', ev => { const tr = ev.target.closest('tr[data-i]'), f = ev.target.dataset.f; if (!tr || !f || ev.target.type === 'checkbox') return; arr[+tr.dataset.i][f] = ev.target.value; });
        tbl.addEventListener('change', ev => { const tr = ev.target.closest('tr[data-i]'), f = ev.target.dataset.f; if (!tr || !f) return; const o = arr[+tr.dataset.i]; o[f] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value; if (rerender && f === 'modo') draw(); });
        tbl.addEventListener('click', ev => { const b = ev.target.closest('[data-del]'); if (!b) return; const i = +b.closest('tr').dataset.i, o = arr[i]; if (!confirm(`Remover “${o.nome || 'item'}”? A mudança só vale depois de salvar.`)) return; arr.splice(i, 1); draw(); });
      };
      edit($('#vsv'), D.servicos, true); edit($('#vcp'), D.componentes, false);
      $('#vsave').onclick = save;
    }
    async function save() {
      const err = $('#verr'); err.textContent = '';
      const money = (v, l) => { const n = num(v); if (n !== null && (isNaN(n) || n < 0)) throw new Error(l + ': valor inválido.'); return n; };
      let body;
      try {
        body = { faixas: { limite1: money(fx.limite1, 'Limite da 1ª faixa'), pct1: money(fx.pct1, '% da 1ª faixa'), limite2: money(fx.limite2, 'Limite da 2ª faixa'), pct2: money(fx.pct2, '% da 2ª faixa'), pct3: money(fx.pct3, '% acima') },
          servicos: D.servicos.map(x => ({ id: x.id, nome: String(x.nome || '').trim(), descricao: x.descricao || '', modo: x.modo, precoUnico: money(x.precoUnico, x.nome), precoLow: money(x.precoLow, x.nome), precoMid: money(x.precoMid, x.nome), precoHigh: money(x.precoHigh, x.nome), parte: money(x.parte, x.nome), ativo: x.ativo !== false })),
          componentes: D.componentes.map(c => { const pr = money(c.preco, c.nome || 'Peça'); if (pr === null) throw new Error(`Informe o preço de “${c.nome || 'peça sem nome'}”.`); return { id: c.id, tipo: c.tipo, marca: String(c.marca || '').trim(), nome: String(c.nome || '').trim(), classe: c.classe, preco: pr, ativo: c.ativo !== false }; }) };
      } catch (e) { err.textContent = e.message; return; }
      const b = $('#vsave'); b.disabled = true; b.textContent = 'Salvando…';
      try { D = await api('saveServicePricing', body); fx = D.faixas; SZ.toast('Valores salvos. O site já usa os novos valores.'); draw(); }
      catch (e) { err.textContent = e.message || 'Erro ao salvar.'; b.disabled = false; b.textContent = 'Salvar valores'; }
    }
    draw();
  }

  /* ------------------------------ feedbacks de clientes ------------------------------ */
  const fileB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => no(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f); });
  const driveFileId = u => { const m = /\/d\/([A-Za-z0-9_-]{10,80})/.exec(String(u || '')); return m ? m[1] : ''; };

  async function feedbacksView(el) {
    el.innerHTML = `<h1>Feedbacks de clientes</h1><p class="lead">Avaliações por item, prints de conversas e vídeos que aparecem na guia Feedbacks do site.</p>
      <div class="tabs" role="tablist"><button class="btn" data-t="rev" aria-pressed="true">Avaliações e prints</button><button class="btn" data-t="vid" aria-pressed="false">Vídeos</button></div><div id="fbody">${loadingHtml}</div>`;
    let D, tab = 'rev', F = { item: '', stars: '', st: '' };
    async function load() {
      try { D = await api('adminFeedbacks'); draw(); } catch (e) { $('#fbody').innerHTML = errHtml(e, 'fretry'); $('#fretry').onclick = () => { $('#fbody').innerHTML = loadingHtml; load(); }; }
    }
    $$('[data-t]', el).forEach(b => b.onclick = () => { tab = b.dataset.t; $$('[data-t]', el).forEach(x => x.setAttribute('aria-pressed', x === b)); if (D) draw(); });
    const flag = (on, t) => on ? `<span class="pill ok">${t}</span>` : '';
    function draw() { tab === 'rev' ? drawReviews() : drawVideos(); }

    /* ---- avaliações, agrupadas por item ---- */
    function drawReviews() {
      const all = D.avaliacoes, items = [...new Set(all.map(a => a.produto))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const list = all.filter(a => (!F.item || a.produto === F.item) && (!F.stars || String(a.estrelas) === F.stars) && (!F.st || (F.st === 'Publicado' ? a.status === 'Publicado' && a.autorizado : !(a.status === 'Publicado' && a.autorizado))));
      const groups = {}; list.forEach(a => { (groups[a.produto] = groups[a.produto] || []).push(a); });
      const n5 = all.filter(a => a.estrelas === 5 && a.status === 'Publicado' && a.autorizado && a.destaque).length;
      $('#fbody').innerHTML = `<div class="cards"><div class="stat"><small>Avaliações</small><b>${all.length}</b></div><div class="stat hl"><small>Em destaque (5★)</small><b>${n5}</b><em>aparecem no carrossel</em></div><div class="stat"><small>Prints publicados</small><b>${all.filter(a => a.imagem && a.noPortfolio && a.status === 'Publicado' && a.autorizado).length}</b></div></div>
        <div class="note info">Só vão para o site avaliações <b>publicadas</b> e com <b>autorização do cliente</b>. O destaque (carrossel) é só para <b>5 estrelas</b>. Avaliações menores nunca vão para o destaque e só aparecem no item ou no portfólio se você marcar.</div>
        <div class="bar"><label class="fld"><span class="sr">Item</span><select class="in" id="fi"><option value="">Todos os itens</option>${items.map(i => `<option ${i === F.item ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></label>
          <label class="fld"><span class="sr">Estrelas</span><select class="in" id="fs"><option value="">Todas as notas</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${String(n) === F.stars ? 'selected' : ''}>${n} estrela${n > 1 ? 's' : ''}</option>`).join('')}</select></label>
          <label class="fld"><span class="sr">Situação</span><select class="in" id="ft"><option value="">Todas</option><option ${F.st === 'Publicado' ? 'selected' : ''}>Publicado</option><option value="Fora" ${F.st === 'Fora' ? 'selected' : ''}>Fora do site</option></select></label>
          <span class="grow"></span><button class="btn btn-pri" id="fnew">+ Nova avaliação</button></div>
        ${Object.keys(groups).length ? Object.keys(groups).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(prod => { const g = groups[prod], avg = (g.reduce((x, a) => x + a.estrelas, 0) / g.length).toFixed(1).replace('.', ',');
          return `<section class="panel"><h2>${esc(prod)} <small style="color:var(--mute);font-weight:400">· ${g.length} avaliação${g.length > 1 ? 'ões' : ''} · média ${avg} (uso interno)</small></h2>
          <p class="q-help" style="margin:0 0 10px"><b>Quem já comprou:</b> ${esc(g.map(a => a.cliente).join(', '))}</p>
          <div class="tw"><table class="tbl rs"><thead><tr><th></th><th>Cliente</th><th>Nota</th><th>Comentário</th><th>Onde aparece</th><th></th></tr></thead><tbody>${g.map(a => `<tr data-id="${esc(a.id)}">
            <td>${a.imagem ? `<img class="thumb" src="${esc(SZ.thumb(a.imagem, 96))}" alt="Print" loading="lazy">` : ''}</td><td data-l="Cliente"><b>${esc(a.cliente)}</b>${a.dataCompra ? `<br><small style="color:var(--mute)">${esc(SZ.dt(a.dataCompra))}</small>` : ''}</td>
            <td data-l="Nota">${SZ.stars(a.estrelas)}</td><td data-l="Comentário" style="max-width:320px">${esc(a.comentario)}${a.observacoes ? `<br><small style="color:var(--mute)">Obs.: ${esc(a.observacoes)}</small>` : ''}</td>
            <td data-l="Onde aparece">${a.status !== 'Publicado' ? '<span class="pill mute">Oculto</span>' : !a.autorizado ? '<span class="pill warn">Sem autorização</span>' : flag(a.destaque, 'Destaque') + flag(a.noProduto, 'No item') + flag(a.noPortfolio, 'Portfólio') || '<span class="pill mute">Só interno</span>'}</td>
            <td><div class="acts"><button class="btn btn-sm" data-ed>Editar</button><button class="btn btn-sm" data-rm>Excluir</button></div></td></tr>`).join('')}</tbody></table></div></section>`; }).join('')
          : `<div class="empty">${all.length ? 'Nenhuma avaliação com esses filtros.' : 'Nenhuma avaliação cadastrada ainda. Clique em “Nova avaliação” e registre o primeiro feedback real.'}</div>`}`;
      $('#fi').onchange = e => { F.item = e.target.value; draw(); }; $('#fs').onchange = e => { F.stars = e.target.value; draw(); }; $('#ft').onchange = e => { F.st = e.target.value; draw(); };
      $('#fnew').onclick = () => reviewForm(null);
      $('#fbody').onclick = async ev => {
        const tr = ev.target.closest('tr[data-id]'); if (!tr) return; const a = D.avaliacoes.find(x => x.id === tr.dataset.id);
        if (ev.target.closest('[data-ed]')) reviewForm(a);
        if (ev.target.closest('[data-rm]')) { if (!confirm(`Excluir a avaliação de ${a.cliente}?`)) return; try { await api('deleteReview', { id: a.id }); const fid = driveFileId(a.imagem); if (fid) api('deleteMedia', { fileId: fid }).catch(() => {}); SZ.toast('Avaliação excluída.'); load(); } catch (e) { fail(e); } }
      };
    }

    async function reviewForm(a) {
      let prods = []; try { prods = await api('listAllProducts'); } catch (e) { try { prods = await SZ.products(true); } catch (e2) { prods = []; } }
      const isNew = !a; let img = a ? a.imagem : '', imgFresh = '', stars = a ? a.estrelas : 5, touched = !!a;
      const known = a && a.idAnuncio && prods.some(p => p.id === a.idAnuncio);
      const m = dlg({ title: isNew ? 'Nova avaliação' : 'Editar avaliação', cls: 'sm', body: `<div class="pf-cols">
        <label class="fld full">Item comprado *<select class="in" id="r_it"><option value="">Selecione…</option>${prods.map(p => `<option value="${esc(p.id)}" ${a && a.idAnuncio === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}<option value="_o" ${a && !known ? 'selected' : ''}>Outro item (digitar)</option></select></label>
        <label class="fld full" id="r_ot_r" ${a && !known ? '' : 'hidden'}>Nome do item<input class="in" id="r_ot" maxlength="140" value="${esc(a && !known ? a.produto : '')}"></label>
        <label class="fld full">Cliente *<input class="in" id="r_cl" maxlength="60" value="${esc(a ? a.cliente : '')}" placeholder="Ex.: Ana Paula Souza"><span class="help">No site aparece só o primeiro nome e a inicial (ex.: “Ana S.”).</span></label>
        <div class="fld full">Nota *<div class="rate" id="r_st" role="radiogroup" aria-label="Nota de 1 a 5">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="rb" data-n="${n}" role="radio" aria-label="${n} estrela${n > 1 ? 's' : ''}">★</button>`).join('')}</div></div>
        <label class="fld full">Comentário curto (aparece no site)<input class="in" id="r_co" maxlength="220" value="${esc(a ? a.comentario : '')}" placeholder="Ex.: Ótimo produto, atendimento excelente!"></label>
        <label class="fld full">Observações internas<textarea class="in" id="r_ob" maxlength="1000" placeholder="Não aparecem no site">${esc(a ? a.observacoes : '')}</textarea></label>
        <label class="fld">Data da compra<input class="in" type="date" id="r_dt" value="${esc(a ? a.dataCompra : '')}"></label>
        <label class="fld">Situação<select class="in" id="r_su"><option ${!a || a.status === 'Publicado' ? 'selected' : ''}>Publicado</option><option ${a && a.status === 'Oculto' ? 'selected' : ''}>Oculto</option></select></label>
        <div class="fld full">Print da conversa (opcional)<div id="r_img"></div><input type="file" id="r_file" accept="image/jpeg,image/png,image/webp" hidden>
          <div><button class="btn btn-sm" type="button" id="r_add" style="margin-top:6px">+ Enviar print</button> <span class="help" id="r_up"></span></div>
          <span class="help">Antes de enviar, cubra telefones e dados pessoais que apareçam na conversa.</span></div>
        <label class="chk full"><input type="checkbox" id="r_au" ${a && a.autorizado ? 'checked' : ''}> O cliente autorizou divulgar o nome e a conversa *</label>
        <div class="fld full">Onde mostrar<div class="chkg"><label class="chk"><input type="checkbox" id="r_de" ${a && a.destaque ? 'checked' : ''}> Destaque (carrossel, só 5★)</label><label class="chk"><input type="checkbox" id="r_np" ${a && a.noProduto ? 'checked' : ''}> No item</label><label class="chk"><input type="checkbox" id="r_po" ${a && a.noPortfolio ? 'checked' : ''}> Portfólio</label></div>
          <span class="help" id="r_h"></span></div>
        <div class="fld full formerr" id="r_err" role="alert" style="text-align:left"></div></div>`,
        footer: `<button class="btn" data-x2>Cancelar</button><button class="btn btn-pri" id="r_save">Salvar</button>` });
      const E = id => $('#' + id, m.el); $('[data-x2]', m.el).onclick = () => { if (imgFresh) api('deleteMedia', { fileId: driveFileId(imgFresh) }).catch(() => {}); m.close(); };
      const drawImg = () => { E('r_img').innerHTML = img ? `<div class="ph" style="max-width:120px"><img src="${esc(SZ.thumb(img, 240))}" alt="Print"><div class="tools"><button type="button" data-rmimg aria-label="Remover print">✕</button></div></div>` : ''; };
      const drawStars = () => { $$('.rb', m.el).forEach(b => { b.classList.toggle('on', +b.dataset.n <= stars); b.setAttribute('aria-checked', +b.dataset.n === stars); }); const five = stars === 5; E('r_de').disabled = !five; if (!five) E('r_de').checked = false;
        E('r_h').textContent = five ? 'Avaliações de 5 estrelas aparecem no destaque, no item e no portfólio por padrão.' : 'Abaixo de 5 estrelas: não vai para o destaque. Marque “No item” ou “Portfólio” só se quiser mostrar.'; };
      E('r_st').onclick = ev => { const b = ev.target.closest('.rb'); if (!b) return; stars = +b.dataset.n; if (!touched) { const five = stars === 5; E('r_de').checked = five; E('r_np').checked = five; E('r_po').checked = five; } drawStars(); };
      $$('#r_de,#r_np,#r_po', m.el).forEach(c => c.onchange = () => { touched = true; });
      if (isNew) { E('r_de').checked = E('r_np').checked = E('r_po').checked = true; } drawStars(); drawImg();
      E('r_it').onchange = () => { E('r_ot_r').hidden = E('r_it').value !== '_o'; };
      E('r_add').onclick = () => E('r_file').click();
      E('r_img').onclick = ev => { if (ev.target.closest('[data-rmimg]')) { if (imgFresh && img === imgFresh) { api('deleteMedia', { fileId: driveFileId(imgFresh) }).catch(() => {}); imgFresh = ''; } img = ''; drawImg(); } };
      E('r_file').onchange = async ev => {
        const f = ev.target.files[0]; ev.target.value = ''; if (!f) return; const up = E('r_up'); up.innerHTML = '<span class="spin"></span> Enviando…';
        try { if (!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error('Use JPG, PNG ou WEBP.'); const b64 = await resizeImage(f, 1600), r = await api('uploadMedia', { mimeType: 'image/jpeg', base64: b64 });
          if (imgFresh) api('deleteMedia', { fileId: driveFileId(imgFresh) }).catch(() => {}); img = imgFresh = r.url; drawImg(); } catch (e) { fail(e); }
        up.textContent = '';
      };
      E('r_save').onclick = async () => {
        const it = E('r_it').value, er = [];
        if (!it) er.push('Escolha o item comprado.'); if (it === '_o' && E('r_ot').value.trim().length < 2) er.push('Digite o nome do item.');
        if (E('r_cl').value.trim().length < 2) er.push('Informe o nome do cliente.');
        if (E('r_su').value === 'Publicado' && !E('r_au').checked) er.push('Para publicar, confirme a autorização do cliente. Sem ela, deixe como Oculto.');
        E('r_err').innerHTML = er.map(x => '• ' + esc(x)).join('<br>'); if (er.length) return;
        const b = E('r_save'); b.disabled = true; b.textContent = 'Salvando…';
        const body = { id: a ? a.id : undefined, idAnuncio: it === '_o' ? '' : it, produto: it === '_o' ? E('r_ot').value.trim() : '', cliente: E('r_cl').value.trim(), estrelas: stars, comentario: E('r_co').value, observacoes: E('r_ob').value, dataCompra: E('r_dt').value, imagem: img,
          autorizado: E('r_au').checked, status: E('r_su').value, destaque: E('r_de').checked, noProduto: E('r_np').checked, noPortfolio: E('r_po').checked };
        try { await api('saveReview', body); if (a && a.imagem && a.imagem !== img) { const fid = driveFileId(a.imagem); if (fid) api('deleteMedia', { fileId: fid }).catch(() => {}); } imgFresh = ''; SZ.toast(isNew ? 'Avaliação cadastrada.' : 'Avaliação atualizada.'); m.close(); load(); }
        catch (e) { E('r_err').textContent = e.message || 'Erro ao salvar.'; b.disabled = false; b.textContent = 'Salvar'; }
      };
    }

    /* ---- vídeos ---- */
    function drawVideos() {
      $('#fbody').innerHTML = `<div class="note info">Os vídeos passam em loop, sem som, na guia Feedbacks do site. <b>Envie arquivos curtos (MP4, até 25 MB)</b> ou <b>cole um link</b> do YouTube (use “não listado”), do Google Drive ou de um arquivo .mp4. Para vídeos longos ou pesados, prefira o link.</div>
        <section class="panel"><h2>Adicionar vídeo</h2><div class="pf-cols"><label class="fld">Título (opcional)<input class="in" id="v_t" maxlength="80" placeholder="Ex.: Montagem completa"></label>
          <label class="fld">Link do vídeo<input class="in" id="v_u" maxlength="400" placeholder="https://youtu.be/…"></label>
          <div class="full"><button class="btn btn-pri" id="v_link" type="button">Adicionar pelo link</button> <span class="help">ou</span> <button class="btn" id="v_up" type="button">Enviar arquivo de vídeo</button> <input type="file" id="v_file" accept="video/mp4,video/webm,video/quicktime" hidden> <span class="help" id="v_st"></span></div>
          <div class="full formerr" id="v_err" role="alert" style="text-align:left"></div></div></section>
        <section class="panel"><h2>Vídeos (${D.videos.length})</h2>${D.videos.length ? `<div class="tw"><table class="tbl rs"><thead><tr><th>Ordem</th><th>Título</th><th>Origem</th><th>Situação</th><th></th></tr></thead><tbody>${D.videos.map(v => `<tr data-id="${esc(v.id)}"><td data-l="Ordem"><input class="in" data-o type="number" min="1" value="${v.ordem}" style="max-width:80px" aria-label="Ordem"></td><td data-l="Título">${esc(v.titulo || '(sem título)')}</td><td data-l="Origem">${v.tipo === 'upload' ? 'Arquivo enviado' : `<a href="${esc(v.url)}" target="_blank" rel="noopener" style="color:var(--neon2)">Link</a>`}</td>
          <td data-l="Situação"><span class="pill ${v.status === 'Publicado' ? 'ok' : 'mute'}">${esc(v.status)}</span></td><td><div class="acts"><button class="btn btn-sm" data-tg>${v.status === 'Publicado' ? 'Ocultar' : 'Publicar'}</button><button class="btn btn-sm" data-rm>Excluir</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhum vídeo ainda.</div>'}</section>`;
      const err = m => { $('#v_err').textContent = m || ''; };
      $('#v_link').onclick = async () => { err(); try { await api('saveVideo', { tipo: 'link', titulo: $('#v_t').value, url: $('#v_u').value.trim() }); SZ.toast('Vídeo adicionado.'); load(); } catch (e) { err(e.message); } };
      $('#v_up').onclick = () => $('#v_file').click();
      $('#v_file').onchange = async ev => {
        const f = ev.target.files[0]; ev.target.value = ''; if (!f) return; err();
        if (!/^video\/(mp4|webm|quicktime)$/.test(f.type)) { err('Use MP4, WEBM ou MOV.'); return; }
        if (f.size > 25 * 1024 * 1024) { err('O vídeo tem mais de 25 MB. Comprima ou use um link do YouTube/Drive.'); return; }
        $('#v_st').innerHTML = '<span class="spin"></span> Enviando vídeo… isso pode levar alguns instantes.';
        try { const r = await api('uploadMedia', { mimeType: f.type, base64: await fileB64(f) }); await api('saveVideo', { tipo: 'upload', titulo: $('#v_t').value, arquivoId: r.fileId }); SZ.toast('Vídeo enviado.'); load(); }
        catch (e) { err((e.message || 'Falha no envio.') + ' Se o arquivo for pesado, use um link.'); }
        $('#v_st').textContent = '';
      };
      $('#fbody').onclick = async ev => {
        const tr = ev.target.closest('tr[data-id]'); if (!tr) return; const v = D.videos.find(x => x.id === tr.dataset.id);
        const save = patch => api('saveVideo', { id: v.id, tipo: v.tipo, titulo: v.titulo, url: v.url, arquivoId: v.arquivoId, ordem: v.ordem, status: v.status, ...patch });
        if (ev.target.closest('[data-tg]')) { try { await save({ status: v.status === 'Publicado' ? 'Oculto' : 'Publicado' }); load(); } catch (e) { fail(e); } }
        if (ev.target.closest('[data-rm]')) { if (!confirm('Excluir este vídeo?')) return; try { await api('deleteVideo', { id: v.id }); SZ.toast('Vídeo excluído.'); load(); } catch (e) { fail(e); } }
      };
      $('#fbody').onchange = async ev => { const o = ev.target.closest('[data-o]'); if (!o) return; const v = D.videos.find(x => x.id === o.closest('tr').dataset.id); try { await api('saveVideo', { id: v.id, tipo: v.tipo, titulo: v.titulo, url: v.url, arquivoId: v.arquivoId, status: v.status, ordem: o.value }); load(); } catch (e) { fail(e); } };
    }
    load();
  }

  /* ------------------------------ contatos (números de atendimento) ------------------------------ */
  async function contactsView(el) {
    el.innerHTML = `<h1>Contatos</h1><p class="lead">Defina para qual WhatsApp vai cada tipo de atendimento. Isso muda os botões e o rodapé do site.</p><div id="tbody">${loadingHtml}</div>`;
    let s; try { s = await SZ.call('getSettings'); } catch (e) { $('#tbody').innerHTML = errHtml(e, 'tretry'); $('#tretry').onclick = () => contactsView(el); return; }
    const F = [['TelefoneComercial', 'Atendimento geral *', 'Recebe tudo que não tiver número próprio abaixo e é o número do botão flutuante do site.'],
      ['TelefoneProdutos', 'Interesse em produtos (compras)', 'Botões “Tenho interesse” dos produtos. Vazio = usa o número geral.'],
      ['TelefoneServicos', 'Serviços e manutenção', 'Orçamento de serviços, calculadora e anúncios de serviços. Vazio = usa o número geral.']];
    const fmt = d => { d = String(d || '').replace(/\D/g, ''); return d.length === 13 ? `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}` : d ? '+' + d : ''; };
    $('#tbody').innerHTML = `<div class="note info">Use o formato <b>55 + DDD + número</b> (ex.: 5561994377971). Pode digitar com espaços, traços ou parênteses.</div>
      <form class="panel" id="tf" style="max-width:720px" novalidate><div class="pf-cols">
        ${F.map(([k, t, h]) => `<label class="fld full">${t}<input class="in" name="${k}" inputmode="tel" maxlength="30" value="${esc(fmt(s[k]))}" placeholder="${k === 'TelefoneComercial' ? '55 61 99999-9999' : 'Vazio = número geral'}"><span class="help">${h}</span></label>`).join('')}
        <label class="fld full">Canal de ofertas (Safezone Promo)<input class="in" name="CanalOfertas" maxlength="300" value="${esc(s.CanalOfertas)}" placeholder="https://whatsapp.com/channel/…"><span class="help">Link do canal do WhatsApp. Aparece na página inicial e no rodapé. Vazio = esconde.</span></label>
        <div class="full"><div class="formerr" id="terr" role="alert" style="text-align:left"></div><button class="btn btn-pri" type="submit">Salvar contatos</button></div></div></form>
      <section class="panel" style="max-width:720px"><h2>Como fica no site</h2><ul class="q-lines" id="tsum"></ul></section>`;
    const f = $('#tf'), val = k => f.elements[k].value.replace(/\D/g, '');
    const sum = () => { const g = val('TelefoneComercial'), p = val('TelefoneProdutos') || g, v = val('TelefoneServicos') || g, N = x => x ? esc(fmt(x)) : '<em>(defina o geral)</em>';
      $('#tsum').innerHTML = `<li><span>Botão flutuante e atendimento geral</span><b>${N(g)}</b></li><li><span>Interesse em produtos</span><b>${N(p)}</b></li><li><span>Serviços, orçamento e manutenção</span><b>${N(v)}</b></li>`; };
    f.addEventListener('input', sum); sum();
    f.onsubmit = async ev => {
      ev.preventDefault(); const er = $('#terr'); er.textContent = '';
      const bad = (k, req) => { const d = val(k); return (req || d) && !(d.length >= 12 && d.length <= 13 && d.indexOf('55') === 0); };
      if (bad('TelefoneComercial', true)) { er.textContent = 'Informe o atendimento geral no formato 55 + DDD + número.'; return; }
      if (bad('TelefoneProdutos')) { er.textContent = 'Número de produtos inválido. Use 55 + DDD + número ou deixe vazio.'; return; }
      if (bad('TelefoneServicos')) { er.textContent = 'Número de serviços inválido. Use 55 + DDD + número ou deixe vazio.'; return; }
      const canal = f.elements.CanalOfertas.value.trim();
      if (canal && !/^https:\/\/(www\.)?(whatsapp\.com|chat\.whatsapp\.com|wa\.me)\/\S+$/.test(canal)) { er.textContent = 'O link do canal deve começar com https://whatsapp.com/channel/…'; return; }
      const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Salvando…';
      try {
        await api('saveSettings', { valores: { TelefoneComercial: val('TelefoneComercial'), TelefoneProdutos: val('TelefoneProdutos'), TelefoneServicos: val('TelefoneServicos'), CanalOfertas: canal } });
        try { localStorage.removeItem('sz2_settings'); sessionStorage.removeItem('sz_settings'); } catch (e) { /* ok */ }
        SZ.toast('Contatos salvos. O site já usa os novos números.');
      } catch (e) { er.textContent = e.message || 'Erro ao salvar.'; }
      b.disabled = false; b.textContent = 'Salvar contatos';
    };
  }

  /* ------------------------------ configurações ------------------------------ */
  async function settingsView(el) {
    el.innerHTML = `<h1>Configurações</h1><p class="lead">Informações comerciais exibidas no site.</p><div id="cbody">${loadingHtml}</div>`;
    try {
      const s = await SZ.call('getSettings');
      const F = [['NomeLoja', 'Nome da loja', 'in'], ['Instagram', 'Instagram (@usuario)', 'in'], ['AvisoNFe', 'Aviso fiscal exibido no rodapé', 'in'],
        ['Subcategorias', 'Subcategorias por categoria (uma linha por categoria, no formato Categoria: item1, item2)', 'ta'], ['InformacoesComerciais', 'Informações comerciais', 'ta'], ['FormasPagamento', 'Formas de pagamento aceitas', 'ta'], ['PoliticaTroca', 'Política de troca e garantia', 'ta']];
      $('#cbody').innerHTML = `<div class="note info">Só publique aqui o que a Safezone realmente oferece. Campos vazios não aparecem no site.</div><form class="panel" id="cf" style="max-width:720px"><div class="pf-cols">
        ${F.map(([k, t, ty]) => `<label class="fld full">${t}${ty === 'ta' ? `<textarea class="in" name="${k}" maxlength="2000">${esc(s[k])}</textarea>` : `<input class="in" name="${k}" maxlength="200" value="${esc(s[k])}">`}</label>`).join('')}
        <div class="full"><button class="btn btn-pri" type="submit">Salvar configurações</button></div></div></form>
        <form class="panel" id="rf" style="max-width:720px;margin-top:16px"><h2>Margem de lucro e ofertas</h2><p class="help">Valores privados: não aparecem no site. Margem calculada sobre o custo (custo R$ 1.000 com margem de 20% = venda por R$ 1.200).</p><div class="pf-cols">
          <label class="fld">Margem de lucro alvo (%)<input class="in" name="margem" inputmode="decimal"><span class="help">Sugere o preço de venda a partir do custo.</span></label>
          <label class="fld">Desconto máximo em ofertas (%)<input class="in" name="descMax" inputmode="decimal"><span class="help">Nenhuma oferta passa disso, mesmo se você pedir mais.</span></label>
          <label class="fld">Margem mínima sobre o custo (%)<input class="in" name="margemMin" inputmode="decimal"><span class="help">0 = nunca abaixo do custo. Ex.: 5 = nunca abaixo de custo + 5%.</span></label>
          <div class="full"><button class="btn btn-pri" type="submit">Salvar regras</button></div></div></form>`;
      api('getPricingRules').then(r => { const f = $('#rf'); ['margem', 'descMax', 'margemMin'].forEach(k => { f.elements[k].value = String(r[k]).replace('.', ','); }); }).catch(() => {});
      $('#rf').onsubmit = async ev => { ev.preventDefault(); const f = ev.target;
        try { A.rules = await api('savePricingRules', { margem: f.elements.margem.value, descMax: f.elements.descMax.value, margemMin: f.elements.margemMin.value }); SZ.sessionBust(); SZ.toast('Regras salvas.'); } catch (e) { fail(e); } };
      $('#cf').onsubmit = async ev => { ev.preventDefault(); const v = {}; new FormData(ev.target).forEach((val, k) => { v[k] = val; });
        try { await api('saveSettings', { valores: v }); rulesP = null; try { sessionStorage.removeItem('sz_settings'); localStorage.removeItem('sz2_settings'); } catch (e) { /* ok */ } SZ.toast('Configurações salvas.'); } catch (e) { fail(e); } };
    } catch (e) { $('#cbody').innerHTML = errHtml(e, 'cretry'); $('#cretry').onclick = () => settingsView(el); }
  }

  restore();
})();
