// Nuremberg landmarks on the day trip: the Kaiserburg on its sandstone ridge, St. Sebald below it, the Hauptmarkt with the
// Frauenkirche and the Schöner Brunnen, and St. Lorenz across the Pegnitz; red Burgsandstein under dark tiled roofs.
// Builders receive the kit K (js/landmarks.js); local metres round each landmark's footprints.json origin.
const SS = { m: 1, c: '#906a5d', t: '#a6826f', f: 1 | 32, seed: .37 };       // red Burgsandstein ashlar: plinth, eaves shade
const SST = { m: 1, c: '#8c675a', t: '#a6826f', f: 1, seed: .52 };          // towers
const SSP = { m: 1, c: '#987465', t: '#ab8b79', f: 0, seed: .71 };          // tracery, pinnacles, string courses
const TILE = { m: 6, c: '#80432f', snow: .85, seed: .3 };
const CU = { m: 4, c: '#68897a', snow: .5, seed: .4 };
const CAP = { m: 11, c: '#a88b7b' };                                        // dressed copings and ledges
const GOLD = { m: 15, c: '#b98a32' };
const IRON = { m: 14, c: '#2a2a2c' };
const D = Math.PI / 180;
const lenOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dirOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / D;
// the point t m along a -> b, out m to its right (outwards on a counter-clockwise ring)
function along(a, b, t, out = 0) { const L = lenOf(a, b), ex = (b[0] - a[0]) / L, ey = (b[1] - a[1]) / L; return [a[0] + ex * t + ey * out, a[1] + ey * t - ex * out]; }
// a standing figure h tall (robe, shoulders, head)
function figure(K, x, y, z, h, m) {
  K.lathe(x, y, z, [[h * .17, 0, 1], [h * .16, h * .28], [h * .12, h * .6], [h * .13, h * .72], [h * .06, h * .8], [h * .08, h * .87], [h * .07, h * .96], [0, h]], m, { seg: K.seg(8) });
}
// a pierced tracery balustrade along a path (o.open) out m in front of it on a corbelled ledge at z, h high
function gallery(K, path, z, h, out, m, o = {}) {
  const W = K.W, p = K.offset(path, out, !o.open), n = path.length, m2 = o.open ? n - 1 : n;
  K.mould(path, [[0, z - .55], [out + .25, z - .1], [out + .25, z], [0, z + .02]], CAP, { open: o.open });
  for (let j = 0; j < m2; j++) {
    const a = p[j], b = p[(j + 1) % n];
    if (lenOf(a, b) < .6) continue;
    K.wall(a, b, z, z + h, m, { win: { t: W.ARCADE, w: .42, y0: z + .14, y1: z + h - .18, P: .66, m: .15 } });
    K.wall(b, a, z, z + h, m, {});
  }
  K.mould(p, [[-.12, z + h], [.12, z + h], [.12, z + h + .14], [-.12, z + h + .14]], CAP, { open: o.open });
}
// a stair turret: an octagonal shaft with slit windows, a cornice and a pointed cap (copper or tiles)
function stairTurret(K, x, y, z0, z1, r, cap, capH, rot = 0) {
  const W = K.W;
  K.lathe(x, y, z0, [[r, 0, 1], [r, z1 - z0, 1]], SST, { n: 8, rot: Math.PI / 8 + rot, wall: 1, win: { t: W.SLIT, w: .32, y0: z0 + 3, y1: z1 - 1.5, n: 1 } });
  K.cornice(K.ngon(x, y, r, 8, Math.PI / 8 + rot), z1 - .5, .5, .25, SSP);
  K.lathe(x, y, z1, [[r * 1.1, 0, 1], [r * .55, capH * .45], [0, capH]], cap, { n: 8, rot: Math.PI / 8 + rot });
  K.detail(() => K.ball(x, y, z1 + capH - .05, .16, GOLD));
}
// a Nuremberg Gothic church tower on the square ring r (CCW, faces 0..3): o.zs storeys (string courses between), o.win(s, j)
// per storey and face; a pierced parapet with corner pinnacles on top, an octagonal belfry, a crown of eight tracery gables
// round the foot of a tall octagonal copper spire with little dormers, a gilt ball and star
function nueTower(K, r, o) {
  const W = K.W, zs = o.zs, ZT = zs[zs.length - 1], c = [(r[0][0] + r[2][0]) / 2, (r[0][1] + r[2][1]) / 2];
  const rot = dirOf(r[0], r[1]) * D;
  for (let s = 0; s < zs.length - 1; s++) {
    const z0 = s ? zs[s] : o.z0, z1 = zs[s + 1];
    for (let j = 0; j < 4; j++) K.wall(r[j], r[(j + 1) % 4], z0, z1, SST, { win: o.win(s, j, lenOf(r[j], r[(j + 1) % 4])), E: z1 });
    if (s) K.band(r, zs[s] - .3, .3, .22, SSP);
  }
  K.cornice(r, ZT - .6, .6, .4, SSP);
  K.cap(r, ZT, CAP);
  // the parapet: open tracery between corner pinnacles
  const pr = K.offset(r, -.2);
  K.walls(pr, ZT, ZT + 1.3, SSP, { win: { t: W.ARCADE, w: .5, y0: ZT + .2, y1: ZT + 1.05, P: .8, m: .5 } });
  K.walls(K.offset(r, -.45).slice().reverse(), ZT, ZT + 1.3, SSP, {});
  K.detail(() => { for (const p of K.offset(r, -.35)) K.pinnacle(p[0], p[1], ZT, .8, o.pin || 5.2, SSP, SSP, { ang: rot / D }); });
  // the octagon
  const side = lenOf(r[0], r[1]), R8 = (side * (o.oct ?? .84)) / 2 / Math.cos(Math.PI / 8), ZO = ZT + o.octH, rr = rot + Math.PI / 8;
  K.lathe(c[0], c[1], ZT, [[R8, 0, 1], [R8, o.octH, 1]], SST, { n: 8, rot: rr, wall: 1, win: { t: W.BELFRY, w: side * .18, y0: ZT + 1.6, y1: ZO - 1, n: 1 }, E: ZO });
  K.cornice(K.ngon(c[0], c[1], R8, 8, rr), ZO - .5, .5, .3, SSP);
  // the crown: a tracery gable over every face of the octagon, a pinnacle between each two
  const oc = K.ngon(c[0], c[1], R8, 8, rr), gh = o.crownH ?? 4;
  for (let k = 0; k < 8; k++) {
    const a = oc[k], b = oc[(k + 1) % 8], L = lenOf(a, b);
    K.slab(a, b, [[0, ZO - .4], [L, ZO - .4], [L / 2, ZO + gh]], .35, SSP, { out: .3, win: { t: W.ROSE, w: L * .42, y0: ZO + .25, y1: ZO + .25 + L * .42, n: 1 } });
  }
  K.detail(() => {
    for (const p of oc) K.pinnacle(p[0], p[1], ZO - .6, .55, gh + 1.2, SSP, SSP, { ang: (rr + Math.PI / 2) / D });
    for (let k = 0; k < 8; k++) { const a = oc[k], b = oc[(k + 1) % 8], p = along(a, b, lenOf(a, b) / 2, .3); K.ball(p[0], p[1], ZO + gh - .1, .14, SSP); }
  });
  // the spire (concave faces running out fine), little gabled dormers a third of the way up, the ball and star
  const SH = o.tip - ZO, R0 = R8 * .93;
  K.spire(c[0], c[1], ZO, R0, SH, o.spire || CU, { n: 8, rot: rr });
  K.detail(() => {
    const zd = ZO + SH * .3, rd = R0 * .62 - .15, g = (R0 * .62 - R0 * .34) / (SH * .3);
    for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 2; K.dormer(c[0] + Math.cos(a) * rd, c[1] + Math.sin(a) * rd, zd, .55, .8, a / D, 1 / Math.max(g, .05), SSP, o.spire || CU, { win: W.BELFRY }); }
    K.ball(c[0], c[1], o.tip - .25, .32, GOLD);
    K.box(c[0], c[1], .1, .1, o.tip + .3, o.tip + 1.9, GOLD);
    for (const a of [0, 1, 2]) K.box(c[0], c[1], 1.1, .09, o.tip + 1.05 - .09, o.tip + 1.05, GOLD, { ang: a * 60 + rot / D });    // the star
  });
  return { c, ZT, ZO, R8 };
}

