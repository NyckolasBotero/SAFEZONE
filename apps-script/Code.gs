/**
 * SAFEZONE — Backend em Google Apps Script
 * ------------------------------------------------------------------
 * Cole este arquivo inteiro em Code.gs no projeto "Safezone".
 * Passos: 1) rode setup()  2) (opcional) rode migrarSenhas()
 *         3) Implantar > Nova implantação > App da Web
 *            Executar como: Eu | Quem tem acesso: Qualquer pessoa
 *
 * Segurança:
 *  - MODO ATUAL (GitHub Pages, sem servidor): o site chama o Apps Script direto e a
 *    API_KEY NÃO é exigida. As ações de admin continuam protegidas por login + sessão
 *    + permissão conferida aqui no backend.
 *  - MODO CLOUDFLARE (depois): rode exigirChave() — toda requisição passa a exigir a
 *    API_KEY, que fica só no servidor do site (variável de ambiente).
 *  - Login valida usuário/senha AQUI (senha com hash + salt), cria sessão com
 *    expiração e bloqueia após tentativas excessivas.
 *  - Cada ação administrativa confere a permissão ("Aba Adm" etc.) no backend.
 *  - Nenhuma senha é devolvida pela API.
 */

const CFG = {
  SHEET_ID: '1llph-o-RVP_YYDRB0B1HGLbFHnkXmfPJmdkXr02o8ws',
  TZ: 'America/Sao_Paulo',
  SESSION_TTL: 21600,        // 6 h (máximo do CacheService)
  MAX_FAILS: 5,              // tentativas de login antes do bloqueio
  LOCK_SECONDS: 900,         // 15 min de bloqueio
  HASH_ROUNDS: 1500,
  FOLDER_NAME: 'Safezone_Imagens',
  MAX_IMAGE_BYTES: 5 * 1024 * 1024
};

const MIGRATED = '(protegida)';
const SERVICE_CAT = 'Serviços de informática';
const CATEGORIES = [
  'Placas de vídeo', 'Memórias RAM', 'Processadores', 'Placas-mãe', 'SSDs e HDs',
  'Fontes de alimentação', 'Gabinetes', 'Coolers e refrigeração', 'Periféricos',
  'Kits e componentes diversos', SERVICE_CAT
];
const PRODUCT_STATUS = ['Rascunho', 'Publicado', 'Despublicado', 'Excluído'];
const SALE_STATUS = ['Interesse recebido', 'Em negociação', 'Venda concluída', 'Cancelada'];
const ACCESS_VALUES = ['Aba Adm', 'Vendas', 'Produtos', 'Configurações'];
const BADGE_STYLES = ['solido', 'contorno', 'vidro'];

const SHEETS = {
  Permissionamento: ['Login', 'Senha', 'Acesso', 'Nome', 'Status', 'SenhaHash', 'Salt', 'CriadoEm', 'UltimoAcesso'],
  Anuncios: ['ID', 'Nome', 'Categoria', 'Marca', 'Modelo', 'DescricaoCurta', 'DescricaoCompleta',
    'Especificacoes', 'Condicao', 'Conservacao', 'PrecoNormal', 'PrecoPromocional', 'Estoque', 'Status',
    'FotoPrincipal', 'FotosAdicionais', 'SeloModo', 'SeloManual', 'SeloPromocional', 'SeloCor', 'SeloEstilo',
    'PercentualDesconto', 'Destaque', 'DataPublicacao', 'ObservacoesInternas', 'DataCriacao', 'DataAtualizacao', 'CriadoPor',
    'LayoutArte', 'FotoArte'],
  Vendas: ['IDVenda', 'Data', 'IDAnuncio', 'NomeProduto', 'Quantidade', 'ValorUnitario', 'ValorTotal',
    'Status', 'Origem', 'Observacoes', 'DataAtualizacao'],
  Layouts: ['IDLayout', 'Nome', 'Formato', 'Configuracao', 'DataCriacao', 'DataAtualizacao', 'CriadoPor'],
  Configuracoes: ['Chave', 'Valor'],
  Auditoria: ['IDEvento', 'Usuario', 'Operacao', 'DataHora', 'Registro', 'Resultado']
};

const DEFAULT_SETTINGS = {
  NomeLoja: 'Safezone',
  TelefoneComercial: '5561994377971',
  Instagram: '@safe_zone.store',
  AvisoNFe: 'A Safezone não emite Nota Fiscal Eletrônica (NF-e).',
  InformacoesComerciais: '',
  PoliticaTroca: '',
  FormasPagamento: '',
  CorPrimaria: '#39FF14',
  _versao: '1'
};

/* ========================= ENTRADAS HTTP ========================= */

function doGet() {
  return json_({ ok: true, data: { servico: 'Safezone API', status: 'online' } });
}

function doPost(e) {
  let out, user = null, route = null, action = '';
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 9 * 1024 * 1024) throw new ApiError('BAD_REQUEST', 'Requisição inválida.');
    const req = JSON.parse(raw);
    if (PropertiesService.getScriptProperties().getProperty('REQUIRE_KEY') === '1') checkKey_(req.apiKey);
    action = String(req.action || '');
    route = ROUTES[action];
    if (!route) throw new ApiError('NOT_FOUND', 'Ação desconhecida.');
    if (route.auth) {
      user = auth_(req.token);
      if (route.auth !== 'any' && !allowed_(user, route.auth)) {
        audit_(user.login, 'ACESSO_NEGADO:' + action, '', 'NEGADO');
        throw new ApiError('FORBIDDEN', 'Você não tem permissão para esta operação.');
      }
    }
    out = { ok: true, data: route.fn(req.data || {}, user) };
  } catch (err) {
    if (!(err instanceof ApiError)) {
      console.error(err && err.stack || err);
      if (user && route && route.write) audit_(user.login, action, '', 'ERRO');
    }
    out = errOut_(err);
  }
  return json_(out);
}

class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function errOut_(err) {
  if (err instanceof ApiError) return { ok: false, error: { code: err.code, message: err.message } };
  return { ok: false, error: { code: 'INTERNAL', message: 'Erro interno. Tente novamente em instantes.' } };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  const real = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!real || !safeEq_(String(key || ''), real)) throw new ApiError('UNAUTHORIZED', 'Acesso não autorizado.');
}

