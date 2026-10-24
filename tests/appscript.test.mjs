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

test('valores de serviços: base inicial, leitura pública, salvar e validar', () => {
  const e = makeEnv(seed);
  const pub = e.call('getServicePricing', {});
  assert.ok(pub.ok);
  assert.deepEqual(pub.data.servicos.map(s => s.nome), ['Montagem de computador', 'Limpeza', 'Formatação']);
  assert.ok(pub.data.servicos.every(s => s.precoUnico === null && s.precoLow === null), 'nenhum preço de serviço inventado');
  assert.ok(pub.data.componentes.length > 80 && ['GPU', 'CPU', 'RAM', 'Placa-mae'].every(t => pub.data.componentes.some(c => c.tipo === t)));
  assert.deepEqual(pub.data.faixas, { limite1: 2000, pct1: 20, limite2: 4000, pct2: 30, pct3: 35 });
  const gtx = pub.data.componentes.find(c => c.nome.includes('GTX 1080 8GB')), r3060 = pub.data.componentes.find(c => c.nome.includes('RTX 3060 12GB')), r3060ti = pub.data.componentes.find(c => c.nome.includes('RTX 3060 Ti'));
  assert.deepEqual([gtx.classe, r3060.classe, r3060ti.classe], ['Low', 'Mid', 'High']);
  // permissões: só quem tem Configurações edita
  const dono = e.call('login', { login: 'dono@safezone.com', password: 'SenhaForte123' }).data.token;
  const vend = e.call('login', { login: 'vendas@safezone.com', password: 'Outra12345' }).data.token;
  assert.equal(e.call('saveServicePricing', {}, vend).error.code, 'FORBIDDEN');
  assert.equal(e.call('adminServicePricing', {}, vend).error.code, 'FORBIDDEN');
  const adm = e.call('adminServicePricing', {}, dono).data;
  // salvar alterações
  const sv = adm.servicos.map(s => s.nome === 'Limpeza' ? { ...s, precoLow: 60, precoMid: 80, precoHigh: '100,50' } : s);
  const cp = adm.componentes.concat([{ tipo: 'GPU', marca: 'AMD', nome: '=HYPERLINK("x")', classe: 'Mid', preco: 999 }]);
  const ok = e.call('saveServicePricing', { servicos: sv, componentes: cp, faixas: { limite1: 2500, pct1: 18, limite2: 5000, pct2: 28, pct3: 33 } }, dono);
  assert.ok(ok.ok, JSON.stringify(ok));
  const after = e.call('getServicePricing', {}).data;
  const l = after.servicos.find(s => s.nome === 'Limpeza');
  assert.deepEqual([l.precoLow, l.precoMid, l.precoHigh], [60, 80, 100.5]);
  assert.equal(after.componentes.length, adm.componentes.length + 1);
  assert.equal(after.componentes.find(c => c.nome.includes('HYPERLINK')).nome, '=HYPERLINK("x")'); // sem fórmula na planilha, texto íntegro na leitura
  assert.equal(after.faixas.limite1, 2500);
  // validações
  const bad = (patch, msg) => { const r = e.call('saveServicePricing', { servicos: sv, componentes: cp.slice(0, 3), faixas: { limite1: 2000, pct1: 20, limite2: 4000, pct2: 30, pct3: 35 }, ...patch }, dono); assert.equal(r.ok, false, msg); };
  bad({ faixas: { limite1: 4000, pct1: 20, limite2: 2000, pct2: 30, pct3: 35 } }, 'limites invertidos');
  bad({ faixas: { limite1: 2000, pct1: 120, limite2: 4000, pct2: 30, pct3: 35 } }, 'pct > 100');
  bad({ componentes: [{ tipo: 'GPU', nome: 'X Placa', classe: 'Ultra', preco: 10 }] }, 'classe inválida');
  bad({ servicos: [{ nome: 'A' }] }, 'nome curto');
  // número do WhatsApp
  assert.equal(e.call('saveSettings', { valores: { TelefoneComercial: '123' } }, dono).ok, false);
  assert.equal(e.call('saveSettings', { valores: { TelefoneComercial: '+55 (61) 99999-1234' } }, dono).data.TelefoneComercial, '5561999991234');
});

