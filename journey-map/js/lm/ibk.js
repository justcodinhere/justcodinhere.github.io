// Innsbruck landmarks on the Christmas walk: the Neuhof with the Goldenes Dachl, the Helblinghaus and the Stadtturm, the
// Ottoburg at the Inn bridge, Dom St. Jakob, the Hofkirche and the Hofburg, and the Bergisel ski jump.
// Builders receive the kit K (js/landmarks.js); local metres round each landmark's footprints.json origin.
const CU = { m: 4, c: '#5b8875', snow: .7, seed: .5 };
const GOLD = { m: 15, c: '#b98a32' };
const DIAL = { m: 12, c: '#2a303a' };
const IRON = { m: 14, c: '#2b2b2d' };
const D = Math.PI / 180;
const lenOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dirOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / D;
// the point t m along a -> b, out m to its right (outwards on a counter-clockwise ring)
function along(a, b, t, out = 0) { const L = lenOf(a, b), ex = (b[0] - a[0]) / L, ey = (b[1] - a[1]) / L; return [a[0] + ex * t + ey * out, a[1] + ey * t - ex * out]; }
function figure(K, x, y, z, h, m) {
  K.lathe(x, y, z, [[h * .17, 0, 1], [h * .16, h * .28], [h * .12, h * .6], [h * .13, h * .72], [h * .06, h * .8], [h * .08, h * .87], [h * .07, h * .96], [0, h]], m, { seg: K.seg(8) });
}
// an open arcade in the wall plane a -> b: n arches (pointed, or round with o.round) between piers pw wide, springing at
// zs, under a band to z1; piers from z0; th thick. The openings are real, so the painted wall behind shows through.
function arcade(K, a, b, z0, zs, z1, n, pw, th, m, o = {}) {
  const L = lenOf(a, b), ow = (L - (n + 1) * pw) / n, pts = [[0, z1], [0, zs]], seg = 6;
  for (let k = 0; k < n; k++) {
    const o0 = pw + k * (ow + pw), o1 = o0 + ow;
    pts.push([o0, zs]);
    for (let i = 1; i < seg; i++) {
      const t = i / seg;
      if (o.round) { const q = Math.PI * (1 - t); pts.push([o0 + ow / 2 + Math.cos(q) * ow / 2, zs + Math.sin(q) * ow / 2]); }
      else if (t <= .5) { const q = t * 2 * Math.PI / 3; pts.push([o1 - Math.cos(q) * ow, zs + Math.sin(q) * ow * .86]); }
      else { const q = (1 - t) * 2 * Math.PI / 3; pts.push([o0 + Math.cos(q) * ow, zs + Math.sin(q) * ow * .86]); }
    }
    pts.push([o1, zs]);
  }
  pts.push([L, zs], [L, z1]);
  K.slab(a, b, pts, th, m, { out: th / 2 });
  for (let k = 0; k <= n; k++) { const p = along(a, b, k * (ow + pw) + pw / 2, 0); K.box(p[0], p[1], pw, th, z0, zs, m, { ang: dirOf(a, b) }); }
}