/* ============================== ROTAS ============================== */

const ROUTES = {
  // públicas (ainda exigem API_KEY — chamadas pelo servidor do site)
  ping:            { auth: null,       fn: () => ({ hora: now_() }) },
  listProducts:    { auth: null,       fn: listPublicProducts_ },
  getProduct:      { auth: null,       fn: getPublicProduct_ },
  getSettings:     { auth: null,       fn: getSettings_ },
  registerInterest:{ auth: null,       fn: registerInterest_, write: true },
  // sessão
  login:           { auth: null,       fn: login_ },
  logout:          { auth: 'any',      fn: logout_ },
  me:              { auth: 'any',      fn: (d, u) => publicUser_(u) },
  // produtos
  listAllProducts: { auth: 'produtos', fn: listAdminProducts_ },
  saveProduct:     { auth: 'produtos', fn: saveProduct_, write: true },
  setProductStatus:{ auth: 'produtos', fn: setProductStatus_, write: true },
  deleteProduct:   { auth: 'produtos', fn: deleteProduct_, write: true },
  uploadImage:     { auth: 'produtos', fn: uploadImage_, write: true },
  deleteImage:     { auth: 'produtos', fn: deleteImage_, write: true },
  // vendas
  listSales:       { auth: 'vendas',   fn: listSales_ },
  createSale:      { auth: 'vendas',   fn: createSale_, write: true },
  updateSale:      { auth: 'vendas',   fn: updateSale_, write: true },
  // configurações
  saveSettings:    { auth: 'config',   fn: saveSettings_, write: true },
  // aba Adm
  dashboard:       { auth: 'adm',      fn: dashboard_ },
  listUsers:       { auth: 'adm',      fn: listUsers_ },
  saveUser:        { auth: 'adm',      fn: saveUser_, write: true },
  revokeSessions:  { auth: 'adm',      fn: revokeSessions_, write: true },
  listAudit:       { auth: 'adm',      fn: listAudit_ },
  listLayouts:     { auth: 'layouts',      fn: listLayouts_ },
  saveLayout:      { auth: 'adm',      fn: saveLayout_, write: true },
  deleteLayout:    { auth: 'adm',      fn: deleteLayout_, write: true }
};

/* ============================ SETUP ============================ */

/** Rode UMA vez no editor. Cria/ajusta guias sem apagar dados existentes. */
function setup() {
  const ss = ss_();
  // Se a guia de permissões existir com outro nome (ex.: "Página1"), renomeia.
  if (!ss.getSheetByName('Permissionamento')) {
    ss.getSheets().forEach(function (sh) {
      if (sh.getLastColumn() >= 3) {
        const h = sh.getRange(1, 1, 1, 3).getValues()[0].map(String);
        if (h[0] === 'Login' && h[1] === 'Senha' && h[2] === 'Acesso') sh.setName('Permissionamento');
      }
    });
  }
  Object.keys(SHEETS).forEach(function (name) { ensureSheet_(ss, name, SHEETS[name]); });

  // status/datas padrão para usuários já existentes
  const t = table_('Permissionamento');
  t.rows.forEach(function (r) {
    const patch = {};
    if (!r.Status) patch.Status = 'Ativo';
    if (!r.CriadoEm) patch.CriadoEm = now_();
    if (Object.keys(patch).length) writeRow_(t, r._row, patch);
  });

  // configurações padrão (só cria as que faltam)
  const c = table_('Configuracoes');
  const have = {};
  c.rows.forEach(function (r) { have[r.Chave] = true; });
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (!have[k]) appendRow_(c, { Chave: k, Valor: DEFAULT_SETTINGS[k] });
  });

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_KEY')) {
    props.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  getFolder_();
  Logger.log('Setup concluído.');
  Logger.log('API_KEY (guarde como variável de ambiente no servidor do site, NÃO compartilhe): ' + props.getProperty('API_KEY'));
}

/** Opcional: troca TODAS as senhas em texto puro da planilha por hash agora. */
function migrarSenhas() {
  withLock_(function () {
    const t = table_('Permissionamento');
    let n = 0;
    t.rows.forEach(function (r) {
      if (!r.SenhaHash && r.Senha && String(r.Senha) !== MIGRATED) {
        const salt = Utilities.getUuid();
        writeRow_(t, r._row, { SenhaHash: hash_(salt, String(r.Senha)), Salt: salt, Senha: MIGRATED });
        n++;
      }
    });
    Logger.log(n + ' senha(s) migrada(s). A coluna Senha agora mostra "' + MIGRATED + '".');
  });
}

/** Passa a exigir a API_KEY em toda requisição (use ao migrar para a Cloudflare). */
function exigirChave() { PropertiesService.getScriptProperties().setProperty('REQUIRE_KEY', '1'); Logger.log('API_KEY agora é obrigatória.'); }
/** Volta ao modo sem chave (GitHub Pages). */
function dispensarChave() { PropertiesService.getScriptProperties().setProperty('REQUIRE_KEY', '0'); Logger.log('API_KEY não é mais exigida.'); }

/** Gera uma API_KEY NOVA e invalida a anterior. Depois faça uma nova implantação
 *  (Implantar > Gerenciar implantações > editar > Nova versão) e atualize a chave no servidor do site. */
function gerarNovaApiKey() {
  const k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_KEY', k);
  Logger.log('NOVA API_KEY (a anterior deixou de funcionar): ' + k);
}

/** Mostra a API_KEY novamente, se precisar. */
function mostrarApiKey() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('API_KEY'));
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const cur = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const missing = headers.filter(function (h) { return cur.indexOf(h) < 0; });
    if (missing.length) sh.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]);
  }
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  sh.setFrozenRows(1);
}

/* ====================== AUTENTICAÇÃO / SESSÃO ====================== */

