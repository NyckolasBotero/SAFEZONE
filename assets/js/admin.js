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
  const TABS = [['vendas', 'Vendas', 'box', () => can('vendas')], ['adm', 'Adm', 'shield', () => A.user.isAdmin], ['produtos', 'Produtos', 'cpu', () => can('produtos')], ['config', 'Configurações', 'wrench', () => can('configuracoes')]];
  const SUBS = [['indicadores', 'Indicadores'], ['logins', 'Logins'], ['postagem', 'Postagem de vendas'], ['layouts', 'Criação de layouts']];
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
    ({ vendas: salesView, adm: admView, produtos: productsView, config: settingsView }[A.view])(el);
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
  const loadingHtml = '<p><span class="spin"></span> Carregando…</p>';
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
  const PF = { photos: [], id: null, rid: '' };
  function productsView(el) {
    el.innerHTML = `<h1>${A.view === 'adm' ? 'Postagem de vendas' : 'Produtos'}</h1><p class="lead">Cadastre, edite, publique e despublique anúncios.</p>
      <div class="bar"><label class="fld"><span class="sr">Buscar</span><input class="in" id="pq" placeholder="Buscar por nome, código ou categoria"></label>
        <label class="fld"><span class="sr">Situação</span><select class="in" id="pst"><option value="">Todas as situações</option><option>Publicado</option><option>Rascunho</option><option>Despublicado</option></select></label>
        <span class="grow"></span><button class="btn btn-pri" id="pnew">+ Novo anúncio</button></div><div id="pbody">${loadingHtml}</div>`;
    let list = [];
    const draw = () => {
      const q = nn($('#pq').value), st = $('#pst').value, b = $('#pbody');
      const r = list.filter(p => (!st || p.status === st) && (!q || nn([p.nome, p.id, p.categoria, p.marca, p.modelo].join(' ')).indexOf(q) >= 0));
      b.innerHTML = r.length ? `<div class="tw"><table class="tbl rs"><thead><tr><th></th><th>Anúncio</th><th>Categoria</th><th class="num">Preço</th><th class="num">Estoque</th><th>Situação</th><th></th></tr></thead><tbody>
        ${r.map(p => `<tr data-id="${esc(p.id)}"><td>${p.fotoPrincipal ? `<img class="thumb" src="${esc(SZ.thumb(p.fotoPrincipal, 96))}" alt="" loading="lazy">` : `<span class="thumb" style="display:grid;place-items:center;color:var(--mute)">${SZ.icon(SZ.catIcon(p.categoria), 20)}</span>`}</td>
        <td data-l="Anúncio"><b>${esc(p.nome)}</b><br><small style="color:var(--mute)">${esc(p.id)} ${p.condicao ? '· ' + esc(p.condicao) : ''}</small></td><td data-l="Categoria">${esc(p.categoria)}</td>
        <td class="num" data-l="Preço">${SZ.brl(p.precoAtual)}${p.selo ? `<br><small style="color:var(--neon2)">${esc(p.selo.texto)}</small>` : ''}</td><td class="num" data-l="Estoque">${p.estoque}</td>
        <td data-l="Situação"><span class="pill ${p.status === 'Publicado' ? 'ok' : p.status === 'Rascunho' ? 'mute' : 'warn'}">${esc(p.status)}</span></td>
        <td><div class="acts"><button class="btn btn-sm" data-ed>Editar</button><button class="btn btn-sm" data-tg>${p.status === 'Publicado' ? 'Despublicar' : 'Publicar'}</button></div></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${list.length ? 'Nenhum anúncio com esses filtros.' : 'Nenhum anúncio cadastrado ainda. Clique em “Novo anúncio” para começar.'}</div>`;
    };
    async function load() {
      $('#pbody').innerHTML = loadingHtml;
      try { list = await api('listAllProducts'); draw(); } catch (e) { $('#pbody').innerHTML = errHtml(e, 'pretry'); $('#pretry').onclick = load; }
    }
    $('#pq').oninput = draw; $('#pst').onchange = draw; $('#pnew').onclick = () => productForm(null, load);
    $('#pbody').onclick = async ev => {
      const tr = ev.target.closest('tr[data-id]'); if (!tr) return; const p = list.find(x => x.id === tr.dataset.id);
      if (ev.target.closest('[data-ed]')) productForm(p, load);
      if (ev.target.closest('[data-tg]')) { const to = p.status === 'Publicado' ? 'Despublicado' : 'Publicado';
        try { await api('setProductStatus', { id: p.id, status: to }); SZ.sessionBust(); SZ.toast(to === 'Publicado' ? 'Anúncio publicado.' : 'Anúncio despublicado.'); load(); } catch (e) { fail(e); } }
    };
    load();
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

  function productForm(p, done) {
    const isNew = !p; PF.id = p ? p.id : null; PF.rid = 'r' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    PF.photos = p ? p.fotos.map(u => ({ url: u })) : [];
    const PRESET = ['OFERTA', 'SUPER OFERTA', 'OPORTUNIDADE', 'DESTAQUE'];
    const seloSel = !p ? 'auto' : p.seloModo === 'none' ? 'none' : p.seloModo === 'manual' ? (PRESET.indexOf(p.seloManual) >= 0 ? p.seloManual : 'custom') : 'auto';
    const dp = p && p.dataPublicacao ? String(p.dataPublicacao).replace(' ', 'T').slice(0, 16) : '';
    const v = p || {};
    const m = dlg({ title: isNew ? 'Novo anúncio' : 'Editar anúncio', body: `<div class="pf"><div><div class="pf-cols">
      <label class="fld full">Nome do produto *<input class="in" id="f_nome" maxlength="140" value="${esc(v.nome)}"></label>
      <label class="fld">Código / ID<input class="in" id="f_id" value="${esc(p ? p.id : 'Gerado automaticamente')}" readonly></label>
      <label class="fld">Categoria *<select class="in" id="f_cat"><option value="">Selecione…</option>${SZ.CATEGORIES.map(c => `<option ${c === v.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
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
      <div class="fld full">Fotos (a primeira é a principal)<div class="photos" id="f_ph"></div>
        <input type="file" id="f_file" accept="image/jpeg,image/png,image/webp" multiple hidden><div><button class="btn btn-sm" type="button" id="f_add" style="margin-top:8px">+ Adicionar fotos</button> <span id="f_up" class="help"></span></div></div>
      <div class="fld full formerr" id="f_err" role="alert" style="text-align:left"></div></div></div>
      <div class="prev"><h3>Prévia no catálogo</h3><div id="f_prev"></div></div></div>`,
      footer: `${isNew ? '' : '<button class="btn btn-danger" id="f_del" style="margin-right:auto">Excluir anúncio</button>'}<button class="btn" data-x2>Cancelar</button><button class="btn btn-pri" id="f_save">Salvar anúncio</button>` });
    const E = id => $('#' + id, m.el); E('f_selo').value = seloSel; $('[data-x2]', m.el).onclick = m.close;

    const selo = () => { const s = E('f_selo').value; return s === 'auto' ? { modo: 'auto' } : s === 'none' ? { modo: 'none' } : s === 'custom' ? { modo: 'manual', texto: E('f_sc').value.trim() } : { modo: 'manual', texto: s }; };
    function preview() {
      E('f_sc_r').hidden = E('f_selo').value !== 'custom';
      const cat = E('f_cat').value, svc = cat === SZ.SERVICE_CAT, n = SZ.money(E('f_pn').value), pr = SZ.money(E('f_pp').value), s = selo();
      const ok = !isNaN(n) && !isNaN(pr), pc = SZ.pricing(ok ? n || 0 : 0, ok ? pr : null, s.modo, s.texto), est = Number(E('f_est').value) || 0;
      E('f_pph').textContent = !ok ? '' : pr != null && pr > (n || 0) ? 'Atenção: o promocional não pode ser maior que o preço de venda.' : pr != null && pr === n ? 'Preços iguais: aparece só o selo, sem desconto.' : pc.desconto ? `Desconto de ${pc.desconto}% calculado automaticamente.` : '';
      E('f_prev').innerHTML = SZ.cardHtml({ id: PF.id || 'NOVO', nome: E('f_nome').value || 'Nome do produto', categoria: cat || 'Categoria', marca: E('f_marca').value, modelo: E('f_modelo').value, descricaoCurta: E('f_dc').value, condicao: E('f_cond').value, precoAtual: pc.precoAtual, precoAnterior: pc.precoAnterior, desconto: pc.desconto,
        selo: pc.selo ? { texto: pc.selo, cor: E('f_scor').value === '#39ff14' ? '' : E('f_scor').value, estilo: E('f_sest').value } : null, estoque: est, disponivel: svc || est > 0, fotoPrincipal: PF.photos[0] ? PF.photos[0].url : '' });
    }
    function drawPhotos() {
      E('f_ph').innerHTML = PF.photos.map((f, i) => `<div class="ph ${i === 0 ? 'main' : ''}" data-i="${i}"><img src="${esc(SZ.thumb(f.url, 200))}" alt="Foto ${i + 1}">${i === 0 ? '<span class="tag">PRINCIPAL</span>' : ''}<div class="tools"><button type="button" data-a="star" title="Tornar principal" aria-label="Tornar principal">★</button><button type="button" data-a="l" aria-label="Mover para a esquerda">◀</button><button type="button" data-a="r" aria-label="Mover para a direita">▶</button><button type="button" data-a="x" aria-label="Remover">✕</button></div></div>`).join('') || '<span class="help">Nenhuma foto. Adicione pelo menos uma para publicar.</span>';
      preview();
    }
    E('f_ph').onclick = async ev => {
      const b = ev.target.closest('[data-a]'); if (!b) return; const i = +b.closest('.ph').dataset.i, a = b.dataset.a, L = PF.photos;
      if (a === 'star' && i > 0) L.unshift(L.splice(i, 1)[0]);
      if (a === 'l' && i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]];
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
          PF.photos.push({ url: r.url, fresh: true, fileId: r.fileId }); drawPhotos();
        } catch (e) { fail(e); }
      }
      up.textContent = '';
    };
    m.el.addEventListener('input', preview); m.el.addEventListener('change', preview); drawPhotos();

    function validate(d) {
      const er = [], svc = d.categoria === SZ.SERVICE_CAT;
      if (d.nome.length < 2) er.push('Informe o nome do produto.'); if (!d.categoria) er.push('Escolha a categoria.');
      if (!svc && !d.condicao) er.push('Escolha a condição: Novo ou Seminovo.');
      const n = SZ.money(d.precoNormal), p = SZ.money(d.precoPromocional);
      if (isNaN(n) || (!svc && !(n > 0))) er.push('Informe um preço de venda válido (ex.: 1.299,90).');
      if (isNaN(p) || (p != null && p <= 0)) er.push('Preço promocional inválido.'); else if (p != null && n != null && !isNaN(n) && p > n) er.push('O preço promocional não pode ser maior que o preço de venda.');
      if (!svc && (d.estoque === '' || !(Number(d.estoque) >= 0) || Math.floor(Number(d.estoque)) !== Number(d.estoque))) er.push('Informe o estoque (número inteiro, 0 ou mais).');
      if (d.seloModo === 'manual' && !d.seloManual) er.push('Digite o texto do selo personalizado.');
      if (d.status === 'Publicado' && !PF.photos.length) er.push('Adicione ao menos uma foto para publicar.');
      return er;
    }
    E('f_save').onclick = async () => {
      const s = selo(), dpv = E('f_dp').value;
      const d = { requestId: PF.rid, id: PF.id || undefined, nome: E('f_nome').value.trim(), categoria: E('f_cat').value, marca: E('f_marca').value, modelo: E('f_modelo').value, descricaoCurta: E('f_dc').value, descricaoCompleta: E('f_dl').value, especificacoes: E('f_esp').value,
        condicao: E('f_cond').value, conservacao: E('f_cons').value, precoNormal: E('f_pn').value, precoPromocional: E('f_pp').value, estoque: E('f_est').value, status: E('f_st').value, seloModo: s.modo, seloManual: s.texto || '',
        seloCor: E('f_scor').value === '#39ff14' ? '' : E('f_scor').value, seloEstilo: E('f_sest').value, destaque: E('f_dest').checked, dataPublicacao: dpv ? dpv.replace('T', ' ') : '', observacoes: E('f_obs').value,
        fotoPrincipal: PF.photos[0] ? PF.photos[0].url : '', fotosAdicionais: PF.photos.slice(1).map(f => f.url) };
      const er = validate(d), box = E('f_err'); box.innerHTML = er.map(x => '• ' + esc(x)).join('<br>');
      if (er.length) { box.scrollIntoView({ block: 'nearest' }); return; }
      const b = E('f_save'); b.disabled = true; b.textContent = 'Salvando…';
      try { const r = await api('saveProduct', d); SZ.sessionBust(); SZ.toast(isNew ? `Anúncio criado (${r.id}).` : 'Anúncio atualizado.'); m.close(); done(); }
      catch (e) { box.textContent = e.message; b.disabled = false; b.textContent = 'Salvar anúncio'; }
    };
    if (!isNew) E('f_del').onclick = async () => {
      if (!confirm(`Excluir o anúncio “${p.nome}”?\n\nEle sai do site e do painel. Vendas e layouts antigos continuam registrados.`)) return;
      try { await api('deleteProduct', { id: p.id }); SZ.sessionBust(); SZ.toast('Anúncio excluído.'); m.close(); done(); } catch (e) { fail(e); }
    };
  }

  /* ---------------------------------- adm ---------------------------------- */
  function admView(el) { ({ indicadores: indicatorsView, logins: usersView, postagem: productsView, layouts: layoutsView }[A.sub])(el); }

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
        <div class="panel"><h2>Atividade recente no painel</h2><div class="feed">${d.atividadeRecente.map(a => `<div><b>${esc(a.operacao)}</b> · ${esc(a.usuario)} · ${SZ.dt(a.dataHora)}${a.registro ? ' · ' + esc(a.registro) : ''} <span class="pill ${a.resultado === 'OK' ? 'ok' : 'bad'}">${esc(a.resultado)}</span></div>`).join('') || 'Nenhuma atividade registrada.'}</div></div>`;
      } catch (e) { b.innerHTML = errHtml(e, 'iretry'); $('#iretry').onclick = load; }
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

  /* ------------------------------ configurações ------------------------------ */
  async function settingsView(el) {
    el.innerHTML = `<h1>Configurações</h1><p class="lead">Informações comerciais exibidas no site.</p><div id="cbody">${loadingHtml}</div>`;
    try {
      const s = await SZ.call('getSettings');
      const F = [['NomeLoja', 'Nome da loja', 'in'], ['TelefoneComercial', 'WhatsApp comercial (com DDI e DDD, só números)', 'in'], ['Instagram', 'Instagram (@usuario)', 'in'], ['AvisoNFe', 'Aviso fiscal exibido no rodapé', 'in'],
        ['InformacoesComerciais', 'Informações comerciais', 'ta'], ['FormasPagamento', 'Formas de pagamento aceitas', 'ta'], ['PoliticaTroca', 'Política de troca e garantia', 'ta']];
      $('#cbody').innerHTML = `<div class="note info">Só publique aqui o que a Safezone realmente oferece. Campos vazios não aparecem no site.</div><form class="panel" id="cf" style="max-width:720px"><div class="pf-cols">
        ${F.map(([k, t, ty]) => `<label class="fld full">${t}${ty === 'ta' ? `<textarea class="in" name="${k}" maxlength="2000">${esc(s[k])}</textarea>` : `<input class="in" name="${k}" maxlength="200" value="${esc(s[k])}">`}</label>`).join('')}
        <div class="full"><button class="btn btn-pri" type="submit">Salvar configurações</button></div></div></form>`;
      $('#cf').onsubmit = async ev => { ev.preventDefault(); const v = {}; new FormData(ev.target).forEach((val, k) => { v[k] = val; });
        try { await api('saveSettings', { valores: v }); try { sessionStorage.removeItem('sz_settings'); } catch (e) { /* ok */ } SZ.toast('Configurações salvas.'); } catch (e) { fail(e); } };
    } catch (e) { $('#cbody').innerHTML = errHtml(e, 'cretry'); $('#cretry').onclick = () => settingsView(el); }
  }

  restore();
})();