test('feedbacks: destaque só com 5 estrelas, autorização obrigatória e exibição controlada', () => {
  const e = makeEnv(seed);
  const dono = e.call('login', { login: 'dono@safezone.com', password: 'SenhaForte123' }).data.token;
  const vend = e.call('login', { login: 'vendas@safezone.com', password: 'Outra12345' }).data.token;
  assert.ok(e.call('adminFeedbacks', {}, vend).ok, 'quem tem Vendas acessa feedbacks');
  assert.equal(e.call('saveUser', { login: 'x@y.com', nome: 'X', password: 'SenhaBoa1234', acesso: 'Configurações' }, dono).ok, true);
  const cfg = e.call('login', { login: 'x@y.com', password: 'SenhaBoa1234' }).data.token;
  assert.equal(e.call('adminFeedbacks', {}, cfg).error.code, 'FORBIDDEN', 'só Configurações não acessa');
  assert.equal(e.call('saveReview', { cliente: 'Ana', estrelas: 5, produto: 'Mouse' }, undefined).error.code, 'SESSION');
  // sem autorização não publica
  assert.equal(e.call('saveReview', { cliente: 'Ana', estrelas: 5, produto: 'Mouse Gamer', status: 'Publicado' }, dono).ok, false);
  const five = e.call('saveReview', { cliente: 'Ana P.', estrelas: 5, produto: 'Mouse Gamer', comentario: 'Ótimo produto, atendimento excelente!', autorizado: true }, dono);
  assert.ok(five.ok, JSON.stringify(five));
  const three = e.call('saveReview', { cliente: 'Bruno', estrelas: 3, produto: 'Mouse Gamer', comentario: 'Demorou um pouco', autorizado: true, destaque: true }, dono);
  const oculto = e.call('saveReview', { cliente: 'Caio', estrelas: 5, produto: 'Teclado', status: 'Oculto' }, dono);
  assert.ok(three.ok && oculto.ok);
  let pub = e.call('getFeedbacks', {}).data;
  assert.deepEqual(pub.avaliacoes.map(a => a.cliente), ['Ana P.'], 'só a 5★ autorizada e publicada aparece; a de 3★ não vai para lugar nenhum por padrão');
  assert.equal(pub.avaliacoes[0].destaque, true);
  assert.ok(!('observacoes' in pub.avaliacoes[0]) && !('autorizado' in pub.avaliacoes[0]), 'campos internos não vazam');
  const adm = e.call('adminFeedbacks', {}, dono).data.avaliacoes;
  assert.equal(adm.find(a => a.cliente === 'Bruno').destaque, false, 'destaque forçado a falso abaixo de 5★');
  // dono decide mostrar a de 3★ no item (mas continua fora do destaque)
  assert.ok(e.call('saveReview', { id: three.data.id, cliente: 'Bruno', estrelas: 3, produto: 'Mouse Gamer', autorizado: true, noProduto: true, destaque: true }, dono).ok);
  pub = e.call('getFeedbacks', {}).data;
  const b = pub.avaliacoes.find(a => a.cliente === 'Bruno');
  assert.ok(b && b.noProduto && !b.destaque && !b.noPortfolio);
  // editar para 4★ mantém escolhas; imagem inválida e estrelas inválidas
  assert.equal(e.call('saveReview', { cliente: 'Dani', estrelas: 6, produto: 'X Item' }, dono).ok, false);
  assert.equal(e.call('saveReview', { cliente: 'Dani', estrelas: 5, produto: 'X Item', autorizado: true, imagem: 'https://evil.com/a.png' }, dono).ok, false);
  // exclusão
  assert.ok(e.call('deleteReview', { id: five.data.id }, dono).ok);
  assert.ok(!e.call('getFeedbacks', {}).data.avaliacoes.some(a => a.cliente === 'Ana P.'));
});