function login_(d) {
  const login = String(d.login || '').trim().toLowerCase();
  const pw = String(d.password || '');
  const generic = new ApiError('AUTH', 'E-mail ou senha inválidos.');
  if (!login || !pw || login.length > 120 || pw.length > 200) throw generic;

  const cache = CacheService.getScriptCache();
  const fk = 'f:' + login;
  const fails = Number(cache.get(fk) || 0);
  if (fails >= CFG.MAX_FAILS) {
    audit_(login, 'LOGIN_BLOQUEADO', '', 'NEGADO');
    throw new ApiError('LOCKED', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  }

  const t = table_('Permissionamento');
  const u = t.rows.find(function (r) { return String(r.Login).trim().toLowerCase() === login; });
  let ok = false;
  if (u && String(u.Status || 'Ativo') === 'Ativo') {
    if (u.SenhaHash) {
      ok = safeEq_(hash_(String(u.Salt), pw), String(u.SenhaHash));
    } else if (u.Senha && String(u.Senha) !== MIGRATED) {
      ok = safeEq_(String(u.Senha), pw);
      if (ok) { // migração transparente: grava hash e apaga o texto puro
        const salt = Utilities.getUuid();
        withLock_(function () {
          writeRow_(t, u._row, { SenhaHash: hash_(salt, pw), Salt: salt, Senha: MIGRATED });
        });
      }
    }
  } else {
    hash_('x', pw); // tempo parecido para usuário inexistente
  }
  if (!ok) {
    cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
    audit_(login, 'LOGIN_FALHA', '', 'NEGADO');
    throw generic;
  }
  cache.remove(fk);
  withLock_(function () { writeRow_(t, u._row, { UltimoAcesso: now_() }); });

  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  const exp = Date.now() + CFG.SESSION_TTL * 1000;
  cache.put('s:' + token, JSON.stringify({ login: login, ver: getVer_(login), exp: exp }), CFG.SESSION_TTL);
  audit_(login, 'LOGIN_OK', '', 'OK');
  return { token: token, expiraEm: exp, usuario: publicUser_(userFrom_(u)) };
}

function logout_(d, user) {
  CacheService.getScriptCache().remove('s:' + user.token);
  audit_(user.login, 'LOGOUT', '', 'OK');
  return { ok: true };
}

function auth_(token) {
  token = String(token || '');
  if (token.length < 40 || token.length > 100) throw new ApiError('SESSION', 'Sessão expirada. Entre novamente.');
  const raw = CacheService.getScriptCache().get('s:' + token);
  if (!raw) throw new ApiError('SESSION', 'Sessão expirada. Entre novamente.');
  const s = JSON.parse(raw);
  if (Date.now() > s.exp || s.ver !== getVer_(s.login)) throw new ApiError('SESSION', 'Sessão expirada. Entre novamente.');
  const t = table_('Permissionamento');
  const u = t.rows.find(function (r) { return String(r.Login).trim().toLowerCase() === s.login; });
  if (!u || String(u.Status || 'Ativo') !== 'Ativo') throw new ApiError('SESSION', 'Acesso desativado.');
  const usr = userFrom_(u);
  usr.token = token;
  return usr;
}

function userFrom_(u) {
  const norm = normAccess_(u.Acesso);
  return {
    login: String(u.Login).trim().toLowerCase(),
    nome: u.Nome || '',
    acesso: String(u.Acesso || ''),
    perms: norm,
    isAdmin: norm.indexOf('aba adm') >= 0
  };
}

function publicUser_(u) {
  return { login: u.login, nome: u.nome, acesso: u.acesso, isAdmin: u.isAdmin };
}

function normAccess_(s) {
  return String(s || '').split(/[,;|]/).map(function (x) {
    return x.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }).filter(Boolean);
}

function allowed_(u, area) {
  if (u.isAdmin) return true;
  if (area === 'adm') return false;
  if (area === 'layouts') return u.perms.indexOf('produtos') >= 0;
  const need = { produtos: 'produtos', vendas: 'vendas', config: 'configuracoes' }[area];
  return u.perms.indexOf(need) >= 0;
}

function getVer_(login) { return PropertiesService.getScriptProperties().getProperty('ver:' + login) || '0'; }
function bumpVer_(login) {
  PropertiesService.getScriptProperties().setProperty('ver:' + login, String(Number(getVer_(login)) + 1));
}

function revokeSessions_(d, user) {
  const login = String(d.login || '').trim().toLowerCase();
  if (!login) throw new ApiError('VALIDATION', 'Informe o usuário.');
  bumpVer_(login);
  audit_(user.login, 'SESSOES_REVOGADAS', login, 'OK');
  return { ok: true };
}

function hash_(salt, pw) {
  let h = salt + pw;
  for (let i = 0; i < CFG.HASH_ROUNDS; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + h + pw));
  }
  return h;
}

