import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const Q = createRequire(import.meta.url)('../assets/js/quote.js');
const F = { limite1: 2000, pct1: 20, limite2: 4000, pct2: 30, pct3: 35 };
const mont = { id: 'a', nome: 'Montagem de computador', modo: 'percentual', parte: 100 };
const limp = { id: 'b', nome: 'Limpeza', modo: 'classe', precoLow: 60, precoMid: 80, precoHigh: 120 };
const fmt = { id: 'c', nome: 'Formatação', modo: 'classe', precoLow: null, precoMid: null, precoHigh: null };
const unico = { id: 'd', nome: 'Diagnóstico', modo: 'unico', precoUnico: 50 };
const gpu = (c, p) => ({ nome: 'GPU ' + c, classe: c, preco: p }), cpu = (c, p) => ({ nome: 'CPU ' + c, classe: c, preco: p });

test('faixas de percentual: até 2000 = 20%, até 4000 = 30%, acima = 35%', () => {
  assert.equal(Q.pctFor(1999, F), 20); assert.equal(Q.pctFor(2000, F), 20); assert.equal(Q.pctFor(2001, F), 30);
  assert.equal(Q.pctFor(4000, F), 30); assert.equal(Q.pctFor(4001, F), 35); assert.equal(Q.pctFor(0, F), null);
});
test('montagem = % do valor do PC; limpeza = preço da classe; formatação sem preço fica a combinar', () => {
  const sel = { gpu: gpu('Mid', 1700), cpu: cpu('Mid', 800), ram: { nome: '16', preco: 350, classe: 'Mid' }, mb: { nome: 'mb', preco: 650, classe: 'Mid' } }; // 3500
  const q = Q.build({ services: [mont, limp, fmt], sel, faixas: F });
  assert.equal(q.value, 3500); assert.equal(q.cls, 'Mid'); assert.equal(q.pct, 30);
  assert.equal(q.lines[0].valor, 1050); assert.equal(q.lines[0].aprox, true);
  assert.equal(q.lines[1].valor, 80); assert.equal(q.lines[2].valor, null); assert.equal(q.pending, 1);
  assert.equal(q.total, 1130);
});
test('classe vem da placa de vídeo; sem placa usa o processador', () => {
  assert.equal(Q.pcClass({ gpu: gpu('Low', 1), cpu: cpu('High', 1) }), 'Low');
  assert.equal(Q.pcClass({ cpu: cpu('High', 1), noGpu: true }), 'High');
  assert.equal(Q.pcClass({}), null);
});
test('Não sei minha config: sem valores, mensagem só com os serviços', () => {
  const q = Q.build({ services: [mont, limp, unico], sel: {}, unknown: true, faixas: F });
  assert.equal(q.lines[0].valor, null); assert.equal(q.lines[1].valor, null); assert.equal(q.lines[2].valor, 50);
  const m = Q.message(q, {});
  assert.ok(m.includes('• Montagem de computador') && m.includes('Não sei a configuração') && !m.includes('R$ 1'));
});
test('mensagem com configuração traz soma, peças e faixa', () => {
  const sel = { gpu: gpu('High', 2100), cpu: cpu('High', 1100) }; // 3200 -> 30% -> 960
  const q = Q.build({ services: [mont, limp], sel, faixas: F }), m = Q.message(q, sel);
  assert.equal(q.lines[0].valor, 960); assert.equal(q.total, 960 + 120);
  assert.ok(m.includes('Total estimado') && m.includes('GPU High') && m.includes('High end'));
});
test('sem peças informadas, serviço por percentual pede as peças', () => {
  const q = Q.build({ services: [mont], sel: {}, faixas: F }); assert.equal(q.lines[0].valor, null); assert.match(q.lines[0].motivo, /peças/);
});
