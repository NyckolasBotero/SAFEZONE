(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const FONT = 'Poppins,"Segoe UI",system-ui,sans-serif';
const NEON = '#39FF14', NEON2 = '#7CFF5B', MUTE = '#A4ADA5', WHITE = '#F4F7F2', INK = '#051005';
const FORMATS = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920], banner: [1200, 628] };
const ACCENTS = [['Roxo', '#A78BFA'], ['Verde', '#7CFF5B'], ['Branco', '#F4F7F2'], ['Azul', '#5AA9FF'], ['Laranja', '#FF9F43']];
const REF = { tall: [1080, 1350], story: [1080, 1920], wide: [1200, 628] };

const DEF = {
  category: 'MICROFONE GAMER', title1: 'Fifine Ampligame', title2: 'AM8 RGB',
  desc: 'Para live, game, podcast e criação de conteúdo.', infoTop: 'FIFINE · AM8',
  sk0: 'Tipo', sv0: 'Dinâmico', sk1: 'Conexão', sv1: 'USB + XLR', sk2: 'Iluminação', sv2: 'RGB', sk3: 'Mute', sv3: 'Por toque',
  priceNormal: '250,00', pricePromo: '', badgeMode: 'auto', badgeCustom: '', condition: '', score: '', conservation: '',
  cta1: 'Peça pelo Instagram', cta2: 'Chame no direct', footerLeft: 'Safezone Store', footerRight: '@safe_zone.store',
  svcTitle: 'Manutenção de computadores', svcSub: 'Seu PC no máximo desempenho',
  svcList: 'Formatação\nLimpeza interna e externa\nManutenção preventiva\nDiagnóstico de problemas\nUpgrade de hardware\nMontagem de computadores',
  svcPrice: '', svcPhone: '+55 61 99437-7971'
};

/* ------------------------------ estado ------------------------------ */
const S = {
  fmt: 'portrait', W: 1080, H: 1350, layout: 'premium', accent: ACCENTS[0][1],
  d: { ...DEF }, photo: { img: null, name: '', zoom: 1, ox: 0, oy: 0 },
  els: [], sel: null, dirty: false, hist: [], hi: -1, guides: [], scale: 1
};
let uid = 1;
const imgCache = {};
const LOGO = new Image(); LOGO.onload = () => render(); LOGO.src = window.__LOGO__;
$('#brandLogo').src = window.__LOGO__;

/* ----------------------------- utilidades ----------------------------- */
function money(v) {
  if (v === '' || v == null) return null;
  let s = String(v).replace(/R\$|\s/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}
const brl = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Mesma regra do backend: desconto só com redução real; preços iguais = só selo. */
function pricing(normal, promo) {
  normal = normal || 0;
  let atual = normal, anterior = null, desconto = 0, selo = '';
  if (promo != null && !isNaN(promo) && promo > 0) {
    if (promo < normal) { atual = promo; anterior = normal; selo = 'OFERTA'; desconto = Math.round((1 - promo / normal) * 100); }
    else if (promo === normal) selo = 'OFERTA';
  }
  return { atual, anterior, desconto: desconto > 0 ? desconto : 0, selo };
}
function vals() {
  const d = S.d, n = money(d.priceNormal), p = money(d.pricePromo);
  const pr = pricing(isNaN(n) ? 0 : n, p);
  let badge = '';
  if (d.badgeMode === 'auto') badge = pr.selo;
  else if (d.badgeMode === 'custom') badge = (d.badgeCustom || '').trim().toUpperCase();
  else if (d.badgeMode !== 'none') badge = d.badgeMode;
  const v = {
    category: d.category.toUpperCase(), title1: d.title1, title2: d.title2, desc: d.desc, infoTop: d.infoTop,
    priceMain: pr.atual > 0 ? brl(pr.atual) : '', priceOld: pr.anterior ? 'R$ ' + brl(pr.anterior) : '',
    discount: pr.desconto ? '-' + pr.desconto + '%' : '', badge,
    cond: d.condition ? d.condition.toUpperCase() : '', score: d.score !== '' && d.score != null ? d.score + '/10' : '',
    conserv: d.conservation, hasCons: (d.conservation || d.score !== '') ? '1' : '',
    cta1: d.cta1, cta2: d.cta2, footerLeft: d.footerLeft, footerRight: d.footerRight,
    svcTitle: d.svcTitle, svcSub: d.svcSub, svcPrice: d.svcPrice ? 'A partir de R$ ' + d.svcPrice : '',
    svcCta: d.svcPhone ? 'Orçamento pelo WhatsApp · ' + d.svcPhone : ''
  };
  for (let i = 0; i < 4; i++) { v['sk' + i] = d['sk' + i]; v['sv' + i] = d['sv' + i]; }
  const svc = String(d.svcList || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < 8; i++) v['svc' + i] = svc[i] || '';
  return v;
}
function hexA(hex, a) {
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800); }
function getImg(src) {
  if (!src) return null;
  if (src === 'logo') return LOGO;
  if (!imgCache[src]) { const i = new Image(); i.onload = () => render(); i.src = src; imgCache[src] = i; }
  return imgCache[src];
}

/* ------------------------- fábrica de elementos ------------------------- */
const E = (type, o) => Object.assign({ id: uid++, type, name: type, x: 0, y: 0, w: 100, h: 100, rot: 0, op: 1, lock: false, hide: false }, o);
const Rr = a => ({ x: a[0], y: a[1], w: a[2], h: a[3] });
const txt = o => E('text', Object.assign({ name: 'Texto', size: 30, weight: 400, color: WHITE, color2: null, align: 'left', valign: 'top', ls: 0, lh: 1.15, fit: true, upper: false, italic: false, text: '', bind: null, dot: null, strike: false, outline: null, ow: 0, nofill: false, nowrap: false }, o));
const rect = o => E('rect', Object.assign({ name: 'Forma', fill: '#000000', fill2: null, ang: 90, r: 0, stroke: null, sw: 0, glow: null, gb: 0 }, o));
const lineEl = o => E('line', Object.assign({ name: 'Linha', c1: WHITE, c2: null, fade: true }, o));
const glowEl = o => E('glow', Object.assign({ name: 'Brilho', c: NEON }, o));
const badgeEl = o => E('badge', Object.assign({ name: 'Selo', bind: 'badge', text: 'OFERTA', color: NEON, style: 'solido', size: 22, weight: 700 }, o));
const photoEl = o => E('photo', Object.assign({ name: 'Foto do produto', r: 28, bc: null, bw: 0, glow: null, gb: 0, blur: 0, dim: 0 }, o));
const imgEl = o => E('image', Object.assign({ name: 'Imagem', src: 'logo' }, o));
const iconEl = o => E('icon', Object.assign({ name: 'Ícone', shape: 'bolt', c: NEON }, o));
const gridEl = o => E('grid', Object.assign({ name: 'Grade', c: NEON, gap: 54 }, o));
const priceEl = o => E('price', Object.assign({ name: 'Preço', size: 120, weight: 700, color: WHITE, color2: null, cur: NEON, align: 'left' }, o));