function safeEq_(a, b) {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* ============================ USUÁRIOS ============================ */

function listUsers_() {
  return table_('Permissionamento').rows.filter(function (r) { return String(r.Login) !== ''; }).map(function (r) {
    return {
      login: r.Login, nome: r.Nome || '', acesso: r.Acesso || '', status: r.Status || 'Ativo',
      criadoEm: cell_(r.CriadoEm), ultimoAcesso: cell_(r.UltimoAcesso), senhaProtegida: !!r.SenhaHash
    };
  });
}

function saveUser_(d, user) {
  return withLock_(function () {
    const login = String(d.login || '').trim().toLowerCase();
    if (!/^[a-z0-9._@+\-]{3,120}$/.test(login)) throw new ApiError('VALIDATION', 'Login/e-mail inválido.');
    const status = d.status === 'Inativo' ? 'Inativo' : 'Ativo';
    const acessos = String(d.acesso || '').split(/[,;|]/).map(function (x) { return x.trim(); }).filter(Boolean);
    acessos.forEach(function (a) {
      if (ACCESS_VALUES.indexOf(a) < 0) throw new ApiError('VALIDATION', 'Permissão inválida: ' + a);
    });
    const t = table_('Permissionamento');
    const ex = t.rows.find(function (r) { return String(r.Login).trim().toLowerCase() === login; });
    const pw = d.password == null ? '' : String(d.password);
    if (!ex && pw.length < 8) throw new ApiError('VALIDATION', 'A senha precisa ter ao menos 8 caracteres.');
    if (pw && (pw.length < 8 || pw.length > 200)) throw new ApiError('VALIDATION', 'A senha precisa ter entre 8 e 200 caracteres.');

    // nunca deixar o sistema sem administrador ativo
    const newIsAdmin = acessos.indexOf('Aba Adm') >= 0 && status === 'Ativo';
    const otherAdmins = t.rows.filter(function (r) {
      return String(r.Login).trim().toLowerCase() !== login && String(r.Status || 'Ativo') === 'Ativo' &&
        normAccess_(r.Acesso).indexOf('aba adm') >= 0;
    }).length;
    if (!newIsAdmin && otherAdmins === 0) throw new ApiError('VALIDATION', 'É preciso manter ao menos um administrador ativo.');
    if (login === user.login && !newIsAdmin) throw new ApiError('VALIDATION', 'Você não pode remover o seu próprio acesso administrativo.');

    const patch = { Login: login, Nome: String(d.nome || '').slice(0, 80), Acesso: acessos.join(', '), Status: status };
    if (pw) {
      const salt = Utilities.getUuid();
      patch.Salt = salt; patch.SenhaHash = hash_(salt, pw); patch.Senha = MIGRATED;
    }
    if (ex) {
      writeRow_(t, ex._row, patch);
      if (pw || status === 'Inativo') bumpVer_(login);
    } else {
      patch.CriadoEm = now_();
      appendRow_(t, patch);
    }
    audit_(user.login, ex ? 'USUARIO_EDITAR' : 'USUARIO_CRIAR', login, 'OK');
    return { ok: true };
  });
}

/* ============================ PRODUTOS ============================ */

function money_(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  let s = String(v).replace(/R\$|\s/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Regra única de preço/selo — usada no cadastro, no catálogo e nas artes. */
function pricing_(normal, promo, modo, manual) {
  normal = Number(normal) || 0;
  promo = (promo === '' || promo == null) ? null : Number(promo);
  let atual = normal, anterior = null, desconto = 0, auto = '';
  if (promo != null && promo > 0 && promo < normal) {
    atual = promo; anterior = normal; auto = 'OFERTA';
    desconto = Math.round((1 - promo / normal) * 100);
  } else if (promo != null && promo > 0 && promo === normal) {
    auto = 'OFERTA';           // preços iguais: só o selo, sem desconto
  }
  let selo = auto;
  if (modo === 'none') selo = '';
  else if (modo === 'manual') selo = String(manual || '');
  return { precoAtual: atual, precoAnterior: anterior, desconto: desconto > 0 ? desconto : 0, selo: selo };
}

function validUrl_(u) { return /^https:\/\/(lh3\.googleusercontent\.com|drive\.google\.com)\/[^\s"'<>]+$/.test(u); }

function validateProduct_(d) {
  const s = function (x, max) { return String(x == null ? '' : x).trim().slice(0, max); };
  const nome = s(d.nome, 140);
  if (nome.length < 2) throw new ApiError('VALIDATION', 'Informe o nome do produto.');
  const categoria = s(d.categoria, 60);
  if (CATEGORIES.indexOf(categoria) < 0) throw new ApiError('VALIDATION', 'Categoria inválida.');
  const svc = categoria === SERVICE_CAT;

  const condicao = s(d.condicao, 12);
  if (!svc && condicao !== 'Novo' && condicao !== 'Seminovo') throw new ApiError('VALIDATION', 'Escolha a condição: Novo ou Seminovo.');

  const normal = money_(d.precoNormal);
  if (isNaN(normal) || (!svc && !(normal > 0))) throw new ApiError('VALIDATION', 'Informe um preço de venda válido.');
  const promo = money_(d.precoPromocional);
  if (isNaN(promo) || (promo != null && promo <= 0)) throw new ApiError('VALIDATION', 'Preço promocional inválido.');
  if (promo != null && promo > (normal || 0)) throw new ApiError('VALIDATION', 'O preço promocional não pode ser maior que o preço normal.');

  let estoque = d.estoque === '' || d.estoque == null ? (svc ? 1 : NaN) : Number(d.estoque);
  if (!isFinite(estoque) || estoque < 0 || estoque > 100000 || Math.floor(estoque) !== estoque) {
    throw new ApiError('VALIDATION', 'Estoque deve ser um número inteiro (0 ou mais).');
  }
  const status = s(d.status || 'Rascunho', 20);
  if (PRODUCT_STATUS.indexOf(status) < 0 || status === 'Excluído') throw new ApiError('VALIDATION', 'Status inválido.');

  let modo = s(d.seloModo || 'auto', 10);
  if (['auto', 'none', 'manual'].indexOf(modo) < 0) modo = 'auto';
  const manual = s(d.seloManual, 24);
  if (modo === 'manual' && !manual) throw new ApiError('VALIDATION', 'Digite o texto do selo personalizado.');
  const cor = s(d.seloCor, 7);
  if (cor && !/^#[0-9a-fA-F]{6}$/.test(cor)) throw new ApiError('VALIDATION', 'Cor do selo inválida.');
  const estilo = BADGE_STYLES.indexOf(d.seloEstilo) >= 0 ? d.seloEstilo : 'solido';

  let principal = s(d.fotoPrincipal, 400);
  let extras = Array.isArray(d.fotosAdicionais) ? d.fotosAdicionais.map(function (x) { return s(x, 400); }).filter(Boolean) : [];
  if (extras.length > 12) throw new ApiError('VALIDATION', 'No máximo 12 fotos adicionais.');
  if (!principal && extras.length) principal = extras.shift();
  if (principal && !validUrl_(principal)) throw new ApiError('VALIDATION', 'URL da foto principal inválida.');
  extras.forEach(function (u) { if (!validUrl_(u)) throw new ApiError('VALIDATION', 'URL de foto inválida.'); });
  if (status === 'Publicado' && !principal) throw new ApiError('VALIDATION', 'Adicione ao menos uma foto para publicar.');

  let dataPub = s(d.dataPublicacao, 19);
  if (dataPub && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(dataPub)) throw new ApiError('VALIDATION', 'Data de publicação inválida.');

  return {
    Nome: nome, Categoria: categoria, Marca: s(d.marca, 60), Modelo: s(d.modelo, 80),
    DescricaoCurta: s(d.descricaoCurta, 220), DescricaoCompleta: s(d.descricaoCompleta, 4000),
    Especificacoes: s(d.especificacoes, 3000), Condicao: svc ? '' : condicao, Conservacao: s(d.conservacao, 200),
    PrecoNormal: normal == null ? 0 : normal, PrecoPromocional: promo == null ? '' : promo, Estoque: estoque,
    Status: status, FotoPrincipal: principal, FotosAdicionais: JSON.stringify(extras),
    SeloModo: modo, SeloManual: manual, SeloCor: cor, SeloEstilo: estilo,
    Destaque: d.destaque ? 'Sim' : 'Não', DataPublicacao: dataPub,
    ObservacoesInternas: s(d.observacoes, 1000),
    LayoutArte: s(d.layoutArte, 40), FotoArte: validUrl_(s(d.fotoArte, 400)) ? s(d.fotoArte, 400) : ''
  };
}

function productView_(r, admin) {
  const p = pricing_(r.PrecoNormal, r.PrecoPromocional, r.SeloModo || 'auto', r.SeloManual);
  let extras = [];
  try { extras = JSON.parse(r.FotosAdicionais || '[]'); } catch (e) { extras = []; }
  const svc = r.Categoria === SERVICE_CAT;
  const estoque = Number(r.Estoque) || 0;
  const specs = String(r.Especificacoes || '').split(/\r?\n/).map(function (l) {
    const i = l.indexOf(':');
    return i > 0 ? { item: l.slice(0, i).trim(), valor: l.slice(i + 1).trim() } : (l.trim() ? { item: l.trim(), valor: '' } : null);
  }).filter(Boolean);
  const v = {
    id: r.ID, nome: r.Nome, categoria: r.Categoria, marca: r.Marca, modelo: r.Modelo,
    descricaoCurta: r.DescricaoCurta, descricaoCompleta: r.DescricaoCompleta,
    especificacoes: specs, especificacoesTexto: r.Especificacoes,
    condicao: r.Condicao, conservacao: r.Conservacao,
    precoAtual: p.precoAtual, precoAnterior: p.precoAnterior, desconto: p.desconto,
    selo: p.selo ? { texto: p.selo, cor: r.SeloCor || '', estilo: r.SeloEstilo || 'solido' } : null,
    estoque: estoque, disponivel: r.Status === 'Publicado' && (svc || estoque > 0),
    fotoPrincipal: r.FotoPrincipal, fotos: [r.FotoPrincipal].concat(extras).filter(Boolean),
    destaque: r.Destaque === 'Sim', dataPublicacao: cell_(r.DataPublicacao), dataAtualizacao: cell_(r.DataAtualizacao)
  };
  if (admin) {
    v.status = r.Status; v.observacoes = r.ObservacoesInternas; v.precoNormal = Number(r.PrecoNormal);
    v.precoPromocional = r.PrecoPromocional === '' ? null : Number(r.PrecoPromocional);
    v.seloModo = r.SeloModo || 'auto'; v.seloManual = r.SeloManual; v.seloCor = r.SeloCor; v.seloEstilo = r.SeloEstilo;
    v.layoutArte = r.LayoutArte || ''; v.fotoArte = r.FotoArte || ''; v.fotosAdicionais = extras; v.criadoPor = r.CriadoPor; v.dataCriacao = cell_(r.DataCriacao);
  }
  return v;
}

function isVisible_(r) {
  if (r.Status !== 'Publicado') return false;
  const dp = cell_(r.DataPublicacao);
  return !dp || String(dp) <= now_();
}

function listPublicProducts_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('pub:list');
  if (hit) return JSON.parse(hit);
  const list = table_('Anuncios').rows.filter(isVisible_).map(function (r) { return productView_(r, false); });
  try { cache.put('pub:list', JSON.stringify(list), 60); } catch (e) { /* grande demais p/ cache */ }
  return list;
}

function getPublicProduct_(d) {
  const r = table_('Anuncios').rows.find(function (x) { return x.ID === String(d.id || ''); });
  if (!r || !isVisible_(r)) throw new ApiError('NOT_FOUND', 'Anúncio não encontrado.');
  return productView_(r, false);
}

function listAdminProducts_() {
  return table_('Anuncios').rows.filter(function (r) { return r.Status !== 'Excluído'; })
    .map(function (r) { return productView_(r, true); });
}

function saveProduct_(d, user) {
  return withLock_(function () {
    const cache = CacheService.getScriptCache();
    if (d.requestId) {
      const prev = cache.get('p:' + d.requestId);
      if (prev) return { id: prev, duplicado: true };
    }
    const t = table_('Anuncios');
    let ex = null;
    if (d.id) {
      ex = t.rows.find(function (r) { return r.ID === String(d.id); });
      if (!ex || ex.Status === 'Excluído') throw new ApiError('NOT_FOUND', 'Anúncio não encontrado.');
    }
    const v = validateProduct_(d);
    const p = pricing_(v.PrecoNormal, v.PrecoPromocional, v.SeloModo, v.SeloManual);
    v.SeloPromocional = p.selo;
    v.PercentualDesconto = p.desconto;
    if (v.Status === 'Publicado' && !v.DataPublicacao) v.DataPublicacao = (ex && cell_(ex.DataPublicacao)) || now_();
    v.DataAtualizacao = now_();
    let id;
    if (ex) {
      id = ex.ID;
      writeRow_(t, ex._row, v);
    } else {
      id = newId_('SZ', t.rows.map(function (r) { return r.ID; }));
      v.ID = id; v.DataCriacao = now_(); v.CriadoPor = user.login;
      appendRow_(t, v);
    }
    if (d.requestId) cache.put('p:' + d.requestId, id, 600);
    cache.remove('pub:list');
    audit_(user.login, ex ? 'PRODUTO_EDITAR' : 'PRODUTO_CRIAR', id, 'OK');
    return { id: id };
  });
}

function setProductStatus_(d, user) {
  return withLock_(function () {
    const status = String(d.status || '');
    if (['Publicado', 'Despublicado', 'Rascunho'].indexOf(status) < 0) throw new ApiError('VALIDATION', 'Status inválido.');
    const t = table_('Anuncios');
    const r = t.rows.find(function (x) { return x.ID === String(d.id || ''); });
    if (!r || r.Status === 'Excluído') throw new ApiError('NOT_FOUND', 'Anúncio não encontrado.');
    if (status === 'Publicado' && !r.FotoPrincipal) throw new ApiError('VALIDATION', 'Adicione ao menos uma foto para publicar.');
    const patch = { Status: status, DataAtualizacao: now_() };
    if (status === 'Publicado' && !cell_(r.DataPublicacao)) patch.DataPublicacao = now_();
    writeRow_(t, r._row, patch);
    CacheService.getScriptCache().remove('pub:list');
    audit_(user.login, 'PRODUTO_STATUS:' + status, r.ID, 'OK');
    return { ok: true };
  });
}

/** Exclusão lógica: some do site e do painel, mas vendas/layouts antigos não quebram. */
function deleteProduct_(d, user) {
  return withLock_(function () {
    const t = table_('Anuncios');
    const r = t.rows.find(function (x) { return x.ID === String(d.id || ''); });
    if (!r) throw new ApiError('NOT_FOUND', 'Anúncio não encontrado.');
    writeRow_(t, r._row, { Status: 'Excluído', DataAtualizacao: now_() });
    CacheService.getScriptCache().remove('pub:list');
    audit_(user.login, 'PRODUTO_EXCLUIR', r.ID, 'OK');
    return { ok: true };
  });
}

/* ============================ IMAGENS ============================ */

function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria */ } }
  const f = DriveApp.createFolder(CFG.FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function uploadImage_(d, user) {
  const mime = String(d.mimeType || '');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  if (!ext) throw new ApiError('VALIDATION', 'Envie uma imagem JPG, PNG ou WEBP.');
  const b64 = String(d.base64 || '');
  if (!b64 || b64.length > Math.ceil(CFG.MAX_IMAGE_BYTES * 4 / 3) + 16) throw new ApiError('VALIDATION', 'Imagem vazia ou maior que 5 MB.');
  const bytes = Utilities.base64Decode(b64);
  if (bytes.length > CFG.MAX_IMAGE_BYTES) throw new ApiError('VALIDATION', 'Imagem maior que 5 MB.');
  const name = 'sz-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
  const f = getFolder_().createFile(Utilities.newBlob(bytes, mime, name));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  audit_(user.login, 'IMAGEM_ENVIAR', f.getId(), 'OK');
  return { fileId: f.getId(), url: 'https://lh3.googleusercontent.com/d/' + f.getId() };
}

function deleteImage_(d, user) {
  const id = String(d.fileId || '');
  if (!/^[A-Za-z0-9_\-]{10,80}$/.test(id)) throw new ApiError('VALIDATION', 'Identificador inválido.');
  const folderId = getFolder_().getId();
  let f;
  try { f = DriveApp.getFileById(id); } catch (e) { throw new ApiError('NOT_FOUND', 'Imagem não encontrada.'); }
  let inside = false;
  const ps = f.getParents();
  while (ps.hasNext()) { if (ps.next().getId() === folderId) inside = true; }
  if (!inside) throw new ApiError('FORBIDDEN', 'Este arquivo não pertence à loja.');
  f.setTrashed(true);
  audit_(user.login, 'IMAGEM_EXCLUIR', id, 'OK');
  return { ok: true };
}

/* ============================== VENDAS ============================== */

/** Chamado quando o visitante toca em "Tenho interesse". NÃO é venda concluída. */
function registerInterest_(d) {
  const cache = CacheService.getScriptCache();
  const rid = String(d.requestId || '').slice(0, 60);
  if (rid) { const prev = cache.get('i:' + rid); if (prev) return { idVenda: prev, duplicado: true }; }
  const gk = 'ig'; const gn = Number(cache.get(gk) || 0); // teto global: 80 registros / 10 min
  if (gn >= 80) throw new ApiError('RATE', 'Muitas solicitações no momento. Tente novamente em alguns minutos.');
  cache.put(gk, String(gn + 1), 600);
  const cid = String(d.clientId || '').slice(0, 64);
  if (cid) { // no máx. 5 registros a cada 10 min por visitante
    const k = 'ic:' + cid; const n = Number(cache.get(k) || 0);
    if (n >= 5) throw new ApiError('RATE', 'Muitas solicitações. Tente novamente em alguns minutos.');
    cache.put(k, String(n + 1), 600);
  }
  return withLock_(function () {
    const pr = table_('Anuncios').rows.find(function (x) { return x.ID === String(d.id || ''); });
    if (!pr || !isVisible_(pr)) throw new ApiError('NOT_FOUND', 'Anúncio não encontrado.');
    const pv = productView_(pr, false);
    const t = table_('Vendas');
    const id = newId_('V', t.rows.map(function (r) { return r.IDVenda; }));
    const origem = ['Site', 'Catálogo', 'Detalhes'].indexOf(d.origem) >= 0 ? d.origem : 'Site';
    appendRow_(t, {
      IDVenda: id, Data: now_(), IDAnuncio: pv.id, NomeProduto: pv.nome, Quantidade: 1,
      ValorUnitario: pv.precoAtual, ValorTotal: pv.precoAtual, Status: 'Interesse recebido',
      Origem: origem, Observacoes: '', DataAtualizacao: now_()
    });
    if (rid) cache.put('i:' + rid, id, 600);
    audit_('visitante', 'INTERESSE', pv.id, 'OK');
    return { idVenda: id };
  });
}

function listSales_(d) {
  const from = String(d.from || ''), to = String(d.to || '');
  const q = String(d.produto || '').toLowerCase(), cod = String(d.codigo || '').toLowerCase();
  const rows = table_('Vendas').rows.map(saleView_).filter(function (s) {
    const day = String(s.data).slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (d.status && s.status !== d.status) return false;
    if (q && String(s.nomeProduto).toLowerCase().indexOf(q) < 0) return false;
    if (cod && String(s.idVenda).toLowerCase().indexOf(cod) < 0 && String(s.idAnuncio).toLowerCase().indexOf(cod) < 0) return false;
    return true;
  }).reverse().slice(0, 1000);
  const done = rows.filter(function (s) { return s.status === 'Venda concluída'; });
  return {
    vendas: rows,
    resumo: {
      registros: rows.length,
      concluidas: done.length,
      valorConcluidas: sum_(done, 'valorTotal'),
      contatos: rows.filter(function (s) { return s.status === 'Interesse recebido' || s.status === 'Em negociação'; }).length
    }
  };
}

function saleView_(r) {
  return {
    idVenda: r.IDVenda, data: cell_(r.Data), idAnuncio: r.IDAnuncio, nomeProduto: r.NomeProduto,
    quantidade: Number(r.Quantidade) || 0, valorUnitario: Number(r.ValorUnitario) || 0,
    valorTotal: Number(r.ValorTotal) || 0, status: r.Status, origem: r.Origem, observacoes: r.Observacoes
  };
}

function createSale_(d, user) {
  return withLock_(function () {
    const pr = table_('Anuncios').rows.find(function (x) { return x.ID === String(d.idAnuncio || ''); });
    if (!pr) throw new ApiError('NOT_FOUND', 'Anúncio não encontrado.');
    const qtd = Number(d.quantidade);
    const unit = money_(d.valorUnitario);
    if (!(qtd >= 1) || Math.floor(qtd) !== qtd || qtd > 1000) throw new ApiError('VALIDATION', 'Quantidade inválida.');
    if (unit == null || isNaN(unit) || unit < 0) throw new ApiError('VALIDATION', 'Valor unitário inválido.');
    const status = SALE_STATUS.indexOf(d.status) >= 0 ? d.status : 'Venda concluída';
    const t = table_('Vendas');
    const id = newId_('V', t.rows.map(function (r) { return r.IDVenda; }));
    appendRow_(t, {
      IDVenda: id, Data: now_(), IDAnuncio: pr.ID, NomeProduto: pr.Nome, Quantidade: qtd,
      ValorUnitario: unit, ValorTotal: Math.round(qtd * unit * 100) / 100, Status: status,
      Origem: 'Manual', Observacoes: String(d.observacoes || '').slice(0, 500), DataAtualizacao: now_()
    });
    audit_(user.login, 'VENDA_CRIAR', id, 'OK');
    return { idVenda: id };
  });
}

function updateSale_(d, user) {
  return withLock_(function () {
    const t = table_('Vendas');
    const r = t.rows.find(function (x) { return x.IDVenda === String(d.idVenda || ''); });
    if (!r) throw new ApiError('NOT_FOUND', 'Registro não encontrado.');
    const patch = { DataAtualizacao: now_() };
    if (d.status != null) {
      if (SALE_STATUS.indexOf(d.status) < 0) throw new ApiError('VALIDATION', 'Status inválido.');
      patch.Status = d.status;
    }
    let qtd = Number(r.Quantidade), unit = Number(r.ValorUnitario);
    if (d.quantidade != null) {
      qtd = Number(d.quantidade);
      if (!(qtd >= 1) || Math.floor(qtd) !== qtd || qtd > 1000) throw new ApiError('VALIDATION', 'Quantidade inválida.');
      patch.Quantidade = qtd;
    }
    if (d.valorUnitario != null) {
      unit = money_(d.valorUnitario);
      if (unit == null || isNaN(unit) || unit < 0) throw new ApiError('VALIDATION', 'Valor unitário inválido.');
      patch.ValorUnitario = unit;
    }
    patch.ValorTotal = Math.round(qtd * unit * 100) / 100;
    if (d.observacoes != null) patch.Observacoes = String(d.observacoes).slice(0, 500);
    writeRow_(t, r._row, patch);
    audit_(user.login, 'VENDA_ATUALIZAR' + (patch.Status ? ':' + patch.Status : ''), r.IDVenda, 'OK');
    return { ok: true };
  });
}

/* ========================== INDICADORES ========================== */

function dashboard_(d) {
  const from = String(d.from || ''), to = String(d.to || ''), cat = String(d.categoria || '');
  const prods = table_('Anuncios').rows.filter(function (r) { return r.Status !== 'Excluído'; });
  const byId = {};
  prods.forEach(function (r) { byId[r.ID] = r; });
  const pf = prods.filter(function (r) { return !cat || r.Categoria === cat; }).map(function (r) { return productView_(r, true); });

  const sales = table_('Vendas').rows.map(saleView_).filter(function (s) {
    const day = String(s.data).slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (cat) { const p = byId[s.idAnuncio]; if (!p || p.Categoria !== cat) return false; }
    return true;
  });
  const concl = sales.filter(function (s) { return s.status === 'Venda concluída'; });
  const interesses = sales.filter(function (s) { return s.status !== 'Cancelada'; });

  const top = {};
  interesses.forEach(function (s) { top[s.idAnuncio] = top[s.idAnuncio] || { id: s.idAnuncio, nome: s.nomeProduto, total: 0 }; top[s.idAnuncio].total++; });
  const cats = {};
  sales.forEach(function (s) {
    const p = byId[s.idAnuncio]; const c = p ? p.Categoria : 'Sem categoria';
    cats[c] = cats[c] || { categoria: c, contatos: 0, vendas: 0, valor: 0 };
    cats[c].contatos++;
    if (s.status === 'Venda concluída') { cats[c].vendas++; cats[c].valor += s.valorTotal; }
  });

  const aud = table_('Auditoria').rows;
  return {
    totalAnuncios: pf.length,
    anunciosAtivos: pf.filter(function (p) { return p.disponivel; }).length,
    esgotados: pf.filter(function (p) { return p.status === 'Publicado' && !p.disponivel; }).length,
    emPromocao: pf.filter(function (p) { return p.status === 'Publicado' && !!p.selo; }).length,
    novosContatos: sales.filter(function (s) { return s.status === 'Interesse recebido'; }).length,
    vendasConcluidas: concl.length,
    valorVendasConcluidas: sum_(concl, 'valorTotal'),
    produtosComMaisInteresse: Object.keys(top).map(function (k) { return top[k]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 5),
    desempenhoPorCategoria: Object.keys(cats).map(function (k) { return cats[k]; }),
    produtosMaisVisualizados: null, // sem instrumentação de visualizações ainda
    atividadeRecente: aud.slice(-15).reverse().map(auditView_)
  };
}

function listAudit_(d) {
  const lim = Math.min(Number(d.limit) || 100, 500);
  const onlyLogin = !!d.apenasAcessos;
  let rows = table_('Auditoria').rows;
  if (onlyLogin) rows = rows.filter(function (r) { return String(r.Operacao).indexOf('LOGIN') === 0 || String(r.Operacao) === 'LOGOUT'; });
  return rows.slice(-lim).reverse().map(auditView_);
}

function auditView_(r) {
  return { id: r.IDEvento, usuario: r.Usuario, operacao: r.Operacao, dataHora: cell_(r.DataHora), registro: r.Registro, resultado: r.Resultado };
}

/* ============================== LAYOUTS ============================== */

function listLayouts_() {
  return table_('Layouts').rows.map(function (r) {
    let cfg = null; try { cfg = JSON.parse(r.Configuracao); } catch (e) { cfg = null; }
    return { id: r.IDLayout, nome: r.Nome, formato: r.Formato, configuracao: cfg, criadoEm: cell_(r.DataCriacao), atualizadoEm: cell_(r.DataAtualizacao) };
  });
}

function saveLayout_(d, user) {
  return withLock_(function () {
    const nome = String(d.nome || '').trim().slice(0, 80);
    if (nome.length < 2) throw new ApiError('VALIDATION', 'Dê um nome ao layout.');
    const cfg = JSON.stringify(d.configuracao || {});
    if (cfg.length > 45000) throw new ApiError('VALIDATION', 'Layout grande demais para salvar.');
    const t = table_('Layouts');
    const ex = d.id ? t.rows.find(function (r) { return r.IDLayout === String(d.id); }) : null;
    const base = { Nome: nome, Formato: String(d.formato || '').slice(0, 20), Configuracao: cfg, DataAtualizacao: now_() };
    let id;
    if (ex) { id = ex.IDLayout; writeRow_(t, ex._row, base); }
    else {
      id = newId_('LY', t.rows.map(function (r) { return r.IDLayout; }));
      base.IDLayout = id; base.DataCriacao = now_(); base.CriadoPor = user.login;
      appendRow_(t, base);
    }
    audit_(user.login, 'LAYOUT_SALVAR', id, 'OK');
    return { id: id };
  });
}

function deleteLayout_(d, user) {
  return withLock_(function () {
    const t = table_('Layouts');
    const r = t.rows.find(function (x) { return x.IDLayout === String(d.id || ''); });
    if (!r) throw new ApiError('NOT_FOUND', 'Layout não encontrado.');
    t.sh.deleteRow(r._row);
    audit_(user.login, 'LAYOUT_EXCLUIR', r.IDLayout, 'OK');
    return { ok: true };
  });
}

/* =========================== CONFIGURAÇÕES =========================== */

function getSettings_() {
  const out = {};
  table_('Configuracoes').rows.forEach(function (r) {
    if (r.Chave && String(r.Chave).charAt(0) !== '_') out[r.Chave] = r.Valor;
  });
  return out;
}

function saveSettings_(d, user) {
  return withLock_(function () {
    const t = table_('Configuracoes');
    const vals = d.valores || {};
    Object.keys(vals).forEach(function (k) {
      if (!/^[A-Za-z0-9]{1,40}$/.test(k)) throw new ApiError('VALIDATION', 'Chave inválida: ' + k);
      const v = String(vals[k] == null ? '' : vals[k]).slice(0, 2000);
      const ex = t.rows.find(function (r) { return r.Chave === k; });
      if (ex) writeRow_(t, ex._row, { Valor: v }); else appendRow_(t, { Chave: k, Valor: v });
    });
    audit_(user.login, 'CONFIG_SALVAR', Object.keys(vals).join(','), 'OK');
    return getSettings_();
  });
}

/* ============================ AUXILIARES ============================ */

let _ss = null;
function ss_() { return _ss || (_ss = SpreadsheetApp.openById(CFG.SHEET_ID)); }

function table_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new ApiError('SETUP', 'Planilha não configurada. Rode a função setup() no Apps Script.');
  const values = sh.getDataRange().getValues();
  const headers = (values[0] || []).map(String);
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i].every(function (c) { return c === ''; })) continue;
    const o = { _row: i + 1 };
    headers.forEach(function (h, j) {
      let v = values[i][j];
      if (typeof v === 'string' && /^'[=+\-@]/.test(v)) v = v.slice(1); // remove o apóstrofo de proteção contra fórmulas
      o[h] = v;
    });
    rows.push(o);
  }
  return { sh: sh, headers: headers, rows: rows };
}

function writeRow_(t, rowNum, obj) {
  const range = t.sh.getRange(rowNum, 1, 1, t.headers.length);
  const cur = range.getValues()[0];
  t.headers.forEach(function (h, j) {
    if (Object.prototype.hasOwnProperty.call(obj, h)) cur[j] = safe_(obj[h]);
  });
  range.setValues([cur]);
}

function appendRow_(t, obj) {
  const row = t.headers.map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? safe_(obj[h]) : ''; });
  t.sh.appendRow(row);
}

/** Evita injeção de fórmulas (=, +, -, @ no início de textos). */
function safe_(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
  return v == null ? '' : v;
}

function now_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }

function newId_(prefix, used) {
  let id;
  do {
    id = prefix + '-' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  } while (used.indexOf(id) >= 0);
  return id;
}

function sum_(arr, key) {
  return Math.round(arr.reduce(function (a, x) { return a + (Number(x[key]) || 0); }, 0) * 100) / 100;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { throw new ApiError('BUSY', 'Sistema ocupado. Tente novamente.'); }
  try { return fn(); } finally { lock.releaseLock(); }
}

function audit_(user, op, record, result) {
  try {
    const t = table_('Auditoria');
    appendRow_(t, { IDEvento: Utilities.getUuid().slice(0, 8), Usuario: user, Operacao: op, DataHora: now_(), Registro: record, Resultado: result });
  } catch (e) { console.error('audit', e); }
}
