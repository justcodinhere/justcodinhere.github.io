// Alpine landmarks: Neuschwanstein over the Pöllat gorge with the Marienbrücke, Hohenschwangau above the Alpsee, Kufstein
// fortress on its rock over the Inn, and the Wieskirche alone in the meadows.
// Builders receive the kit K (js/landmarks.js); local metres round each landmark's footprints.json origin.
const SLATE = { m: 5, c: '#535b65', snow: .8, seed: .2 };
const TILE = { m: 6, c: '#86452f', snow: .85, seed: .4 };
const CU = { m: 4, c: '#5e8a78', snow: .6 };
const GOLD = { m: 15, c: '#b98a32' };
const DIAL = { m: 12, c: '#2a303a' };
const IRON = { m: 14, c: '#2f3133' };
const FOREST = { m: 17, c: '#2f392e', f: 110 };              // wooded slopes, the snow thinned (flag byte)
const D = Math.PI / 180;
const lenOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dirOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / D;
const sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
// the point t m along a -> b, out m to its right (outwards on a counter-clockwise ring)
function along(a, b, t, out = 0) { const L = lenOf(a, b), ex = (b[0] - a[0]) / L, ey = (b[1] - a[1]) / L; return [a[0] + ex * t + ey * out, a[1] + ey * t - ex * out]; }
function figure(K, x, y, z, h, m) {
  K.lathe(x, y, z, [[h * .17, 0, 1], [h * .16, h * .28], [h * .12, h * .6], [h * .13, h * .72], [h * .06, h * .8], [h * .08, h * .87], [h * .07, h * .96], [0, h]], m, { seg: K.seg(8) });
}
// the convex hull of the landmark's own outlines in the current frame, grown by out
const hullOf = (K, out, f = p => !p.ctx) => K.offset(K.ccw(K.hull(K.parts.filter(f).flatMap(p => K.local(p.ring)))), out);
// lift(x, y) eased to nothing round the neighbouring houses (footprints.json ctx records), so a crag never buries them
function spare(K, lift, pad = 2, ease = 14) {
  const keep = K.parts.filter(p => p.ctx).map(p => [...K.local([p.c])[0], Math.sqrt(p.area / Math.PI)]);
  return (x, y) => { let v = lift(x, y); for (let i = 0; i < keep.length && v > 0; i++) { const [cx, cy, r] = keep[i]; v *= sm((Math.hypot(x - cx, y - cy) - r - pad) / ease); } return v; };
}
// a round tower: shaft r from z0 to z1 with slit windows staggered up a stair, a corbelled crenellated or plain top
function roundTower(K, c, r, z0, z1, wall, o = {}) {
  const W = K.W, n = o.seg || K.seg(18), steps = o.slits ?? Math.max(1, Math.floor((z1 - z0 - 6) / 5));
  K.lathe(c[0], c[1], z0, [[r, 0, 1], [r, z1 - z0, 1]], wall, { seg: n, wall: 1, E: z1 });
  K.detail(() => {
    for (let i = 0; i < steps; i++) {
      const a = (i * 2.4 + (o.rot || 0)) % (Math.PI * 2), z = z1 - 4 - i * 5, p = [c[0] + Math.cos(a) * (r + .03), c[1] + Math.sin(a) * (r + .03)];
      if (z < (o.zmin ?? z0 + 3)) break;
      const t = [-Math.sin(a), Math.cos(a)];
      K.wall([p[0] - t[0] * .35, p[1] - t[1] * .35], [p[0] + t[0] * .35, p[1] + t[1] * .35], z, z + 1.6, wall, { win: { t: o.win || W.SLIT, w: o.ww || .32, y0: z + .1, y1: z + 1.5, n: 1 } });
    }
  });
}
// a corbelled, crenellated top on a round tower or bartizan: corbel ring, parapet, merlons
function crownRound(K, c, r, z, wall, o = {}) {
  const n = o.seg || K.seg(18), R = r + (o.over ?? .45);
  K.lathe(c[0], c[1], z - 1.1, [[r, 0, 1], [R, 1.1, 1], [R, 2, 1]], wall, { seg: n });
  K.lathe(c[0], c[1], z + .9, [[R - .4, 0, 1], [R - .4, .05, 1], [0, .05]], wall, { seg: n });
  K.detail(() => K.crenels(K.ngon(c[0], c[1], R - .2, Math.max(8, Math.round(R * 2.2))), z + .9, 1, .9, .7, .4, wall));
}
// a crenellated parapet along an open path (or ring), th thick
function parapet(K, path, z, h, wall, o = {}) {
  K.walls(path, z, z + h * .55, wall, { skip: o.open ? j => j === path.length - 1 : null });
  K.detail(() => K.crenels(path, z + h * .55, h * .45, o.mw ?? 1.1, o.gw ?? .8, o.th ?? .5, wall, { open: o.open }));
}