test('vídeos: link validado, upload ao Drive e ordem', () => {
  const e = makeEnv(seed);
  const dono = e.call('login', { login: 'dono@safezone.com', password: 'SenhaForte123' }).data.token;
  assert.equal(e.call('saveVideo', { tipo: 'link', url: 'javascript:alert(1)' }, dono).ok, false);
  assert.equal(e.call('saveVideo', { tipo: 'link', url: 'https://evil.com/pagina' }, dono).ok, false);
  const yt = e.call('saveVideo', { tipo: 'link', titulo: 'Montagem', url: 'https://youtu.be/dQw4w9WgXcQ' }, dono);
  assert.ok(yt.ok);
  const up = e.call('uploadMedia', { mimeType: 'video/mp4', base64: Buffer.from('fake-video-bytes').toString('base64') }, dono);
  assert.ok(up.ok && up.data.tipo === 'video');
  assert.equal(e.call('uploadMedia', { mimeType: 'application/pdf', base64: 'AAAA' }, dono).ok, false);
  const v2 = e.call('saveVideo', { tipo: 'upload', titulo: 'Limpeza', arquivoId: up.data.fileId }, dono);
  assert.ok(v2.ok);
  const pub = e.call('getFeedbacks', {}).data.videos;
  assert.deepEqual(pub.map(v => v.titulo), ['Montagem', 'Limpeza']);
  assert.ok(e.call('saveVideo', { id: v2.data.id, tipo: 'upload', arquivoId: up.data.fileId, status: 'Oculto' }, dono).ok);
  assert.equal(e.call('getFeedbacks', {}).data.videos.length, 1);
  assert.ok(e.call('deleteVideo', { id: yt.data.id }, dono).ok);
});

