// Innsbruck landmarks: Dom St. Jakob, the Hofkirche, the Goldenes Dachl and the Bergisel ski jump.
// Builders receive the kit K (js/landmarks.js); local metres round each landmark's footprints.json origin.
const CU = { m: 4, c: '#5b8875', snow: .7, seed: .5 };
const GOLD = { m: 15, c: '#b98a32' };
const DIAL = { m: 12, c: '#2a303a' };

export default {
  // Dom St. Jakob (1717-24): Baroque, warm ochre with white pilasters; twin west towers with copper Hauben and lanterns,
  // a copper dome on a windowed drum over the crossing, round transept arms, a copper roof.
  domIbk(K) {
    const { W } = K, rec = K.part('B12877');
    const PL = { m: 2, c: '#e2cfa6', t: '#f3ede0', f: 1 | 4 | 32, seed: .4 }, PLT = { m: 2, c: '#dfcca2', t: '#f3ede0', f: 1 | 4 | 16, seed: .7 };
    K.at(0, 0, 0, K.fp.ang, () => {
      const body = K.simplify(K.clip(K.local(rec.ring), 1, 0, 27.45), 1);      // the church without its towers
      const P = K.planes(body, 'gable', 21, 9.5, 0, { hw: 10.8, tc: 0 });
      K.roofPlanes(body, P, CU, { over: .5 });
      K.roofWalls(body, P, -2, PL, { E: 21, win: (j, len) => len > 5 ? { t: W.ROUND, w: 2.4, y0: 8, y1: 17.5, P: 6.2, m: 1.4 } : null });
      K.cornice(body, 20.4, .7, .5, { ...PL, f: 0 });
      // the towers: square shafts with a clock storey, an octagonal bell stage, Hauben with lanterns
      for (const id of ['P1863', 'P1864']) {
        const r = K.local(K.part(id).ring), c = [(r[0][0] + r[2][0]) / 2, (r[0][1] + r[2][1]) / 2];
        for (let j = 0; j < 4; j++) K.storeys(r[j], r[(j + 1) % 4], [-2, 21, 31, 41], PLT, i => [{ t: W.ROUND, w: 1.6, y0: 9, y1: 15, n: 1 }, { t: W.ROUND, w: 1.4, y0: 23, y1: 28, n: 1 }, null][i]);
        for (let j = 0; j < 4; j++) { const a = r[j], b = r[(j + 1) % 4]; K.clock(a, b, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, 36, 1.8, DIAL, { out: .15 }); }
        K.cornice(r, 40.4, .7, .5, { ...PLT, f: 0 }); K.cap(r, 41.1, { m: 11, c: '#a59c8c' });
        K.lathe(c[0], c[1], 41.1, [[3.9, 0, 1], [3.9, 7.5, 1]], PLT, { n: 8, wall: 1, win: { t: W.BELFRY, w: 1.5, y0: 42.8, y1: 47.6, n: 1 } });
        K.lathe(c[0], c[1], 48.6, K.P.onion(4.1, 9.5), CU, { seg: K.seg(18) });
        K.lantern(c[0], c[1], 58.1, 1.05, 2.8, CU, CU, { n: 6, cap: K.P.onion(1.15, 3.2), finial: 2.2, finM: GOLD });
      }
      // crossing dome on its drum
      const dc = K.local([K.part('P1851').c])[0];
      K.lathe(dc[0], dc[1], 20, [[7.2, 0, 1], [7.2, 9, 1]], PL, { seg: K.seg(24), wall: 1, win: { t: W.ROUND, w: 1.8, y0: 23, y1: 27.5, P: 2 * Math.PI * 7.2 / 8 } });
      K.lathe(dc[0], dc[1], 28.7, [[7.6, 0, 1], [7.6, .6, 1], [7.2, .7, 1]], { ...PL, f: 0 }, { seg: K.seg(24) });
      K.lathe(dc[0], dc[1], 29.4, K.P.dome(7.2, 8.5), CU, { seg: K.seg(24) });
      K.lantern(dc[0], dc[1], 37.6, 1.6, 3.6, PL, CU, { n: 8, cap: K.P.onion(1.7, 3.6), finial: 2.4, finM: GOLD });
    });
  },
  // Hofkirche (1553-63): a late-Gothic hall church, white, under a steep slate roof; its Renaissance tower carries a
  // copper onion with a lantern.
  hofkirche(K) {
    const { W } = K, rec = K.part('B13574'), tw = K.part('P1959');
    const PL = { m: 2, c: '#e8e3d7', t: '#d3c8b2', f: 1 | 32, seed: .3 }, SL = { m: 5, c: '#4c535a', snow: .85 };
    const r = K.simplify(rec.ring, 1.2);
    const P = K.planes(r, 'hip', 17.5, 14.5, rec.ang, { hw: 10.8 });
    K.roofPlanes(r, P, SL, { over: .5 });
    K.roofWalls(r, P, -2, PL, { E: 17.5, win: (j, len) => len > 6 ? { t: W.LANCET, w: 2.1, y0: 4.5, y1: 15, P: 6.4, m: 1.5, lights: 2 } : null });
    const t = K.offset(K.simplify(tw.ring, .5), .2), c = tw.c;
    for (let j = 0; j < t.length; j++) K.storeys(t[j], t[(j + 1) % t.length], [-2, 17.5, 27, 33], PL, i => [null, { t: W.ROUND, w: 1.3, y0: 20, y1: 24.5, n: 1 }, null][i]);
    for (let j = 0; j < t.length; j++) { const a = t[j], b = t[(j + 1) % t.length]; K.clock(a, b, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, 30.2, 1.6, DIAL, { out: .12 }); }
    K.cornice(t, 32.4, .6, .45, { ...PL, f: 0 }); K.cap(t, 33, { m: 11, c: '#a59c8c' });
    K.lathe(c[0], c[1], 33, [[3.4, 0, 1], [3.4, 5.5, 1]], PL, { n: 8, wall: 1, win: { t: W.BELFRY, w: 1.3, y0: 34, y1: 37.6, n: 1 } });
    K.lathe(c[0], c[1], 38.5, K.P.onion(3.6, 8.5), CU, { seg: K.seg(16) });
    K.lantern(c[0], c[1], 47, .9, 2.4, CU, CU, { n: 6, cap: K.P.onion(1, 2.6), finial: 1.8, finM: GOLD });
  },
  // Goldenes Dachl (about 1500): a late-Gothic loggia oriel on the Neuhof, two storeys of balustrade and open arches
  // under a steep roof of 2,657 fire-gilded copper tiles. The Neuhof behind it stays an ordinary pack building.
  goldenesDachl(K) {
    const { W } = K, PL = { m: 2, c: '#efe7d6', t: '#c9b48a', f: 8 }, REL = { m: 2, c: '#e6dcc6', t: '#b79a62', f: 0 }, GILT = { m: 7, c: '#c99a3c', snow: .25 };
    K.at(0, 0, 0, K.fp.ang, () => {
      const x0 = -3.1, x1 = 3.1, yf = .7, yo = -1.75, z0 = 3, zm = 7.4, z1 = 11.3, zr = 15.8;
      const box = [[x0, yo], [x1, yo], [x1, yf], [x0, yf]];
      // lower storey: the relief balustrade (coats of arms) over a closed base; upper: the open loggia
      K.walls(box, z0, zm, REL, { skip: j => j === 2, win: (j, len) => ({ t: W.BLIND, w: j === 0 ? 1.15 : .9, y0: zm - 2.6, y1: zm - .5, n: j === 0 ? 4 : 1, m: .2 }) });
      K.walls(box, zm, z1, PL, { skip: j => j === 2, win: (j, len) => ({ t: W.ARCADE, w: j === 0 ? 2.3 : 1.1, y0: zm + .9, y1: z1 - .4, n: j === 0 ? 2 : 1, m: .3 }) });
      const front = [[x0, yf], [x0, yo], [x1, yo], [x1, yf]];
      K.band(front, zm - .25, .3, .2, PL, { open: true });
      K.cap(box, z0, PL, { down: 1 });
      K.mould(front, [[-1.5, z0 - 1.8], [-.3, z0 - .35], [0, z0 - .2], [0, z0]], PL, { open: true });     // the corbel under it
      // the gilt roof: three steep faces falling away from the house front, with a ridge against it
      const g = (zr - z1) / (yf - yo), ring = [[x0 - .35, yo - .35], [x1 + .35, yo - .35], [x1 + .35, yf], [x0 - .35, yf]];
      const planes = [{ d: [0, -1], g, zt: zr, s0: -yf }, { d: [1, 0], g: g * 1.25, zt: zr, s0: x1 - (zr - z1) / (g * 1.25) }, { d: [-1, 0], g: g * 1.25, zt: zr, s0: -(x0 + (zr - z1) / (g * 1.25)) }];
      K.roofPlanes(ring, planes, GILT, {});
      K.detail(() => { K.finial(0, yf - .3, zr - .2, 1.2, { m: 15, c: '#b98a32' }); });
    });
  },
  // Bergisel (2002): the slender concrete tower with its cantilevered glass head, and the inrun bridge running down the
  // hill to the take-off above the stadium.
  bergisel(K) {
    const C = { m: 10, c: '#b8bbbb', seed: .2 }, GL = { m: 8, c: '#2e3946' };
    const zg = K.groundAt(0, 0);
    K.lathe(0, 0, zg - 3, [[3.4, 0, 1], [3.4, 43, 1]], C, { n: 8, wall: 1 });
    // the head: a rounded body leaning out over the inrun, glass between concrete bands
    const head = []; for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; head.push([Math.cos(a) * 6.2, 4 + Math.sin(a) * 15.5]); }
    K.prism(head, zg + 40, zg + 41.6, C, { cap: C });
    K.walls(head, zg + 41.6, zg + 47.2, GL);
    K.prism(head.map(p => [p[0] * .92, (p[1] - 4) * .95 + 4]), zg + 47.2, zg + 49, C, { cap: C });
    // the inrun: a ramp from the head down to the take-off, on two slim legs
    const yT = 98, zT = K.groundAt(-6, yT) + 3;
    K.bridge([0, 14, zg + 45.5], [-6, yT, zT], 4.6, C, { deck: .9, piers: [] });
    for (const t of [.38, .7]) { const y = 14 + (yT - 14) * t, x = -6 * t, z = zg + 45.5 + (zT - zg - 45.5) * t; K.box(x, y, 1.2, 1.2, K.groundAt(x, y) - 3, z - .9, C); }
  },
};
