import vm from 'node:vm'; import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert/strict'; import test from 'node:test';

const seed = [['Login', 'Senha', 'Acesso'], ['dono@safezone.com', 'SenhaForte123', 'Aba Adm'], ['vendas@safezone.com', 'Outra12345', 'Vendas']];
const photo = 'https://lh3.googleusercontent.com/d/ABCDEFGHIJ1234';

test('login migra senha, bloqueia tentativas e sessões respeitam permissões', () => {
  const e = makeEnv(seed);
  assert.equal(e.call('login', { login: 'dono@safezone.com', password: 'errada' }).error.code, 'AUTH');
  const ok = e.call('login', { login: 'dono@safezone.com', password: 'SenhaForte123' });
  assert.ok(ok.ok && ok.data.usuario.isAdmin);
  const perm = e.sheets.Permissionamento.rows;
  assert.equal(perm[1][1], '(protegida)');           // texto puro apagado
  assert.ok(perm[1][5]);                               // hash gravado
  assert.ok(!JSON.stringify(ok).includes('SenhaForte123'));
  assert.ok(e.call('login', { login: 'dono@safezone.com', password: 'SenhaForte123' }).ok); // login pós-migração
  const v = e.call('login', { login: 'vendas@safezone.com', password: 'Outra12345' }).data.token;
  assert.equal(e.call('listLayouts', {}, v).error.code, 'FORBIDDEN'); // só Vendas: sem acesso aos layouts
  assert.equal(e.call('listUsers', {}, v).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveProduct', {}, v).error.code, 'FORBIDDEN');
  assert.ok(e.call('listSales', {}, v).ok);
  assert.equal(e.call('listSales', {}).error.code, 'SESSION');
  for (let i = 0; i < 5; i++) e.call('login', { login: 'x@y.com', password: 'a' });
  assert.equal(e.call('login', { login: 'x@y.com', password: 'a' }).error.code, 'LOCKED');
  const ping = k => JSON.parse(vm.runInContext(`doPost({postData:{contents:JSON.stringify({apiKey:${JSON.stringify(k)},action:"ping"})}}).getContent()`, e.ctx));
  assert.ok(ping(undefined).ok);                                   // modo GitHub Pages: sem chave
  vm.runInContext('exigirChave()', e.ctx);
  assert.equal(ping('errada').error.code, 'UNAUTHORIZED');          // modo Cloudflare: chave obrigatória
  assert.ok(ping(e.key).ok);
});

test('regras de preço e selo', () => {
  const e = makeEnv(seed);
  const p = (a, b, m, t) => vm.runInContext(`pricing_(${a},${b},${JSON.stringify(m)},${JSON.stringify(t)})`, e.ctx);
  let r = p(250, 200, 'auto'); assert.deepEqual([r.precoAtual, r.precoAnterior, r.desconto, r.selo], [200, 250, 20, 'OFERTA']);
  r = p(250, 250, 'auto'); assert.deepEqual([r.precoAtual, r.precoAnterior, r.desconto, r.selo], [250, null, 0, 'OFERTA']);
  r = p(250, null, 'auto'); assert.deepEqual([r.desconto, r.selo], [0, '']);
  r = p(250, null, 'manual', 'DESTAQUE'); assert.equal(r.selo, 'DESTAQUE');
  r = p(250, 200, 'none'); assert.equal(r.selo, '');
});

test('cadastro, validação, catálogo público, interesse e dashboard', () => {
  const e = makeEnv(seed);
  const t = e.call('login', { login: 'dono@safezone.com', password: 'SenhaForte123' }).data.token;
  const base = { nome: 'Fifine AM8', categoria: 'Periféricos', condicao: 'Novo', precoNormal: '250,00', estoque: 3, status: 'Publicado', fotoPrincipal: photo, requestId: 'r1' };
  assert.equal(e.call('saveProduct', { ...base, precoPromocional: '300' }, t).error.code, 'VALIDATION');
  assert.equal(e.call('saveProduct', { ...base, fotoPrincipal: 'http://evil.com/x.png' }, t).error.code, 'VALIDATION');
  const s1 = e.call('saveProduct', base, t); assert.ok(s1.ok);
  assert.equal(e.call('saveProduct', base, t).data.duplicado, true);   // sem duplicar
  assert.equal(e.sheets.Anuncios.rows.length, 2);
  const id = s1.data.id;
  const eq = e.call('saveProduct', { ...base, requestId: 'r2', nome: 'Promo igual', precoPromocional: '250,00' }, t).data.id;
  const lst = e.call('listProducts').data;
  assert.equal(lst.length, 2);
  const igual = lst.find(x => x.id === eq); assert.equal(igual.selo.texto, 'OFERTA'); assert.equal(igual.desconto, 0); assert.equal(igual.precoAnterior, null);
  assert.ok(!('observacoes' in lst[0]) && !('criadoPor' in lst[0]));
  e.call('setProductStatus', { id, status: 'Despublicado' }, t);
  e.ctx.CacheService.getScriptCache().remove('pub:list');
  assert.equal(e.call('listProducts').data.length, 1);
  assert.equal(e.call('getProduct', { id }).error.code, 'NOT_FOUND');
  const i1 = e.call('registerInterest', { id: eq, requestId: 'q1', clientId: 'c' }); assert.ok(i1.ok);
  assert.equal(e.call('registerInterest', { id: eq, requestId: 'q1', clientId: 'c' }).data.duplicado, true);
  e.call('registerInterest', { id: eq, requestId: 'q2', clientId: 'c' });
  let d = e.call('dashboard', {}, t).data;
  assert.equal(d.novosContatos, 2); assert.equal(d.vendasConcluidas, 0); assert.equal(d.valorVendasConcluidas, 0);
  e.call('updateSale', { idVenda: i1.data.idVenda, status: 'Venda concluída' }, t);
  d = e.call('dashboard', {}, t).data;
  assert.equal(d.vendasConcluidas, 1); assert.equal(d.valorVendasConcluidas, 250); assert.equal(d.novosContatos, 1);
  e.call('deleteProduct', { id }, t);
  assert.equal(e.call('listAllProducts', {}, t).data.length, 1);          // exclusão lógica
  assert.equal(e.sheets.Anuncios.rows.length, 3);
  const f = e.call('saveProduct', { ...base, requestId: 'r3', nome: '=HYPERLINK("x")' }, t); assert.ok(f.ok);
  assert.ok(e.sheets.Anuncios.rows[3][1].startsWith("'="));                // proteção de fórmula
  assert.equal(e.call('saveUser', { login: 'dono@safezone.com', acesso: 'Vendas', status: 'Ativo' }, t).error.code, 'VALIDATION'); // não remove o último admin
});