export default {
  // Neuschwanstein (1869-86, Eduard Riedel and Christian Jank for Ludwig II): pale limestone over brick on a crag above the
  // Pöllat gorge. West to east: the Palas, five storeys under its steep slate roof, its west wing gabled to north and south
  // with the throne hall's balconies over the cliff, the slender north stair tower (65 m) and the south tower; the Bower
  // (Kemenate) and the Knights' House round the upper court, the Square Tower; the red-brick Gatehouse with its corner
  // towers at the end of the ridge. Gilded finials, a lion on the courtyard gable.
  neuschwanstein(K) {
    const { W } = K;
    const LIME = { m: 3, c: '#dbd6cb', t: '#cdc6b7', f: 1 | 32, seed: .3 }, LIMEP = { m: 3, c: '#e1dcd2', t: '#d2cbbd', f: 0, seed: .63 };
    const BR = { m: 0, c: '#a5644d', t: '#dcd5c7', f: 1 | 8 | 16 | 32, seed: .5 }, BRP = { m: 0, c: '#a5644d', t: '#dcd5c7', f: 16, seed: .58 };
    const ROCK = { m: 9, c: '#7f7d76' }, SL = { ...SLATE, c: '#4f5761' }, CAPS = { m: 11, c: '#cfc9bc' };
    K.at(0, 0, 0, 23.5, () => {
      // ---- the crag: the castle's level falls a little from the Palas to the Gatehouse; a wooded shoulder round the cliff ----
      const Lv = x => 26 - .08 * x;
      const lift = lv => (x, y) => Math.max(0, lv(x) - K.groundAt(x, y));
      K.mound(hullOf(K, 18), lift(x => Lv(x) - 15), FOREST, { skirtM: FOREST, flare: 1.1, rough: 3, skirtStep: 5 });
      K.mound(hullOf(K, 4.5), lift(Lv), ROCK, { flare: .2, rough: 3.4, skirtStep: 3 });
      const zP = Lv(10), ZE = zP + 32, X0 = -4.23, X1 = 29.77, Y0 = -7.35, Y1 = 7.67;
      // ---- the Palas: five storeys of round-arched windows, the singers' hall arcades on the fourth ----
      const pw = (i, len) => len < 8 ? null : [null, { t: W.RECT, w: 1, y0: 2, y1: 4, P: 3.4, m: 1.4 }, { t: W.ROUND, w: 1.5, y0: 7.2, y1: 10.2, P: 3.4, m: 1.4, lights: 2 },
        { t: W.ROUND, w: 1.5, y0: 12.6, y1: 15.8, P: 3.4, m: 1.4, lights: 2 }, { t: W.ROUND, w: 2.5, y0: 18.2, y1: 22.6, P: 4.25, m: 1.2, lights: 3 }, { t: W.ROUND, w: 1.4, y0: 24.6, y1: 27.2, P: 3.4, m: 1.4, lights: 2 }, { t: W.RECT, w: .9, y0: 29, y1: 30.6, P: 3.4, m: 1.4 }][i];
      const zs = [zP - 12, zP, zP + 6, zP + 11.5, zP + 17, zP + 23.5, zP + 28, ZE];
      const PR = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
      K.storeys(PR[0], PR[1], zs, LIME, pw, { vz: zP, E: ZE });
      K.storeys(PR[2], PR[3], zs, LIME, pw, { vz: zP, E: ZE });
      K.storeys(PR[1], PR[2], zs, LIME, (i, len) => i ? { t: W.ROUND, w: 1.3, y0: [0, 2, 7.2, 12.6, 18.2, 24.6, 29][i], y1: [0, 4, 10, 15.6, 22.4, 27, 30.6][i], n: 3, m: 2 } : null, { vz: zP, E: ZE });
      for (const z of [zP + 11.5, zP + 17, zP + 23.5]) K.band(PR, z - .25, .28, .2, LIMEP);
      const pp = K.planes(PR, 'gable', ZE, 13, 0);
      K.roofPlanes(PR, pp, SL, { over: .5 });
      K.roofWalls(PR, pp, ZE, LIME, { skip: j => j !== 1, vz: zP, E: ZE, win: { t: W.ROUND, w: 1.2, y0: 34, y1: 37, n: 2, m: 4.5, lights: 2 } });
      K.cornice(PR, ZE - .6, .6, .45, LIMEP);
      // the courtyard gable: corner turrets, a gilded lion on the apex
      K.detail(() => {
        for (const y of [Y0, Y1]) { K.lathe(X1 + .2, y, ZE - 10, [[.2, 0, 1], [.95, 1.6, 1], [.95, 13, 1]], LIMEP, { n: 8, wall: 1, win: { t: W.SLIT, w: .3, y0: ZE - 2, y1: ZE + 1.5, n: 1 } }); K.spire(X1 + .2, y, ZE + 3, 1.1, 4.2, SL, { n: 8 }); K.ball(X1 + .2, y, ZE + 7.1, .14, GOLD); }
        figure(K, X1 + .2, 0, ZE + 12.6, 2, GOLD);
      });
      // ---- the west wing: gabled to north and south, the throne hall over the cliff with its two balconies ----
      const WW = [[-23.72, -15.41], [.5, -12.45], [-3.5, 11.21], [-27.68, 6.36]], zW = Lv(-12), ZEW = zW + 32;
      const wp = K.planes(WW, 'gable', ZEW, 15, 100.3);
      K.roofPlanes(WW, wp, SL, { over: .5 });
      const ww = (j) => (i, len) => !i ? null : j === 3 ? [null, { t: W.RECT, w: 1, y0: 2, y1: 4, P: 3.6, m: 1.6 }, { t: W.ROUND, w: 1.4, y0: 7.2, y1: 10.2, P: 3.6, m: 1.6, lights: 2 }, { t: W.ROUND, w: 2.4, y0: 12.4, y1: 16.6, P: 4.6, m: 1.6, lights: 3 }, { t: W.ROUND, w: 2.4, y0: 18.2, y1: 22.8, P: 4.6, m: 1.6, lights: 3 }, { t: W.ROUND, w: 1.4, y0: 24.6, y1: 27.2, P: 3.6, m: 1.6, lights: 2 }, { t: W.RECT, w: .9, y0: 29, y1: 30.6, P: 3.6, m: 1.6 }][i]
        : pw(i, len);
      for (let j = 0; j < 4; j++) { if (j === 1) continue; K.storeys(WW[j], WW[(j + 1) % 4], [zW - 14, zW, zW + 6, zW + 11.5, zW + 17, zW + 23.5, zW + 28, ZEW], LIME, ww(j), { vz: zW, E: ZEW }); }
      K.roofWalls(WW, wp, ZEW, LIME, { skip: j => j !== 0 && j !== 2, vz: zW, E: ZEW, win: { t: W.ROUND, w: 1.4, y0: 34.5, y1: 38, n: 2, m: 6, lights: 2 } });
      K.cornice(WW, ZEW - .6, .6, .45, LIMEP);
      K.detail(() => {
        // the throne hall's balconies on the west face, a corbelled turret at each gable corner, finials on the apexes
        const a = WW[3], b = WW[0], L = lenOf(a, b);
        for (const z of [zW + 12, zW + 17.6]) {
          const p0 = along(a, b, L / 2 - 6), p1 = along(a, b, L / 2 + 6), q0 = along(a, b, L / 2 - 6, 1.6), q1 = along(a, b, L / 2 + 6, 1.6);
          K.quad([p0[0], p0[1], z], [p1[0], p1[1], z], [q1[0], q1[1], z], [q0[0], q0[1], z], CAPS);
          K.quad([q0[0], q0[1], z - .45], [q1[0], q1[1], z - .45], [p1[0], p1[1], z - .45], [p0[0], p0[1], z - .45], CAPS);
          K.wall(q0, q1, z - .45, z + 1.05, LIMEP, { win: { t: W.ARCADE, w: .35, y0: z + .1, y1: z + .85, P: .55, m: .3 } });
          K.wall(p0, q0, z - .45, z + 1.05, LIMEP, {}); K.wall(q1, p1, z - .45, z + 1.05, LIMEP, {});
          for (let k = 0; k <= 4; k++) { const c = along(a, b, L / 2 - 6 + k * 3, 1.1); K.lathe(c[0], c[1], z - 2.4, [[.12, 0, 1], [.75, 1.95, 1], [.75, 1.95, 1]], CAPS, { n: 4 }); }
        }
        for (const p of WW) { K.lathe(p[0], p[1], ZEW - 6, [[.2, 0, 1], [1, 1.5, 1], [1, 9, 1]], LIMEP, { n: 8, wall: 1, win: { t: W.SLIT, w: .3, y0: ZEW - 1.5, y1: ZEW + 1.5, n: 1 } }); K.spire(p[0], p[1], ZEW + 3, 1.15, 4.5, SL, { n: 8 }); K.ball(p[0], p[1], ZEW + 7.4, .14, GOLD); }
        for (const [a2, b2] of [[WW[0], WW[1]], [WW[2], WW[3]]]) { const m = along(a2, b2, lenOf(a2, b2) / 2, .2); K.box(m[0], m[1], .16, .16, ZEW + 14.6, ZEW + 17, GOLD); K.ball(m[0], m[1], ZEW + 15, .3, GOLD); }
      });
      // ---- the north stair tower (65 m) with its gallery and needle spire, the south tower, the turrets ----
      const nt = [-8.12, 11.56];
      roundTower(K, nt, 3.85, zW - 14, zW + 48.5, LIME, { slits: 8 });
      K.band(K.ngon(nt[0], nt[1], 3.85, K.seg(18)), zW + 33, .3, .22, LIMEP);
      K.lathe(nt[0], nt[1], zW + 48.5, [[3.85, 0, 1], [4.35, 1, 1], [4.35, 1.3, 1], [3.75, 1.3, 1], [3.75, 5.6, 1]], LIMEP, { seg: K.seg(18), wall: 1, win: { t: W.ROUND, w: 1, y0: zW + 50.1, y1: zW + 53.2, P: 2.6 } });
      K.cornice(K.ngon(nt[0], nt[1], 3.75, K.seg(18)), zW + 53.6, .6, .4, LIMEP);
      K.lathe(nt[0], nt[1], zW + 54.1, [[4.1, 0, 1], [3.1, 2.2], [1.9, 5.4], [.8, 9.2], [.1, 12.4]], SL, { seg: K.seg(18) });
      K.lathe(-11.1, 11.26, zW + 49, [[.65, 0, 1], [.65, 9.5, 1]], LIMEP, { n: 8 }); K.spire(-11.1, 11.26, zW + 58.5, .8, 4.5, SL, { n: 8 });
      K.detail(() => { K.ball(nt[0], nt[1], zW + 66.4, .26, GOLD); K.box(nt[0], nt[1], .1, .1, zW + 66.6, zW + 68.4, GOLD); K.ball(-11.1, 11.26, zW + 63, .12, GOLD); });
      const st = [-1.58, -9.96];
      roundTower(K, st, 2.5, zW - 14, zW + 40.5, LIME, { slits: 6, rot: 1 });
      K.lathe(st[0], st[1], zW + 40.5, [[2.5, 0, 1], [2.9, .8, 1], [2.9, 1, 1], [2.45, 1, 1], [2.45, 4.6, 1]], LIMEP, { seg: K.seg(14), wall: 1, win: { t: W.ROUND, w: .8, y0: zW + 41.8, y1: zW + 44.4, P: 2.2 } });
      K.lathe(st[0], st[1], zW + 45.1, [[2.75, 0, 1], [2, 2], [1.1, 5], [.08, 9.6]], SL, { seg: K.seg(14) });
      K.detail(() => K.ball(st[0], st[1], zW + 54.6, .2, GOLD));
      K.lathe(-1.87, 9.6, zP + 24, [[.3, 0, 1], [1.7, 2.2, 1], [1.7, 11, 1]], LIMEP, { n: 8, wall: 1, win: { t: W.ROUND, w: .6, y0: 27.5, y1: 30, n: 1 }, vz: zP });
      K.spire(-1.87, 9.6, zP + 35, 1.9, 5.5, SL, { n: 8 });
      K.lathe(16.6, 10.9, zP - 4, [[2.3, 0, 1], [2.3, 38, 1]], LIME, { n: 8, wall: 1, win: { t: W.SLIT, w: .35, y0: 24, y1: 27, n: 1 }, vz: zP });
      K.cornice(K.ngon(16.6, 10.9, 2.3, 8, Math.PI / 8), zP + 33.4, .5, .35, LIMEP);
      K.lathe(16.6, 10.9, zP + 34, [[2.55, 0, 1], [1.4, 2.6], [.08, 6.4]], SL, { n: 8 });
      K.lathe(29.66, 7.65, zP + 18, [[.3, 0, 1], [1.05, 1.6, 1], [1.05, 13, 1]], LIMEP, { n: 8 });
      K.spire(29.66, 7.65, zP + 31, 1.2, 4.4, SL, { n: 8 });
      K.detail(() => { K.ball(16.6, 10.9, zP + 40.4, .16, GOLD); K.ball(-1.87, 9.6, zP + 40.5, .14, GOLD); K.ball(29.66, 7.65, zP + 35.4, .12, GOLD); });
      const p117 = K.ccw([[18.84, 7.66], [29.77, 7.67], [29.77, 11.59], [18.84, 11.6]]), pl117 = [{ d: [0, 1], g: 4 / 3.9, zt: zP + 25, s0: 7.66 }];
      K.roofPlanes(p117, pl117, SL, { over: .3 }); K.roofWalls(p117, pl117, zP - 6, LIME, { vz: zP, win: (j, len) => len > 9 ? { t: W.ROUND, w: 1.2, y0: 14, y1: 17, P: 3.4, m: 1 } : null });
      // ---- round the upper court: the Bower, the connecting wings, the Knights' House, the Square Tower ----
      const part = id => { const r = K.part(id); return r ? K.ccw(K.local(r.ring)) : null; };
      const wing = (id, eave, rise, deg, wins, o = {}) => {
        const r = part(id); if (!r) return null;
        const cx = r.reduce((t, p) => t + p[0], 0) / r.length, zb = o.z ?? Lv(cx), pl = K.planes(r, o.type || 'gable', zb + eave, rise, deg);
        K.roofPlanes(r, pl, o.roof || SL, { over: .45 });
        K.roofWalls(r, pl, zb - 10, o.wall || LIME, { vz: zb, E: zb + eave, win: wins });
        if (o.cornice !== false) K.cornice(r, zb + eave - .5, .5, .4, LIMEP);
        return { r, zb };
      };
      const rows = (P, n0 = 1, top = 99) => (j, len) => len < 5 ? null : { t: W.ROUND, w: 1.2, y0: 2.4, y1: Math.min(top, 4.6), P, m: 1.2, lights: n0 };
      const bower = wing('B3603', 13.5, 6.5, 0, (j, len) => len < 5 ? null : { t: W.ROUND, w: 1.3, y0: 5.4, y1: 8.4, P: 3.2, m: 1.2, lights: 2 });
      if (bower) for (let j = 0; j < bower.r.length; j++) { const a = bower.r[j], b = bower.r[(j + 1) % bower.r.length]; if (lenOf(a, b) > 6) K.wall(a, b, bower.zb + 9.2, bower.zb + 12.6, LIME, { vz: bower.zb, E: bower.zb + 13.5, win: { t: W.ROUND, w: 1.1, y0: 10, y1: 12.2, P: 3.2, m: 1.2 } }); }
      const bt = part('B3604');
      if (bt) { const c = [31.9, -18.52], zb = Lv(32); K.walls(bt, zb - 10, zb + 20, LIME, { vz: zb, E: zb + 20, win: (j, len) => ({ t: W.ROUND, w: .9, y0: 16, y1: 18.4, n: 1 }) }); K.cornice(bt, zb + 19.4, .5, .35, LIMEP); K.lathe(c[0], c[1], zb + 20, [[3.9, 0, 1], [0, 7.5]], SL, { n: 4, rot: Math.PI / 4 }); K.detail(() => K.ball(c[0], c[1], zb + 27.5, .15, GOLD)); }
      wing('B3605', 9, 4, 0, rows(3, 1));
      wing('B3606', 16, 4, 90, (j, len) => len > 8 ? { t: W.ROUND, w: 1.2, y0: 8, y1: 11, P: 3.3, m: 1, lights: 2 } : null, { type: 'skillion' });
      wing('B3599', 11, 4, 0, (j, len) => len > 8 ? { t: W.ROUND, w: 1.1, y0: 6.5, y1: 9, P: 3.2, m: .8 } : null);
      const kh = wing('B3601', 18, 6.5, 0, (j, len) => len < 6 ? null : { t: W.ROUND, w: 1.3, y0: 8.8, y1: 11.8, P: 3.4, m: 1.2, lights: 2 });
      if (kh) for (let j = 0; j < kh.r.length; j++) { const a = kh.r[j], b = kh.r[(j + 1) % kh.r.length]; if (lenOf(a, b) > 6) K.wall(a, b, kh.zb - 1, kh.zb + 6.2, LIME, { vz: kh.zb, E: kh.zb + 18, win: { t: Math.abs(a[1] - b[1]) < 1 && a[1] < 10 ? W.ARCADE : W.ROUND, w: 1.6, y0: Math.abs(a[1] - b[1]) < 1 && a[1] < 10 ? 0 : 2.4, y1: 5.2, P: 3.4, m: 1 } }); }
      wing('B3600', 14, 4, 0, null);
      { const c = [54.71, 17.66], zb = Lv(55); K.lathe(c[0], c[1], zb - 6, [[1.95, 0, 1], [1.95, 31, 1]], LIME, { n: 8, wall: 1, win: { t: W.SLIT, w: .3, y0: 6, y1: 22, n: 1 }, vz: zb }); K.cornice(K.ngon(c[0], c[1], 1.95, 8, Math.PI / 8), zb + 24.4, .5, .3, LIMEP); K.lathe(c[0], c[1], zb + 25, [[2.2, 0, 1], [1.1, 2.6], [.06, 6]], SL, { n: 8 }); K.detail(() => K.ball(c[0], c[1], zb + 31, .14, GOLD)); }
      const gal = part('B3598');
      if (gal) { const zb = Lv(63); const pl = K.planes(gal, 'gable', zb + 10, 3.5, 0); K.roofPlanes(gal, pl, SL, { over: .35 }); K.roofWalls(gal, pl, zb - 10, LIME, { vz: zb, E: zb + 10, win: (j, len) => len > 10 ? { t: W.ARCADE, w: 1.3, y0: 5.4, y1: 8.6, P: 2.2, m: .8 } : null }); }
      // the Square Tower: a battlemented square shaft with corner bartizans, an octagonal belfry and spire inside the parapet
      {
        const r = part('B3597'), c = [78.98, 11.09], zb = Lv(79), ZT = zb + 31;
        K.walls(r, zb - 10, ZT, LIME, { vz: zb, E: ZT, win: (j, len) => ({ t: W.ROUND, w: 1.1, y0: 22, y1: 25.5, n: 2, m: 2, lights: 2 }) });
        K.band(r, zb + 15, .3, .22, LIMEP);
        K.cap(r, ZT, CAPS);
        K.mould(r, [[0, ZT - 1.1], [.5, ZT], [.5, ZT + 1]], LIMEP);
        K.detail(() => K.crenels(K.offset(r, .3), ZT + 1, 1, .9, .7, .45, LIMEP));
        for (const p of r) { const q = [p[0] + (p[0] - c[0]) * .07, p[1] + (p[1] - c[1]) * .07]; K.lathe(q[0], q[1], ZT - 4, [[.2, 0, 1], [1.05, 1.6, 1], [1.05, 6.4, 1]], LIMEP, { n: 8 }); K.spire(q[0], q[1], ZT + 2.4, 1.2, 4, SL, { n: 8 }); K.detail(() => K.ball(q[0], q[1], ZT + 6.4, .12, GOLD)); }
        K.lathe(c[0], c[1], ZT, [[3.3, 0, 1], [3.3, 6.2, 1]], LIME, { n: 8, wall: 1, win: { t: W.ROUND, w: .9, y0: ZT + 1.6, y1: ZT + 4.6, n: 1 } });
        K.cornice(K.ngon(c[0], c[1], 3.3, 8, Math.PI / 8), ZT + 5.7, .5, .35, LIMEP);
        K.lathe(c[0], c[1], ZT + 6.2, [[3.6, 0, 1], [2.3, 3], [1.1, 7], [.06, 10.5]], SL, { n: 8 });
        K.detail(() => { K.ball(c[0], c[1], ZT + 16.7, .22, GOLD); K.box(c[0], c[1], .09, .09, ZT + 16.9, ZT + 18.4, GOLD); });
      }
      { const r = part('B3583'), zb = Lv(92); if (r) { K.walls(r, zb - 10, zb + 8, LIME, { vz: zb, E: zb + 8 }); K.cap(r, zb + 8, CAPS); K.detail(() => K.crenels(r, zb + 8, 1, 1, .8, .5, LIME)); } }
      // ---- the Gatehouse: red brick with limestone trim, battlemented wings, the gate block under its steep roof, corner towers ----
      {
        const zb = Lv(105), wingR = id => part(id);
        for (const id of ['P123', 'P126']) {
          const r = wingR(id); if (!r) continue;
          K.walls(r, zb - 9, zb + 11, BR, { vz: zb, E: zb + 11, win: (j, len) => len > 8 ? { t: W.RECT, w: 1.1, y0: 6.4, y1: 8.8, P: 2.9, m: 1 } : len > 4 ? { t: W.RECT, w: 1.1, y0: 6.4, y1: 8.8, n: 1 } : null });
          K.roof(K.offset(r, -.6), 'hip', zb + 11, 1.6, SL, { ang: 90 });
          parapet(K, K.offset(r, -.1), zb + 11, 1.8, BRP);
        }
        const g = wingR('P122'), gt = wingR('P121');
        if (g) {
          for (let j = 0; j < 4; j++) K.storeys(g[j], g[(j + 1) % 4], [zb - 9, zb, zb + 6.5, zb + 15.5], BR, (i, len) => len < 9 || !i ? null : i === 1 ? { t: W.DOOR_R, w: 3.6, y0: 0, y1: 5.4, n: 1 } : { t: W.RECT, w: 1.2, y0: 8, y1: 10.6, P: 2.8, m: 1.6 }, { vz: zb, E: zb + 15.5 });
          parapet(K, K.offset(g, -.1), zb + 15.5, 1.8, BRP);
        }
        if (gt) {
          const pl = K.planes(gt, 'gable', zb + 20, 6.5, 0);
          K.roofWalls(gt, pl, zb + 15.5, BR, { vz: zb, E: zb + 20, win: (j, len) => ({ t: W.ROUND, w: 1.3, y0: 16.6, y1: 19.2, n: 2, m: 1.2, lights: 2 }) });
          K.roofPlanes(gt, pl, SL, { over: .4 });
          K.detail(() => { for (const x of [100.3, 108.1]) { K.ball(x, -3.07, zb + 26.4, .2, GOLD); } });
        }
        for (const c of [[107.95, -21.22], [107.75, 14.64]]) {
          roundTower(K, c, 2.25, zb - 9, zb + 16.5, BRP, { slits: 2, win: W.RECT, ww: .5 });
          crownRound(K, c, 2.25, zb + 16.5, BRP, { seg: K.seg(14) });
          K.lathe(c[0], c[1], zb + 17.4, [[1.9, 0, 1], [1.9, 2, 1]], LIMEP, { seg: K.seg(12) });
          K.lathe(c[0], c[1], zb + 19.4, [[2.15, 0, 1], [1.2, 2.2], [.06, 5.4]], SL, { seg: K.seg(12) });
          K.detail(() => K.ball(c[0], c[1], zb + 24.8, .14, GOLD));
        }
      }
    });
  },

  // Marienbrücke: the iron footbridge (1866, rebuilt in steel) across the Pöllat gorge, about 90 m over the stream, with the
  // classic view of Neuschwanstein. The height map has no gorge here, so its rims are raised as rock banks round the drawn
  // ground: the gorge runs north-north-east from the waterfall under the bridge, frozen in winter, a ribbon of ice below.
  marienbruecke(K) {
    const sA = [.5, .866], sN = [.866, -.5], p = (s, l) => [s * sA[0] + l * sN[0], s * sA[1] + l * sN[1]];
    const ROCK = { m: 9, c: '#6f6c66' }, ICE = { m: 16, c: '#cfdbe4' }, WOOD = { m: 13, c: '#7a5b42' };
    const DK = 46;                                       // the deck over the gorge floor (true m)
    const g0 = K.groundAt(0, 0), sl = (x, y) => { const s = x * sA[0] + y * sA[1], l = x * sN[0] + y * sN[1]; return [s, l]; };
    // the rims: level with the deck by the bridge, further off a ridge riding the slope that falls away from the gorge edge,
    // the gorge getting shallower downstream; wooded on top, rock walls into the gorge
    const fl = l => 1 - sm((Math.abs(l) - 20) / 30);
    const bankLift = (x, y) => {
      const [s, l] = sl(x, y), G = K.groundAt(x, y), Gf = K.groundAt(...p(Math.max(s, -6), 0));
      const near = Math.max(0, g0 + DK - .3 - G), far = Math.max(0, g0 + DK - .3 - Gf) * (1 - .7 * sm(s / 170)) * fl(l);
      return Math.max(0, near + (far - near) * sm((Math.abs(s) - 6) / 24)) * (1 - sm((s - 120) / 60));
    };
    const stepLift = (x, y) => {
      const [s, l] = sl(x, y), G = K.groundAt(x, y), lip = Math.max(0, g0 + DK - 15 - G);
      return lip * (1 - sm((-s - 25) / 60)) * fl(l);
    };
    for (const side of [-1, 1]) {
      const ring = K.ccw([p(-16, side * 13), p(-16, side * 52), p(70, side * 56), p(165, side * 42), p(180, side * 20), p(150, side * 11.5)]);
      K.mound(ring, bankLift, FOREST, { skirtM: ROCK, flare: .12, rough: 2, skirtStep: 2.5 });
    }
    K.mound(K.ccw([p(-12.5, -54), p(-12.5, 54), p(-60, 58), p(-100, 36), p(-100, -36), p(-60, -58)]), stepLift, FOREST, { skirtM: ROCK, flare: .1, rough: .9, skirtStep: 3 });
    // the frozen Pöllat along the gorge floor
    K.mound(K.ccw([p(-13, -4.5), p(-13, 4.5), p(175, 5.5), p(175, -5.5)]), () => 2.4, ICE, { flare: .5, rough: .6, step: 6 });
    // the frozen fall: a curtain of ice down the face of the step (which leans out .1 m per m of drop), icicles off its lip,
    // a frozen mound at its foot
    const zTop = g0 + DK - 15, zFoot = K.groundAt(...p(-6, 0)), sf = z => -12.5 + .1 * (zTop - z) + 1.1;
    const P3 = (s2, l, z) => [...p(s2, l), z];
    K.quad(P3(sf(zFoot), -7.5, zFoot - 1), P3(sf(zFoot), 7.5, zFoot - 1), P3(sf(zTop) - .3, 6, zTop + .2), P3(sf(zTop) - .3, -6, zTop + .2), ICE, {}, [[0, 0], [15, 0], [12, zTop - zFoot], [3, zTop - zFoot]]);
    K.detail(() => {
      for (let i = 0; i < 16; i++) {
        const l = -6.4 + i * .85 + Math.sin(i * 7.3) * .25, h = (zTop - zFoot) * (.3 + .5 * Math.abs(Math.sin(i * 3.1))), zt = zTop + .2, q = p(sf(zt - h * .5) + .5, l), r = .35 + .3 * Math.abs(Math.sin(i * 2.3));
        K.lathe(q[0], q[1], zt - h, [[.02, 0, 1], [r * .55, h * .4], [r, h * .9], [r * 1.1, h]], ICE, { seg: 6 });
      }
    });
    K.lathe(...p(sf(zFoot) + 2.5, 0), zFoot - 1.5, [[6.5, 0, 1], [5.2, 1.8], [3, 3.4], [0, 4.2]], ICE, { seg: K.seg(14) });
    // the bridge: steel lattice girders as its railings, a plank deck, struts down to the rock under each end
    const L = 38, a = p(0, -L / 2), b = p(0, L / 2), zD = g0 + DK;
    K.bridge([...a, zD], [...b, zD], 2.2, WOOD, { truss: 1.45, deck: .55, steel: IRON });
    for (const s of [-1, 1]) for (const e of [-1, 1]) {
      const top = p(e * .9, s * (L / 2 - 7)), foot = p(e * .9, s * (L / 2 - .6));
      K.quad([top[0], top[1], zD - .9], [foot[0], foot[1], zD - 7.4], [foot[0], foot[1], zD - 7], [top[0], top[1], zD - .55], IRON);
    }
    for (const s of [-1, 1]) { const c = p(0, s * (L / 2 + .6)); K.box(c[0], c[1], 3.2, 3.4, zD - 3, zD - .5, { m: 11, c: '#a49e92' }, { ang: dirOf(a, b) }); }
  },

  // Hohenschwangau (rebuilt 1832-37 by Crown Prince Maximilian on the ruins of Schwanstein): an ochre-yellow neo-Gothic
  // castle on its wooded hill above the Alpsee, four storeys under battlements with a round tower at each corner, the
  // garden terraces to the north, the castle's lower wings with red roofs to the east.
  hohenschwangau(K) {
    const { W } = K, Y = { m: 2, c: '#d8b46c', t: '#ece2c8', f: 1 | 8 | 32, seed: .6 }, YP = { m: 2, c: '#d3ad62', t: '#ece2c8', f: 0, seed: .27 };
    const ROCK = { m: 9, c: '#8e8a80' }, CAP = { m: 11, c: '#d9d0bd' }, RED = { ...TILE, c: '#8a4632' };
    // the hill: the castle's level a little lower to the east; its slopes wooded down into the terrain
    const Lh = x => 21 - .08 * x;
    const hl = spare(K, (x, y) => Math.max(0, Lh(x) - K.groundAt(x, y)));
    K.mound(hullOf(K, 7), hl, ROCK, { skirtM: FOREST, flare: .95, rough: 2.6, skirtStep: 4 });
    const zb = Lh(0), ZT = zb + 19;
    // ---- the main block: a rectangle turned -38 degrees, its corners carried by round towers ----
    const T = { w: [-12.4, -1.6], s: [-1.9, -11.2], e: [15.2, -.4], n: [-3.0, 10.3] };
    const core = K.ccw([T.w, T.s, T.e, T.n]);
    const win = (i, len) => len < 6 ? null : [null, { t: W.RECT, w: 1.1, y0: 1.4, y1: 3.4, P: 3, m: 2.4 }, { t: W.LANCET, w: 1.3, y0: 6, y1: 8.8, P: 3, m: 2.4, lights: 2 }, { t: W.LANCET, w: 1.3, y0: 10.6, y1: 13.2, P: 3, m: 2.4, lights: 2 }, { t: W.RECT, w: 1.1, y0: 15.1, y1: 17, P: 3, m: 2.4 }][i];
    for (let j = 0; j < 4; j++) K.storeys(core[j], core[(j + 1) % 4], [zb - 8, zb, zb + 5, zb + 9.6, zb + 14, ZT], Y, win, { vz: zb, E: ZT });
    for (const z of [zb + 5, zb + 14]) K.band(core, z - .2, .25, .18, YP);
    K.mould(core, [[0, ZT - 1], [.45, ZT], [.45, ZT + .9]], YP);
    K.detail(() => K.crenels(K.offset(core, .25), ZT + .9, 1.1, 1.1, .8, .45, YP));
    K.roof(K.offset(core, -.8), 'hip', ZT + .3, 4.6, SLATE, { ang: dirOf(T.s, T.e) });
    // the white swan on the roof ridge, small finials on the hip ends
    K.detail(() => { const c = [(T.w[0] + T.e[0]) / 2, (T.w[1] + T.e[1]) / 2]; K.lathe(c[0], c[1], ZT + 4.6, [[.45, 0, 1], [.55, .4], [.3, .9], [.12, 1.6], [.18, 1.9], [0, 2.1]], { m: 16, c: '#eef0f0' }, { seg: 8 }); });
    for (const [k, r, h] of [['w', 2.45, 24], ['s', 2.45, 23.5], ['e', 2.75, 27], ['n', 2.45, 23]]) {
      const c = T[k];
      K.lathe(c[0], c[1], zb - 8, [[r, 0, 1], [r, h + 8, 1]], Y, { seg: K.seg(16), wall: 1, vz: zb, win: { t: W.LANCET, w: .9, y0: h - 5.5, y1: h - 3.2, P: 3.4 }, E: zb + h });
      for (const z of [zb + 5, zb + 14]) K.band(K.ngon(c[0], c[1], r, K.seg(16)), z - .2, .25, .18, YP);
      crownRound(K, c, r, zb + h, YP, { seg: K.seg(16), over: .35 });
    }
    // ---- the garden terraces on the north, with their balustrades and the lion fountain ----
    for (const id of ['B3808', 'B3809']) {
      const r = K.part(id); if (!r) continue;
      const ring = K.ccw(r.ring), zt = zb + (id === 'B3808' ? 2.6 : 1.2);
      K.walls(ring, zb - 6, zt, YP, { vz: zb, win: (j, len) => len > 6 && id === 'B3808' ? { t: W.ROUND, w: 1.3, y0: -1.8, y1: 1.4, P: 2.6, m: .8 } : null });
      K.cap(ring, zt, { m: 11, c: '#e8ebef' });
      K.walls(K.offset(ring, -.15), zt, zt + .95, CAP, { win: { t: W.ARCADE, w: .22, y0: .15, y1: .7, P: .38, m: .2 }, vz: zt });
    }
    K.detail(() => { const c = [-4.2, 16.2], z = zb + 2.6; K.lathe(c[0], c[1], z, [[1.6, 0, 1], [1.6, .55, 1], [1.3, .55, 1]], CAP, { seg: 12 }); K.lathe(c[0], c[1], z + .3, [[.35, 0, 1], [.35, 1.2, 1], [.7, 1.4, 1]], CAP, { seg: 8 }); figure(K, c[0], c[1], z + 1.4, .9, GOLD); });
    // ---- the lower wings to the east: yellow, under red hipped roofs; the round tower at the corner ----
    for (const [id, eave, rise] of [['B3806', 10.5, 5], ['B3805', 9.5, 5], ['B3807', 3.2, 1.5]]) {
      const r = K.part(id); if (!r) continue;
      const z = Lh(r.c[0]);
      K.footprint(r, { wall: Y, roof: RED, roofType: 'hip', eave, rh: rise, z, z0: z - 7, simplify: 1.2, storeys: eave > 5 ? [0, 3.8, 7.2] : null, win: (i, len) => len < 4 || !i ? null : { t: W.RECT, w: 1.1, y0: [0, 1.2, 4.8, 8.2][i], y1: [0, 2.9, 6.5, 9.7][i], P: 3, m: 1.2 } });
    }
    { const c = [37.1, -4.9], z = Lh(37); K.lathe(c[0], c[1], z - 7, [[2.3, 0, 1], [2.3, 21, 1]], Y, { seg: K.seg(14), wall: 1, vz: z, win: { t: W.RECT, w: .8, y0: 9, y1: 10.6, P: 3.4 }, E: z + 14 }); K.lathe(c[0], c[1], z + 14, [[2.6, 0, 1], [1.5, 2.4], [.06, 6]], RED, { seg: K.seg(14) }); K.detail(() => K.ball(c[0], c[1], z + 20, .14, GOLD)); }
  },

  // Kufstein fortress (first recorded 1205; the Kaiserturm 1518-22 under Maximilian I): rough-cast walls on the 90 m rock over
  // the Inn. The huge round Kaiserturm in the middle under its low cone and lantern, the Bürgerturm with the Heroes' Organ in
  // its open top storey at the north end, the Schlossrondell, barracks, the well house, and the bastions down the south.
  kufstein(K) {
    const { W } = K, ST = { m: 2, c: '#cdc6b7', t: '#b3ab9a', f: 1 | 16 | 32, seed: .45 }, STP = { m: 2, c: '#c6bfb0', t: '#b3ab9a', f: 0, seed: .71 };
    const ROCK = { m: 9, c: '#77736b' }, TL = { ...TILE, c: '#7f4a36' }, CAP = { m: 11, c: '#b8b1a3' };
    // the rock (the height map has lost it): a flat top for the fortress, cliffs round it, a wooded shoulder lower down
    const Lk = (x, y) => 66 - .05 * Math.max(0, -y - 40);
    const rl = spare(K, (x, y) => Math.max(0, Lk(x, y) - K.groundAt(x, y)), 3, 12);
    K.mound(hullOf(K, 18), spare(K, (x, y) => Math.max(0, 38 - K.groundAt(x, y)), 3, 12), FOREST, { skirtM: FOREST, flare: .9, rough: 3, skirtStep: 5 });
    K.mound(hullOf(K, 4), rl, ROCK, { flare: .2, rough: 4, skirtStep: 3 });
    const zAt = (x, y) => Lk(x, y);
    const H = { 'Obere Schlosskaserne': [11, 6, 'hip'], 'Unterer Schlosskaserne': [8.5, 4.5, 'hip'], Fuchsturm: [14, 6, 'hip'], 'Tiefer Brunnen': [7, 5, 'pyramid'],
      'Artillerie, Laboratorium': [8.5, 5, 'gable'], Kriegspulvermagazin: [6, 4, 'gable'], B63974: [9, 5, 'hip'], B63969: [8, 4, 'hip'], B63971: [7, 4, 'hip'], B63972: [6, 4, 'hip'], B63973: [7, 4, 'hip'], B63986: [7, 4, 'hip'], B63987: [6, 3.5, 'hip'], B63880: [4, 2.5, 'hip'] };
    const special = new Set(['Kaiserturm', 'Bürgerturm', 'Schlossrondell', 'Carolibastion', 'B63878', 'B63879', 'B63985']);
    for (const p of K.parts) {
      if (p.ctx || special.has(p.name) || special.has(p.id)) continue;
      const hr = H[p.name] || H[p.id] || (p.area < 20 ? [4, 2.5, 'hip'] : [8, 4.5, 'hip']), z = zAt(p.c[0], p.c[1]);
      K.footprint(p, { wall: ST, roof: TL, roofType: hr[2], eave: hr[0], rh: hr[1], z, z0: z - 9, simplify: 1, storeys: hr[0] > 7.5 ? [0, 3.8, 7.4, 11] : null,
        win: (i, len) => len < 4 || (hr[0] > 7.5 && !i) ? null : { t: i === 1 ? W.SLIT : W.RECT, w: i === 1 ? .5 : 1, y0: [0, 1.4, 4.6, 8.3][i] ?? 1.4, y1: [0, 3.2, 6.4, 10][i] ?? 3, P: 3.6, m: 1.2 } });
    }
    // the walls of the bastions and the outer works: parapets with gun ports, battlements on the higher ones
    for (const id of ['B63878', 'B63879', 'B63985']) {
      const r = K.part(id); if (!r) continue;
      const ring = K.ccw(K.simplify(r.ring, .8)), z = zAt(r.c[0], r.c[1]);
      K.walls(ring, z - 14, z + 2.2, ST, { vz: z, win: (j, len) => len > 5 ? { t: W.SLIT, w: .45, y0: .4, y1: 1.6, P: 4.5, m: 1 } : null });
      K.cap(ring, z + 2.2, CAP);
    }
    const cb = K.part('Carolibastion');
    if (cb) { const ring = K.ccw(K.simplify(cb.ring, .8)), z = zAt(cb.c[0], cb.c[1]); K.walls(ring, z - 14, z + 1.8, ST, { vz: z, win: (j, len) => len > 6 ? { t: W.SLIT, w: .5, y0: .2, y1: 1.4, P: 5, m: 1.5 } : null }); K.cap(ring, z + 1.8, CAP); }
    // ---- the Kaiserturm: walls 7 m thick, few windows, a broad low cone, the lantern with its little dome ----
    {
      const r = K.part('Kaiserturm'), c = r.c, R = Math.sqrt(r.area / Math.PI), z = zAt(c[0], c[1]);
      K.lathe(c[0], c[1], z - 12, [[R + .5, 0, 1], [R + .5, 12.6, 1], [R, 13.2, 1], [R, 12 + 27, 1]], ST, { seg: K.seg(36), wall: 1, vz: z, win: { t: W.RECT, w: 1, y0: 21, y1: 22.8, P: 7.5 }, E: z + 27 });
      K.detail(() => { for (const zz of [6, 13.5]) for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + zz, q = [c[0] + Math.cos(a) * (R + .03), c[1] + Math.sin(a) * (R + .03)], t = [-Math.sin(a) * .4, Math.cos(a) * .4]; K.wall([q[0] - t[0], q[1] - t[1]], [q[0] + t[0], q[1] + t[1]], z + zz, z + zz + 1.4, ST, { win: { t: W.SLIT, w: .38, y0: z + zz + .1, y1: z + zz + 1.3, n: 1 } }); } });
      K.cornice(K.ngon(c[0], c[1], R, K.seg(36)), z + 26.4, .6, .5, STP);
      K.lathe(c[0], c[1], z + 27, [[R + .7, 0, 1], [R * .82, 2.2], [R * .5, 6], [R * .2, 9.2], [2.6, 9.8, 1]], TL, { seg: K.seg(32) });
      K.lathe(c[0], c[1], z + 36.7, [[2.4, 0, 1], [2.4, 2.6, 1]], STP, { n: 8, wall: 1, win: { t: W.ROUND, w: .7, y0: z + 37.2, y1: z + 38.9, n: 1 } });
      K.lathe(c[0], c[1], z + 39.3, [[2.7, 0, 1], [2.3, .9], [1.3, 2.2], [.5, 2.9], [.18, 3.6]], CU, { seg: K.seg(12) });
      K.detail(() => K.ball(c[0], c[1], z + 43, .22, GOLD));
    }
    // ---- the Bürgerturm: the round tower of the Heroes' Organ, its open top storey, a cone over it ----
    {
      const r = K.part('Bürgerturm'), c = r.c, R = Math.sqrt(r.area / Math.PI), z = zAt(c[0], c[1]);
      K.lathe(c[0], c[1], z - 12, [[R, 0, 1], [R, 12 + 17, 1]], ST, { seg: K.seg(28), wall: 1, vz: z, win: { t: W.RECT, w: .9, y0: 8, y1: 9.8, P: 6 }, E: z + 17 });
      K.lathe(c[0], c[1], z + 17, [[R, 0, 1], [R, 5.5, 1]], ST, { seg: K.seg(28), wall: 1, vz: z, win: { t: W.ARCADE, w: 2.4, y0: 17.6, y1: 21.8, P: 3.6 }, E: z + 22.5 });
      K.cornice(K.ngon(c[0], c[1], R, K.seg(28)), z + 22, .6, .5, STP);
      K.lathe(c[0], c[1], z + 22.5, [[R + .7, 0, 1], [R * .7, 3], [R * .35, 7], [.12, 10.5]], TL, { seg: K.seg(24) });
      K.detail(() => K.ball(c[0], c[1], z + 33, .2, GOLD));
    }
    // ---- the Schlossrondell: a round bastion with a battlemented platform ----
    {
      const r = K.part('Schlossrondell'); if (r) {
        const ring = K.ccw(K.simplify(r.ring, .6)), z = zAt(r.c[0], r.c[1]);
        K.walls(ring, z - 12, z + 8, ST, { vz: z, win: (j, len) => len > 3 ? { t: W.SLIT, w: .5, y0: 3.5, y1: 5, n: 1 } : null, E: z + 8 });
        K.cap(ring, z + 8, { m: 11, c: '#c9c2b4' });
        parapet(K, ring, z + 8, 1.8, STP);
      }
    }
  },

  // Wieskirche (1745-54, Dominikus Zimmermann): the Rococo pilgrimage church alone in the meadows below the Ammergau Alps; white
  // with ochre-washed pilasters, an oval nave under a tall hipped roof with oculi, the deep choir, the tower behind it with
  // its little onion, the abbot's house at the back; a curved porch on the west front.
  wieskirche(K) {
    const { W } = K, PL = { m: 2, c: '#efebe1', t: '#d8bf86', f: 1 | 4 | 32, seed: .33 }, PLH = { m: 2, c: '#ece6d8', t: '#d8c49a', f: 1 | 16 | 32 }, PLT = { m: 2, c: '#f1ede4', t: '#d8bf86', f: 1 | 16, seed: .7 };
    const SLW = { m: 5, c: '#5e656d', snow: .85 }, CAP = { m: 11, c: '#cfc6b4' };
    const zb = K.groundAt(0, 0);
    K.at(0, 0, zb, K.fp.ang, () => {
      const Z0 = Math.min(0, K.groundMin([[-30, -15], [45, -15], [45, 15], [-30, 15]])) - 2;
      // the oval nave as a sixteen-sided ring, the choir to the east
      const nave = [], cx = -9.3, rx = 18.2, ry = 13.8;
      for (let k = 0; k < 16; k++) { const a = Math.PI + (k + .5) / 16 * Math.PI * 2; nave.push([cx + Math.cos(a) * rx, Math.sin(a) * ry * (1 - .08 * Math.cos(a) ** 2)]); }
      const ring = K.ccw(nave);
      const P = K.hipPlanes(ring, 15, 12.5 / 13.8);
      K.roofPlanes(ring, P, SLW, { over: .55 });
      for (let j = 0; j < ring.length; j++) {
        const a = ring[j], b = ring[(j + 1) % ring.length], east = (a[0] + b[0]) / 2 > 6;
        if (east && Math.abs((a[1] + b[1]) / 2) < 7.5) continue;
        K.storeys(a, b, [Z0, 11.6, 15], PL, i => [{ t: W.ROUND, w: 2.2, y0: 4.2, y1: 10.4, n: 1 }, { t: W.ROSE, w: 1.5, y0: 12.4, y1: 13.9, n: 1 }][i], { E: 15 });
      }
      K.cornice(ring, 14.5, .55, .45, { ...PL, f: 0 });
      K.detail(() => { for (const s of [-1, 1]) for (const x of [-20, -9.3, 1.5]) { const y = s * (ry - 4.2) * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2)), z = K.roofZ(P, x, y); K.dormer(x, y, z, 1.2, 1.2, s * 90, 12.5 / 13.8, PL, { ...SLW, snow: .9 }, { win: W.ROSE }); } });
      // the roof lantern over the nave
      K.lathe(cx, 0, 26.5, [[1, 0, 1], [1, 1.6, 1]], PL, { n: 8, wall: 1, win: { t: W.ROUND, w: .5, y0: 26.8, y1: 27.8, n: 1 } });
      K.lathe(cx, 0, 28.1, K.P.onion(1.1, 2.6), CU, { seg: K.seg(10) });
      K.detail(() => K.cross(cx, 0, 30.7, 1.1, GOLD));
      // the west porch: a curved front with three arches and a scrolled gable
      const por = K.rect(-27.2, 0, 2.6, 8.4);
      K.walls(por, Z0, 7.6, PLT, { win: j => j === 3 ? { t: W.ARCADE, w: 1.8, y0: 0, y1: 5.2, n: 3, m: .5 } : j !== 1 ? { t: W.ARCADE, w: 1.2, y0: 0, y1: 4.6, n: 1 } : null });
      K.slab([-28.6, 4.4], [-28.6, -4.4], K.outline.scroll(8.8, 7.6, 4.8, { round: 1, top: .4 }), .5, PLT, { out: .25, win: { t: W.ROUND, w: 1, y0: 9, y1: 10.6, n: 1 } });
      K.roof(por, 'hip', 7.6, 1.6, SLW, { over: .3 });
      // the choir: long, with tall windows, under its own hipped roof joined to the nave's
      const choir = [[6.5, -7.3], [23.4, -7.1], [23.5, 7.5], [6.4, 7.6]];
      const Pc = K.hipPlanes(choir, 13, 9 / 7.5, { gable: [3] });
      K.roofPlanes(choir, Pc, SLW, { over: .45 });
      K.roofWalls(choir, Pc, Z0, PL, { skip: j => j === 3, E: 13, win: (j, len) => len > 9 ? { t: W.ROUND, w: 2.1, y0: 4.4, y1: 10.5, P: 4.6, m: 1 } : { t: W.ROUND, w: 1.6, y0: 5, y1: 9, n: 2, m: 2 } });
      K.cornice(choir.slice(0, 4), 12.5, .5, .4, { ...PL, f: 0 }, { open: true });
      // the tower behind the choir: plain shaft, clock storey, belfry, an octagon and a small onion with its lantern
      const t = K.rect(28.3, .4, 6.2, 6.2);
      for (let j = 0; j < 4; j++) K.storeys(t[j], t[(j + 1) % 4], [Z0, 14, 24, 31], PLT, i => [null, { t: W.ROUND, w: 1.2, y0: 17, y1: 21, n: 1 }, { t: W.BELFRY, w: 1.4, y0: 25.5, y1: 29.5, n: 1 }][i], { E: 31 });
      for (let j = 0; j < 4; j++) { const a = t[j], b = t[(j + 1) % 4]; K.clock(a, b, 3.1, 22.3, 1.2, DIAL, { out: .12 }); }
      K.cornice(t, 30.5, .6, .4, { ...PL, f: 0 }); K.cap(t, 31.1, CAP);
      K.lathe(28.3, .4, 31.1, [[2.7, 0, 1], [2.7, 3.2, 1]], PLT, { n: 8, wall: 1, win: { t: W.ROUND, w: .8, y0: 31.6, y1: 33.6, n: 1 } });
      K.lathe(28.3, .4, 34.3, K.P.onion(3, 7.5), CU, { seg: K.seg(16) });
      K.lantern(28.3, .4, 41.8, .8, 2.2, CU, CU, { n: 6, cap: K.P.onion(.9, 2.4), finial: 1.6, finM: GOLD });
    });
    // the abbot's house and its wing at the back
    for (const id of ['X30', 'X31']) { const p = K.part(id); if (p) K.footprint(p, { wall: PLH, roof: SLW, roofType: 'hip', eave: 11, rh: 6, storeys: [0, 3.8, 7.4], win: (i, len) => len < 3.5 ? null : { t: W.RECT, w: 1.2, y0: 1.1 + i * 3.6, y1: 3.4 + i * 3.6, P: 3.1, m: 1 } }); }
  },
};