export default {
  // St. Lorenz: the Gothic parish church south of the Pegnitz (nave and towers about 1270-1350, hall choir 1439-77). Twin
  // west towers of 81 m: square shafts with string courses and tall belfry lancets, a pierced parapet and pinnacles, an
  // octagonal belfry, a crown of eight tracery gables round each copper spire; the deep portal and the 9 m rose between them
  // under a tracery gable; a basilican nave with lower aisles; the soaring hall choir under its huge roof (eaves 25 m,
  // ridge 47 m), two storeys of tall windows between buttresses, galleries at the chapels and the eaves, pinnacles.
  stLorenz(K) {
    const { W } = K;
    K.at(0, 0, 0, K.fp.ang, () => {
      const Z0 = Math.min(0, K.groundMin([[-47, -22], [48, -22], [48, 21], [-47, 21]])) - 2;
      const XW = -44.86, XE = -36.23, YN = 7.05, YA = 16.1, XC = 3.63;
      // ---- the towers ----
      const tw = (s, j) => {
        const facing = j;          // 0 south, 1 east, 2 north, 3 west (faces of a CCW rect)
        if (s === 0) return facing === 3 ? null : { t: W.SLIT, w: .45, y0: 4, y1: 7.5, n: 1 };
        if (s === 1) return { t: W.LANCET, w: 1.3, y0: 14.5, y1: 19.5, n: 1, lights: 1 };
        if (s === 2) return { t: W.BLIND, w: 1.5, y0: 26.3, y1: 32, n: 2, m: 1.6, lights: 2 };
        if (s === 3) return { t: W.LANCET, w: 1.4, y0: 34.6, y1: 40.6, n: 2, m: 1.7, lights: 2 };
        return { t: W.BELFRY, w: 1.6, y0: 42.8, y1: 48.8, n: 2, m: 1.5, lights: 2 };
      };
      for (const [y0, y1] of [[5.4, 13.99], [-14.2, -5.61]]) {
        const r = [[XW, y0], [XE, y0], [XE, y1], [XW, y1]];
        nueTower(K, r, { z0: Z0, zs: [0, 13, 25, 33.5, 42, 50], win: tw, octH: 6.6, crownH: 4.2, tip: 80, pin: 5.5 });
        // stepped corner buttresses on the west and outer faces
        const out = y0 > 0 ? 1 : -1, yo = out > 0 ? y1 : y0, yi = out > 0 ? y0 : y1;
        K.buttress(XW, yo - out * .7, 180, 1.3, 2, Z0, 30.7, SSP, { steps: 3 });
        K.buttress(XW + .7, yo, out * 90, 1.3, 1.9, Z0, 30.7, SSP, { steps: 3 });
        K.buttress(XW, yi + out * .7, 180, 1.2, 1.6, Z0, 21, SSP, { steps: 2 });
        K.buttress(XE - .7, yo, out * 90, 1.2, 1.6, Z0, 21, SSP, { steps: 2 });
        // the small stair turret on the outer face and the tall one in the corner by the nave
        stairTurret(K, -38.5, out * 14.5, Z0, 15.2, 1.55, TILE, 3.8);
        stairTurret(K, -36.25, out * 6.9, Z0, 38.5, 1.28, CU, 3.6);
      }
      // ---- the west front between the towers: the portal under its gable, the rose, the tracery gable ----
      const wa = [XW, 5.4], wb = [XW, -5.61], WL = lenOf(wa, wb);
      K.wall(wa, wb, Z0, 13, SS, {});
      K.wall(wa, wb, 13, 25, SS, { win: { t: W.ROSE, w: 9, y0: 14.8, y1: 23.8, n: 1 } });
      K.band([wa, wb], 13, .35, .3, SSP, { open: true });
      // the portal: a deep pointed frame round the doors, a pinnacled tracery gable over it
      K.slab(along(wa, wb, WL / 2 - 3.6), along(wa, wb, WL / 2 + 3.6), [[0, Z0], [7.2, Z0], [7.2, 7.4], [3.6, 12.2], [0, 7.4]], 1.3, SSP, { out: 1.3, win: { t: W.DOOR, w: 3.6, y0: 0, y1: 8.6, n: 1 } });
      K.slab(along(wa, wb, WL / 2 - 3.7), along(wa, wb, WL / 2 + 3.7), [[0, 9.4], [7.4, 9.4], [3.7, 15.6]], .4, SSP, { out: 1.6, win: { t: W.BLIND, w: 2.4, y0: 10.2, y1: 13.6, n: 1, lights: 2 } });
      K.detail(() => {
        for (const t of [WL / 2 - 3.9, WL / 2 + 3.9]) { const p = along(wa, wb, t, 1.5); K.pinnacle(p[0], p[1], Z0, .75, 16.5 - Z0, SSP, SSP); }
        const p = along(wa, wb, WL / 2, 1.5); K.pinnacle(p[0], p[1], 15.2, .5, 2.4, SSP, SSP);
      });
      gallery(K, [wa, wb], 25, 1.2, .5, SSP, { open: true });
      // the nave roof's west gable between the towers: blind lancets, pinnacles up the rakes, the crowning turret
      const ga = [XW + .6, YN], gb = [XW + .6, -YN];
      K.wallPoly(ga, gb, [[0, 25], [2 * YN, 25], [YN, 37]], SS, { win: { t: W.BLIND, w: 1.5, y0: 26.5, y1: 32.5, n: 3, m: 3.4, lights: 2 } });
      K.detail(() => {
        for (let k = 1; k < 5; k++) for (const s of [-1, 1]) { const y = s * YN * (1 - k / 5), z = 25 + 12 * k / 5; K.pinnacle(XW + .3, y, z - .4, .45, 2.2, SSP, SSP); }
      });
      K.lathe(XW + .4, 0, 33, [[.95, 0, 1], [.95, 4.5, 1]], SSP, { n: 8, wall: 1, win: { t: W.BELFRY, w: .45, y0: 34, y1: 36.6, n: 1 } });
      K.spire(XW + .4, 0, 37.5, 1.05, 5.5, CU, { n: 8 });
      K.detail(() => K.ball(XW + .4, 0, 42.9, .2, GOLD));
      // ---- nave: clerestory over the aisle roofs, the steep saddle roof, dormers ----
      const nring = [[XW + .6, -YN], [XC, -YN], [XC, YN], [XW + .6, YN]];
      const np = K.planes(nring, 'gable', 25, 12, 0);
      K.roofPlanes(nring, np, TILE, { over: .5 });
      for (const s of [-1, 1]) {
        const a = s < 0 ? [XE, -YN] : [XC, YN], b = s < 0 ? [XC, -YN] : [XE, YN];
        K.wall(a, b, 16.4, 25, SS, { win: { t: W.LANCET, w: 2.3, y0: 18.2, y1: 24, P: 5.2, m: .4, lights: 2 } });
      }
      K.cornice([[XE, -YN], [XC, -YN]], 24.4, .6, .45, SSP, { open: true });
      K.cornice([[XC, YN], [XE, YN]], 24.4, .6, .45, SSP, { open: true });
      // ---- aisles: tall three-light windows in every bay, a tracery parapet, pinnacles over the inner buttresses ----
      for (const s of [-1, 1]) {
        const a = s < 0 ? [XE, -YA] : [XC, YA], b = s < 0 ? [XC, -YA] : [XE, YA];
        K.wall(a, b, Z0, 12, SS, { win: { t: W.LANCET, w: 3.2, y0: 3.2, y1: 10.9, n: 7, m: 0, lights: 3 } });
        K.wall(s < 0 ? [XE, -YN] : [XE, YA], s < 0 ? [XE, -YA] : [XE, YN], Z0, 12, SS, {});
        const pl = { d: [0, s], g: 5.5 / (YA - YN), zt: 17, s0: YN };
        K.roofPlanes(K.ccw([[XE - .3, s * YN], [XC, s * YN], [XC, s * (YA + .35)], [XE - .3, s * (YA + .35)]]), [pl], TILE, {});
        gallery(K, [a, b], 12, 1.1, .35, SSP, { open: true });
        K.detail(() => { for (let k = 1; k < 7; k++) K.pinnacle(XE + k * (XC - XE) / 7, s * (YA + .5), 12, .6, 3.6, SSP, SSP); });
      }
      // ---- the hall choir ----
      const CH = [[3.62, -16.1], [31.6, -16.05], [37.89, -12.97], [42.76, -8.84], [45.26, -3.05], [45.05, 3.16], [42.41, 8.72], [37.61, 12.64], [31.56, 16.07], [3.61, 16.01]];
      const g = 22.5 / 16.05, cp = K.hipPlanes(CH, 25, g, { gable: [9] });
      cp.push({ d: [-1, 0], g, zt: 25, s0: 18 / g - 3.62 });                       // a small hip at the top of the west gable
      K.roofPlanes(CH, cp, TILE, { over: .6 });
      K.roofWalls(CH, cp, 11.6, SS, { skip: j => j !== 9, E: 25 });
      // walls: chapel windows below the gallery, the tall upper windows above; on the long sides split between the buttresses
      const lower = (w, n) => ({ t: W.LANCET, w, y0: 2.6, y1: 12.2, n, m: 1, lights: 2 }), upper = (w, n) => ({ t: W.LANCET, w, y0: 15.6, y1: 23.6, n, m: 1, lights: 3 });
      const longSide = (y, xs, s) => {
        for (let i = 0; i < xs.length - 1; i++) {
          const x0 = xs[i], x1 = xs[i + 1], L = x1 - x0, n = L > 10 ? 2 : L > 4 ? 1 : 0, w = n === 2 ? 3.3 : Math.min(3.8, L - 2.4);
          const a = s < 0 ? [x0, y] : [x1, y], b = s < 0 ? [x1, y] : [x0, y];
          K.storeys(a, b, [Z0, 14, 25], SS, i2 => n ? (i2 ? upper(w, n) : lower(w, n)) : null);
        }
      };
      longSide(-16.08, [3.62, 4.29, 12.53, 15.7, 24.97, 31.6], -1);
      longSide(16.04, [3.61, 4.21, 12.46, 15.7, 24.91, 31.56], 1);
      for (let j = 1; j < 8; j++) K.storeys(CH[j], CH[j + 1], [Z0, 14, 25], SS, i2 => i2 ? upper(3.3, 1) : lower(3.2, 1));
      // the galleries round the chapels and the eaves, on the long sides and round the polygon
      const rim = CH.slice(0, 9).concat([CH[9]]).slice(0);
      gallery(K, rim, 14, 1.05, .9, SSP, { open: true });
      gallery(K, rim, 25, 1.1, .45, SSP, { open: true });
      // buttresses with pinnacles over the eaves
      const bpts = [[4.29, -16.08, -90], [12.53, -16.08, -90], [24.97, -16.08, -90], [4.21, 16.04, 90], [12.46, 16.04, 90], [24.91, 16.04, 90]];
      for (let j = 1; j < 9; j++) {
        const p = CH[j], q = CH[j - 1], n = CH[j + 1], a1 = dirOf(q, p) - 90, a2 = dirOf(p, n) - 90;
        bpts.push([p[0], p[1], (a1 + a2) / 2 + (Math.abs(a1 - a2) > 180 ? 180 : 0)]);
      }
      for (const [x, y, deg] of bpts) {
        K.buttress(x, y, deg, 1.25, 2.7, Z0, 24.2, SSP, { steps: 2 });
        const e = [x + Math.cos(deg * D) * 1.2, y + Math.sin(deg * D) * 1.2];
        K.detail(() => K.pinnacle(e[0], e[1], 24, .95, 6.2, SSP, SSP, { ang: deg }));
      }
      // stair turrets at the joint of nave and choir
      stairTurret(K, 13.74, 16.9, Z0, 29.6, 1.75, CU, 3.6);
      stairTurret(K, 13.89, -17.05, Z0, 29.6, 1.75, CU, 3.6);
      // the two-storey annexes on either side of the choir's west bay, under lean-to roofs; the little north porch
      for (const s of [-1, 1]) {
        const y0 = s * 16.05, y1 = s * 20.4, r = K.ccw([[4.85, y0], [11.9, y0], [11.9, y1], [4.85, y1]]);
        const pl = [{ d: [0, s], g: 4.5 / 4.35, zt: 17.5, s0: 16.05 }];
        K.roofPlanes(r, pl, TILE, { over: .35 });
        K.roofWalls(r, pl, Z0, SS, { E: 13, win: (j, len) => len > 6 ? { t: W.LANCET, w: 1.8, y0: 4, y1: 11, n: 2, m: 1, lights: 2 } : null });
      }
      const por = K.ccw([[-3.6, 16.05], [3.6, 16.05], [3.6, 18.2], [-3.6, 18.2]]);
      const ppl = [{ d: [0, 1], g: 2.4 / 2.15, zt: 6, s0: 16.05 }];
      K.roofPlanes(por, ppl, TILE, { over: .3 });
      K.roofWalls(por, ppl, Z0, SSP, { E: 3.6, win: (j, len) => len > 5 ? { t: W.ARCADE, w: 2.6, y0: 0, y1: 3.1, n: 2, m: .6 } : null });
      // rows of little dormers on the great roofs
      K.detail(() => {
        for (const s of [-1, 1]) {
          for (const [z, n, x0, x1] of [[29.5, 6, -31, 0], [33.5, 4, -27, -4]]) for (let i = 0; i < n; i++) K.dormer(x0 + (x1 - x0) * i / (n - 1), s * (37 - z) * YN / 12, z, .9, .9, s * 90, 12 / YN, SS, { ...TILE, snow: .9 }, {});
          for (const [z, n, x0, x1] of [[31, 5, 8, 28], [37.5, 4, 10, 26], [43, 2, 14, 22]]) for (let i = 0; i < n; i++) K.dormer(x0 + (x1 - x0) * (n === 1 ? .5 : i / (n - 1)), s * (47.5 - z) / g, z, 1.1, 1.05, s * 90, g, SS, { ...TILE, snow: .9 }, {});
        }
      });
    });
  },

  // St. Sebald (1225-1379): Nuremberg's oldest parish church, below the castle. A late-Romanesque west choir between twin
  // towers (raised and given their octagons and spires in 1481-83, 71 m), a basilican nave, and the soaring Gothic hall choir
  // of 1361-79 in the east under a huge hipped roof, its buttresses and pinnacles round the polygon.
  stSebald(K) {
    const { W } = K;
    K.at(0, 0, 0, K.fp.ang, () => {
      const Z0 = Math.min(0, K.groundMin([[-43, -19], [42, -19], [42, 19], [-43, 19]])) - 2;
      const tw = (s, j) => {
        if (s === 0) return j === 1 ? null : { t: W.SLIT, w: .4, y0: 5, y1: 8, n: 1 };
        if (s === 1) return j === 1 ? null : { t: W.ROUND, w: 1.1, y0: 15, y1: 18.6, n: 1 };
        if (s === 2) return { t: W.BLIND, w: 1.2, y0: 25, y1: 30, n: 2, m: 1.3, lights: 2 };
        if (s === 3) return { t: W.LANCET, w: 1.25, y0: 33.5, y1: 38.5, n: 2, m: 1.3, lights: 1 };
        return { t: W.BELFRY, w: 1.4, y0: 41.5, y1: 46.6, n: 2, m: 1.2, lights: 2 };
      };
      for (const cy of [-6.04, 8.48]) {
        const r = K.rect(-34.45, cy, 6.9, 6.9, -2.4);
        nueTower(K, r, { z0: Z0, zs: [0, 12, 22, 31.5, 40, 48], win: tw, octH: 5.8, crownH: 3.4, tip: 71.5, pin: 4.4, oct: .88 });
      }
      // nave and aisles (a basilica: the aisle roofs lean against the clerestory)
      const XN0 = -31, XN1 = -4, YN = 6.7, YA = 14.4;
      const nring = [[XN0 - 6.5, -YN], [XN1, -YN], [XN1, YN], [XN0 - 6.5, YN]], np = K.planes(nring, 'gable', 20.5, 8.5, 0);
      K.roofPlanes(nring, np, TILE, { over: .45 });
      // the west choir: half an octagon of the late-Romanesque Peter choir between the towers, its roof running into the nave's
      const wc = K.ngon(-37.66, 1.3, 4.9, 8, Math.PI / 8), ar = K.ccw([wc[2], wc[3], wc[4], wc[5], wc[6], [-31, wc[6][1]], [-31, wc[2][1]]]);
      const ap = [...K.hipPlanes(ar, 17, 12 / 4.9, { gable: [4, 5, 6] }), ...np];
      K.roofPlanes(ar, ap, TILE, { over: .4 });
      for (let k = 2; k < 6; k++) K.wall(wc[k], wc[k + 1], Z0, 17, SS, { win: { t: W.ROUND, w: 1.5, y0: 7, y1: 13, n: 1 } });
      K.band(wc.slice(2, 7), 6, .35, .3, SSP, { open: true });
      K.cornice(wc.slice(2, 7), 16.4, .6, .45, SSP, { open: true });
      for (const s of [-1, 1]) {
        const a = s < 0 ? [XN0, -YN] : [XN1, YN], b = s < 0 ? [XN1, -YN] : [XN0, YN];
        K.wall(a, b, 17.5, 20.5, SS, { win: { t: W.ROUND, w: 1.4, y0: 18.6, y1: 20.1, n: 5, m: 0 } });
        const c = s < 0 ? [XN0, -YA] : [XN1, YA], d = s < 0 ? [XN1, -YA] : [XN0, YA];
        K.wall(c, d, Z0, 12, SS, { win: { t: W.LANCET, w: 2.5, y0: 3.4, y1: 10.6, n: 5, m: 0, lights: 2 } });
        K.wall(s < 0 ? [XN0, -YN] : [XN0, YA], s < 0 ? [XN0, -YA] : [XN0, YN], Z0, 12, SS, {});
        K.roofPlanes(K.ccw([[XN0 - .3, s * YN], [XN1, s * YN], [XN1, s * (YA + .35)], [XN0 - .3, s * (YA + .35)]]), [{ d: [0, s], g: 6.5 / (YA - YN), zt: 18.5, s0: YN }], TILE, {});
        K.cornice([c, d], 11.4, .55, .4, SSP, { open: true });
        for (let k = 1; k < 5; k++) K.buttress(XN0 + k * (XN1 - XN0) / 5, s * YA, s * 90, .9, 1.2, Z0, 11, SSP, { steps: 1 });
      }
      // the east hall choir (1361-79): tall walls, two storeys of windows between buttresses with pinnacles, the great hipped
      // roof, a gallery at the eaves
      const CH = [[-4.5, -14.0], [27.9, -14.0], [33.6, -12.6], [38.1, -8.5], [40.5, -2.9], [40.4, 2.9], [37.8, 8.2], [33.3, 12.1], [27.6, 13.4], [-3.6, 13.5]];
      const g = 18 / 13.75, cp = K.hipPlanes(CH, 20, g, { gable: [9] });
      K.roofPlanes(CH, cp, TILE, { over: .55 });
      K.roofWalls(CH, cp, 12, SS, { skip: j => j !== 9, E: 20, win: { t: W.ROUND, w: 1.1, y0: 23, y1: 25.5, n: 2, m: 6 } });
      const tiers = (a, b, n, w) => K.storeys(a, b, [Z0, 9.5, 20], SS, i => n ? { t: W.LANCET, w, y0: i ? 10.8 : 2.8, y1: i ? 19 : 8.6, n, m: .9, lights: i ? 3 : 2 } : null, { E: 20 });
      for (const [y, s] of [[-14.0, -1], [13.45, 1]]) {
        const xs = [s < 0 ? -4.5 : -3.6, 2.05, 11.8, 21.6, s < 0 ? 27.9 : 27.6];
        for (let i = 0; i < 4; i++) { const a = [xs[i], y], b = [xs[i + 1], y]; tiers(s < 0 ? a : b, s < 0 ? b : a, 1, Math.min(4, xs[i + 1] - xs[i] - 2)); }
        for (const x of xs.slice(1, 4)) { K.buttress(x, y, s * 90, 1.1, 2.2, Z0, 19.4, SSP, { steps: 2 }); K.detail(() => K.pinnacle(x, y + s * 1.1, 19.2, .8, 5, SSP, SSP)); }
      }
      for (let j = 1; j < 8; j++) tiers(CH[j], CH[j + 1], 1, 3);
      for (let j = 1; j < 9; j++) {
        const p = CH[j], a1 = dirOf(CH[j - 1], p) - 90, a2 = dirOf(p, CH[j + 1]) - 90, deg = (a1 + a2) / 2 + (Math.abs(a1 - a2) > 180 ? 180 : 0);
        K.buttress(p[0], p[1], deg, 1.1, 2.3, Z0, 19.4, SSP, { steps: 2 });
        K.detail(() => K.pinnacle(p[0] + Math.cos(deg * D) * 1.1, p[1] + Math.sin(deg * D) * 1.1, 19.2, .8, 5, SSP, SSP));
      }
      gallery(K, CH, 20, 1, .4, SSP, { open: true });
      // the low chapels on either side of the choir
      for (const s of [-1, 1]) {
        const r = K.ccw([[7.4, s * 13.6], [16, s * 13.6], [16, s * 18.6], [7.4, s * 18.6]]), pl = [{ d: [0, s], g: 1.8 / 5, zt: 5.4, s0: 13.6 }];
        K.roofPlanes(r, pl, TILE, { over: .3 });
        K.roofWalls(r, pl, Z0, SS, { E: 3.6, win: (j, len) => len > 7 ? { t: W.LANCET, w: 1.4, y0: .8, y1: 3, n: 3, m: .6 } : null });
      }
      K.detail(() => {
        for (const s of [-1, 1]) for (const [z, n, x0, x1] of [[25, 6, 0, 24], [30, 4, 4, 20]]) for (let i = 0; i < n; i++) K.dormer(x0 + (x1 - x0) * i / (n - 1), s * (13.75 - (z - 20) / g), z, 1, 1, s * 90, g, SS, { ...TILE, snow: .9 }, {});
      });
    });
  },

  // Frauenkirche (1352-62): the emperor's chapel on the Hauptmarkt, a hall church of three by three bays. Its west front
  // carries a porch of three arches with a balustrade, the Michaelschörlein above it with the Männleinlaufen clock (1509:
  // the seven electors circle the emperor at noon), two stair turrets, and the great show gable stepped in seven tall
  // blind arches with pinnacles, the slender turret rising from its middle.
  frauenkircheNue(K) {
    const { W } = K;
    const FS = { m: 1, c: '#8f6f62', t: '#a88d7c', f: 1 | 32, seed: .44 }, FSP = { m: 1, c: '#9a7a6a', t: '#ae9483', f: 0, seed: .63 };
    K.at(0, 0, 0, K.fp.ang, () => {
      const Z0 = Math.min(0, K.groundMin([[-24, -14], [24, -14], [24, 14], [-24, 14]])) - 2;
      const XW = -15.08, XE = 7.0, YN = 12.6, EAVE = 16, RIDGE = 30;
      // ---- the hall: three bays of tall windows between buttresses, the steep roof ----
      const hall = [[XW, -YN], [XE, -YN], [XE, YN], [XW, YN]];
      const hp = K.planes(hall, 'gable', EAVE, RIDGE - EAVE, 0);
      K.roofPlanes(hall, hp, TILE, { over: .5 });
      K.roofWalls(hall, hp, EAVE, FS, { skip: j => j !== 1, E: EAVE, win: { t: W.LANCET, w: 1.4, y0: 18.5, y1: 22.5, n: 3, m: 6 } });
      for (const s of [-1, 1]) {
        const a = s < 0 ? [XW, -YN] : [XE, YN], b = s < 0 ? [XE, -YN] : [XW, YN];
        K.wall(a, b, Z0, EAVE, FS, { win: { t: W.LANCET, w: 3.2, y0: 4.2, y1: 14.2, n: 3, m: .6, lights: 3 } });
        K.cornice([a, b], EAVE - .55, .55, .45, FSP, { open: true });
        for (const x of [-7.95, -.6]) { K.buttress(x, s * YN, s * 90, .85, 1.4, Z0, EAVE - .5, FSP, { steps: 2 }); K.detail(() => K.pinnacle(x, s * (YN + .6), EAVE - .6, .7, 3.6, FSP, FSP)); }
        for (const x of [XW, XE]) { const deg = s < 0 ? (x < 0 ? 225 : 315) : (x < 0 ? 135 : 45); K.buttress(x, s * YN, deg, .9, 1.4, Z0, EAVE - .5, FSP, { steps: 2 }); }
        K.wall(s < 0 ? [XE, -YN] : [XE, 5.5], s < 0 ? [XE, -5.7] : [XE, YN], Z0, EAVE, FS, {});
      }
      for (const [y0, y1, n] of [[YN, 6.4, 1], [6.4, -6.4, 0], [-6.4, -YN, 1]]) K.wall([XW, y0], [XW, y1], Z0, EAVE, FS, { win: n ? { t: W.LANCET, w: 2.4, y0: 4.5, y1: 13.5, n: 1, lights: 2 } : null });
      // ---- the show gable: seven tall blind arches stepping up to the middle, each its own pier of the stepped outline, high
      // over the roof line; pinnacles on the steps ----
      const ga = [XW - .3, YN], gb = [XW - .3, -YN], GL = 2 * YN, st = 7, sw = GL / st, stepZ = l => l < 3 ? EAVE + 4.8 + 4 * l : EAVE + 15.8;
      for (let k = 0; k < st; k++) {
        const zt = stepZ(Math.min(k, st - 1 - k)), p0 = along(ga, gb, k * sw), p1 = along(ga, gb, (k + 1) * sw);
        K.slab(p0, p1, [[0, EAVE - .6], [sw, EAVE - .6], [sw, zt], [0, zt]], .9, FSP, { out: .6, win: { t: W.BLIND, w: sw - 1.05, y0: EAVE + .3, y1: zt - 1.1, n: 1, lights: 2 } });
        K.box(...along(ga, gb, (k + .5) * sw, .15), sw + .1, 1.4, zt, zt + .25, CAP, { ang: dirOf(ga, gb) });
      }
      K.detail(() => {
        for (let k = 0; k < 3; k++) for (const t of [(k + 1) * sw - .35, GL - (k + 1) * sw + .35]) { const p = along(ga, gb, t, .45); K.pinnacle(p[0], p[1], stepZ(k) + .2, .6, 2.8, FSP, FSP); }
        for (const t of [.35, GL - .35]) { const p = along(ga, gb, t, .45); K.pinnacle(p[0], p[1], stepZ(0) + .2, .6, 2.8, FSP, FSP); }
      });
      // the slender middle turret up the gable, above the apex, with its copper cap
      K.lathe(-15.35, 0, 21, [[1.25, 0, 1], [1.25, 15.4, 1]], FSP, { n: 8, wall: 1, win: { t: W.LANCET, w: .55, y0: 30.2, y1: 35, n: 1 } });
      K.cornice(K.ngon(-15.35, 0, 1.25, 8, Math.PI / 8), 35.9, .5, .3, FSP);
      K.lathe(-15.35, 0, 36.4, [[1.35, 0, 1], [1.2, .6], [.6, 1.8], [.18, 2.8]], CU, { n: 8 });
      K.lantern(-15.35, 0, 39.2, .32, .9, FSP, CU, { n: 6, cap: K.P.cone(.38, 1.4), finial: .9, finM: GOLD });
      // ---- the porch: three pointed arches with a pierced balustrade; the Michaelschörlein over it ----
      const PR = [[-15.01, -4.27], [-15, 4.41], [-22.77, 4.44], [-23.5, 3.75], [-23.5, -3.55], [-22.79, -4.25]].reverse();
      const pring = K.ccw(PR);
      K.walls(pring, Z0, 8, FS, { win: (j, len) => len > 6 ? { t: W.ARCADE, w: 3.4, y0: 0, y1: 5.8, n: 1 } : null });
      K.cap(pring, 8, CAP);
      const prail = [[-15, 4.41], [-22.77, 4.44], [-23.5, 3.75], [-23.5, -3.55], [-22.79, -4.25], [-15.01, -4.27]];
      gallery(K, prail, 8, 1, -.2, FSP, { open: true });
      K.detail(() => { for (const p of prail.slice(1, 5)) K.pinnacle(p[0], p[1], 7.4, .6, 3.6, FSP, FSP); });
      const MC = K.ccw([[-20.47, -3.31], [-14.98, -3.3], [-14.9, 3.55], [-20.48, 3.52], [-21.69, 2.16], [-21.69, -2.02]]);
      const mp = K.planes(MC, 'gable', 16.5, 5.5, 0);
      K.roofPlanes(MC, mp, TILE, { over: .3 });
      K.roofWalls(MC, mp, 8, FS, { E: 16.5, win: (j, L) => { const a = MC[j], b = MC[(j + 1) % MC.length]; return Math.abs(a[0] - b[0]) < .3 && a[0] < -21 ? { t: W.LANCET, w: 1.4, y0: 9.4, y1: 11.6, n: 1 } : L > 2 ? { t: W.LANCET, w: Math.min(1.5, L - .8), y0: 9.4, y1: 15.2, n: 1, lights: 1 } : null; } });
      // the front gable of the Michaelschörlein with the Männleinlaufen niche, crowned by a pinnacle
      const fa = [-21.69, 2.16], fb = [-21.69, -2.02], FL = lenOf(fa, fb);
      K.slab(fa, fb, [[-.7, 16.3], [FL + .7, 16.3], [FL / 2, 22.2]], .4, FSP, { out: .35 });
      K.clock(fa, fb, FL / 2, 13.9, 1.25, { m: 12, c: '#2c3d63' }, { out: .2 });
      K.box(-22.15, 0, 1.1, 4.2, 16.1, 16.4, CAP);
      K.detail(() => {
        K.pinnacle(-21.75, 0, 21.4, .55, 2.4, FSP, FSP);
        for (const t of [-.6, FL + .6]) { const p = along(fa, fb, t, .3); K.pinnacle(p[0], p[1], 15.4, .5, 3, FSP, FSP); }
        // the emperor on his throne and the seven electors in their robes, on the ledge under the gable
        const cols = ['#7d2f2a', '#2d4a73', '#3c5c3a', '#7d2f2a', '#b98a32', '#2d4a73', '#6b2c4a'];
        figure(K, -22.4, 0, 16.4, 1.05, GOLD);
        for (let k = 0; k < 8; k++) { const y = -1.82 + k * .52; if (Math.abs(y) < .3) continue; figure(K, -22.35, y, 16.4, .85, { m: 16, c: cols[k % 7] }); }
      });
      stairTurret(K, -15.47, -5.01, Z0, 10.4, 1.15, TILE, 3.6, 0);
      stairTurret(K, -15.42, 5.18, Z0, 10.4, 1.15, TILE, 3.6, 0);
      // ---- the choir and its sacristies ----
      const CR = K.ccw([[6.85, -5.65], [19.44, -5.79], [22.76, -2.53], [22.79, 2.09], [19.56, 5.37], [6.93, 5.52]]);
      const cpl = K.hipPlanes(CR, 15, 10 / 5.6, { gable: [5] });
      K.roofPlanes(CR, cpl, TILE, { over: .45 });
      for (let j = 0; j < 5; j++) {
        K.wall(CR[j], CR[j + 1], Z0, 15, FS, { win: { t: W.LANCET, w: 2, y0: 4.2, y1: 13.2, n: lenOf(CR[j], CR[j + 1]) > 8 ? 2 : 1, m: .8, lights: 2 } });
        if (j) { const p = CR[j], deg = (dirOf(CR[j - 1], p) + dirOf(p, CR[j + 1])) / 2 - 90; K.buttress(p[0], p[1], deg, .8, 1.3, Z0, 14.4, FSP, { steps: 2 }); }
      }
      K.cornice(CR.slice(0, 6), 14.5, .5, .4, FSP, { open: true });
      const sac = K.ccw([[6.8, -13.9], [13.1, -13.9], [13.1, -5.71], [6.8, -5.71]]);
      K.roof(sac, 'hip', 12, 6, TILE, { ang: 90, over: .4, walls: FS, z0: Z0, wallOpts: { win: (j, len) => len > 7 ? { t: W.LANCET, w: 1.3, y0: 4, y1: 9.5, n: 2, m: 1 } : null } });
      const ne = K.ccw([[6.93, 5.52], [15.8, 5.42], [15.85, 12.34], [7.01, 12.44]]);
      K.walls(ne, Z0, 4.4, FS, { win: (j, len) => len > 6 ? { t: W.RECT, w: 1, y0: 1.4, y1: 3.2, P: 2.6, m: .8 } : null });
      K.roof(ne, 'skillion', 4.4, 1.2, TILE, { ang: 180, over: .3 });
      stairTurret(K, 7.89, 5.09, Z0, 15.4, 1.15, CU, 3.6, 0);
      // little dormers on the hall roof
      K.detail(() => { for (const s of [-1, 1]) for (const [z, n] of [[20.5, 4], [25, 2]]) for (let i = 0; i < n; i++) K.dormer(-9 + 13 * (n === 1 ? .5 : i / (n - 1)), s * (YN * (RIDGE - z) / (RIDGE - EAVE)), z, .9, .95, s * 90, (RIDGE - EAVE) / YN, FS, { ...TILE, snow: .9 }, {}); });
    });
  },

  // Schöner Brunnen (1385-96, Heinrich Beheim): the "beautiful fountain" on the Hauptmarkt, a 19 m Gothic spire in painted
  // and gilded stone with forty figures (philosophers, evangelists, church fathers, the electors, the nine heroes, Moses
  // and the prophets) in an octagonal basin behind the wrought-iron grille of 1587 with its brass ring.
  schoenerBrunnen(K) {
    const W = K.W, z = K.groundAt(0, 0), PS = { m: 11, c: '#cdbd9c' }, PS2 = { m: 11, c: '#bba887' }, BAS = { m: 11, c: '#b4a084' };
    const rot = Math.PI / 8 + 12 * D, cols = ['#8c2f2a', '#2f4f7d', '#3e6040', '#b98a32', '#6b2c4a', '#d8d0bc', '#2f4f7d', '#8c2f2a'];
    // the basin: a stepped octagonal plinth, the trough wall, ice in winter
    K.lathe(0, 0, z - 1, [[4.2, 0, 1], [4.2, 1.25, 1], [3.85, 1.25, 1]], BAS, { n: 8, rot });
    K.lathe(0, 0, z + .25, [[3.55, 0, 1], [3.55, .85, 1], [3.75, .95, 1], [3.75, 1.1, 1], [3.3, 1.1, 1], [3.3, .7, 1]], PS2, { n: 8, rot });
    K.lathe(0, 0, z + .95, [[3.3, 0, 1], [0, 0]], { m: 11, c: '#b9c4cc' }, { n: 8, rot });
    // the grille: bars round the basin, a brass ring at the top
    K.detail(() => {
      const gr = K.ngon(0, 0, 4, 8, rot);
      for (let k = 0; k < 8; k++) {
        const a = gr[k], b = gr[(k + 1) % 8], L = lenOf(a, b), deg = dirOf(a, b);
        for (let i = 0; i <= 8; i++) { const p = along(a, b, L * i / 8); K.box(p[0], p[1], .06, .06, z + .25, z + (i % 2 ? 2.4 : 2.7), IRON, { ang: deg }); }
        for (const h of [.6, 1.5, 2.25]) { const p = along(a, b, L / 2); K.box(p[0], p[1], L, .05, z + h, z + h + .07, IRON, { ang: deg }); }
      }
      K.mould(gr, [[-.05, z + 2.3], [.05, z + 2.3], [.05, z + 2.42], [-.05, z + 2.42]], GOLD);
    });
    // the spire in three stages: an octagonal core, figures on brackets round it, pinnacles at the corners joined by arches
    const stage = (z0, z1, rc, rp, nf, fh) => {
      K.lathe(0, 0, z0, [[rc, 0, 1], [rc, z1 - z0, 1]], PS, { n: 8, rot, wall: 1, win: { t: W.BLIND, w: rc * .45, y0: z0 - z + .4, y1: z1 - z - .5, n: 1 }, vz: z });
      K.lathe(0, 0, z0 - .25, [[rp + .3, 0, 1], [rp + .3, .25, 1], [rc, .5, 1]], PS2, { n: 8, rot });
      K.detail(() => {
        const pc = K.ngon(0, 0, rp, 8, rot);
        for (let k = 0; k < 8; k++) {
          const p = pc[k], q = pc[(k + 1) % 8], m = along(p, q, lenOf(p, q) / 2);
          K.pinnacle(p[0], p[1], z0, .26, z1 - z0 + 1.3, PS, GOLD, { ang: Math.atan2(p[1], p[0]) / D });
          K.slab(p, q, [[0, z1 - 1.4], [lenOf(p, q), z1 - 1.4], [lenOf(p, q), z1 - .9], [lenOf(p, q) / 2, z1 + .4], [0, z1 - .9]], .14, GOLD, { out: .07 });
          if (k < nf) figure(K, m[0] * .82, m[1] * .82, z0 + .05, fh, { m: 16, c: cols[k] });
        }
      });
    };
    stage(z + 1.1, z + 6.2, 1.15, 2.05, 8, 1.55);
    stage(z + 6.5, z + 10.6, .85, 1.5, 8, 1.25);
    stage(z + 10.9, z + 13.6, .6, 1, 0, 1);
    K.spire(0, 0, z + 13.6, .95, 5.4, GOLD, { n: 8, rot });
    K.detail(() => { K.ball(0, 0, z + 18.95, .14, GOLD); K.box(0, 0, .06, .06, z + 19.1, z + 19.7, GOLD); });
  },

  // Kaiserburg: the imperial castle along the sandstone ridge over the old town, west to east: the Burggarten on its bastion,
  // the Kemenate and the Palas (Romanesque hall, rebuilt 1440s) round the inner court, the double chapel with the
  // Heidenturm, the half-timbered Kastellanhaus; the outer court (Freiung) with the round Sinwellturm (13th c., raised with
  // its storey and helm in 1561), the timbered house over the Deep Well and the Himmelsstallung; the Burggrafenburg with
  // the Walburgis chapel, the Fünfeckturm (pentagonal, about 1040), the vast granary of the Kaiserstallung (1494-95) with
  // tier on tier of dormers, and the Luginsland (1377) with its corner turrets. Walls in reddish Burgsandstein, steep
  // dark-red tile roofs.
  kaiserburg(K) {
    const { W } = K;
    const KS = { m: 1, c: '#9a7767', t: '#b19583', f: 1 | 32, seed: .41 }, KSP = { m: 1, c: '#a2806f', t: '#b49886', f: 0, seed: .66 };
    const TIMB = { m: 2, c: '#e2d8c3', t: '#5b3f2f', f: 1 | 32 | 128, seed: .5 }, ROCK = { m: 9, c: '#7b6357' };
    const TL = { ...TILE, seed: .62 }, TLD = { ...TILE, snow: .9 };
    // the sandstone ridge: the height map has smoothed it away, so the castle gets its plateau back (true m over the origin's
    // ground, a little higher in the west), and the Burggarten bastion a step lower on the north-west
    const P = x => 21 - x * .03, PB = x => P(x) - 6;
    const main = K.ccw([[-114, 11.5], [-104, 2.6], [-94.5, -2.6], [-84.6, -7.4], [-74.9, -11.4], [-71.6, -13.8], [-63.5, -14.2], [-59.5, -19.4], [-44.5, -24.6],
      [-12.9, -32.6], [-1.7, -34.2], [3.2, -20.4], [12, -12], [33, -6.4], [39.6, -6.4], [47.6, 1.4], [57.5, 31], [69.6, 30.6], [116.3, 47.6], [129.6, 58.8],
      [125.5, 72.9], [107.6, 75.1], [74.6, 63.5], [74.9, 72.5], [68.6, 80.9], [62.4, 79.8], [53.6, 69.4], [47.4, 51.5], [19.6, 41.5], [19.6, 53.2], [3.9, 53.8],
      [-6.9, 55.1], [-30.8, 42.5], [-50.1, 38.1], [-66.9, 39.3], [-90.2, 41.9], [-108.6, 43.4], [-113.6, 45.7], [-119.4, 40.6], [-124.6, 22.6]]);
    const bast = K.ccw([[-173.5, -24.6], [-112.6, 15.6], [-124.2, 23.6], [-128.6, 41.6], [-150.6, 52.6], [-189.6, 8.6]]);
    const lift = lvl => (x, y) => Math.max(0, lvl(x) - K.groundAt(x, y));
    K.mound(main, lift(P), ROCK, { flare: .14, rough: 2.4, skirtStep: 3 });
    K.mound(bast, lift(PB), ROCK, { flare: .14, rough: 2.4, skirtStep: 3 });
    // parapets round both plateaus: walls that run down over the rock, a coping on top
    const rampart = (ring, lvl, h) => {
      const inn = K.offset(ring, -.7);
      for (let j = 0; j < ring.length; j++) {
        const j2 = (j + 1) % ring.length, a = ring[j], b = ring[j2], c = inn[j], d = inn[j2], za = lvl(a[0]), zb = lvl(b[0]);
        if (lenOf(a, b) < .3) continue;
        K.wall(a, b, [za - 5, zb - 5], [za + h, zb + h], KSP, {});
        K.wall(d, c, [zb - .5, za - .5], [zb + h, za + h], KSP, {});
        K.quad([a[0], a[1], za + h], [b[0], b[1], zb + h], [d[0], d[1], zb + h], [c[0], c[1], za + h], CAP);
      }
    };
    rampart(main, P, 1.3);
    rampart(bast, PB, 1.3);
    const at = rec => P(rec.c[0]);
    const roofDormers = (ring, deg, ze, rise, rows, wallM) => {           // rows of dormers on both slopes of a gable roof
      const a = deg * D, ex = [Math.cos(a), Math.sin(a)], ey = [-ex[1], ex[0]];
      const S = ring.map(p => p[0] * ex[0] + p[1] * ex[1]), T = ring.map(p => p[0] * ey[0] + p[1] * ey[1]);
      const s0 = Math.min(...S), s1 = Math.max(...S), tc = (Math.min(...T) + Math.max(...T)) / 2, hw = (Math.max(...T) - Math.min(...T)) / 2, g = rise / hw;
      K.detail(() => {
        for (const [k, n, w, h, e] of rows) {
          const z = ze + rise * k, d = rise * (1 - k) / g, m0 = e ?? 3;
          for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
            const u = s0 + m0 + (s1 - s0 - 2 * m0) * (n === 1 ? .5 : i / (n - 1)), t = tc + s * d;
            K.dormer(u * ex[0] + t * ey[0], u * ex[1] + t * ey[1], z, w, h, deg + s * 90, g, wallM, TLD, {});
          }
        }
      });
    };
    const small = (i, len) => len < 3.5 ? null : i === 0 ? null : { t: W.RECT, w: .9, y0: (i - 1) * 3.4 + 1.2, y1: (i - 1) * 3.4 + 2.7, P: 3.1, m: 1 };
    const build = (id, o) => { const r = K.part(id); if (!r) return null; const zb = at(r); return { r, zb, ...K.footprint(r, { wall: KS, roof: TL, z: zb, z0: zb - 7, win: small, ...o }) }; };

    // ---- the Palas: two great halls over a basement, small paired windows below, the hall windows above, two rows of dormers ----
    const pal = K.part('Palas'), zp = at(pal);
    K.footprint(pal, { wall: KS, roof: TL, roofType: 'gable', eave: 14, rh: 11, deg: -24, z: zp, z0: zp - 9, simplify: 1.2, storeys: [0, 5.2, 9.6],
      win: (i, len) => len < 6 ? null : [null, { t: W.ROUND, w: .8, y0: 2, y1: 3.7, P: 3.4, m: 1.6 }, { t: W.ROUND, w: 1.5, y0: 6.2, y1: 8.6, P: 3.4, m: 1.6, lights: 2 }, { t: W.RECT, w: 1.2, y0: 10.5, y1: 12.5, P: 3.4, m: 1.6 }][i] });
    roofDormers(K.simplify(pal.ring, 1.2), -24, zp + 14, 11, [[.25, 6, 1.1, 1.1], [.55, 4, .9, .9]], KS);
    // ---- the Kemenate: four storeys round its block, a deep roof all round ----
    const kem = K.part('Kemenate'), zk = at(kem), kr = K.ccw(K.simplify(kem.ring, 2.5));
    for (let j = 0; j < kr.length; j++) K.storeys(kr[j], kr[(j + 1) % kr.length], [zk - 9, zk, zk + 4.4, zk + 8.2, zk + 12, zk + 15], KS, (i, len) => len < 4 || i === 0 ? null : { t: i === 1 ? W.ROUND : W.RECT, w: 1.1, y0: [0, .9, 5.3, 9.1, 12.9][i], y1: [0, 3, 7.4, 11.2, 14.4][i], P: 3.4, m: 1.4 }, { vz: zk, E: zk + 15 });
    K.wingRoof(kr, zk + 15, 8.5, 9.5, TL, { over: .4 });
    // ---- the double chapel and the Heidenturm ----
    build('Kaiserkapelle', { roofType: 'gable', eave: 15.5, rh: 8, deg: -2.7, storeys: [0, 6.5], win: (i, len) => len < 4 || !i ? null : { t: W.ROUND, w: i === 1 ? .7 : 1.1, y0: i === 1 ? 2.6 : 8.5, y1: i === 1 ? 4.4 : 12.6, P: 3, m: 1.2 } });
    const hd = build('Heidenturm', { roofType: 'pyramid', eave: 28.5, rh: 7, storeys: [0, 9, 17, 23], win: (i, len) => [null, { t: W.SLIT, w: .4, y0: 4, y1: 6.5, n: 1 }, { t: W.ROUND, w: .9, y0: 12, y1: 14.5, n: 1 }, { t: W.ROUND, w: .8, y0: 19, y1: 21.5, n: 2, m: 1.6 }, { t: W.ROUND, w: 1, y0: 24.5, y1: 27, n: 2, m: 1.3, lights: 2 }][i] });
    if (hd) { K.cornice(K.ccw(hd.r.ring), hd.zb + 27.9, .6, .4, KSP); K.detail(() => K.ball(hd.r.c[0], hd.r.c[1], hd.zb + 35.6, .3, GOLD)); }
    build('B176940', { roofType: 'hip', eave: 9, rh: 4 });
    // ---- round the inner court and the north side: the Kastellanhaus and the houses of the castle staff, half-timbered over stone ----
    build('Kastellanhaus', { wall: TIMB, roofType: 'gable', eave: 10.4, rh: 8, deg: 75, storeys: [0, 4.2, 7.4], win: (i, len) => len < 3.5 || !i ? null : { t: W.RECT, w: 1, y0: [0, 1.2, 5.2, 8.3][i], y1: [0, 2.8, 6.6, 9.7][i], P: 2.9, m: 1 } });
    roofDormers(K.part('Kastellanhaus').ring, 75, at(K.part('Kastellanhaus')) + 10.4, 8, [[.3, 4, .9, .9]], TIMB);
    build('B176946', { wall: TIMB, roofType: 'gable', eave: 7.6, rh: 7, deg: -6, storeys: [0, 3.8], win: (i, len) => len < 3.5 || !i ? null : { t: W.RECT, w: 1, y0: [0, 1.1, 4.8][i], y1: [0, 2.6, 6.3][i], P: 2.8, m: 1 } });
    build('B176945', { roofType: 'gable', eave: 4.5, rh: 3.5, deg: -6.6 });
    build('B177015', { roofType: 'gable', eave: 4.5, rh: 4, deg: -6.6 });
    build('B177018', { roofType: 'gable', eave: 7, rh: 4.5, deg: -13 });
    build('Finanzstadel', { roofType: 'gable', eave: 8.5, rh: 9.5, deg: 81, storeys: [0, 4.2] });
    roofDormers(K.part('Finanzstadel').ring, 81, at(K.part('Finanzstadel')) + 8.5, 9.5, [[.3, 3, 1, 1], [.62, 2, .8, .8]], KS);
    build('Burgamtsmannhaus', { roofType: 'gable', eave: 10, rh: 8, deg: -82, storeys: [0, 3.6, 6.8] });
    build('B177019', { roofType: 'gable', eave: 6, rh: 4, deg: 76 });
    build('B177020', { roofType: 'gable', eave: 6.5, rh: 4.5, deg: 81 });
    // ---- the outer court: the house over the Deep Well, the Himmelsstallung and Hasenburg along the south side ----
    build('Tiefer Brunnen', { wall: TIMB, roofType: 'gable', eave: 5.2, rh: 6, deg: -9, storeys: [0, 2.8], win: (i, len) => len < 3 || !i ? null : { t: W.RECT, w: .9, y0: i === 1 ? .9 : 3.6, y1: i === 1 ? 2.2 : 4.7, P: 2.6, m: .9 } });
    build('Himmelsstallung', { wall: TIMB, roofType: 'gable', eave: 8, rh: 7.5, deg: -13.8, storeys: [0, 4], win: (i, len) => len < 3.5 || !i ? null : { t: W.RECT, w: i === 1 ? .7 : 1, y0: i === 1 ? 1.6 : 5.2, y1: i === 1 ? 2.6 : 6.8, P: 3, m: 1 } });
    roofDormers(K.part('Himmelsstallung').ring, -13.8, at(K.part('Himmelsstallung')) + 8, 7.5, [[.35, 5, .9, .9]], TIMB);
    build('Hasenburg', { roofType: 'gable', eave: 8.5, rh: 6, deg: 74.6, storeys: [0, 4.2] });
    // ---- the Sinwellturm: a round shaft of rusticated blocks, the 1561 storey with its ring of windows, the tall tiled helm ----
    {
      const s = K.part('Sinwellturm'), c = s.c, zs = at(s), R = 6.05;
      K.lathe(c[0], c[1], zs - 8, [[R + .3, 0, 1], [R + .3, 8.4, 1], [R, 8.9, 1], [R, 29.5, 1]], { ...KS, seed: .83 }, { seg: K.seg(30), wall: 1, vz: zs, win: { t: W.SLIT, w: .42, y0: 8.5, y1: 10.8, P: 9.5 }, E: zs + 21.5 });
      K.band(K.ngon(c[0], c[1], R, K.seg(30)), zs + 14.5, .3, .2, KSP);
      K.lathe(c[0], c[1], zs + 21.5, [[R + .15, 0, 1], [R + .15, 4.3, 1]], { ...KS, seed: .21 }, { seg: K.seg(30), wall: 1, vz: zs, win: { t: W.RECT, w: .95, y0: 22.5, y1: 24.7, P: 2.7 } });
      K.cornice(K.ngon(c[0], c[1], R + .15, K.seg(30)), zs + 25.2, .6, .4, KSP);
      K.cornice(K.ngon(c[0], c[1], R + .02, K.seg(30)), zs + 21.2, .4, .35, KSP);
      K.lathe(c[0], c[1], zs + 25.8, [[R + .65, 0, 1], [R * .9, 1.1], [R * .7, 3.2], [R * .48, 6], [R * .26, 9], [R * .1, 11.4], [.08, 12.4]], TL, { seg: K.seg(24) });
      K.detail(() => { K.ball(c[0], c[1], zs + 38.1, .3, GOLD); K.box(c[0], c[1], .08, .08, zs + 38.4, zs + 39.6, GOLD); K.box(c[0] + .35, c[1], .7, .05, zs + 39, zs + 39.45, GOLD); });
    }
    // ---- the Burggrafenburg: the Walburgis chapel with its ridge turret, the Fünfeckturm, the round tower by it ----
    const wb = build('Walburgiskapelle', { roofType: 'gable', eave: 6, rh: 5, deg: -51.5, win: (i, len) => len < 4 || !i ? null : { t: W.ROUND, w: .8, y0: 2.4, y1: 4.4, P: 3, m: 1 } });
    if (wb) K.detail(() => { const c = wb.r.c; K.lathe(c[0], c[1], wb.zb + 10.2, [[.6, 0, 1], [.6, 1.6, 1]], KSP, { n: 6, wall: 1, win: { t: W.BELFRY, w: .35, y0: 10.5, y1: 11.5, n: 1 }, vz: wb.zb }); K.spire(c[0], c[1], wb.zb + 11.8, .7, 3, TL, { n: 6 }); K.ball(c[0], c[1], wb.zb + 14.8, .12, GOLD); });
    {
      const f = K.part('Fünfeckturm'), zf = at(f), fr = K.ccw(f.ring);
      for (let j = 0; j < fr.length; j++) K.storeys(fr[j], fr[(j + 1) % fr.length], [zf - 8, zf, zf + 8, zf + 15, zf + 22], KS, (i, len) => len < 3 || !i ? null : { t: i === 3 ? W.ROUND : W.SLIT, w: i === 3 ? .8 : .4, y0: [0, 3, 10, 17.5][i], y1: [0, 5.5, 12.6, 20][i], n: 1 }, { vz: zf, E: zf + 22 });
      K.cornice(fr, zf + 21.4, .6, .4, KSP);
      K.tent(fr, [f.c[0], f.c[1], zf + 31], zf + 22, TL, { over: .35 });
      K.detail(() => K.ball(f.c[0], f.c[1], zf + 31, .25, GOLD));
    }
    build('B177022', { roofType: 'hip', eave: 11, rh: 5.5 });
    { const r = K.part('B177023'), zr = at(r), R = 5.2, c = [68.3, 72.4];
      K.lathe(c[0], c[1], zr - 8, [[R, 0, 1], [R, 19.5, 1]], KS, { seg: K.seg(20), wall: 1, vz: zr, win: { t: W.SLIT, w: .4, y0: 5, y1: 7.5, P: 6 } });
      K.lathe(c[0], c[1], zr + 11.5, [[R + .4, 0, 1], [R * .55, 3.2], [.1, 6.2]], TL, { seg: K.seg(18) }); }
    // ---- the Kaiserstallung: stone storeys under a gigantic roof with four tiers of dormers ----
    {
      const ks = K.part('Kaiserstallung'), zs = at(ks), R = K.ccw([[71.5, 33.9], [114.9, 50.1], [106.9, 71.4], [66.4, 56.3]]), deg = 20.5;
      for (let j = 0; j < 4; j++) K.storeys(R[j], R[(j + 1) % 4], [zs - 8, zs, zs + 5, zs + 10], KS, (i, len) => len < 25 || !i ? (i === 2 && len < 25 ? { t: W.RECT, w: 1, y0: 6.5, y1: 8.4, n: 3, m: 4 } : null) : { t: i === 1 ? W.ROUND : W.RECT, w: i === 1 ? 2.6 : 1.1, y0: i === 1 ? 0 : 6.5, y1: i === 1 ? 3.6 : 8.4, P: i === 1 ? 6.8 : 3.4, m: 2 }, { vz: zs, E: zs + 10 });
      const pl = K.planes(R, 'gable', zs + 10, 19, deg);
      K.roofPlanes(R, pl, TL, { over: .5 });
      K.roofWalls(R, pl, zs + 10, KS, { vz: zs, E: zs + 10, win: (j, len) => len < 25 ? { t: W.RECT, w: .9, y0: 13, y1: 14.6, n: 3, m: 5 } : null });
      K.cornice(R, zs + 9.5, .5, .4, KSP);
      roofDormers(R, deg, zs + 10, 19, [[.1, 11, 1.35, 1.25, 4], [.33, 10, 1.1, 1.05, 5], [.56, 8, .9, .85, 7], [.78, 5, .7, .7, 10]], KS);
    }
    // ---- the Luginsland: a square tower with four corner turrets on corbels round its steep roof ----
    {
      const lg = K.part('Luginsland'), zl = at(lg), lr = K.ccw(lg.ring), c = lg.c;
      for (let j = 0; j < 4; j++) K.storeys(lr[j], lr[(j + 1) % 4], [zl - 8, zl, zl + 9, zl + 17, zl + 24.5], KS, (i, len) => [null, { t: W.SLIT, w: .45, y0: 3.5, y1: 6, n: 1 }, { t: W.RECT, w: .9, y0: 12, y1: 14, n: 2, m: 2.5 }, { t: W.RECT, w: 1, y0: 19.5, y1: 21.6, n: 2, m: 2.2 }][i], { vz: zl, E: zl + 24.5 });
      K.cornice(lr, zl + 23.9, .6, .45, KSP);
      K.tent(lr, [c[0], c[1], zl + 37], zl + 24.5, TL, { over: .4 });
      for (const p of lr) {
        const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy), q = [p[0] + dx / l * .5, p[1] + dy / l * .5];
        K.lathe(q[0], q[1], zl + 20.5, [[.25, 0, 1], [1.2, 1.7, 1], [1.2, 6.6, 1]], KS, { n: 8, wall: 1, vz: zl, win: { t: W.SLIT, w: .3, y0: 23.6, y1: 25.6, n: 1 } });
        K.spire(q[0], q[1], zl + 27.1, 1.35, 4.6, TL, { n: 8 });
        K.detail(() => K.ball(q[0], q[1], zl + 31.6, .13, GOLD));
      }
      K.detail(() => K.ball(c[0], c[1], zl + 37, .25, GOLD));
    }
    // ---- the bastion walls down to the town: the long wall to the Tiergärtnertor, a wall tower ----
    { const w = K.part('B176882'), wr = K.ccw(w.ring), zt = PB(w.c[0]) + 1.4;
      K.walls(wr, K.groundMin(wr) - 3, zt, KSP, {}); K.cap(wr, zt, CAP); }
    { const t = K.part('B176925'); if (t) { const zg = K.groundAt(t.c[0], t.c[1]); K.footprint(t, { wall: KS, roof: TL, roofType: 'hip', eave: 11, rh: 5, z: zg, win: (j, len) => len > 4 ? { t: W.SLIT, w: .4, y0: 6, y1: 8, n: 1 } : null }); } }
    { const t = K.part('B176934'); if (t) K.footprint(t, { wall: KS, roof: TL, roofType: 'gable', eave: 6, rh: 4.5, z: K.groundAt(t.c[0], t.c[1]) }); }
  },
};