/* ------------------------- tabelas de regiões ------------------------- */
// FULL: layout 01 (produto premium). Coordenadas no tamanho de referência de cada modo.
const FULL = {
  tall: { logo: [80, 62, 140, 55], info: [560, 84, 440, 30], line1: [80, 156, 920, 2], cat: [80, 203, 440, 30], t1: [80, 248, 440, 165], t2: [80, 415, 440, 85], desc: [80, 500, 440, 80],
    spec: [80, 610, 420, 64], photo: [540, 200, 460, 700], line2: [80, 930, 920, 1], vlabel: [80, 990, 200, 26], price: [80, 1010, 520, 140], old: [190, 985, 300, 34],
    badge: [558, 220, 210, 46], cond: [870, 220, 112, 44], disc: [558, 832, 120, 50], cta1: [600, 1030, 400, 50], cta2: [600, 1090, 400, 34], line3: [80, 1208, 920, 2], fl: [80, 1255, 400, 34], fr: [540, 1255, 460, 34],
    fs: { info: 20, cat: 20, t1: 84, t2: 84, desc: 25, spec: 22, vlabel: 18, price: 120, old: 24, badge: 20, cond: 18, disc: 22, cta1: 36, cta2: 24, f: 24 }, cta: 'right' },
  story: { logo: [70, 90, 150, 59], info: [560, 112, 450, 32], line1: [70, 190, 940, 2], cat: [70, 1020, 940, 30], t1: [70, 1055, 940, 96], t2: [70, 1150, 940, 90], desc: [70, 1250, 940, 64],
    spec: [70, 1330, 940, 50], photo: [70, 225, 940, 760], line2: [70, 1545, 940, 1], vlabel: [70, 1565, 200, 26], price: [70, 1590, 600, 150], old: [210, 1562, 400, 34],
    badge: [95, 250, 300, 62], cond: [830, 250, 155, 52], disc: [95, 905, 150, 56], cta1: [560, 1625, 450, 52], cta2: [560, 1682, 450, 34], line3: [70, 1800, 940, 2], fl: [70, 1830, 450, 34], fr: [500, 1830, 510, 34],
    fs: { info: 22, cat: 22, t1: 84, t2: 84, desc: 26, spec: 24, vlabel: 20, price: 130, old: 26, badge: 24, cond: 20, disc: 26, cta1: 36, cta2: 24, f: 26 }, cta: 'right' },
  wide: { logo: [40, 26, 110, 43], info: [640, 36, 520, 26], line1: [40, 78, 1120, 2], cat: [40, 100, 560, 22], t1: [40, 124, 600, 70], t2: [40, 196, 600, 56], desc: [40, 260, 540, 46],
    spec: [40, 322, 540, 32], photo: [660, 96, 500, 430], line2: [40, 456, 540, 1], vlabel: [40, 466, 150, 20], price: [40, 484, 420, 80], old: [150, 462, 300, 24],
    badge: [676, 112, 220, 46], cond: [1040, 112, 104, 40], disc: [676, 468, 110, 44], cta1: [660, 538, 500, 32], cta2: [660, 566, 500, 22], line3: [40, 584, 1120, 1], fl: [40, 594, 400, 22], fr: [660, 594, 500, 22],
    fs: { info: 15, cat: 15, t1: 54, t2: 46, desc: 17, spec: 18, vlabel: 14, price: 78, old: 18, badge: 18, cond: 15, disc: 18, cta1: 22, cta2: 16, f: 14 }, cta: 'right' }
};
// HERO: layouts 02–05 (foto em destaque, textos centralizados).
const HERO = {
  tall: { logo: [80, 62, 140, 55], info: [560, 84, 440, 30], line1: [80, 156, 920, 2], photo: [120, 190, 840, 560], badge: [90, 185, 330, 64], disc: [790, 185, 170, 64], cond: [440, 762, 200, 36],
    cat: [80, 814, 920, 24], t1: [80, 850, 920, 72], t2: [80, 924, 920, 60], old: [80, 995, 920, 32], price: [80, 1025, 920, 140], cta1: [80, 1185, 920, 44], cta2: [80, 1230, 920, 30],
    line3: [80, 1283, 920, 2], fl: [80, 1298, 440, 26], fr: [540, 1298, 460, 26],
    fs: { info: 20, badge: 28, disc: 30, cond: 18, cat: 20, t1: 72, t2: 56, old: 26, price: 130, cta1: 32, cta2: 22, f: 22 }, al: 'center' },
  story: { logo: [60, 90, 160, 63], info: [560, 112, 460, 34], line1: [60, 190, 960, 2], photo: [60, 230, 960, 860], badge: [80, 250, 380, 76], disc: [780, 250, 200, 76], cond: [380, 1105, 320, 50],
    cat: [60, 1180, 960, 30], t1: [60, 1220, 960, 100], t2: [60, 1320, 960, 84], old: [60, 1450, 960, 40], price: [60, 1495, 960, 190], cta1: [60, 1710, 960, 56], cta2: [60, 1768, 960, 36],
    line3: [60, 1830, 960, 2], fl: [60, 1850, 440, 32], fr: [500, 1850, 520, 32],
    fs: { info: 22, badge: 34, disc: 36, cond: 22, cat: 22, t1: 88, t2: 70, old: 32, price: 170, cta1: 40, cta2: 26, f: 26 }, al: 'center' },
  wide: { logo: [40, 24, 110, 43], info: [700, 36, 460, 26], line1: [40, 78, 1120, 2], photo: [700, 90, 460, 440], badge: [715, 105, 230, 50], disc: [1000, 105, 150, 50], cond: [40, 100, 120, 30],
    cat: [180, 102, 480, 24], t1: [40, 134, 620, 64], t2: [40, 198, 620, 54], old: [40, 268, 600, 30], price: [40, 300, 600, 120], cta1: [40, 445, 600, 36], cta2: [40, 484, 600, 26],
    line3: [40, 560, 1120, 2], fl: [40, 578, 500, 24], fr: [660, 578, 500, 24],
    fs: { info: 15, badge: 20, disc: 22, cond: 14, cat: 16, t1: 52, t2: 44, old: 22, price: 100, cta1: 26, cta2: 18, f: 15 }, al: 'left' }
};
const SVC = {
  tall: { logo: [80, 62, 140, 55], info: [560, 84, 440, 30], line1: [80, 156, 920, 2], cat: [80, 200, 920, 30], t1: [80, 250, 920, 200], sub: [80, 470, 920, 60], list: [80, 580, 920, 66], price: [80, 1005, 920, 50], panel: [80, 1085, 920, 100], cta: [110, 1100, 860, 70], line3: [80, 1230, 920, 2], fl: [80, 1262, 400, 34], fr: [540, 1262, 460, 34],
    fs: { info: 20, cat: 20, t1: 96, sub: 30, row: 32, price: 34, cta: 38, f: 24 }, cols: 1 },
  story: { logo: [70, 90, 150, 59], info: [560, 112, 450, 32], line1: [70, 190, 940, 2], cat: [70, 250, 940, 30], t1: [70, 300, 940, 260], sub: [70, 590, 940, 70], list: [70, 740, 940, 84], price: [70, 1430, 940, 60], panel: [70, 1530, 940, 130], cta: [100, 1550, 880, 90], line3: [70, 1800, 940, 2], fl: [70, 1830, 450, 34], fr: [500, 1830, 510, 34],
    fs: { info: 22, cat: 22, t1: 104, sub: 34, row: 38, price: 38, cta: 42, f: 26 }, cols: 1 },
  wide: { logo: [40, 26, 110, 43], info: [640, 36, 520, 26], line1: [40, 78, 1120, 2], cat: [40, 104, 560, 22], t1: [40, 134, 560, 170], sub: [40, 316, 560, 50], list: [660, 108, 500, 54], price: [40, 396, 560, 36], panel: [40, 450, 560, 90], cta: [60, 462, 520, 66], line3: [40, 584, 1120, 1], fl: [40, 594, 400, 22], fr: [660, 594, 500, 22],
    fs: { info: 15, cat: 15, t1: 52, sub: 21, row: 24, price: 24, cta: 24, f: 14 }, cols: 1 }
};

function geom(W, H) {
  const r = W / H, mode = r >= 1.35 ? 'wide' : r <= 0.65 ? 'story' : 'tall';
  const [rw, rh] = REF[mode], kx = W / rw, ky = H / rh;
  const s = mode === 'tall' ? kx : Math.min(kx, ky);
  const R = a => ({ x: a[0] * kx, y: a[1] * ky, w: a[2] * kx, h: a[3] * ky });
  return { W, H, mode, kx, ky, s, R, acc: S.accent };
}

/* ----------------------------- layouts ----------------------------- */
function bg(g, c1, c2) { return rect({ name: 'Fundo', x: 0, y: 0, w: g.W, h: g.H, fill: c1, fill2: c2 || null, ang: 90, lock: true }); }
function header(g, T, o = {}) {
  const els = [];
  els.push(imgEl({ name: 'Logo Safezone', src: 'logo', ...g.R(T.logo) }));
  els.push(txt({ name: 'Texto do topo', bind: 'infoTop', ...g.R(T.info), size: T.fs.info * g.s, weight: 500, color: MUTE, align: 'right', ls: 4 * g.s, valign: 'middle', upper: true }));
  els.push(lineEl({ name: 'Linha topo', ...g.R(T.line1), c1: g.acc, c2: NEON }));
  return els;
}
function footer(g, T, o = {}) {
  return [
    lineEl({ name: 'Linha rodapé', ...g.R(T.line3), c1: NEON, c2: g.acc, fade: true }),
    txt({ name: 'Rodapé esquerda', bind: 'footerLeft', ...g.R(T.fl), size: T.fs.f * g.s, weight: 300, color: MUTE, ls: 2 * g.s, valign: 'middle' }),
    txt({ name: 'Rodapé direita', bind: 'footerRight', ...g.R(T.fr), size: T.fs.f * g.s, weight: 500, color: o.rightColor || NEON2, align: 'right', valign: 'middle' })
  ];
}
function ctaPair(g, T, align, colors = {}) {
  return [
    txt({ name: 'Chamada', bind: 'cta1', ...g.R(T.cta1), size: T.fs.cta1 * g.s, weight: 700, color: colors.c1 || NEON, align, valign: 'middle' }),
    txt({ name: 'Chamada apoio', bind: 'cta2', ...g.R(T.cta2), size: T.fs.cta2 * g.s, weight: 300, color: MUTE, align, valign: 'middle' })
  ];
}