test('ofertas: respeitam desconto máximo e custo, agenda por data, privacidade e indicadores', () => {
  const e = makeEnv(seed);
  const t = e.call('login', { login: 'dono@safezone.com', password: 'SenhaForte123' }).data.token;
  const base = { condicao: 'Novo', estoque: 5, status: 'Publicado', fotoPrincipal: photo };
  const mk = (n, extra) => e.call('saveProduct', { ...base, nome: n, requestId: 'q' + n, ...extra }, t).data.id;
  const tec = mk('Teclado X', { categoria: 'Periféricos', subcategoria: 'Teclados', precoNormal: '1200,00', custo: '1000,00' });
  const mou = mk('Mouse Y', { categoria: 'Periféricos', subcategoria: 'Mouses', precoNormal: '100,00', custo: '60,00' });
  const semc = mk('Teclado sem custo', { categoria: 'Periféricos', subcategoria: 'Teclados', precoNormal: '300,00' });
  const gpu = mk('GPU', { categoria: 'Placas de vídeo', precoNormal: '2000,00', custo: '1900,00' });
  assert.equal(e.call('saveProduct', { ...base, nome: 'Z', categoria: 'Periféricos', precoNormal: '10', custo: '-5', requestId: 'zz' }, t).error.code, 'VALIDATION');
  const adm = e.call('listAllProducts', {}, t).data.find(x => x.id === tec);
  assert.equal(adm.margemAtual, 20); assert.equal(adm.precoSugerido, 1200);
  const pub = JSON.stringify(e.call('listProducts').data); assert.ok(!pub.includes('"custo"') && !pub.includes('1000'));       // custo nunca público
  assert.ok(!JSON.stringify(e.call('getSettings').data).includes('_DescontoMaximo'));                                       // regras privadas
  // 30% pedido, mas máximo 10% (exemplo do dono: 1200 -> 1080, ainda acima do custo)
  const o = { nome: 'Semana dos teclados', escopo: 'categoria', categoria: 'Periféricos', subcategoria: 'Teclados', percentual: 30, inicio: '2000-01-01 00:00', fim: '2999-01-01 00:00' };
  const pv = e.call('previewOffer', o, t).data; const it = pv.itens.find(x => x.id === tec);
  assert.deepEqual([it.novoPreco, it.pct, it.limite], [1080, 10, 'desconto máximo']);
  assert.equal(pv.itens.find(x => x.id === semc).motivo, 'sem_custo');           // sem custo: não aplica
  assert.ok(!pv.itens.some(x => x.id === mou));                                    // outra subcategoria fica de fora
  // piso = custo: GPU com custo 1900 e desconto máx 10% (1800) trava em 1900
  const pg = e.call('previewOffer', { ...o, escopo: 'todos', categoria: '', subcategoria: '' }, t).data.itens.find(x => x.id === gpu);
  assert.deepEqual([pg.novoPreco, pg.limite], [1900, 'custo']);
  assert.equal(e.call('saveOffer', { ...o, percentual: 0 }, t).error.code, 'VALIDATION');
  assert.equal(e.call('saveOffer', { ...o, fim: '1999-01-01 00:00' }, t).error.code, 'VALIDATION');
  const sv = e.call('saveOffer', o, t); assert.ok(sv.ok);
  let c = e.call('listProducts').data.find(x => x.id === tec);
  assert.deepEqual([c.precoAtual, c.precoAnterior, c.desconto, c.selo.texto], [1080, 1200, 10, 'OFERTA']);   // aplicada sem editar o produto
  assert.equal(e.call('listProducts').data.find(x => x.id === semc).precoAtual, 300);
  // agenda: oferta futura não vale; pausada não vale
  e.call('saveOffer', { ...o, id: sv.data.id, inicio: '2998-01-01 00:00', fim: '2999-01-01 00:00' }, t);
  e.ctx.CacheService.getScriptCache().remove('pub:list');
  assert.equal(e.call('listProducts').data.find(x => x.id === tec).precoAtual, 1200);
  assert.equal(e.call('listOffers', {}, t).data[0].estado, 'Agendada');
  e.call('saveOffer', { ...o, id: sv.data.id, status: 'Pausada' }, t);
  assert.equal(e.call('listOffers', {}, t).data[0].estado, 'Pausada');
  // promoção manual mais barata vence a oferta
  e.call('saveOffer', { ...o, id: sv.data.id }, t);
  e.call('saveProduct', { ...base, id: tec, nome: 'Teclado X', categoria: 'Periféricos', subcategoria: 'Teclados', precoNormal: '1200,00', precoPromocional: '1050,00', custo: '1000,00', requestId: 'm2' }, t);
  assert.equal(e.call('listProducts').data.find(x => x.id === tec).precoAtual, 1050);
  // regras: só quem tem Configurações altera
  const ven = e.call('login', { login: 'vendas@safezone.com', password: 'Outra12345' }).data.token;
  assert.equal(e.call('savePricingRules', { margem: 25, descMax: 15, margemMin: 0 }, ven).error.code, 'FORBIDDEN');
  assert.equal(e.call('savePricingRules', { margem: 25, descMax: 95, margemMin: 0 }, t).error.code, 'VALIDATION');
  assert.equal(e.call('savePricingRules', { margem: 25, descMax: 15, margemMin: 0 }, t).data.descMax, 15);
  // arte em lote: troca layout/arte mantendo a foto original
  const art = 'https://lh3.googleusercontent.com/d/ARTEARTEART123';
  const sa = e.call('saveProductArt', { id: mou, layoutArte: 'b:hero:portrait', fotoArte: art }, t); assert.ok(sa.ok);
  let m = e.call('listAllProducts', {}, t).data.find(x => x.id === mou);
  assert.equal(m.fotoPrincipal, art); assert.deepEqual(m.fotosAdicionais, [photo]); assert.equal(m.layoutArte, 'b:hero:portrait');
  const art2 = 'https://lh3.googleusercontent.com/d/ARTEARTEART456';
  assert.equal(e.call('saveProductArt', { id: mou, layoutArte: 'b:neon:portrait', fotoArte: art2 }, t).data.antiga, art);
  m = e.call('listAllProducts', {}, t).data.find(x => x.id === mou);
  assert.equal(m.fotoPrincipal, art2); assert.deepEqual(m.fotosAdicionais, [photo]);
  assert.equal(e.call('saveProductArt', { id: mou, fotoArte: 'http://x.com/a.png' }, t).error.code, 'VALIDATION');
  // giro
  e.call('createSale', { idAnuncio: mou, quantidade: 4, valorUnitario: 100, status: 'Venda concluída' }, ven);
  const g = e.call('turnover', {}, t).data;
  assert.equal(g.itens.find(x => x.id === mou).classe, 'Alto giro');
  assert.equal(g.itens.find(x => x.id === gpu).classe, 'Baixo giro');
  assert.equal(g.itens.find(x => x.id === semc).semCusto, true);
});
