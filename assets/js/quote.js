/* Cálculo do orçamento de serviços. Funções puras: usadas no site e nos testes. */
(function (root, factory) {
  const q = factory();
  if (typeof module === 'object' && module.exports) module.exports = q; else root.SZQuote = q;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const CLASS_LABEL = { Low: 'Low end', Mid: 'Mid end', High: 'High end' };
  const roundTo = (n, step) => Math.round(n / step) * step;

  /** Valor estimado do PC = soma do preço de mercado das peças informadas. */
  function pcValue(sel) {
    return ['gpu', 'cpu', 'ram', 'mb'].reduce((a, k) => a + (sel[k] ? Number(sel[k].preco) || 0 : 0), 0);
  }
  /** Classe do PC: pela placa de vídeo; sem placa dedicada (ou não informada), pelo processador. */
  function pcClass(sel) {
    if (sel.gpu && sel.gpu.classe) return sel.gpu.classe;
    if (sel.cpu && sel.cpu.classe) return sel.cpu.classe;
    return null;
  }
  /** % do serviço conforme o valor do PC (até limite1, até limite2, acima). */
  function pctFor(value, f) {
    if (!(value > 0)) return null;
    return value <= f.limite1 ? f.pct1 : value <= f.limite2 ? f.pct2 : f.pct3;
  }
  /** Preço de um serviço. Retorna {valor|null, aprox, motivo}. */
  function servicePrice(sv, cls, value, f) {
    if (sv.modo === 'unico') return sv.precoUnico != null ? { valor: sv.precoUnico, aprox: false } : { valor: null, motivo: 'a combinar' };
    if (sv.modo === 'classe') {
      const v = cls ? sv['preco' + cls] : null;
      return v != null ? { valor: v, aprox: false } : { valor: null, motivo: cls ? 'a combinar' : 'informe a placa de vídeo ou o processador' };
    }
    const pct = pctFor(value, f);
    if (pct == null) return { valor: null, motivo: 'informe as peças do PC' };
    const parte = sv.parte == null || isNaN(sv.parte) ? 100 : sv.parte;
    return { valor: Math.max(0, roundTo(value * pct / 100 * parte / 100, 10)), aprox: true, pct };
  }
  /** Monta o orçamento completo. config=false → "Não sei minha config" (sem valores). */
  function build(cfg) {
    const { services, sel, unknown, faixas } = cfg;
    const value = pcValue(sel), cls = pcClass(sel), needs = services.some(s => s.modo !== 'unico');
    const hasConfig = !unknown && !!(sel.gpu || sel.cpu || sel.ram || sel.mb || sel.noGpu);
    const lines = services.map(sv => {
      if (unknown && sv.modo !== 'unico') return { sv, valor: null, motivo: 'valor definido no atendimento' };
      return { sv, ...servicePrice(sv, cls, value, faixas) };
    });
    const priced = lines.filter(l => l.valor != null);
    return { lines, value, cls, clsLabel: cls ? CLASS_LABEL[cls] : null, pct: pctFor(value, faixas), needsConfig: needs, hasConfig, unknown: !!unknown,
      total: priced.reduce((a, l) => a + l.valor, 0), pending: lines.length - priced.length, approx: priced.some(l => l.aprox) };
  }
  const brl = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const TYPE_LABEL = { gpu: 'Placa de vídeo', cpu: 'Processador', ram: 'Memória RAM', mb: 'Placa-mãe' };
  /** Texto da mensagem do WhatsApp. */
  function message(q, sel) {
    const L = ['Olá, Safezone! Quero um orçamento de serviços:'];
    q.lines.forEach(l => L.push('• ' + l.sv.nome + (l.valor != null ? ' — ' + (l.aprox ? 'cerca de ' : '') + brl(l.valor) : '')));
    if (q.unknown) {
      L.push('', 'Não sei a configuração do meu computador. Podem me orientar no atendimento?');
    } else if (q.hasConfig) {
      if (q.total > 0) L.push('', (q.approx || q.pending ? 'Total estimado: ' : 'Total: ') + brl(q.total) + (q.pending ? ' (+ itens a combinar)' : ''));
      L.push('', 'Minha configuração:');
      ['gpu', 'cpu', 'ram', 'mb'].forEach(k => { if (sel[k]) L.push('- ' + TYPE_LABEL[k] + ': ' + sel[k].nome); });
      if (sel.noGpu && !sel.gpu) L.push('- Placa de vídeo: integrada / sem placa dedicada');
      if (q.value > 0) L.push('Valor estimado do PC: ' + brl(q.value) + (q.clsLabel ? ' (' + q.clsLabel + ')' : ''));
      L.push('', 'Valores estimados pelo site. Confirmo no atendimento.');
    } else if (q.total > 0) L.push('', 'Total: ' + brl(q.total));
    return L.join('\n');
  }
  return { pcValue, pcClass, pctFor, servicePrice, build, message, CLASS_LABEL, brl };
});