const LAYOUTS = {
  premium: { name: 'Layout 01', sub: 'Produto premium', build(g) {
    const T = FULL[g.mode], s = g.s, acc = g.acc, els = [];
    els.push(bg(g, '#07080B'));
    const ph = g.R(T.photo);
    els.push(glowEl({ name: 'Brilho roxo', x: ph.x - ph.w * .5, y: ph.y - ph.h * .35, w: ph.w * 2, h: ph.h * 1.7, c: acc, op: .32, lock: true }));
    els.push(glowEl({ name: 'Brilho verde', x: -g.W * .35, y: g.H * .72, w: g.W * 1.1, h: g.H * .6, c: NEON, op: .16, lock: true }));
    els.push(...header(g, T));
    const wide = g.mode === 'wide';
    els.push(txt({ name: 'Categoria', bind: 'category', ...g.R(T.cat), size: T.fs.cat * s, weight: 700, color: NEON, ls: 5 * s, valign: 'middle' }));
    els.push(txt({ name: 'Nome', bind: 'title1', ...g.R(T.t1), size: T.fs.t1 * s, weight: 700, lh: 1.02, color: WHITE }));
    els.push(txt({ name: 'Nome destaque', bind: 'title2', ...g.R(T.t2), size: T.fs.t2 * s, weight: 300, lh: 1.02, color: '#EDE9FE', color2: acc }));
    els.push(txt({ name: 'Descrição', bind: 'desc', ...g.R(T.desc), size: T.fs.desc * s, weight: 300, lh: 1.4, color: MUTE }));
    const [sx, sy, sw, rh] = T.spec, sc = g.mode === 'tall' ? [g.kx, g.ky] : [g.kx, g.ky];
    for (let i = 0; i < 4; i++) {
      const y = sy + rh * i;
      els.push(lineEl({ name: 'Linha ' + (i + 1), ...g.R([sx, y, sw, 1]), c1: WHITE, fade: false, op: .13, showIf: 'sk' + i }));
      els.push(txt({ name: 'Item ' + (i + 1), bind: 'sk' + i, ...g.R([sx, y + 8, sw * .45, rh - 16]), size: T.fs.spec * s, weight: 300, color: MUTE, valign: 'middle' }));
      els.push(txt({ name: 'Valor ' + (i + 1), bind: 'sv' + i, ...g.R([sx + sw * .4, y + 8, sw * .6, rh - 16]), size: T.fs.spec * s, weight: 500, color: WHITE, align: 'right', valign: 'middle', dot: i % 2 ? acc : NEON }));
    }
    els.push(photoEl({ ...ph, r: 28 * s, bc: NEON, bw: 2 * s, glow: acc, gb: 60 * s }));
    els.push(badgeEl({ ...g.R(T.badge), size: T.fs.badge * s, color: NEON }));
    els.push(badgeEl({ name: 'Condição', bind: 'cond', ...g.R(T.cond), size: T.fs.cond * s, color: WHITE, style: 'vidro' }));
    els.push(badgeEl({ name: 'Desconto', bind: 'discount', ...g.R(T.disc), size: T.fs.disc * s, color: acc, style: 'solido' }));
    els.push(lineEl({ name: 'Divisor', ...g.R(T.line2), c1: WHITE, fade: false, op: .13 }));
    els.push(txt({ name: 'Rótulo valor', text: 'VALOR', ...g.R(T.vlabel), size: T.fs.vlabel * s, weight: 600, color: MUTE, ls: 5 * s, valign: 'middle' }));
    els.push(txt({ name: 'Preço anterior', bind: 'priceOld', ...g.R(T.old), size: T.fs.old * s, weight: 400, color: MUTE, strike: true, valign: 'middle', fit: true }));
    els.push(priceEl({ bind: 'priceMain', ...g.R(T.price), size: T.fs.price * s, color: WHITE, color2: '#C4B5FD', cur: NEON }));
    els.push(...ctaPair(g, T, T.cta));
    els.push(...footer(g, T));
    return els;
  } },

  oferta: { name: 'Layout 02', sub: 'Super oferta', build(g) {
    const T = HERO[g.mode], s = g.s, acc = g.acc, al = T.al, els = [];
    els.push(bg(g, '#050605'));
    const ph = g.R(T.photo);
    els.push(glowEl({ name: 'Brilho neon', x: ph.x - ph.w * .35, y: ph.y - ph.h * .3, w: ph.w * 1.7, h: ph.h * 1.6, c: NEON, op: .34, lock: true }));
    for (let i = 0; i < 3; i++) els.push(rect({ name: 'Faixa ' + (i + 1), x: -g.W * .1, y: g.H * (.16 + i * .26), w: g.W * 1.3, h: 26 * s, rot: -12, fill: NEON, op: .07, lock: true }));
    els.push(...header(g, T));
    els.push(photoEl({ ...ph, r: 30 * s, bc: NEON, bw: 3 * s, glow: NEON, gb: 70 * s }));
    const b = g.R(T.badge);
    els.push(badgeEl({ ...b, x: b.x - 6 * s, y: b.y + 10 * s, w: b.w * 1.15, h: b.h * 1.25, size: T.fs.badge * 1.25 * s, rot: -7, color: NEON, glow: true, weight: 800 }));
    els.push(badgeEl({ name: 'Desconto', bind: 'discount', ...g.R(T.disc), size: T.fs.disc * s, color: WHITE, rot: 6, weight: 800 }));
    els.push(badgeEl({ name: 'Condição', bind: 'cond', ...g.R(T.cond), size: T.fs.cond * s, color: WHITE, style: 'contorno' }));
    els.push(txt({ name: 'Categoria', bind: 'category', ...g.R(T.cat), size: T.fs.cat * s, weight: 700, color: NEON, ls: 6 * s, align: al, valign: 'middle' }));
    els.push(txt({ name: 'Nome', bind: 'title1', ...g.R(T.t1), size: T.fs.t1 * s, weight: 800, lh: 1, align: al, color: WHITE, valign: 'middle' }));
    els.push(txt({ name: 'Nome destaque', bind: 'title2', ...g.R(T.t2), size: T.fs.t2 * s, weight: 300, lh: 1, align: al, color: NEON, valign: 'middle' }));
    els.push(txt({ name: 'Preço anterior', bind: 'priceOld', ...g.R(T.old), size: T.fs.old * s, color: WHITE, op: .6, strike: true, align: al, valign: 'middle' }));
    els.push(priceEl({ bind: 'priceMain', ...g.R(T.price), size: T.fs.price * 1.1 * s, weight: 800, color: NEON, color2: NEON2, cur: WHITE, align: al }));
    els.push(...ctaPair(g, T, al, { c1: WHITE }));
    els.push(...footer(g, T));
    return els;
  } },

  seminovo: { name: 'Layout 03', sub: 'Seminovo selecionado', build(g) {
    const T = HERO[g.mode], s = g.s, acc = g.acc, al = T.al, els = [];
    els.push(bg(g, '#0B0D0B', '#151A15'));
    const ph = g.R(T.photo);
    els.push(glowEl({ name: 'Brilho suave', x: ph.x - ph.w * .3, y: ph.y - ph.h * .2, w: ph.w * 1.6, h: ph.h * 1.5, c: acc, op: .2, lock: true }));
    els.push(...header(g, T));
    els.push(photoEl({ ...ph, r: 34 * s, bc: '#F4F7F2', bw: 1.5 * s, glow: null }));
    els.push(badgeEl({ name: 'Selo seminovo', text: 'SEMINOVO SELECIONADO', bind: null, ...g.R(T.badge), size: T.fs.badge * .8 * s, color: NEON, w: g.R(T.badge).w * (g.mode === 'wide' ? 1.08 : 1.45) }));
    els.push(badgeEl({ name: 'Selo promocional', bind: 'badge', ...g.R(T.disc), size: T.fs.disc * .8 * s, color: WHITE, style: 'contorno', w: g.R(T.disc).w * (g.mode === 'wide' ? 1 : 1.2), x: g.R(T.disc).x - (g.mode === 'wide' ? 0 : g.R(T.disc).w * .2) }));
    const pw = ph.w - 56 * s, pxx = ph.x + 28 * s, ph2 = Math.min(ph.h * .24, 150 * s), py = ph.y + ph.h - ph2 - 28 * s;
    els.push(rect({ name: 'Painel conservação', x: pxx, y: py, w: pw, h: ph2, fill: 'rgba(14,17,14,.78)', r: 22 * s, stroke: hexA(NEON, .55), sw: 1.5 * s, showIf: 'hasCons' }));
    els.push(txt({ name: 'Nota', bind: 'score', x: pxx + 22 * s, y: py + 10 * s, w: ph2 * 1.25, h: ph2 - 20 * s, size: ph2 * .55, weight: 800, color: NEON, valign: 'middle', align: 'center' }));
    els.push(txt({ name: 'Rótulo conservação', text: 'ESTADO DE CONSERVAÇÃO', x: pxx + ph2 * 1.45, y: py + ph2 * .16, w: pw - ph2 * 1.6, h: ph2 * .22, size: ph2 * .15, weight: 600, color: MUTE, ls: 3 * s, showIf: 'hasCons' }));
    els.push(txt({ name: 'Conservação', bind: 'conserv', x: pxx + ph2 * 1.45, y: py + ph2 * .4, w: pw - ph2 * 1.6, h: ph2 * .5, size: ph2 * .22, weight: 400, color: WHITE, lh: 1.25 }));
    els.push(badgeEl({ name: 'Condição', bind: 'cond', ...g.R(T.cond), size: T.fs.cond * s, color: NEON, style: 'vidro' }));
    els.push(txt({ name: 'Categoria', bind: 'category', ...g.R(T.cat), size: T.fs.cat * s, weight: 600, color: MUTE, ls: 6 * s, align: al, valign: 'middle' }));
    els.push(txt({ name: 'Nome', bind: 'title1', ...g.R(T.t1), size: T.fs.t1 * s, weight: 600, lh: 1, align: al, color: WHITE, valign: 'middle' }));
    els.push(txt({ name: 'Nome destaque', bind: 'title2', ...g.R(T.t2), size: T.fs.t2 * s, weight: 300, lh: 1, align: al, color: acc, valign: 'middle' }));
    els.push(txt({ name: 'Preço anterior', bind: 'priceOld', ...g.R(T.old), size: T.fs.old * s, color: MUTE, strike: true, align: al, valign: 'middle' }));
    els.push(priceEl({ bind: 'priceMain', ...g.R(T.price), size: T.fs.price * s, color: WHITE, color2: '#E5E7E0', cur: NEON, align: al }));
    els.push(...ctaPair(g, T, al));
    els.push(...footer(g, T));
    return els;
  } },

  gamer: { name: 'Layout 04', sub: 'Setup gamer', build(g) {
    const T = HERO[g.mode], s = g.s, acc = g.acc, al = T.al, els = [];
    els.push(bg(g, '#04060A', '#090D14'));
    els.push(gridEl({ name: 'Grade tech', x: 0, y: 0, w: g.W, h: g.H, c: NEON, gap: 54 * s, op: .07, lock: true }));
    const ph = g.R(T.photo);
    els.push(glowEl({ name: 'Brilho', x: ph.x - ph.w * .4, y: ph.y - ph.h * .3, w: ph.w * 1.8, h: ph.h * 1.6, c: acc, op: .3, lock: true }));
    els.push(rect({ name: 'Linha luminosa 1', x: -g.W * .2, y: g.H * .34, w: g.W * 1.5, h: 5 * s, rot: -16, fill: NEON, glow: NEON, gb: 26 * s, op: .9, lock: true }));
    els.push(rect({ name: 'Linha luminosa 2', x: -g.W * .2, y: g.H * .62, w: g.W * 1.5, h: 3 * s, rot: -16, fill: acc, glow: acc, gb: 22 * s, op: .8, lock: true }));
    els.push(...header(g, T));
    els.push(photoEl({ ...ph, r: 10 * s, bc: NEON, bw: 2.5 * s, glow: NEON, gb: 46 * s }));
    // colchetes de canto
    const k = 46 * s, th = 5 * s, pad = -10 * s;
    [[ph.x + pad, ph.y + pad, 1, 1], [ph.x + ph.w - pad - k, ph.y + pad, -1, 1], [ph.x + pad, ph.y + ph.h - pad - th, 1, -1], [ph.x + ph.w - pad - k, ph.y + ph.h - pad - th, -1, -1]].forEach((c, i) => {
      els.push(rect({ name: 'Canto ' + (i + 1) + 'a', x: c[0], y: c[1], w: k, h: th, fill: NEON }));
      els.push(rect({ name: 'Canto ' + (i + 1) + 'b', x: c[2] > 0 ? c[0] : c[0] + k - th, y: c[3] > 0 ? c[1] : c[1] + th - k, w: th, h: k, fill: NEON }));
    });
    const b = g.R(T.badge);
    els.push(badgeEl({ ...b, size: T.fs.badge * s, color: NEON, rot: -3, style: 'solido' }));
    els.push(badgeEl({ name: 'Desconto', bind: 'discount', ...g.R(T.disc), size: T.fs.disc * s, color: acc, style: 'solido', rot: 3 }));
    els.push(badgeEl({ name: 'Condição', bind: 'cond', ...g.R(T.cond), size: T.fs.cond * s, color: NEON, style: 'contorno' }));
    els.push(txt({ name: 'Categoria', bind: 'category', ...g.R(T.cat), size: T.fs.cat * s, weight: 700, color: NEON, ls: 7 * s, align: al, valign: 'middle' }));
    els.push(txt({ name: 'Nome', bind: 'title1', ...g.R(T.t1), size: T.fs.t1 * s, weight: 800, lh: 1, align: al, color: WHITE, valign: 'middle', upper: true, ls: 1 * s }));
    els.push(txt({ name: 'Nome destaque', bind: 'title2', ...g.R(T.t2), size: T.fs.t2 * s, weight: 800, lh: 1, align: al, color: NEON, color2: acc, valign: 'middle', upper: true }));
    els.push(txt({ name: 'Preço anterior', bind: 'priceOld', ...g.R(T.old), size: T.fs.old * s, color: MUTE, strike: true, align: al, valign: 'middle' }));
    els.push(priceEl({ bind: 'priceMain', ...g.R(T.price), size: T.fs.price * s, weight: 800, color: WHITE, color2: NEON2, cur: NEON, align: al }));
    els.push(...ctaPair(g, T, al));
    els.push(...footer(g, T));
    return els;
  } },

  minimal: { name: 'Layout 05', sub: 'Oferta minimalista', build(g) {
    const T = HERO[g.mode], s = g.s, acc = g.acc, al = T.al, els = [];
    els.push(bg(g, '#080A08'));
    els.push(imgEl({ name: 'Logo Safezone', src: 'logo', ...g.R(T.logo) }));
    els.push(txt({ name: 'Texto do topo', bind: 'infoTop', ...g.R(T.info), size: T.fs.info * s, weight: 400, color: MUTE, align: 'right', ls: 4 * s, valign: 'middle', upper: true }));
    const p0 = g.R(T.photo), inset = 70 * s;
    const ph = g.mode === 'wide' ? { x: p0.x + 40 * s, y: p0.y, w: p0.w - 80 * s, h: p0.h } : { x: p0.x + inset, y: p0.y + 14 * s, w: p0.w - inset * 2, h: p0.h - 28 * s };
    els.push(photoEl({ ...ph, r: 44 * s }));
    const b = g.R(T.badge);
    els.push(badgeEl({ ...b, w: b.w * .8, h: b.h * .7, x: ph.x, y: ph.y + 12 * s, size: T.fs.badge * .7 * s, color: WHITE, style: 'contorno' }));
    els.push(txt({ name: 'Categoria', bind: 'category', ...g.R(T.cat), size: T.fs.cat * .85 * s, weight: 400, color: MUTE, ls: 9 * s, align: al, valign: 'middle' }));
    els.push(txt({ name: 'Nome', bind: 'title1', ...g.R(T.t1), size: T.fs.t1 * .9 * s, weight: 300, lh: 1, align: al, color: WHITE, valign: 'middle' }));
    els.push(txt({ name: 'Nome destaque', bind: 'title2', ...g.R(T.t2), size: T.fs.t2 * .9 * s, weight: 600, lh: 1, align: al, color: WHITE, valign: 'middle' }));
    els.push(txt({ name: 'Preço anterior', bind: 'priceOld', ...g.R(T.old), size: T.fs.old * s, color: MUTE, strike: true, align: al, valign: 'middle' }));
    els.push(priceEl({ bind: 'priceMain', ...g.R(T.price), size: T.fs.price * .85 * s, weight: 300, color: WHITE, cur: MUTE, align: al }));
    els.push(txt({ name: 'Chamada', bind: 'cta1', ...g.R(T.cta1), size: T.fs.cta1 * .7 * s, weight: 400, color: WHITE, align: al, valign: 'middle', ls: 1 * s }));
    els.push(lineEl({ name: 'Linha rodapé', ...g.R(T.line3), c1: WHITE, fade: false, op: .15 }));
    els.push(txt({ name: 'Rodapé direita', bind: 'footerRight', ...g.R(T.fr), size: T.fs.f * s, weight: 400, color: MUTE, align: 'right', valign: 'middle' }));
    els.push(txt({ name: 'Rodapé esquerda', bind: 'footerLeft', ...g.R(T.fl), size: T.fs.f * s, weight: 300, color: MUTE, ls: 2 * s, valign: 'middle' }));
    els.push(rect({ name: 'Ponto neon', x: g.R(T.line3).x, y: g.R(T.line3).y - 3 * s, w: 80 * s, h: 4 * s, fill: NEON, glow: NEON, gb: 14 * s }));
    return els;
  } },

  servicos: { name: 'Layout 06', sub: 'Divulgação de serviços', build(g) {
    const T = SVC[g.mode], s = g.s, acc = g.acc, els = [];
    els.push(bg(g, '#07080B'));
    els.push(glowEl({ name: 'Brilho verde', x: g.W * .35, y: -g.H * .15, w: g.W * .9, h: g.H * .6, c: NEON, op: .16, lock: true }));
    els.push(glowEl({ name: 'Brilho roxo', x: -g.W * .3, y: g.H * .6, w: g.W * 1, h: g.H * .6, c: acc, op: .2, lock: true }));
    els.push(...header(g, T));
    els.push(txt({ name: 'Categoria', text: 'SERVIÇOS DE INFORMÁTICA', ...g.R(T.cat), size: T.fs.cat * s, weight: 700, color: NEON, ls: 5 * s, valign: 'middle' }));
    els.push(txt({ name: 'Título', bind: 'svcTitle', ...g.R(T.t1), size: T.fs.t1 * s, weight: 700, lh: 1.02, color: WHITE, color2: '#C4B5FD' }));
    els.push(txt({ name: 'Subtítulo', bind: 'svcSub', ...g.R(T.sub), size: T.fs.sub * s, weight: 300, color: MUTE, lh: 1.3 }));
    const [lx, ly, lw, rh] = T.list;
    for (let i = 0; i < 8; i++) {
      const wide = g.mode === 'wide', y = ly + rh * i;
      els.push(iconEl({ name: 'Ícone ' + (i + 1), shape: 'check', ...g.R([lx, y + rh * .2, rh * .5, rh * .5]), c: NEON, showIf: 'svc' + i }));
      els.push(txt({ name: 'Serviço ' + (i + 1), bind: 'svc' + i, ...g.R([lx + rh * .8, y, lw - rh * .8, rh * .9]), size: T.fs.row * s, weight: 400, color: WHITE, valign: 'middle', fit: true }));
    }
    els.push(txt({ name: 'Preço inicial', bind: 'svcPrice', ...g.R(T.price), size: T.fs.price * s, weight: 600, color: NEON2, valign: 'middle' }));
    els.push(rect({ name: 'Painel WhatsApp', ...g.R(T.panel), fill: NEON, fill2: NEON2, ang: 0, r: 26 * s, glow: NEON, gb: 36 * s, showIf: 'svcCta' }));
    els.push(txt({ name: 'Contato', bind: 'svcCta', ...g.R(T.cta), size: T.fs.cta * s, weight: 700, color: INK, align: 'center', valign: 'middle' }));
    els.push(...footer(g, T));
    return els;
  } }
};