export default {
  // The Neuhof and its Goldenes Dachl (about 1500, for Emperor Maximilian I): the late-Gothic oriel on the house front,
  // a corbel, two loggias one over the other (coats of arms on the lower balustrade, the figural reliefs of the emperor,
  // his wives and the Moorish dancers on the upper, frescoed walls behind the open arches) under the steep roof of 2,657
  // fire-gilded copper tiles. The Neuhof round it is a plain old-town house of the Inn-Salzach kind: arcades on the
  // street, a straight parapet in front of the roof.
  goldenesDachl(K) {
    const { W, F } = K, rec = K.part('B12848');
    const PL = { m: 2, c: '#e9dccb', t: '#c8b28e', f: F.PLINTH | F.FRAME | F.EAVES, seed: .32 }, ST = { m: 11, c: '#d9cbb0' }, ST2 = { m: 2, c: '#e4d6bc', t: '#b89a68', f: F.FRAME, seed: .77 };
    const FRES = { m: 2, c: '#c59a68', t: '#8f5a3a', f: 0, seed: .4 }, TL = { m: 6, c: '#86452f', snow: .85, seed: .25 }, GILT = { m: 7, c: '#dbab48', snow: 0, seed: .6 };
    // the house: Overture's outline without the oriel, storeys of framed windows, arcades on the street front
    const ring = rec.ring.filter((p, i) => i !== 11 && i !== 12), E = 18.2;
    const zs = [-2, 3.8, 7.6, 11.4, 15, E];
    const isFront = (a, b) => Math.abs(b[1] - a[1]) < 1.5 && (a[1] + b[1]) / 2 < -13 && b[0] > a[0];
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j], b = ring[(j + 1) % ring.length], len = lenOf(a, b), front = isFront(a, b);
      K.storeys(a, b, zs, PL, i => len < 3 ? null : i === 0 ? (front ? { t: W.ARCADE, w: 2.8, y0: -1, y1: 3.2, P: 4.1, m: .8 } : { t: W.RECT, w: 1.2, y0: 1.2, y1: 3, P: 3.4, m: 1 }) : { t: W.RECT, w: 1.2, y0: zs[i] + .9, y1: zs[i + 1] - .7, P: front ? 3.1 : 3.4, m: 1 });
      if (front) {                                         // the straight parapet hiding the roof, with its coping
        K.wall(a, b, E, E + 1.5, PL, { E: E + 1.5 });
        K.box(...along(a, b, len / 2, .05), len + .2, .5, E + 1.5, E + 1.75, ST, { ang: dirOf(a, b) });
      }
    }
    K.band(ring, 3.8, .3, .25, ST);
    K.roof(K.simplify(ring, 1.5), 'hip', E, 6.5, TL, { ang: rec.ang, over: .3 });
    // ---- the oriel ----
    const x0 = 1.17, x1 = 7.48, yf = -14.62, yo = -16.3, zc = 2.9, z1 = 7.2, z2 = 11.5, zr = 15.9, xm = (x0 + x1) / 2;
    const fL = [x0, yo], fR = [x1, yo], bL = [x0, yf], bR = [x1, yf];
    // the corbel: a stone cone of mouldings narrowing down to the arch over the house door
    K.mould([[x0, yf], [x0, yo], [x1, yo], [x1, yf]], [[-1.55, zc - 1.6], [-1.1, zc - 1], [-.35, zc - .45], [0, zc - .2], [0, zc]], ST, { open: true });
    K.cap([fL, fR, bR, bL], zc, ST, { down: 1 });
    // the frescoed house wall behind the loggias
    K.wall([x0, yf - .03], [x1, yf - .03], zc, z2, FRES, { win: { t: W.DOOR_R, w: 1.3, y0: zc + 1.3, y1: zc + 3.6, n: 2, m: 1 }, E: z2 });
    for (const [za, zb, n, round] of [[zc, z1, 3, 1], [z1, z2, 2, 0]]) {
      const zp = za + 1.3;                                 // the balustrade's top
      K.walls([bL, fL, fR, bR], za, zp, ST2, { skip: j => j === 3, win: (j, len) => j === 1 ? { t: za > zc ? W.NICHE : W.BLIND, w: za > zc ? .7 : .55, y0: za + .2, y1: zp - .15, n: za > zc ? 4 : 6, m: .25 } : null });
      K.cap([fL, fR, bR, bL], za, ST, {});
      K.box(xm, (yo + yf) / 2 - .05, x1 - x0 + .1, yf - yo + .1, zp, zp + .14, ST);
      arcade(K, fL, fR, zp + .14, za + (za > zc ? 3.15 : 3.05), za > zc ? z2 - .2 : z1 - .15, n, .36, .3, ST2, { round });
      arcade(K, bL, fL, zp + .14, za + (za > zc ? 3.15 : 3.05), za > zc ? z2 - .2 : z1 - .15, 1, .3, .3, ST2, { round });
      arcade(K, fR, bR, zp + .14, za + (za > zc ? 3.15 : 3.05), za > zc ? z2 - .2 : z1 - .15, 1, .3, .3, ST2, { round });
      K.box(xm, (yo + yf) / 2, x1 - x0 + .1, yf - yo + .1, (za > zc ? z2 : z1) - .2, za > zc ? z2 : z1, ST);
    }
    K.detail(() => {                                       // the painted coats of arms on the lower balustrade
      const cols = ['#a8322a', '#e8e2d4', '#c39a3c', '#2b2b2d', '#a8322a', '#c39a3c'];
      for (let k = 0; k < 6; k++) { const x = x0 + .25 + (k + .5) * (x1 - x0 - .5) / 6; K.box(x, yo - .06, .48, .1, zc + .35, zc + 1, { m: 16, c: cols[k] }); }
      for (let k = 0; k < 2; k++) figure(K, x0 + 1.7 + k * 2.9, (yo + yf) / 2 + .2, z1 + 1.45, 1.55, { m: 16, c: '#6d4b36' });   // figures in the upper loggia
    });
    // the gilt roof: three steep faces falling away from the house front
    const g = (zr - z2) / (yf - yo + .35), rr = [[x0 - .35, yo - .35], [x1 + .35, yo - .35], [x1 + .35, yf], [x0 - .35, yf]];
    const planes = [{ d: [0, -1], g, zt: zr, s0: -yf }, { d: [1, 0], g: g * 1.2, zt: zr, s0: x1 + .35 - (zr - z2) / (g * 1.2) }, { d: [-1, 0], g: g * 1.2, zt: zr, s0: -(x0 - .35 + (zr - z2) / (g * 1.2)) }];
    K.roofPlanes(rr, planes, GILT, {});
    K.detail(() => { K.finial(xm, yf - .25, zr - .15, 1.1, GOLD); for (const x of [x0 - .2, x1 + .2]) K.ball(x, yo - .2, z2 - .1, .12, GOLD); });
  },
  // Helblinghaus: a late-Gothic house dressed in 1730 (Anton Gigl) in the town's richest Rococo stucco: acanthus, shells,
  // fruit garlands and putti in white over every window, the oriels and a curved Baroque gable on the street front.
  helbling(K) {
    const { W, F } = K, r = K.ccw(K.part('B13586').ring);
    const PL = { m: 2, c: '#efe3cb', t: '#fbf8f1', f: F.PLINTH | F.FRAME | F.EAVES, seed: .66 }, WH = { m: 2, c: '#f8f4ea', t: '#fdfbf7', f: F.FRAME, seed: .18 };
    const STU = { m: 11, c: '#f3eee3' }, TL = { m: 6, c: '#8a4934', snow: .85, seed: .7 };
    const E = 17.8, zs = [-2, 4.2, 7.6, 11, 14.4, E];
    for (let j = 0; j < r.length; j++) {
      const a = r[j], b = r[(j + 1) % r.length], len = lenOf(a, b), party = j === 1 || j === 2;   // west and south walls meet the neighbours
      if (party) { K.wall(a, b, -2, E, { ...PL, f: 0 }); continue; }
      K.storeys(a, b, zs, PL, i => len < 3 ? null : i === 0 ? { t: W.ROUND, w: 2.2, y0: .2, y1: 3.4, P: 3.6, m: .8 } : { t: W.RECT, w: 1.1, y0: zs[i] + .9, y1: zs[i + 1] - .8, P: 2.6, m: .9 });
      K.wall(a, b, E, E + 1.2, PL, { E: E + 1.2 });
      for (const z of zs.slice(1)) K.band([a, b], z - .25, .32, .22, STU, { open: true });
      K.detail(() => {                                     // stucco hoods and garlands over the windows
        const n = Math.floor((len - 1.8) / 2.6 + .3);
        if (len > 3) for (let i = 0; i < n; i++) for (const z of zs.slice(1, -1)) { const t = (len - n * 2.6) / 2 + (i + .5) * 2.6, p = along(a, b, t, .1); K.box(p[0], p[1], 1.5, .22, z + 2.45, z + 2.75, STU, { ang: dirOf(a, b) }); K.lathe(...along(a, b, t, .12), z + 2.75, [[.55, 0, 1], [.35, .3], [0, .42]], STU, { n: 4, rot: Math.PI / 4 + dirOf(a, b) * D }); }
      });
    }
    K.roof(r, 'hip', E, 5.5, TL, { ang: 17.83, over: .3 });
    // the curved gable over the street front (east), with a shell niche and urns
    const ia = r.findIndex(p => Math.abs(p[0] - 13.59) < .05), a = r[ia], b = r[(ia + 1) % r.length], L = lenOf(a, b);
    K.slab(along(a, b, .2), along(a, b, L - .2), K.outline.scroll(L - .4, E + .6, 5.6, { top: .4, round: true }), .7, WH, { out: .4, win: { t: W.NICHE, w: 1.2, y0: E + 1.6, y1: E + 4.4, n: 1 } });
    K.detail(() => { for (const t of [.6, L - .6]) { const p = along(a, b, t, .4); K.lathe(p[0], p[1], E + 1.8, [[.25, 0, 1], [.32, .25], [.18, .55], [.22, .75], [0, .95]], STU, { seg: 8 }); } });
    // oriels: on the corner to the Goldenes Dachl and in the middle of the north front, three storeys high
    const corner = [r[(ia + 1) % r.length], r[(ia + 2) % r.length]];
    const nf = [r[(ia + 2) % r.length], r[(ia + 3) % r.length]];
    for (const [a2, b2, s0, w] of [[corner[0], corner[1], -.6, 3.1], [nf[0], nf[1], lenOf(...nf) / 2 - 1.6, 3.2]]) {
      const P = t => along(a2, b2, t, 0), Q = t => along(a2, b2, t, .95);
      const ring2 = [P(s0), Q(s0 + .5), Q(s0 + w - .5), P(s0 + w)];
      for (let j = 0; j < 3; j++) K.storeys(ring2[j], ring2[j + 1], [4.6, 8.05, 11.45, 14.2], WH, (i, len) => ({ t: W.RECT, w: Math.min(1.1, len * .62), y0: [5.5, 8.9, 12.3][i], y1: [7.2, 10.6, 13.6][i], n: 1 }), { E: 14.2 });
      K.cap(ring2, 4.6, STU, { down: 1 });
      K.lathe(...along(a2, b2, s0 + w / 2, .3), 3.4, [[.15, 0, 1], [1.2, 1.2, 1]], STU, { n: 4, rot: Math.PI / 4 + dirOf(a2, b2) * D });
      K.tent([ring2[0], ring2[1], ring2[2], ring2[3]], [...along(a2, b2, s0 + w / 2, .1), 15.9], 14.2, { ...TL, m: 4, c: '#5b8875' }, { open: true, over: .12 });
    }
  },
  // Stadtturm (1442-50): the town tower beside the old Rathaus, 51 m; the gallery at 31 m round the top of its plain
  // shaft, the octagonal clock storey and the Renaissance onion of 1560 with a lantern and a second little onion.
  stadtturm(K) {
    const { W, F } = K, r = K.ccw(K.part('B13566').ring), c = K.part('B13566').c;
    const PL = { m: 2, c: '#e8e1d2', t: '#b2a690', f: F.PLINTH | F.QUOIN | F.STONEFRAME, seed: .51 }, ST = { m: 11, c: '#a99f8e' }, CAP = { m: 11, c: '#b7ae9e' };
    for (let j = 0; j < 4; j++) K.storeys(r[j], r[(j + 1) % 4], [-2, 7, 14, 21, 26.5, 30.6], PL, i => [j === 0 ? { t: W.DOOR_R, w: 1.6, y0: 0, y1: 3.2, n: 1 } : null, { t: W.SLIT, w: .45, y0: 9.5, y1: 11.5, n: 1 }, { t: W.RECT, w: .7, y0: 16.5, y1: 18.3, n: 1 }, { t: W.RECT, w: .8, y0: 22.8, y1: 24.6, n: 1 }, { t: W.ROUND, w: .9, y0: 27.2, y1: 29.6, n: 1 }][i], { E: 30.6 });
    // the gallery: a stone walk corbelled out round the shaft, an iron railing
    const g = K.offset(r, 1.05);
    K.mould(r, [[0, 29.4], [.35, 29.8], [.75, 30.2], [1.05, 30.6], [1.05, 31]], ST);
    K.cap(g, 31, CAP);
    K.detail(() => {
      for (let j = 0; j < 4; j++) { const a = g[j], b = g[(j + 1) % 4], l = lenOf(a, b), n = Math.round(l / .9); for (let i = 0; i < n; i++) { const p = along(a, b, i / n * l, -.05); K.box(p[0], p[1], .06, .06, 31, 32.05, IRON); } }
      K.mould(K.offset(g, -.05), [[-.04, 32], [.04, 32], [.04, 32.1], [-.04, 32.1]], IRON);
    });
    // the octagonal clock storey, the onion, the lantern, the little onion
    const rot = dirOf(r[0], r[1]) * D + Math.PI / 8, R8 = 2.95, V = K.ngon(c[0], c[1], R8, 8, rot);
    K.lathe(c[0], c[1], 31, [[R8, 0, 1], [R8, 9, 1]], PL, { n: 8, rot, wall: 1, win: { t: W.ROUND, w: .85, y0: 32.2, y1: 35, n: 1 } });
    for (const k of [0, 2, 4, 6]) K.clock(V[k], V[k + 1 & 7], lenOf(V[k], V[k + 1 & 7]) / 2, 37.4, .95, DIAL, { out: .1 });
    K.cornice(V, 39.4, .6, .4, CAP);
    K.lathe(c[0], c[1], 40, [[R8 * .97, 0, 1], [R8 * 1.06, .5], [R8 * 1.12, 1.6], [R8 * 1.04, 2.8], [R8 * .8, 4.1], [R8 * .48, 5.3], [R8 * .26, 6.1], [R8 * .2, 6.6]], CU, { seg: K.seg(20) });
    K.lantern(c[0], c[1], 46.6, .8, 2, CU, CU, { n: 6, cap: [[.92, 0, 1], [1, .3], [.85, .8], [.45, 1.3], [.12, 1.7], [.06, 2]], finial: 1.5, finM: GOLD });
  },
  // Ottoburg (first recorded 1476): the late-Gothic tower house at the Inn bridge where the old town began, its fronts
  // stepped out in corbelled oriels towards the river, small windows with red-and-white shutters, a steep tiled roof.
  ottoburg(K) {
    const { W, F } = K, rec = K.part('B13585'), full = K.ccw(rec.ring), base = K.ccw(K.simplify(rec.ring, 2.6));
    const PL = { m: 2, c: '#e7e1d5', t: '#b9ad98', f: F.PLINTH | F.STONEFRAME | F.QUOIN, seed: .27 }, TL = { m: 6, c: '#874430', snow: .85, seed: .48 };
    const RED = { m: 13, c: '#a23d33' }, WHT = { m: 13, c: '#e9e4da' }, CAP = { m: 11, c: '#cfc7b8' };
    const E = 16.8, P = K.planes(full, 'hip', E, 8.5, rec.ang), zs = [4, 7.6, 11, 14.4, E], rows = [[5.3, 6.9], [8.7, 10.3], [12.1, 13.7]];
    const lay = len => len > 1.9 ? { n: len > 6 ? 3 : 1, w: Math.min(1, len * .4) } : null;
    // the ground floor under the corbelled-out oriels, then the storeys round the full stepped outline
    K.walls(base, -2, 4, { ...PL, t: '#b7ab96' }, { win: (j, len) => len > 4 ? { t: W.ROUND, w: 1.6, y0: .2, y1: 2.9, P: 3.6, m: .8 } : null, E: 4 });
    K.cap(full, 4, CAP, { down: 1 });
    for (let j = 0; j < full.length; j++) {
      const a = full[j], b = full[(j + 1) % full.length], len = lenOf(a, b), L = lay(len);
      K.storeys(a, b, zs, PL, i => L && i < 3 ? { t: W.RECT, w: L.w, y0: rows[i][0], y1: rows[i][1], n: L.n, m: .5 } : null, { E });
      if (L) K.detail(() => {                                // red-white-red shutters folded back beside each window
        const Pw = (len - 1) / L.n;
        for (let k = 0; k < L.n; k++) for (const [y0, y1] of rows) for (const sg of [-1, 1]) {
          const t = L.n === 1 ? len / 2 : .5 + (k + .5) * Pw, p = along(a, b, t + sg * (L.w / 2 + .24), .05), dg = dirOf(a, b);
          K.box(p[0], p[1], .44, .07, y0, y1, RED, { ang: dg }); K.box(p[0], p[1], .45, .08, (y0 + y1) / 2 - .17, (y0 + y1) / 2 + .17, WHT, { ang: dg });
        }
      });
    }
    K.roofWalls(full, P, E, PL, { E });
    K.mould(full, [[-.25, 3.4], [0, 4], [0, 4.1]], CAP);
    K.roofPlanes(full, P, TL, { over: .45 });
    K.detail(() => { const c = rec.c; K.lathe(c[0], c[1], E + 6, [[.7, 0, 1], [.7, 2.2, 1]], PL, { n: 6, wall: 1, win: { t: W.BELFRY, w: .35, y0: E + 6.5, y1: E + 7.8, n: 1 } }); K.spire(c[0], c[1], E + 8.2, .85, 3.4, TL, { n: 6 }); });
  },
  // Dom St. Jakob (1717-24, Johann Jakob Herkomer and Johann Georg Fischer): Baroque, warm ochre with white pilasters; the
  // twin towers of the west front with clock storeys, belfries and copper Hauben with lanterns; between them a gabled
  // centre with the portal and St. James; a copper dome on a windowed drum over the choir.
  domIbk(K) {
    const { W, F } = K, rec = K.part('B12877');
    const PL = { m: 2, c: '#e0cba1', t: '#f3ede0', f: F.PLINTH | F.PILASTER | F.EAVES, seed: .4 }, PLT = { m: 2, c: '#dcc79c', t: '#f3ede0', f: F.PLINTH | F.PILASTER | F.QUOIN, seed: .7 };
    const FR = { m: 2, c: '#e2cea5', t: '#f5f0e4', f: F.PILASTER | F.FRAME, seed: .2 }, CAP = { m: 11, c: '#c9bfae' };
    K.at(0, 0, 0, K.fp.ang, () => {
      const body = K.simplify(K.clip(K.local(rec.ring), 1, 0, 27.45), 1);      // the church without its towers
      const P = K.planes(body, 'gable', 21, 9.5, 0, { hw: 10.8, tc: 0 });
      K.roofPlanes(body, P, CU, { over: .5 });
      K.roofWalls(body, P, -2, PL, { E: 21, win: (j, len) => len > 5 ? { t: W.ROUND, w: 2.4, y0: 8, y1: 17.5, P: 6.2, m: 1.4 } : null });
      K.cornice(body, 20.4, .7, .5, { ...PL, f: 0 });
      // the towers: square shafts in storeys, a clock storey, an octagonal belfry, Hauben with lanterns
      const tws = ['P1863', 'P1864'].map(id => K.ccw(K.local(K.part(id).ring)));
      for (const r of tws) {
        const c = [(r[0][0] + r[2][0]) / 2, (r[0][1] + r[2][1]) / 2];
        for (let j = 0; j < 4; j++) K.storeys(r[j], r[(j + 1) % 4], [-2, 8.5, 21, 31, 41], PLT, i => [{ t: W.RECT, w: 1.3, y0: 3, y1: 6, n: 1 }, { t: W.ROUND, w: 1.7, y0: 11, y1: 17.5, n: 1 }, { t: W.ROUND, w: 1.4, y0: 23, y1: 28, n: 1 }, null][i], { E: 41 });
        for (const z of [8.5, 21, 31]) K.band(r, z - .2, .3, .25, CAP);
        for (let j = 0; j < 4; j++) { const a = r[j], b = r[(j + 1) % 4]; K.clock(a, b, lenOf(a, b) / 2, 36, 1.8, DIAL, { out: .15 }); }
        K.cornice(r, 40.4, .7, .55, { ...PLT, f: 0 }); K.cap(r, 41.1, CAP);
        K.lathe(c[0], c[1], 41.1, [[3.9, 0, 1], [3.9, 7.5, 1]], PLT, { n: 8, wall: 1, win: { t: W.BELFRY, w: 1.5, y0: 42.8, y1: 47.6, n: 1 } });
        K.cornice(K.ngon(c[0], c[1], 3.9, 8, Math.PI / 8), 48, .6, .4, CAP);
        K.lathe(c[0], c[1], 48.6, [[3.85, 0, 1], [4.1, .7], [4.35, 2.2], [4.15, 3.9], [3.4, 5.4], [2.2, 6.8], [1.2, 7.9], [.85, 8.6], [.8, 9.4]], CU, { seg: K.seg(20) });
        K.lantern(c[0], c[1], 58, 1.05, 2.8, CU, CU, { n: 6, cap: K.P.onion(1.15, 3.2), finial: 2.2, finM: GOLD });
      }
      // the centre of the west front between the towers: portal, a great window, the gable with St. James
      const yS = Math.max(...tws[1].map(p => p[1])), yN = Math.min(...tws[0].map(p => p[1])), xF = Math.min(...tws[0].map(p => p[0])) + 1.2;
      const a = [xF, yN], b = [xF, yS], L = yN - yS;
      K.storeys(a, b, [-2, 9, 21], FR, i => [{ t: W.DOOR_R, w: 3, y0: 0, y1: 6.2, n: 1 }, { t: W.ROUND, w: 3.2, y0: 11, y1: 18.6, n: 1 }][i], { E: 21 });
      K.walls([a, b, [xF + 3.6, yS], [xF + 3.6, yN]], -2, 21, FR, { skip: j => j === 0 || j === 2 });
      K.cap([a, b, [xF + 3.6, yS], [xF + 3.6, yN]], 21.05, CAP);
      K.cornice([a, b], 20.3, .8, .6, CAP, { open: true });
      K.slab(a, b, K.outline.scroll(L, 21, 9, { top: .42, round: false }), 1.2, FR, { out: .6, win: { t: W.NICHE, w: 1.8, y0: 22.4, y1: 26.6, n: 1 } });
      K.detail(() => {
        const m = along(a, b, L / 2, .3); figure(K, m[0], m[1], 21.9, 2.4, { m: 2, c: '#f1ebdf' });
        K.cross(m[0], m[1], 29.8, 1.4, GOLD, 90);
        for (const t of [.8, L - .8]) { const q = along(a, b, t, .5); figure(K, q[0], q[1], 21.2, 1.8, { m: 2, c: '#efe8da' }); }
      });
      // the dome over the choir on its drum
      const dc = K.local([K.part('P1851').c])[0];
      K.lathe(dc[0], dc[1], 20, [[7.2, 0, 1], [7.2, 9, 1]], PL, { seg: K.seg(24), wall: 1, win: { t: W.ROUND, w: 1.8, y0: 23, y1: 27.5, P: 2 * Math.PI * 7.2 / 8 } });
      K.lathe(dc[0], dc[1], 28.7, [[7.6, 0, 1], [7.6, .6, 1], [7.2, .7, 1]], { ...PL, f: 0 }, { seg: K.seg(24) });
      K.lathe(dc[0], dc[1], 29.4, K.P.dome(7.2, 8.5), CU, { seg: K.seg(24) });
      K.lantern(dc[0], dc[1], 37.6, 1.6, 3.6, PL, CU, { n: 8, cap: K.P.onion(1.7, 3.6), finial: 2.4, finM: GOLD });
    });
  },
  // Hofkirche (1553-63, Andrea Crivelli): built for Maximilian I's cenotaph and its 28 bronze "Schwarze Mander"; a
  // German hall church in Renaissance dress: white, stepped buttresses, tall windows, a three-sided choir, the steep
  // half-hipped slate roof, the Renaissance portico at the entrance, the tower by the choir with a copper onion.
  hofkirche(K) {
    const { W, F } = K, rec = K.part('B13574'), tw = K.part('P1959');
    const PL = { m: 2, c: '#e9e4d8', t: '#d1c6b0', f: F.PLINTH | F.EAVES, seed: .3 }, SL = { m: 5, c: '#4c535a', snow: .85 }, CAP = { m: 11, c: '#bdb4a5' };
    const r = K.ccw(K.simplify(rec.ring, 1.2)), E = 17.5;
    const P = K.planes(r, 'halfhip', E, 14.5, rec.ang, { hw: 10.8, k: .45 });
    K.roofPlanes(r, P, SL, { over: .5 });
    K.roofWalls(r, P, -2, PL, { E, win: (j, len) => len > 6 ? { t: W.LANCET, w: 2.1, y0: 4.5, y1: 15, P: 6.4, m: 1.5, lights: 2 } : len > 3.5 ? { t: W.LANCET, w: 1.8, y0: 4.5, y1: 15, n: 1, lights: 2 } : null });
    K.cornice(r, E - .6, .6, .45, { ...PL, f: 0 });
    // stepped buttresses between the windows on the long sides and round the choir
    K.detail(() => {
      for (let j = 0; j < r.length; j++) {
        const a = r[j], b = r[(j + 1) % r.length], len = lenOf(a, b), deg = dirOf(a, b) - 90;
        if (len < 6) continue;
        const n = Math.floor((len - 3) / 6.4 + .3), m0 = (len - n * 6.4) / 2;
        for (let i = 0; i <= n; i++) { const p = along(a, b, m0 + i * 6.4); K.buttress(p[0], p[1], deg, .9, 1.3, -1, 13.5, PL, { steps: 2 }); }
      }
    });
    // the portico at the north entrance: three round arches on columns under a lean-to roof
    const nA = [12.68, 27.28], nB = [-8.19, 28.37], pa = along(nA, nB, 3.2, 0), pb = along(nA, nB, 17.2, 0), po = [pa, pb, along(nA, nB, 17.2, 4.2), along(nA, nB, 3.2, 4.2)];
    arcade(K, along(nA, nB, 17.2, 4.2), along(nA, nB, 3.2, 4.2), -1, 4.6, 6.4, 3, .7, .55, { ...PL, f: 0 }, { round: 1 });
    arcade(K, along(nA, nB, 3.2, 4.2), pa, -1, 4.6, 6.4, 1, .6, .55, { ...PL, f: 0 }, { round: 1 });
    arcade(K, pb, along(nA, nB, 17.2, 4.2), -1, 4.6, 6.4, 1, .6, .55, { ...PL, f: 0 }, { round: 1 });
    K.roof(K.ccw(po), 'skillion', 6.4, 2.2, SL, { ang: dirOf(nA, nB), over: .3 });
    K.wall(along(nA, nB, 3.2, .06), along(nA, nB, 17.2, .06), -1, 6, { ...PL, f: 0 }, { win: { t: W.DOOR_R, w: 2.6, y0: 0, y1: 4.6, n: 1 } });
    // the tower
    const t = K.offset(K.ccw(K.simplify(tw.ring, .5)), .2), c = tw.c;
    for (let j = 0; j < t.length; j++) K.storeys(t[j], t[(j + 1) % t.length], [-2, 17.5, 27, 33], { ...PL, f: F.PLINTH | F.QUOIN }, i => [null, { t: W.ROUND, w: 1.3, y0: 20, y1: 24.5, n: 1 }, null][i], { E: 33 });
    for (let j = 0; j < t.length; j++) { const a = t[j], b = t[(j + 1) % t.length]; K.clock(a, b, lenOf(a, b) / 2, 30.2, 1.6, DIAL, { out: .12 }); }
    K.cornice(t, 32.4, .6, .45, { ...PL, f: 0 }); K.cap(t, 33, CAP);
    K.lathe(c[0], c[1], 33, [[3.4, 0, 1], [3.4, 5.5, 1]], PL, { n: 8, wall: 1, win: { t: W.BELFRY, w: 1.3, y0: 34, y1: 37.6, n: 1 } });
    K.lathe(c[0], c[1], 38.5, K.P.onion(3.6, 8.5), CU, { seg: K.seg(16) });
    K.lantern(c[0], c[1], 47, .9, 2.4, CU, CU, { n: 6, cap: K.P.onion(1, 2.6), finial: 1.8, finM: GOLD });
  },
  // Hofburg (rebuilt 1754-73 for Maria Theresa): the long Rococo palace front on the Rennweg, four storeys, cream with
  // white pilaster strips and framed windows, a central projection with balcony and pediment, a mansard of dark slate
  // with dormers round two courtyards, the round tower at the north end and the Wappenturm at the south, both under
  // copper domes with lanterns.
  hofburg(K) {
    const { W, F } = K, rec = K.part('B12876');
    const PL = { m: 2, c: '#ebe1cb', t: '#f7f3ea', f: F.PLINTH | F.PILASTER | F.FRAME | F.EAVES, seed: .58 }, CAP = { m: 11, c: '#cfc6b4' };
    const SL = { m: 5, c: '#565b61', snow: .85, seed: .2 };
    const ring = K.ccw(K.simplify(rec.ring, 1.1)), holes = (rec.holes || []).map(h => K.simplify(h, 1.2)).filter(h => h.length > 2);
    const E = 20.5, zs = [-2, 5.8, 10.8, 15.6, E];
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j], b = ring[(j + 1) % ring.length], len = lenOf(a, b);
      K.storeys(a, b, zs, PL, i => len < 3.2 ? null : { t: i === 0 ? W.ROUND : W.RECT, w: i === 0 ? 1.5 : 1.35, y0: [1.4, 6.9, 11.8, 16.4][i], y1: [4.6, 9.9, 14.6, 19][i], P: 3.7, m: 1.2 });
    }
    for (const h of holes) for (let j = 0; j < h.length; j++) K.storeys(h[j], h[(j + 1) % h.length], zs, { ...PL, f: F.FRAME }, i => ({ t: W.RECT, w: 1.3, y0: [1.4, 6.9, 11.8, 16.4][i], y1: [4.6, 9.9, 14.6, 19][i], P: 3.7, m: 1.2 }));
    K.band(ring, 5.8, .35, .3, CAP); K.cornice(ring, E - .8, .8, .65, CAP);
    K.wingRoof(ring, E, 4.2, 6.2, SL, { holes, over: .4 });
    // the central projection on the Rennweg: balcony, pilasters, attic, pediment with the arms
    const ra = [28.07, -9], rb = [28.93, 5.5], RL = lenOf(ra, rb), pr = [ra, along(ra, rb, 0, 1.4), along(ra, rb, RL, 1.4), rb].map(p => p);
    K.storeys(pr[1], pr[2], zs.concat([E + 2.4]), { ...PL, f: F.PILASTER | F.FRAME }, i => i === 4 ? null : { t: i === 0 ? W.DOOR_R : W.ROUND, w: i === 0 ? 2.8 : 1.6, y0: [0, 6.9, 11.8, 16.4][i], y1: [4.8, 10.2, 14.8, 19][i], n: 3, m: 2 });
    K.storeys(pr[0], pr[1], zs.concat([E + 2.4]), PL, null); K.storeys(pr[2], pr[3], zs.concat([E + 2.4]), PL, null);
    K.cap([pr[0], pr[1], pr[2], pr[3]], E + 2.4, CAP);
    K.slab(along(pr[1], pr[2], 1.5), along(pr[1], pr[2], RL - 1.5), [[0, E + 2.2], [RL - 3, E + 2.2], [(RL - 3) / 2, E + 5.6]], .7, PL, { out: .4 });
    K.box(...along(pr[1], pr[2], RL / 2, .6), 6.5, 1.2, 10.4, 10.8, CAP, { ang: dirOf(ra, rb) });                   // the balcony
    K.detail(() => {
      const m = along(pr[1], pr[2], RL / 2, .45); K.box(m[0], m[1], 1.6, .2, E + 2.7, E + 4.4, { m: 16, c: '#b98a32' }, { ang: dirOf(ra, rb) });
      for (const t of [1.2, RL / 2, RL - 1.2]) { const q = along(pr[1], pr[2], t, .3); figure(K, q[0], q[1], E + 2.4, 1.7, { m: 2, c: '#f1ece0' }); }
    });
    // the towers: round at the north end, the Wappenturm at the south
    const nc = [25, 64.8], nr = 5.6, sc = [21.6, -52.6];
    K.lathe(nc[0], nc[1], -2, [[nr, 0, 1], [nr, E + 6.5, 1]], PL, { seg: K.seg(20), wall: 1, win: { t: W.RECT, w: 1.2, y0: E + 1.5, y1: E + 4, P: 3.7 } });
    K.cornice(K.ngon(nc[0], nc[1], nr, K.seg(20)), E + 5.8, .7, .5, CAP);
    K.lathe(nc[0], nc[1], E + 6.5, [[nr, 0, 1], [nr * 1.02, .6], [nr * .9, 2.6], [nr * .6, 4.4], [nr * .3, 5.6], [nr * .2, 6.2]], CU, { seg: K.seg(20) });
    K.lantern(nc[0], nc[1], E + 12.7, 1.1, 2.4, CU, CU, { n: 8, cap: K.P.onion(1.25, 2.8), finial: 1.8, finM: GOLD });
    const st = K.rect(sc[0], sc[1], 8.6, 8.6, 4);
    for (let j = 0; j < 4; j++) K.storeys(st[j], st[(j + 1) % 4], [-2, ...zs.slice(1), E + 7], { ...PL, f: F.PLINTH | F.QUOIN | F.FRAME }, i => ({ t: i === 4 ? W.ROUND : W.RECT, w: 1.3, y0: [1.4, 6.9, 11.8, 16.4, 22][i], y1: [4.6, 9.9, 14.6, 19, 25.8][i], n: 1 }), { E: E + 7 });
    K.cornice(st, E + 6.3, .8, .55, CAP);
    for (let j = 0; j < 4; j++) { const a = st[j], b = st[(j + 1) % 4]; K.clock(a, b, 4.3, E + 4.6, 1.2, DIAL, { out: .12 }); }
    K.lathe(sc[0], sc[1], E + 7, K.P.onion(5, 7.8), CU, { seg: K.seg(20) });
    K.lantern(sc[0], sc[1], E + 14.8, .9, 2.2, CU, CU, { n: 6, cap: K.P.onion(1.05, 2.5), finial: 1.8, finM: GOLD });
  },
  // Bergisel (2002, Zaha Hadid): the slim concrete tower with its cantilevered "cobra head" of glass and steel (cafe and
  // terrace), the inrun bridge falling 35 degrees to the take-off, the steep snowy landing hill of the 1964/1976 Olympic
  // jump and the horseshoe of stands round the outrun. The height map has smoothed the Bergisel away (the drawn ground
  // here is flat), so the hill is modelled too: a wooded, snowy rise carrying the tower 62 m over the arena, the landing
  // hill falling north in its hollow.
  bergisel(K) {
    const C = { m: 10, c: '#c3c5c3', seed: .2 }, C2 = { m: 10, c: '#a9aca9', seed: .6 }, GL = { m: 8, c: '#2e3946' }, STEEL = { m: 10, c: '#8e9397', seed: .35 };
    const SNOW = { m: 11, c: '#e9edf2' }, HILL = { m: 17, c: '#343e30' }, STAND = { m: 10, c: '#a2a6a5', seed: .9 };
    const ax = 96.4 * D, ux = [Math.cos(ax), Math.sin(ax)], vx = [-ux[1], ux[0]];                 // the jump's axis (north, a little west) and across it (west)
    const P = (s, t) => [ux[0] * s + vx[0] * t - 1.2, ux[1] * s + vx[1] * t + 1.5];                 // s along the axis from the head's front, t across
    const sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    const lerpT = (T, s) => { if (s <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (s <= T[i][0]) { const [s0, z0] = T[i - 1], [s1, z1] = T[i], k = (s - s0) / (s1 - s0); return z0 + (z1 - z0) * k; } return T[T.length - 1][1]; };
    // the hill along the axis (m over the drawn ground): plateau round the tower, the knoll, landing slope, transition, outrun
    const AX = [[-240, 0], [-180, 12], [-130, 36], [-85, 56], [-50, 62], [30, 62], [50, 60.5], [62, 58], [70, 55.5], [84, 48.5], [107, 34], [132, 18], [154, 7], [174, 1.5], [194, .35], [300, .35]];
    const H = s => lerpT(AX, s), tc = s => -6.9 * sm((s - 62) / 138), half = s => s < 62 ? 3 : 9 + 10 * sm((s - 62) / 120);
    const lift = (s, t) => {
      const d = Math.abs(t - tc(s)), h = H(s), hw = half(s);
      const side = h + (s > 55 && s < 200 ? 2.5 + 7 * sm((d - hw) / 40) * sm((180 - s) / 60) : 0);   // the woods stand higher than the landing hill
      const lat = 1 - sm((d - 40) / 150);
      return d < hw ? h : Math.max(.35 * sm((300 - s) / 10) * (1 - sm((d - 40) / 8)), (h + (side - h) * sm((d - hw) / 6)) * lat);
    };
    const zAt = (s, t) => { const p = P(s, t), l = lift(s, t); return K.groundAt(p[0], p[1]) + (l > .3 ? l : l - 1.2 * (1 - l / .3)); };
    // the hill: rows across the axis, finer round the landing hill; inside the landing strip it sits a little lower
    const SS = []; for (let s = -240; s <= 300; s += K.lite ? 14 : 10) SS.push(s);
    const TT = [-200, -160, -125, -95, -70, -52, -38, -28, -21, -15, -10, -5, 0, 5, 10, 15, 21, 28, 38, 52, 70, 95, 125, 160, 200];
    const G = SS.map(s => TT.map(t => { const p = P(s, t + tc(s)), d = Math.abs(t), inner = d < half(s) - .8; return [p[0], p[1], zAt(s, t + tc(s)) - (inner ? .7 : 0)]; }));
    for (let i = 0; i < SS.length - 1; i++) for (let k = 0; k < TT.length - 1; k++) {
      const A = G[i][k], B = G[i][k + 1], Cc = G[i + 1][k + 1], Dd = G[i + 1][k];
      K.poly([A, B, Cc], [[0, 0], [1, 0], [1, 1]], HILL); K.poly([A, Cc, Dd], [[0, 0], [1, 1], [0, 1]], HILL);
    }
    // the landing hill: a bright strip from the take-off down through the arena
    const LS = []; for (let s = 62; s <= 292; s += s < 200 ? 6 : 12) LS.push(s);
    const LT = [-1, -.5, 0, .5, 1];
    const LG = LS.map(s => LT.map(f => { const t = tc(s) + f * half(s), p = P(s, t); return [p[0], p[1], K.groundAt(p[0], p[1]) + Math.max(.4, H(s))]; }));
    for (let i = 0; i < LS.length - 1; i++) for (let k = 0; k < LT.length - 1; k++) {
      const A = LG[i][k], B = LG[i][k + 1], Cc = LG[i + 1][k + 1], Dd = LG[i + 1][k];
      K.poly([A, B, Cc], [[0, 0], [1, 0], [1, 1]], SNOW); K.poly([A, Cc, Dd], [[0, 0], [1, 1], [0, 1]], SNOW);
    }
    K.detail(() => {                                         // distance boards along the landing hill, blue and red
      for (const sg of [-1, 1]) for (let s = 80; s < 196; s += 9) {
        const t = tc(s) + sg * (half(s) + .3), p = P(s, t), z = K.groundAt(p[0], p[1]) + Math.max(.4, H(s));
        K.box(p[0], p[1], 3.4, .14, z, z + .9, { m: 16, c: (s / 9 | 0) % 2 ? '#2d4a73' : '#a8322a' }, { ang: 96.4 });
      }
    });
    // the tower on the plateau: a slender shaft, the lifts' glazed slots
    const tcn = P(-16.5, 0), zg = K.groundAt(...tcn) + H(-16.5), zt = zg + 37;
    K.lathe(tcn[0], tcn[1], zg - 4, [[4.2, 0, 1], [3.8, 20, 1], [3.6, zt - zg + 4, 1]], C, { n: 4, rot: (96.4 - 45) * D, wall: 1, win: { t: 8, w: .5, y0: zg + 6, y1: zt - 2, n: 1 } });
    // the head: a long rounded body over the tower, its glass band between curving concrete shells, the terrace on top
    const head = [];
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2, c = Math.cos(a), t = Math.sin(a); head.push(P(-16 + c * 16 * (c > 0 ? 1 : .85), t * (8.4 - 2.5 * Math.max(0, c)))); }
    const hr = K.ccw(head);
    K.lathe(tcn[0], tcn[1], zt - 2.5, [[3.6, 0, 1], [6.5, 2.5, 1]], C2, { n: 4, rot: (96.4 - 45) * D });            // the neck flaring into the head
    K.prism(K.offset(hr, -1.2), zt - .6, zt, C2, { cap: C2 }); K.cap(K.offset(hr, -1.2), zt - .6, C2, { down: 1 });
    K.prism(hr, zt, zt + .9, C, { cap: null }); K.cap(hr, zt, C, { down: 1 });
    K.walls(hr, zt + .9, zt + 6.2, GL);
    K.walls(K.offset(hr, .15), zt + 3.3, zt + 3.65, C);
    K.prism(K.offset(hr, .25), zt + 6.2, zt + 7.3, C, { cap: { m: 11, c: '#d9dcde' } });
    K.detail(() => { const o = K.offset(hr, .1); for (let j = 0; j < o.length; j += 2) K.box(o[j][0], o[j][1], .08, .08, zt + 7.3, zt + 8.4, IRON); K.mould(o, [[-.04, zt + 8.35], [.04, zt + 8.35], [.04, zt + 8.45], [-.04, zt + 8.45]], IRON); });
    // the inrun: a steel-clad bridge from the head down to the take-off, on two concrete legs, its snowy track
    const sT = 62, pT = P(sT, 0), zT = K.groundAt(...pT) + H(sT) + 1.2, zi = zt + 5, i0 = P(-2, 0);
    K.bridge([...i0, zi], [...pT, zT], 4.8, STEEL, { deck: 1.4 });
    K.at(...i0, 0, 96.4, () => {
      const z = s => zi + (zT - zi) * s / (sT + 2);
      K.quad([0, -1.2, zi + .05], [sT + 2, -1.2, zT + .05], [sT + 2, 1.2, zT + .05], [0, 1.2, zi + .05], SNOW, {}, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      K.detail(() => { for (const s of [4, 16, 28, 40, 52]) for (const y of [-2.5, 2.5]) K.box(s, y, .12, .12, z(s), z(s) + 1.1, IRON); });
      for (const s of [26, 48]) { const q = P(s - 2, 0), gz = K.groundAt(...q) + H(s - 2) - K.groundAt(0, 0); K.box(s, 0, 2.2, 2.2, gz - 3, z(s) - 1.4, C2); }
    });
    // the stands: round the Overture horseshoe's inner edge, the seating rising away from the arena
    const inner = [[-26.07, 127.04], [-23.18, 153.93], [-45.99, 283.7], [-42.96, 289.66], [-38.64, 293.65], [-33.68, 296.42], [-28.01, 297.77], [-22.1, 297.93], [-17.93, 296.66], [-14.6, 295.17], [-9.88, 292.43], [-7.91, 288.47], [-6.42, 283.84], [.85, 156.55], [11.47, 133.09]];
    const depth = p => p[1] > 280 ? 15 : p[0] < -15 ? 26 : 17, rise = p => p[1] > 280 ? 9 : p[0] < -15 ? 13 : 9;
    const nrm = inner.map((p, i) => { const a = inner[Math.max(0, i - 1)], b = inner[Math.min(inner.length - 1, i + 1)], l = lenOf(a, b); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; });
    const ground = (x, y) => { const s = (x + 1.2) * ux[0] + (y - 1.5) * ux[1], t = (x + 1.2) * vx[0] + (y - 1.5) * vx[1]; return K.groundAt(x, y) + Math.max(0, lift(s, t)); };
    const IN = inner.map(p => [p[0], p[1], ground(p[0], p[1]) + 1.4]), OUT = inner.map((p, i) => { const q = [p[0] + nrm[i][0] * depth(p), p[1] + nrm[i][1] * depth(p)]; return [q[0], q[1], ground(p[0], p[1]) + rise(p)]; });
    for (let i = 0; i < inner.length - 1; i++) {
      K.poly([IN[i], OUT[i], OUT[i + 1], IN[i + 1]].reverse(), [[0, 0], [0, 20], [20, 20], [20, 0]], STAND, {});
      const g0 = ground(OUT[i][0], OUT[i][1]), g1 = ground(OUT[i + 1][0], OUT[i + 1][1]);
      K.wall([OUT[i][0], OUT[i][1]], [OUT[i + 1][0], OUT[i + 1][1]], [g0 - 3, g1 - 3], [OUT[i][2], OUT[i + 1][2]], STAND);
      K.wall([IN[i + 1][0], IN[i + 1][1]], [IN[i][0], IN[i][1]], [IN[i + 1][2] - 4.4, IN[i][2] - 4.4], [IN[i + 1][2], IN[i][2]], C2);
    }
    // the roof over the main stand on the west side
    const w0 = [inner[1][0] - 28, inner[1][1] + 30], w1 = [inner[2][0] - 26, inner[2][1] - 25], wg = ground(...w0) + 15;
    K.at(...w0, 0, dirOf(w0, w1), () => {
      const L = lenOf(w0, w1);
      K.quad([0, -2, wg], [L, -2, wg], [L, 14, wg - 2.5], [0, 14, wg - 2.5], { m: 4, c: '#8f989c', snow: .8 }, {}, [[0, 16], [L, 16], [L, 0], [0, 0]]);
      for (let s = 0; s <= L; s += 16) K.box(s, -1.5, .5, .5, wg - 15, wg, IRON);
    });
  },
};