/* ------------------------------ desenho ------------------------------ */
function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function grad(c, w, h, a, b, ang) {
  const t = (ang || 0) * Math.PI / 180, dx = Math.cos(t), dy = Math.sin(t), L = (Math.abs(w * dx) + Math.abs(h * dy)) / 2, cx = w / 2, cy = h / 2;
  const g = c.createLinearGradient(cx - dx * L, cy - dy * L, cx + dx * L, cy + dy * L); g.addColorStop(0, a); g.addColorStop(1, b); return g;
}
function setFont(c, e, size) {
  c.font = `${e.italic ? 'italic ' : ''}${e.weight} ${size}px ${FONT}`;
  if ('letterSpacing' in c) c.letterSpacing = (e.ls || 0) + 'px';
}
function wrap(c, text, maxW) {
  const out = [];
  String(text).split('\n').forEach(par => {
    const words = par.split(/\s+/).filter(Boolean); if (!words.length) { out.push(''); return; }
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const t = cur + ' ' + words[i];
      if (c.measureText(t).width <= maxW) cur = t; else { out.push(cur); cur = words[i]; }
    }
    out.push(cur);
  });
  return out;
}
function textOf(e, V) { return e.bind ? (V[e.bind] ?? '') : e.text; }
function visible(e, V) { return !e.hide && (!e.showIf || V[e.showIf]); }

const DRAW = {
  rect(c, e) {
    if (e.glow) { c.shadowColor = e.glow; c.shadowBlur = e.gb; }
    c.fillStyle = e.fill2 ? grad(c, e.w, e.h, e.fill, e.fill2, e.ang) : e.fill;
    rr(c, 0, 0, e.w, e.h, e.r); c.fill();
    c.shadowBlur = 0; c.shadowColor = 'transparent';
    if (e.stroke && e.sw > 0) { c.strokeStyle = e.stroke; c.lineWidth = e.sw; rr(c, 0, 0, e.w, e.h, e.r); c.stroke(); }
  },
  glow(c, e) {
    c.translate(e.w / 2, e.h / 2); c.scale(1, e.h / e.w);
    const r = e.w / 2, g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, hexA(e.c, 1)); g.addColorStop(.5, hexA(e.c, .35)); g.addColorStop(1, hexA(e.c, 0));
    c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2);
  },
  line(c, e) {
    if (e.c2) {
      const g = c.createLinearGradient(0, 0, e.w, 0); g.addColorStop(0, e.c1); g.addColorStop(.55, e.c2); g.addColorStop(1, e.fade ? hexA(e.c2, 0) : e.c2); c.fillStyle = g;
    } else c.fillStyle = e.c1;
    c.fillRect(0, 0, e.w, Math.max(1, e.h));
  },
  grid(c, e) {
    c.strokeStyle = e.c; c.lineWidth = Math.max(1, e.gap / 54); c.beginPath();
    for (let x = 0; x <= e.w; x += e.gap) { c.moveTo(x, 0); c.lineTo(x, e.h); }
    for (let y = 0; y <= e.h; y += e.gap) { c.moveTo(0, y); c.lineTo(e.w, y); }
    c.stroke();
  },
  image(c, e) {
    const im = getImg(e.src); if (!im || !im.complete || !im.naturalWidth) return;
    const k = Math.min(e.w / im.naturalWidth, e.h / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k;
    c.imageSmoothingQuality = 'high'; c.drawImage(im, (e.w - w) / 2, (e.h - h) / 2, w, h);
  },
  icon(c, e) {
    const P = { bolt: 'M13 2L4 14h6l-1 8 9-12h-6z', star: 'M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z', shield: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z', check: 'M4 12.5l5 5L20 6.5' };
    c.scale(e.w / 24, e.h / 24);
    const p = new Path2D(P[e.shape] || P.bolt);
    if (e.shape === 'check') { c.strokeStyle = e.c; c.lineWidth = 3.2; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(p); } else { c.fillStyle = e.c; c.fill(p); }
  },
  photo(c, e, ex) {
    const im = S.photo.img;
    if (e.glow) { c.shadowColor = e.glow; c.shadowBlur = e.gb; c.fillStyle = '#0b0d0b'; rr(c, 0, 0, e.w, e.h, e.r); c.fill(); c.shadowBlur = 0; c.shadowColor = 'transparent'; }
    c.save(); rr(c, 0, 0, e.w, e.h, e.r); c.clip();
    if (im) {
      const k = Math.max(e.w / im.naturalWidth, e.h / im.naturalHeight) * S.photo.zoom, w = im.naturalWidth * k, h = im.naturalHeight * k;
      const x = (e.w - w) / 2 + S.photo.ox * e.w, y = (e.h - h) / 2 + S.photo.oy * e.h;
      c.imageSmoothingQuality = 'high';
      if (e.blur && 'filter' in c) c.filter = `blur(${e.blur}px)`;
      c.drawImage(im, x, y, w, h); c.filter = 'none';
    } else if (!ex) {
      c.fillStyle = '#10140f'; c.fillRect(0, 0, e.w, e.h);
      c.strokeStyle = 'rgba(57,255,20,.5)'; c.setLineDash([14, 10]); c.lineWidth = 3; c.strokeRect(14, 14, e.w - 28, e.h - 28); c.setLineDash([]);
      c.fillStyle = MUTE; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `500 ${Math.max(16, Math.min(e.w, e.h) * .055)}px ${FONT}`; c.fillText('Envie a foto do produto', e.w / 2, e.h / 2);
    }
    if (e.dim) { c.fillStyle = `rgba(0,0,0,${e.dim})`; c.fillRect(0, 0, e.w, e.h); }
    c.restore();
    if (e.bc && e.bw > 0) { c.strokeStyle = e.bc; c.lineWidth = e.bw; rr(c, e.bw / 2, e.bw / 2, e.w - e.bw, e.h - e.bw, e.r); c.stroke(); }
  },
  badge(c, e, ex, V) {
    const t = textOf(e, V); if (!t) return;
    const pad = e.h * .45; let size = Math.min(e.size, e.h * .56);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 30; i++) { c.font = `${e.weight} ${size}px ${FONT}`; if ('letterSpacing' in c) c.letterSpacing = size * .06 + 'px'; if (c.measureText(t).width <= e.w - pad * 1.2 || size < 8) break; size *= .94; }
    const lum = (() => { const n = parseInt(e.color.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; })();
    const dark = lum > .55;
    if (e.style === 'solido') {
      if (e.glow || e.color === NEON) { c.shadowColor = hexA(e.color, .7); c.shadowBlur = e.h * .6; }
      c.fillStyle = e.color; rr(c, 0, 0, e.w, e.h, e.h / 2); c.fill(); c.shadowBlur = 0; c.shadowColor = 'transparent';
      c.fillStyle = dark ? INK : '#fff';
    } else if (e.style === 'contorno') {
      c.fillStyle = 'rgba(5,8,5,.55)'; rr(c, 0, 0, e.w, e.h, e.h / 2); c.fill();
      c.strokeStyle = e.color; c.lineWidth = Math.max(2, e.h * .05); rr(c, 1, 1, e.w - 2, e.h - 2, e.h / 2); c.stroke(); c.fillStyle = e.color;
    } else {
      c.fillStyle = hexA(e.color, .16); rr(c, 0, 0, e.w, e.h, e.h / 2); c.fill();
      c.strokeStyle = hexA(e.color, .6); c.lineWidth = Math.max(1.5, e.h * .035); rr(c, 1, 1, e.w - 2, e.h - 2, e.h / 2); c.stroke(); c.fillStyle = e.color;
    }
    c.fillText(t, e.w / 2, e.h / 2 + size * .04);
  },
  price(c, e, ex, V) {
    const t = textOf(e, V) || (e.bind ? '' : e.text); if (!t) return;
    let size = e.size, cs, gap;
    for (let i = 0; i < 40; i++) {
      c.font = `${e.weight} ${size}px ${FONT}`; const nw = c.measureText(t).width;
      c.font = `600 ${size * .36}px ${FONT}`; cs = c.measureText('R$').width; gap = size * .08;
      if (nw + cs + gap <= e.w || size < 10) break; size *= .95;
    }
    c.font = `${e.weight} ${size}px ${FONT}`; const nw = c.measureText(t).width, total = cs + gap + nw;
    const x0 = e.align === 'center' ? (e.w - total) / 2 : e.align === 'right' ? e.w - total : 0;
    const cap = (e.h - size * .72) / 2;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = `600 ${size * .36}px ${FONT}`; c.fillStyle = e.cur; c.fillText('R$', x0, cap + size * .27);
    c.font = `${e.weight} ${size}px ${FONT}`;
    c.fillStyle = e.color2 ? grad(c, nw, size, e.color, e.color2, 20) : e.color;
    c.save(); c.translate(x0 + cs + gap, cap + size * .72); c.fillStyle = e.color2 ? grad(c, nw, size, e.color, e.color2, 20) : e.color;
    c.translate(0, 0); c.fillText(t, 0, 0); c.restore();
  },
  text(c, e, ex, V) {
    let t = textOf(e, V); if (!t) return; if (e.upper) t = String(t).toUpperCase();
    let size = e.size, lines, lh;
    for (let i = 0; i < 45; i++) {
      setFont(c, e, size); lines = e.nowrap ? [String(t).replace(/\n/g, ' ')] : wrap(c, t, e.w); lh = size * e.lh;
      const mw = Math.max(...lines.map(l => c.measureText(l).width));
      if (!e.fit || (lines.length * lh <= e.h + 1 && mw <= e.w + 1) || size < 8) break; size *= .94;
    }
    const th = lines.length * lh, y0 = e.valign === 'middle' ? (e.h - th) / 2 : e.valign === 'bottom' ? e.h - th : 0;
    c.textBaseline = 'middle'; c.textAlign = e.align;
    const gx = e.align === 'center' ? e.w / 2 : e.align === 'right' ? e.w : 0;
    if (e.color2) c.fillStyle = grad(c, e.w, th, e.color, e.color2, 0); else c.fillStyle = e.color;
    lines.forEach((ln, i) => {
      const y = y0 + i * lh + lh / 2;
      if (e.outline && e.ow > 0) { c.strokeStyle = e.outline; c.lineWidth = e.ow; c.lineJoin = 'round'; c.strokeText(ln, gx, y); }
      if (!e.nofill) c.fillText(ln, gx, y);
      const w = c.measureText(ln).width, x1 = e.align === 'center' ? gx - w / 2 : e.align === 'right' ? gx - w : gx;
      if (e.strike) { c.fillStyle = e.color2 ? c.fillStyle : e.color; c.fillRect(x1, y, w, Math.max(2, size * .06)); }
      if (e.dot && i === 0) { c.save(); c.fillStyle = e.dot; c.shadowColor = e.dot; c.shadowBlur = size * .5; c.beginPath(); c.arc(x1 - size * .55, y, size * .14, 0, 7); c.fill(); c.restore(); if (e.color2) c.fillStyle = grad(c, e.w, th, e.color, e.color2, 0); }
    });
  }
};

function drawEl(c, e, ex, V) {
  c.save(); c.globalAlpha = e.op; c.translate(e.x + e.w / 2, e.y + e.h / 2); c.rotate(e.rot * Math.PI / 180); c.translate(-e.w / 2, -e.h / 2);
  try { DRAW[e.type](c, e, ex, V); } finally { c.restore(); }
}
function drawScene(c, ex) {
  const V = vals();
  c.clearRect(0, 0, S.W, S.H);
  for (const e of S.els) if (visible(e, V)) drawEl(c, e, ex, V);
}

const cv = $('#cv'), ov = $('#ov'), box = $('#box'), cc = cv.getContext('2d'), oc = ov.getContext('2d');
let raf = 0;
function render() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; drawScene(cc, false); drawOverlay(); }); }

function corners(e) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, t = e.rot * Math.PI / 180, co = Math.cos(t), si = Math.sin(t);
  const P = (lx, ly) => ({ x: cx + lx * co - ly * si, y: cy + lx * si + ly * co });
  return { cx, cy, P, tl: P(-e.w / 2, -e.h / 2), tr: P(e.w / 2, -e.h / 2), br: P(e.w / 2, e.h / 2), bl: P(-e.w / 2, e.h / 2) };
}
function handleR() { return (matchMedia('(pointer:coarse)').matches ? 26 : 15) / S.scale; }
function handlePts(e) {
  const k = corners(e), off = 38 / S.scale;
  return { resize: k.br, rotate: k.P(0, -e.h / 2 - off), top: k.P(0, -e.h / 2) };
}
function drawOverlay() {
  oc.clearRect(0, 0, S.W, S.H);
  const lw = 2 / S.scale;
  if (S.guides.length) {
    oc.strokeStyle = NEON; oc.lineWidth = lw; oc.setLineDash([10 / S.scale, 8 / S.scale]); oc.beginPath();
    S.guides.forEach(g => { if (g.v != null) { oc.moveTo(g.v, 0); oc.lineTo(g.v, S.H); } else { oc.moveTo(0, g.h); oc.lineTo(S.W, g.h); } });
    oc.stroke(); oc.setLineDash([]);
  }
  const e = cur(); if (!e || e.hide) return;
  const k = corners(e), hp = handlePts(e), hr = handleR() * .55;
  oc.strokeStyle = NEON; oc.lineWidth = lw; oc.beginPath(); oc.moveTo(k.tl.x, k.tl.y); oc.lineTo(k.tr.x, k.tr.y); oc.lineTo(k.br.x, k.br.y); oc.lineTo(k.bl.x, k.bl.y); oc.closePath(); oc.stroke();
  if (e.lock) return;
  oc.beginPath(); oc.moveTo(hp.top.x, hp.top.y); oc.lineTo(hp.rotate.x, hp.rotate.y); oc.stroke();
  oc.fillStyle = '#080A08';
  [hp.resize, hp.rotate].forEach((p, i) => { oc.beginPath(); if (i === 0) oc.rect(p.x - hr, p.y - hr, hr * 2, hr * 2); else oc.arc(p.x, p.y, hr, 0, 7); oc.fill(); oc.stroke(); });
}

/* --------------------------- seleção / histórico --------------------------- */
const cur = () => S.els.find(e => e.id === S.sel) || null;
function snapState() {
  return JSON.stringify({ fmt: S.fmt, W: S.W, H: S.H, layout: S.layout, accent: S.accent, d: S.d, ph: { zoom: S.photo.zoom, ox: S.photo.ox, oy: S.photo.oy }, els: S.els, sel: S.sel, dirty: S.dirty, uid });
}
function commit() {
  const s = snapState(); if (S.hist[S.hi] === s) return;
  S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(s); if (S.hist.length > 100) S.hist.shift(); S.hi = S.hist.length - 1; updUndo();
}
function restore(js) {
  const o = JSON.parse(js);
  Object.assign(S, { fmt: o.fmt, W: o.W, H: o.H, layout: o.layout, accent: o.accent, d: o.d, els: o.els, sel: o.sel, dirty: o.dirty });
  Object.assign(S.photo, o.ph); uid = Math.max(uid, o.uid || 1);
  $('#fmt').value = S.fmt; sizeCanvas(); syncAll();
}
function undo() { if (S.hi > 0) { S.hi--; restore(S.hist[S.hi]); updUndo(); } }
function redo() { if (S.hi < S.hist.length - 1) { S.hi++; restore(S.hist[S.hi]); updUndo(); } }
function updUndo() { $('#bUndo').disabled = S.hi <= 0; $('#bRedo').disabled = S.hi >= S.hist.length - 1; }
function select(id) { S.sel = id; renderLayers(); renderInsp(); render(); }

/* ------------------------------ layout ------------------------------ */
function buildLayout() {
  const g = geom(S.W, S.H);
  const user = S.els.filter(e => e.user);
  const NW = new Set(['Categoria', 'Texto do topo', 'Chamada', 'Chamada apoio', 'Rodapé esquerda', 'Rodapé direita', 'Preço anterior', 'Preço inicial', 'Contato', 'Rótulo valor', 'Rótulo conservação']);
  const built = LAYOUTS[S.layout].build(g);
  built.forEach(e => { if (e.type === 'text' && (NW.has(e.name) || /^(Item|Valor|Serviço) /.test(e.name))) e.nowrap = true; });
  S.els = built.concat(user);
  S.dirty = false;
}
function setLayout(id) {
  if (S.dirty && !confirm('Trocar o layout descarta os ajustes manuais feitos nos elementos do layout atual (elementos que você adicionou são mantidos). Continuar?')) return;
  S.layout = id; buildLayout(); S.sel = null; syncAll(); commit();
}
function setFormat(fmt, w, h) {
  if (S.dirty && !confirm('Mudar o formato reorganiza o layout e descarta ajustes manuais feitos nos elementos do layout (os que você adicionou são mantidos e reposicionados). Continuar?')) { $('#fmt').value = S.fmt; return; }
  const ow = S.W, oh = S.H;
  S.fmt = fmt; S.W = w; S.H = h;
  S.els.filter(e => e.user).forEach(e => { const kx = w / ow, ky = h / oh, k = Math.min(kx, ky); e.x *= kx; e.y *= ky; e.w *= k; e.h *= k; if (e.size) e.size *= k; });
  buildLayout(); sizeCanvas(); S.sel = null; syncAll(); commit();
}
function sizeCanvas() {
  cv.width = ov.width = S.W; cv.height = ov.height = S.H; fitStage();
}
function fitStage() {
  const st = $('#stage'), aw = st.clientWidth - 32, ah = st.clientHeight - 32;
  S.scale = Math.max(.05, Math.min(aw / S.W, ah / S.H));
  box.style.width = S.W * S.scale + 'px'; box.style.height = S.H * S.scale + 'px';
  render();
}
new ResizeObserver(fitStage).observe($('#stage'));

/* ------------------------------ interação ------------------------------ */
let drag = null;
function pt(ev) { const r = ov.getBoundingClientRect(); return { x: (ev.clientX - r.left) * S.W / r.width, y: (ev.clientY - r.top) * S.H / r.height }; }
function hitTest(p) {
  const V = vals();
  for (let i = S.els.length - 1; i >= 0; i--) {
    const e = S.els[i]; if (e.hide || e.lock || !visible(e, V)) continue;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, t = -e.rot * Math.PI / 180, dx = p.x - cx, dy = p.y - cy;
    const lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t);
    if (Math.abs(lx) <= e.w / 2 && Math.abs(ly) <= e.h / 2) return e;
  }
  return null;
}
function markDirty(e) { if (!e.user && !S.dirty) { S.dirty = true; $('#customWarn').hidden = false; } }
function snapMove(e, nx, ny) {
  S.guides = []; if (e.rot) return [nx, ny];
  const th = 9 / S.scale, xs = [[nx, 0], [nx + e.w / 2, e.w / 2], [nx + e.w, e.w]], ys = [[ny, 0], [ny + e.h / 2, e.h / 2], [ny + e.h, e.h]];
  const tx = [0, S.W / 2, S.W], ty = [0, S.H / 2, S.H];
  for (const [v, off] of xs) for (const t of tx) if (Math.abs(v - t) < th) { nx = t - off; S.guides.push({ v: t }); break; }
  for (const [v, off] of ys) for (const t of ty) if (Math.abs(v - t) < th) { ny = t - off; S.guides.push({ h: t }); break; }
  return [nx, ny];
}
ov.addEventListener('pointerdown', ev => {
  if (ev.button > 0) return;
  ov.setPointerCapture(ev.pointerId);
  const p = pt(ev), e = cur();
  if (e && !e.lock && !e.hide) {
    const hp = handlePts(e), hr = handleR();
    if (Math.hypot(p.x - hp.resize.x, p.y - hp.resize.y) < hr) { const k = corners(e); drag = { m: 'resize', e, tl: k.tl, w0: e.w, h0: e.h, moved: false }; return; }
    if (Math.hypot(p.x - hp.rotate.x, p.y - hp.rotate.y) < hr) { drag = { m: 'rotate', e, moved: false }; return; }
  }
  const hit = hitTest(p);
  select(hit ? hit.id : null);
  if (hit) drag = { m: 'move', e: hit, sx: p.x, sy: p.y, ox: hit.x, oy: hit.y, moved: false };
});
ov.addEventListener('pointermove', ev => {
  if (!drag) return;
  const p = pt(ev), e = drag.e; drag.moved = true; markDirty(e);
  if (drag.m === 'move') { [e.x, e.y] = snapMove(e, drag.ox + p.x - drag.sx, drag.oy + p.y - drag.sy); }
  else if (drag.m === 'rotate') {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2; let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
    if (ev.shiftKey || [0, 45, 90, 135, 180, -45, -90, -135, -180].some(t => Math.abs(a - t) < 3)) a = Math.round(a / 15) * 15;
    e.rot = Math.round(a * 10) / 10;
  } else {
    const t = e.rot * Math.PI / 180, co = Math.cos(t), si = Math.sin(t), dx = p.x - drag.tl.x, dy = p.y - drag.tl.y;
    const lx = dx * co + dy * si, ly = -dx * si + dy * co;
    e.w = Math.max(12, lx); e.h = Math.max(8, ly);
    if (e.type === 'image' && !ev.altKey) { const im = getImg(e.src); if (im && im.naturalWidth) e.h = e.w * im.naturalHeight / im.naturalWidth; }
    const cx = drag.tl.x + (e.w / 2) * co - (e.h / 2) * si, cy = drag.tl.y + (e.w / 2) * si + (e.h / 2) * co;
    e.x = cx - e.w / 2; e.y = cy - e.h / 2;
  }
  renderInspValues(); render();
});
const endDrag = () => { if (!drag) return; const moved = drag.moved; drag = null; S.guides = []; render(); if (moved) { commit(); renderInsp(); } };
ov.addEventListener('pointerup', endDrag); ov.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', ev => {
  const tag = (document.activeElement || {}).tagName;
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
  if (mod && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { ev.preventDefault(); redo(); }
  else if (mod && k === 'd') { ev.preventDefault(); dup(); }
  else if ((k === 'delete' || k === 'backspace') && cur()) { ev.preventDefault(); del(); }
  else if (k.startsWith('arrow') && cur() && !cur().lock) {
    ev.preventDefault(); const e = cur(), st = ev.shiftKey ? 10 : 1;
    if (k === 'arrowleft') e.x -= st; if (k === 'arrowright') e.x += st; if (k === 'arrowup') e.y -= st; if (k === 'arrowdown') e.y += st;
    markDirty(e); render(); renderInspValues(); clearTimeout(window.__nt); window.__nt = setTimeout(commit, 350);
  }
});

/* ------------------------------ ações ------------------------------ */
function dup() { const e = cur(); if (!e) return; const n = JSON.parse(JSON.stringify(e)); n.id = uid++; n.x += 24; n.y += 24; n.user = true; n.name = e.name + ' cópia'; S.els.splice(S.els.indexOf(e) + 1, 0, n); S.sel = n.id; refreshPanels(); commit(); }
function del() { const e = cur(); if (!e) return; markDirty(e); S.els = S.els.filter(x => x !== e); S.sel = null; refreshPanels(); commit(); }
function move(dir) { const e = cur(); if (!e) return; const i = S.els.indexOf(e), j = i + dir; if (j < 0 || j >= S.els.length) return; S.els.splice(i, 1); S.els.splice(j, 0, e); markDirty(e); refreshPanels(); commit(); }
function addEl(kind) {
  const W = S.W, H = S.H, k = W / 1080; let e;
  const c = { x: W / 2, y: H / 2 };
  if (kind === 'text') e = txt({ name: 'Texto', text: 'Novo texto', w: 520 * k, h: 90 * k, size: 64 * k, weight: 600, fit: false });
  else if (kind === 'rect') e = rect({ name: 'Forma', w: 360 * k, h: 200 * k, fill: NEON, r: 24 * k });
  else if (kind === 'line') e = lineEl({ name: 'Linha', w: 520 * k, h: 4 * k, c1: NEON, c2: S.accent });
  else if (kind === 'glow') e = glowEl({ name: 'Brilho', w: 700 * k, h: 700 * k, c: NEON, op: .5 });
  else if (kind === 'badge') e = badgeEl({ name: 'Selo', bind: null, text: 'OFERTA', w: 280 * k, h: 70 * k, size: 36 * k });
  else if (kind === 'logo') e = imgEl({ name: 'Logo Safezone', src: 'logo', w: 260 * k, h: 103 * k });
  else if (kind === 'bolt' || kind === 'star' || kind === 'check' || kind === 'shield') e = iconEl({ name: 'Ícone', shape: kind, w: 110 * k, h: 110 * k });
  else if (kind === 'tag') e = txt({ name: 'Etiqueta', text: 'ETIQUETA', w: 300 * k, h: 64 * k, size: 28 * k, weight: 700, color: INK, align: 'center', valign: 'middle', fit: true });
  else if (kind === 'image') { $('#imgFile').click(); return; }
  if (!e) return; e.x = c.x - e.w / 2; e.y = c.y - e.h / 2; e.user = true;
  S.els.push(e); S.sel = e.id; refreshPanels(); commit();
  if (kind === 'tag') { const bgR = rect({ name: 'Fundo etiqueta', x: e.x, y: e.y, w: e.w, h: e.h, fill: NEON, r: e.h / 2, user: true }); S.els.splice(S.els.indexOf(e), 0, bgR); refreshPanels(); commit(); }
}

/* ----------------------------- painéis ----------------------------- */
const ADD = [['text', 'Texto'], ['rect', 'Forma'], ['line', 'Linha'], ['glow', 'Brilho'], ['badge', 'Selo'], ['tag', 'Etiqueta'], ['logo', 'Logo'], ['image', 'Imagem'], ['bolt', '⚡'], ['star', '★'], ['check', '✓'], ['shield', 'Escudo']];
$('#addrow').innerHTML = ADD.map(([k, n]) => `<button class="btn sm" data-add="${k}">${n}</button>`).join('') + '<input type="file" id="imgFile" accept="image/*" hidden>';
$('#addrow').addEventListener('click', ev => { const b = ev.target.closest('[data-add]'); if (b) addEl(b.dataset.add); });
$('#imgFile').addEventListener('change', ev => {
  const f = ev.target.files[0]; if (!f) return; const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 700 / Math.max(im.naturalWidth, im.naturalHeight)), w = im.naturalWidth * k * S.W / 1080, h = im.naturalHeight * k * S.W / 1080;
      imgCache[r.result] = im; const e = imgEl({ name: f.name.slice(0, 24), src: r.result, w, h, x: S.W / 2 - w / 2, y: S.H / 2 - h / 2, user: true }); S.els.push(e); S.sel = e.id; refreshPanels(); commit(); }; im.src = r.result; };
  r.readAsDataURL(f); ev.target.value = '';
});

function renderLayers() {
  const V = vals();
  $('#layers').innerHTML = S.els.slice().reverse().map(e => `
    <div class="layer ${e.id === S.sel ? 'on' : ''} ${e.hide || (e.showIf && !V[e.showIf]) ? 'off' : ''}" data-id="${e.id}">
      <span class="nm">${e.lock ? '🔒 ' : ''}${esc(e.name)}</span>
      <span class="ops"><button data-op="hide" title="Mostrar/ocultar">${e.hide ? '🚫' : '👁'}</button><button data-op="lock" title="Bloquear">${e.lock ? '🔓' : '🔒'}</button></span>
    </div>`).join('') || '<div class="hint">Sem elementos.</div>';
}
$('#layers').addEventListener('click', ev => {
  const row = ev.target.closest('.layer'); if (!row) return; const id = +row.dataset.id, e = S.els.find(x => x.id === id), op = ev.target.closest('[data-op]');
  if (op && e) { if (op.dataset.op === 'hide') e.hide = !e.hide; else e.lock = !e.lock; markDirty(e); commit(); refreshPanels(); return; }
  select(id);
});
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const num = (k, l, step = 1, min, max) => `<label>${l}<input type="number" data-p="${k}" step="${step}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''}></label>`;
const col = (k, l) => `<label>${l}<input type="color" data-p="${k}"></label>`;
function renderInsp() {
  const e = cur(), el = $('#insp');
  if (!e) { el.innerHTML = '<div class="hint">Toque em um elemento da arte (ou na lista de camadas) para editar. Arraste para mover, use o quadrado do canto para redimensionar e a bolinha para girar. Setas movem 1px (Shift = 10px).</div>'; return; }
  let h = `<div class="hint"><b>${esc(e.name)}</b>${e.bind ? ` · ligado ao campo "${e.bind}"` : ''}${e.showIf ? ' · aparece só se o campo tiver valor' : ''}</div>
    <div class="addrow"><button class="btn sm" data-a="dup">Duplicar</button><button class="btn sm" data-a="lock">${e.lock ? 'Desbloquear' : 'Bloquear'}</button><button class="btn sm" data-a="hide">${e.hide ? 'Mostrar' : 'Ocultar'}</button><button class="btn sm" data-a="del">Excluir</button><button class="btn sm" data-a="up">▲ Frente</button><button class="btn sm" data-a="down">▼ Trás</button></div>
    <div class="g2">${num('x', 'X')}${num('y', 'Y')}${num('w', 'Largura')}${num('h', 'Altura')}${num('rot', 'Rotação °')}<label>Opacidade<input type="range" data-p="op" min="0" max="1" step="0.01"></label></div>`;
  if (e.type === 'text') h += `<label>Conteúdo<textarea data-p="text"></textarea></label>${e.bind ? '<div class="hint">Editar aqui desliga o vínculo com o campo do anúncio.</div>' : ''}
    <div class="g2">${num('size', 'Tamanho', 1, 4)}<label>Peso<select data-p="weight"><option>300</option><option>400</option><option>500</option><option>600</option><option>700</option><option>800</option></select></label>
    ${col('color', 'Cor')}${col('color2', 'Cor 2 (degradê)')}<label>Alinhar<select data-p="align"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
    <label>Vertical<select data-p="valign"><option value="top">Topo</option><option value="middle">Meio</option><option value="bottom">Base</option></select></label>${num('ls', 'Espaçamento', 0.5)}${num('lh', 'Entrelinha', 0.05, 0.6, 3)}</div>
    <label class="row">Ajustar ao quadro (sem cortar)<input type="checkbox" data-p="fit"></label><label class="row">Tudo em maiúsculas<input type="checkbox" data-p="upper"></label><label class="row">Itálico<input type="checkbox" data-p="italic"></label><label class="row">Riscado<input type="checkbox" data-p="strike"></label>
    <button class="btn sm" data-a="nograd">Remover degradê</button>`;
  if (e.type === 'price') h += `<div class="g2">${num('size', 'Tamanho', 1, 8)}${col('color', 'Cor do valor')}${col('color2', 'Cor 2')}${col('cur', 'Cor do R$')}</div><div class="hint">O valor vem do campo "Preço" (seção 4).</div>`;
  if (e.type === 'rect') h += `<div class="g2">${col('fill', 'Cor')}${col('fill2', 'Cor 2 (degradê)')}${num('ang', 'Ângulo °')}${num('r', 'Cantos', 1, 0)}${col('stroke', 'Contorno')}${num('sw', 'Espessura', 0.5, 0)}${col('glow', 'Brilho')}${num('gb', 'Intensidade', 1, 0)}</div><button class="btn sm" data-a="nograd">Remover degradê</button> <button class="btn sm" data-a="noglow">Sem brilho</button>`;
  if (e.type === 'line') h += `<div class="g2">${col('c1', 'Cor 1')}${col('c2', 'Cor 2')}</div><label class="row">Esmaecer no fim<input type="checkbox" data-p="fade"></label>`;
  if (e.type === 'glow') h += `<div class="g2">${col('c', 'Cor')}</div>`;
  if (e.type === 'grid') h += `<div class="g2">${col('c', 'Cor')}${num('gap', 'Espaço', 2, 10)}</div>`;
  if (e.type === 'icon') h += `<div class="g2">${col('c', 'Cor')}<label>Ícone<select data-p="shape"><option value="bolt">Raio</option><option value="star">Estrela</option><option value="check">Check</option><option value="shield">Escudo</option></select></label></div>`;
  if (e.type === 'badge') h += `${e.bind ? '<div class="hint">O texto vem do anúncio (seção 4). Digite abaixo para personalizar só esta arte.</div>' : ''}<label>Texto<input type="text" data-p="text" maxlength="30"></label>
    <div class="g2">${col('color', 'Cor')}<label>Estilo<select data-p="style"><option value="solido">Sólido</option><option value="contorno">Contorno</option><option value="vidro">Vidro</option></select></label>${num('size', 'Tamanho', 1, 6)}</div>`;
  if (e.type === 'photo') h += `<div class="g2">${num('r', 'Cantos', 1, 0)}${col('bc', 'Borda')}${num('bw', 'Espessura', 0.5, 0)}${col('glow', 'Brilho')}${num('gb', 'Intensidade', 1, 0)}${num('dim', 'Escurecer', 0.05, 0, 0.9)}</div><div class="hint">Zoom e posição da foto: seção 1.</div>`;
  el.innerHTML = h; renderInspValues();
}
function renderInspValues() {
  const e = cur(); if (!e) return;
  $$('#insp [data-p]').forEach(i => {
    if (document.activeElement === i) return;
    const k = i.dataset.p; let v = e[k];
    if (i.type === 'checkbox') i.checked = !!v;
    else if (i.type === 'color') i.value = /^#[0-9a-f]{6}$/i.test(v || '') ? v : (k === 'color2' || k === 'fill2' || k === 'stroke' || k === 'glow' || k === 'bc' ? '#000000' : '#ffffff');
    else if (k === 'text' && e.bind) i.value = textOf(e, vals());
    else i.value = typeof v === 'number' ? Math.round(v * 100) / 100 : (v ?? '');
  });
}
$('#insp').addEventListener('input', ev => {
  const i = ev.target.closest('[data-p]'), e = cur(); if (!i || !e) return;
  const k = i.dataset.p; let v = i.type === 'checkbox' ? i.checked : i.type === 'number' || i.type === 'range' ? parseFloat(i.value) : i.value;
  if (typeof v === 'number' && isNaN(v)) return;
  if (k === 'weight') v = parseInt(v, 10);
  if (k === 'text' && e.bind) { e.bind = null; }
  e[k] = v; markDirty(e); render(); renderLayers();
});
$('#insp').addEventListener('change', () => commit());
$('#insp').addEventListener('click', ev => {
  const b = ev.target.closest('[data-a]'), e = cur(); if (!b || !e) return; const a = b.dataset.a;
  if (a === 'dup') dup(); else if (a === 'del') del(); else if (a === 'up') move(1); else if (a === 'down') move(-1);
  else if (a === 'lock') { e.lock = !e.lock; refreshPanels(); commit(); } else if (a === 'hide') { e.hide = !e.hide; refreshPanels(); commit(); }
  else if (a === 'nograd') { e.color2 = null; e.fill2 = null; render(); renderInsp(); commit(); } else if (a === 'noglow') { e.glow = null; e.gb = 0; render(); renderInsp(); commit(); }
});
function refreshPanels() { renderLayers(); renderInsp(); render(); $('#customWarn').hidden = !S.dirty; }

/* --------------------------- campos de dados --------------------------- */
function syncData() {
  $$('[data-k]').forEach(i => { if (document.activeElement !== i) i.value = S.d[i.dataset.k] ?? ''; });
  $('#badgeCustomRow').hidden = S.d.badgeMode !== 'custom'; updPriceHint();
}
function updPriceHint() {
  const n = money(S.d.priceNormal), p = money(S.d.pricePromo), h = $('#priceHint');
  if (isNaN(n) || isNaN(p)) { h.innerHTML = '<span style="color:#ff8a8a">Valor inválido. Use o formato 1.299,90</span>'; return; }
  const pr = pricing(n || 0, p);
  if (p != null && p > (n || 0)) h.innerHTML = '<span style="color:#ffb86b">O promocional é maior que o normal: nenhum desconto é exibido.</span>';
  else if (pr.anterior) h.innerHTML = `Mostra <b>R$ ${brl(pr.atual)}</b>, preço anterior R$ ${brl(pr.anterior)} e <b>-${pr.desconto}%</b>.`;
  else if (p != null && p === n) h.innerHTML = 'Preços iguais: aparece só o selo <b>OFERTA</b>, sem percentual.';
  else h.textContent = 'Sem preço promocional: aparece só o preço normal.';
}
$('#dataSec').closest('details').parentElement.addEventListener('input', ev => {
  const i = ev.target.closest('[data-k]'); if (!i) return; S.d[i.dataset.k] = i.value;
  if (i.dataset.k === 'badgeMode') $('#badgeCustomRow').hidden = i.value !== 'custom';
  updPriceHint(); render(); renderLayers();
});
$('.panel.left').addEventListener('change', ev => { if (ev.target.closest('[data-k]')) commit(); });

/* ---------------------------- foto do produto ---------------------------- */
function setPhoto(im, name) {
  S.photo.img = im; S.photo.name = name; S.photo.zoom = 1; S.photo.ox = 0; S.photo.oy = 0; syncPhoto();
  const low = Math.max(im.naturalWidth, im.naturalHeight) < 800;
  $('#photoInfo').innerHTML = `${esc(name)} · ${im.naturalWidth}×${im.naturalHeight}px${low ? '<br><span style="color:#ffb86b">Resolução baixa: a arte pode ficar pouco nítida.</span>' : ''}`;
  render();
}
function loadFile(f) {
  if (!f || !/^image\//.test(f.type)) { toast('Envie um arquivo de imagem (JPG, PNG ou WEBP).'); return; }
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => setPhoto(im, f.name); im.onerror = () => toast('Não foi possível abrir esta imagem.'); im.src = url;
}
$('#bPick').onclick = () => $('#file').click();
$('#file').onchange = ev => { loadFile(ev.target.files[0]); ev.target.value = ''; };
['dragover', 'dragenter'].forEach(t => box.addEventListener(t, ev => { ev.preventDefault(); box.classList.add('drop'); }));
['dragleave', 'drop'].forEach(t => box.addEventListener(t, ev => { ev.preventDefault(); box.classList.remove('drop'); }));
box.addEventListener('drop', ev => loadFile(ev.dataTransfer.files[0]));
function syncPhoto() { $('#pzoom').value = S.photo.zoom; $('#pox').value = S.photo.ox; $('#poy').value = S.photo.oy; }
['pzoom', 'pox', 'poy'].forEach(id => {
  $('#' + id).addEventListener('input', () => { S.photo.zoom = +$('#pzoom').value; S.photo.ox = +$('#pox').value; S.photo.oy = +$('#poy').value; render(); });
  $('#' + id).addEventListener('change', commit);
});

/* ------------------------ layouts / formato / cores ------------------------ */
$('#layouts').innerHTML = Object.entries(LAYOUTS).map(([id, l]) => `<button class="lay" data-lay="${id}"><b>${l.name}</b><small>${l.sub}</small></button>`).join('');
$('#layouts').addEventListener('click', ev => { const b = ev.target.closest('[data-lay]'); if (b && b.dataset.lay !== S.layout) setLayout(b.dataset.lay); });
$('#chips').innerHTML = ACCENTS.map(([n, c]) => `<button class="chip" title="${n}" data-acc="${c}" style="background:${c}"></button>`).join('');
$('#chips').addEventListener('click', ev => {
  const b = ev.target.closest('[data-acc]'); if (!b) return;
  if (S.dirty && !confirm('Trocar a cor de apoio reaplica o layout e descarta ajustes manuais. Continuar?')) return;
  S.accent = b.dataset.acc; buildLayout(); S.sel = null; syncAll(); commit();
});
$('#fmt').addEventListener('change', () => {
  const v = $('#fmt').value; $('#customBox').hidden = v !== 'custom';
  if (v === 'custom') { applyCustom(); return; }
  const [w, h] = FORMATS[v]; setFormat(v, w, h);
});
function applyCustom() {
  const w = Math.max(300, Math.min(4000, +$('#cw').value || 1080)), h = Math.max(300, Math.min(4000, +$('#ch').value || 1080));
  setFormat('custom', w, h);
}
$('#cw').addEventListener('change', applyCustom); $('#ch').addEventListener('change', applyCustom);
$('#bReflow').onclick = () => { if (!confirm('Reaplicar o layout descarta os ajustes manuais nos elementos do layout. Continuar?')) return; buildLayout(); S.sel = null; syncAll(); commit(); };
$('#bUndo').onclick = undo; $('#bRedo').onclick = redo;

function syncAll() {
  $$('.lay').forEach(b => b.classList.toggle('on', b.dataset.lay === S.layout));
  $$('.chip').forEach(b => b.classList.toggle('on', b.dataset.acc === S.accent));
  $('#customBox').hidden = S.fmt !== 'custom'; if (S.fmt === 'custom') { $('#cw').value = S.W; $('#ch').value = S.H; }
  $('#svcDet').open = S.layout === 'servicos' ? true : $('#svcDet').open;
  syncData(); syncPhoto(); refreshPanels(); updUndo();
}

/* ------------------------------ exportar ------------------------------ */
function fileName(ext) { return `safezone-${S.layout}-${S.W}x${S.H}.${ext}`; }
async function exportImg(type) {
  try { await document.fonts.ready; } catch (e) { /* segue */ }
  const c = document.createElement('canvas'); c.width = S.W; c.height = S.H; const x = c.getContext('2d');
  if (type === 'image/jpeg') { x.fillStyle = '#080A08'; x.fillRect(0, 0, S.W, S.H); }
  drawScene(x, true);
  try {
    c.toBlob(b => {
      if (!b) { toast('Falha ao gerar a imagem.'); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName(type === 'image/png' ? 'png' : 'jpg'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Imagem exportada: ' + a.download);
    }, type, .93);
  } catch (e) { toast('Não foi possível exportar: a foto veio de outro site sem permissão. Baixe a foto e envie manualmente.'); }
}
$('#bPng').onclick = () => exportImg('image/png'); $('#bJpg').onclick = () => exportImg('image/jpeg');

/* --------------------------- biblioteca de layouts --------------------------- */
const LIBKEY = 'sz_layouts_v1';
let CLOUD = [];
const inFrame = window.parent !== window;
const toParent = m => { try { window.parent.postMessage(m, location.origin); } catch (e) { /* sem painel */ } };
const lib = { get() { try { return JSON.parse(localStorage.getItem(LIBKEY) || '[]'); } catch (e) { return []; } }, set(v) { try { localStorage.setItem(LIBKEY, JSON.stringify(v)); return true; } catch (e) { toast('Não foi possível salvar neste navegador.'); return false; } } };
function currentSaved(name) { return { id: 'L' + Date.now().toString(36), name, ts: new Date().toISOString(), state: JSON.parse(snapState()) }; }
function renderLib() {
  const l = lib.get();
  const cl = CLOUD.map(c => `<div class="layer" style="grid-template-columns:1fr auto auto"><span class="nm">☁ ${esc(c.nome)} <small style="color:var(--mute)">· ${esc(c.formato || '')} · planilha</small></span><button class="btn sm" data-cload="${esc(c.id)}">Abrir</button><button class="btn sm" data-crm="${esc(c.id)}">Excluir</button></div>`).join('');
  $('#libList').innerHTML = cl + l.map(x => `<div class="layer" style="grid-template-columns:1fr auto auto"><span class="nm">${esc(x.name)} <small style="color:var(--mute)">· ${x.state.W}×${x.state.H}</small></span><button class="btn sm" data-load="${x.id}">Abrir</button><button class="btn sm" data-rm="${x.id}">Excluir</button></div>`).join('') || '<div class="hint">Nenhum layout salvo ainda.</div>';
  if (cl && !l.length) $('#libList').innerHTML = cl;
}
$('#bSave').onclick = () => { $('#dlg').showModal(); renderLib(); $('#saveName').focus(); };
$('#bLib').onclick = () => { $('#dlg').showModal(); renderLib(); };
$('#dlgClose').onclick = () => $('#dlg').close();
$('#saveGo').onclick = () => {
  const n = $('#saveName').value.trim(); if (n.length < 2) { toast('Dê um nome ao layout.'); return; }
  const l = lib.get(), i = l.findIndex(x => x.name === n), item = currentSaved(n); if (i >= 0) { item.id = l[i].id; l[i] = item; } else l.push(item);
  const okLocal = lib.set(l);
  if (okLocal) { toast('Layout salvo: ' + n); $('#saveName').value = ''; renderLib(); }
  if (inFrame) { const ex = CLOUD.find(c => c.nome === n); toParent({ type: 'sz:layout-save', id: ex ? ex.id : undefined, name: n, formato: S.W + 'x' + S.H, state: JSON.parse(snapState()) }); }
};
$('#libList').addEventListener('click', ev => {
  const l = lib.get(), ld = ev.target.closest('[data-load]'), rm = ev.target.closest('[data-rm]');
  if (ld) { const it = l.find(x => x.id === ld.dataset.load); if (it) { restore(JSON.stringify({ ...it.state, uid })); S.hist = []; S.hi = -1; commit(); $('#dlg').close(); toast('Layout aberto: ' + it.name); } }
  const cld = ev.target.closest('[data-cload]'), crm = ev.target.closest('[data-crm]');
  if (cld) { const it = CLOUD.find(x => x.id === cld.dataset.cload); if (it && it.configuracao && it.configuracao.els) { restore(JSON.stringify({ ...it.configuracao, uid })); S.hist = []; S.hi = -1; commit(); $('#dlg').close(); toast('Layout aberto: ' + it.nome); } else toast('Layout inválido.'); }
  if (crm && confirm('Excluir este layout da planilha?')) toParent({ type: 'sz:layout-delete', id: crm.dataset.crm });
  if (rm && confirm('Excluir este layout salvo?')) { lib.set(l.filter(x => x.id !== rm.dataset.rm)); renderLib(); }
});
$('#libExp').onclick = () => { const b = new Blob([JSON.stringify(lib.get(), null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'safezone-layouts.json'; a.click(); };
$('#libImp').onclick = () => $('#libFile').click();
$('#libFile').onchange = ev => {
  const f = ev.target.files[0]; if (!f) return; const r = new FileReader();
  r.onload = () => { try { const arr = JSON.parse(r.result); if (!Array.isArray(arr) || arr.some(x => !x.state || !x.state.els)) throw 0; const cur = lib.get(); lib.set(cur.concat(arr.map(x => ({ ...x, id: 'L' + Math.random().toString(36).slice(2, 8) })))); renderLib(); toast('Layouts importados.'); } catch (e) { toast('Arquivo inválido.'); } };
  r.readAsText(f); ev.target.value = '';
};

/* -------------------- integração com os anúncios cadastrados -------------------- */
const API = {
  applyProduct(p) {
    const w = String(p.nome || '').trim().split(/\s+/);
    const t1 = w.length > 2 ? w.slice(0, -2).join(' ') : p.nome, t2 = w.length > 2 ? w.slice(-2).join(' ') : '';
    const sp = (p.especificacoes || []).slice(0, 4);
    Object.assign(S.d, { category: p.categoria || '', title1: t1 || '', title2: t2, desc: p.descricaoCurta || '', infoTop: [p.marca, p.modelo].filter(Boolean).join(' · ').toUpperCase(),
      priceNormal: p.precoNormal != null ? brl(p.precoNormal) : '', pricePromo: p.precoPromocional != null ? brl(p.precoPromocional) : '',
      condition: p.condicao || '', conservation: p.conservacao || '',
      badgeMode: p.seloModo === 'none' ? 'none' : p.seloModo === 'manual' ? 'custom' : 'auto', badgeCustom: p.seloManual || '' });
    for (let i = 0; i < 4; i++) { S.d['sk' + i] = sp[i] ? sp[i].item : ''; S.d['sv' + i] = sp[i] ? sp[i].valor : ''; }
    if (p.fotoPrincipal) { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => setPhoto(im, p.nome); im.onerror = () => toast('Não foi possível carregar a foto do anúncio. Envie manualmente.'); im.src = /^https:\/\/lh3\.googleusercontent\.com\/d\/[^=]*$/.test(p.fotoPrincipal) ? p.fotoPrincipal + '=w1600' : p.fotoPrincipal; }
    syncData(); render(); renderLayers(); commit();
  },
  setProducts(list) {
    const sel = $('#prodSel'); if (!sel) return;
    sel.innerHTML = '<option value="">Selecione…</option>' + list.map((p, i) => `<option value="${i}">${esc(p.nome)} · ${esc(p.id)}</option>`).join('');
    sel.onchange = () => { if (sel.value !== '') API.applyProduct(list[+sel.value]); };
    $('#prodRow').hidden = false;
  },
  setCloud(list) { CLOUD = Array.isArray(list) ? list : []; if ($('#dlg').open) renderLib(); },
  getState: () => JSON.parse(snapState()), exportPng: () => exportImg('image/png')
};
window.SafezoneEditor = API;
window.addEventListener('message', ev => { if (ev.origin !== location.origin) return; if (ev.data && ev.data.type === 'sz:cloud') API.setCloud(ev.data.layouts); if (ev.data && ev.data.type === 'sz:products') API.setProducts(ev.data.products || []); if (ev.data && ev.data.type === 'sz:product') API.applyProduct(ev.data.product); });

/* ------------------------------ início ------------------------------ */
buildLayout(); sizeCanvas(); syncAll(); commit();
if (document.fonts && document.fonts.load) {
  Promise.all([300, 400, 500, 600, 700, 800].map(w => document.fonts.load(`${w} 40px Poppins`))).then(() => render()).catch(() => {});
}
})();
