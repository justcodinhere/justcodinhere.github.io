// Munich landmarks: the Frauenkirche (the reference model for the kit), the Neues Rathaus, Alter Peter and St. Michael.
// Builders receive the kit K (js/landmarks.js); local metres round each landmark's footprints.json origin.
const BRICK = { m: 0, c: '#76453a', t: '#b5ab9c', f: 1 | 2 | 32, seed: .31 };       // nave: plinth, eaves frieze, eaves shade
const BRICK_T = { m: 0, c: '#734337', t: '#b5ab9c', f: 1, seed: .53 };              // towers
const BRICK_P = { m: 0, c: '#734337', t: '#b5ab9c', f: 0, seed: .53 };              // strips and bands
const TILE = { m: 6, c: '#7b3f30', snow: .62, seed: .2 };
const COPPER = { m: 4, c: '#5c8774', snow: .75, seed: .4 };
const STONE = { m: 11, c: '#b9b0a2' };
const DIAL = { m: 12, c: '#29303b' };
const GOLD = { m: 15, c: '#b98a32' };

export default {
  // Frauenkirche (1468-88, Jörg von Halsbach): a late-Gothic brick hall church, 109 x 40 m, walls 37 m to the eaves under
  // one huge steep roof; the buttresses are drawn inside, so outside only flat strips divide the tall lancet windows; a
  // half-decagon choir; the sacristy hugging the north-east; two west towers of 99 m: square shafts with corner strips
  // and blind arcading, a clock storey, octagonal belfries, and the green copper welsche Hauben (1525) with lanterns.
  frauenkircheMuc(K) {
    const { W } = K;
    K.at(0, 0, 0, K.fp.ang, () => {                     // frame: x along the nave (east), y north
      const yc = -1.25, hw = 19.775, yS = yc - hw, yN = yc + hw;
      const xW = -54.9, xT = -38.5, xM = -51.3, xC = 35.5, EAVE = 37, RIDGE = 64, g = (RIDGE - EAVE) / hw;
      const choir = [];
      for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * Math.PI / 5; choir.push([xC + hw * Math.cos(a), yc + hw * Math.sin(a)]); }
      // ---- nave and choir walls: one tall two-light lancet per bay, flat strips between, a brick frieze under the eaves ----
      const win = { t: W.LANCET, w: 3.3, y0: 8.6, y1: 33.4, lights: 2 };
      K.wall([xT, yS], [xC, yS], -2, EAVE, BRICK, { win: { ...win, n: 11 } });
      K.wall([xC, yN], [xT, yN], -2, EAVE, BRICK, { win: { ...win, n: 11 } });
      for (let k = 0; k < 5; k++) K.wall(choir[k], choir[k + 1], -2, EAVE, BRICK, { win: { ...win, n: 2, m: .9 } });
      const bay = (xC - xT) / 11, strip = (x, y, deg) => K.box(x, y, 1.25, .36, .95, EAVE - 1.75, BRICK_P, { ang: deg, cap: BRICK_P });
      K.detail(() => {                                   // the stone sills under the windows catch a line of snow
        for (let k = 0; k < 11; k++) { const x = xT + (k + .5) * bay; K.box(x, yS - .12, win.w + .5, .45, win.y0 - .35, win.y0, STONE); K.box(x, yN + .12, win.w + .5, .45, win.y0 - .35, win.y0, STONE); }
        for (let k = 0; k < 5; k++) {
          const a = choir[k], b = choir[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), P = (L - 1.8) / 2, deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
          for (const t of [.9 + P / 2, .9 + P * 1.5]) { const ex = (b[0] - a[0]) / L, ey = (b[1] - a[1]) / L; K.box(a[0] + ex * t + ey * .12, a[1] + ey * t - ex * .12, win.w + .5, .45, win.y0 - .35, win.y0, STONE, { ang: deg }); }
        }
      });
      for (let k = 1; k < 11; k++) { strip(xT + k * bay, yS - .18, 0); strip(xT + k * bay, yN + .18, 0); }
      for (let k = 0; k <= 5; k++) {
        const p = choir[k], a = -Math.PI / 2 + k * Math.PI / 5;
        if (k === 5 || k === 0) continue;
        strip(p[0] + Math.cos(a) * .18, p[1] + Math.sin(a) * .18, a / Math.PI * 180 + 90);
      }
      // eaves cornice round the whole body
      const rim = [[xT, yS], [xC, yS], ...choir.slice(1, 5), [xC, yN], [xT, yN]];
      K.cornice(rim, EAVE - .5, .55, .5, BRICK_P, { open: true });
      // ---- the roof: one steep saddle, its east end hipped round the choir polygon; the west gable stands between the towers ----
      const ring = [[xT, yS], [xC, yS], ...choir.slice(1, 5), [xC, yN], [xT, yN]];
      const planes = K.hipPlanes(ring, EAVE, g, { gable: [ring.length - 1] });
      K.roofPlanes(ring, planes, TILE, { over: .75 });
      const mid = [[xM, -5.7], [xT - .75, -5.7], [xT - .75, 3.2], [xM, 3.2]], lp = [planes[0], planes[planes.length - 1]];   // between the towers
      K.roofPlanes(mid, lp, TILE, {});
      K.roofWalls(mid, lp, EAVE, BRICK_T, { skip: j => j !== 3, win: { t: W.BLIND, w: 1.5, y0: EAVE + 2, y1: EAVE + 14, n: 2, m: 1.6 } });
      // rows of small dormers (the roof space is lit and aired through them)
      K.detail(() => {
        for (const s of [-1, 1]) for (const [z, n, x0, x1] of [[44.5, 9, -33, 28], [51.5, 7, -30, 24], [58, 4, -24, 16]]) for (let i = 0; i < n; i++) {
          const x = x0 + (x1 - x0) * (n === 1 ? .5 : i / (n - 1)), y = yc + s * (RIDGE - z) / g;
          K.dormer(x, y, z, 1.1, 1.05, s * 90, g, BRICK_P, { ...TILE, snow: .9 }, {});
        }
      });
      // ---- side portals: pointed doors in stone frames under little gables ----
      for (const [x, s] of [[-27.4, -1], [9.2, -1], [-27.4, 1], [9.2, 1]]) {
        const y = s < 0 ? yS : yN, a = s < 0 ? [x - 2.9, y] : [x + 2.9, y], b = s < 0 ? [x + 2.9, y] : [x - 2.9, y];
        K.slab(a, b, [[0, -1], [5.8, -1], [5.8, 7.6], [2.9, 10.4], [0, 7.6]], .7, STONE, { out: .7, win: { t: W.DOOR, w: 2.7, y0: 0, y1: 6.4, n: 1 } });
      }
      // ---- the sacristy and chapels on the north-east, under a lean-to roof against the choir ----
      const sac = [[13.3, yN], [xC, yN], choir[4], [50.4, 11.0], [55.6, 14.6], [50.8, 19.9], [36.2, 24.7], [13.3, 24.6]];
      const sp = K.hipPlanes(sac, 14.5, 7 / 6.1, { gable: [0, 1, 2] });
      K.roofPlanes(sac, sp, TILE, { over: .5 });
      K.roofWalls(sac, sp, -2, { ...BRICK, f: 1 | 32 }, { skip: j => j <= 2, E: 14.5, win: (j, len) => len > 6 ? { t: W.LANCET, w: 1.7, y0: 4.5, y1: 11, P: 5.5, m: 1, lights: 1 } : null });
      // ---- the west porch between the towers, and the tall west window over it ----
      K.wall([xM, yN - 15.33], [xM, yS + 15.33], 12.6, EAVE, BRICK, { win: { t: W.LANCET, w: 4.6, y0: 17, y1: 34.5, n: 1, lights: 3 } });
      const porch = K.rect((xW + xM) / 2, (-5.7 + 3.2) / 2, xM - xW, 8.9);
      K.walls(porch, -2, 12.6, BRICK_T, { win: (j, len) => j === 3 ? { t: W.DOOR, w: 3.6, y0: 0, y1: 8.4, n: 1 } : null, E: 12.6 });
      K.roof(porch, 'skillion', 12.6, 2.6, TILE, { ang: -90, over: .4 });
      K.slab([xW, 3.2], [xW, -5.7], [[1.2, -1], [7.7, -1], [7.7, 9.6], [4.45, 12.2], [1.2, 9.6]], .5, STONE, { out: .5, win: { t: W.DOOR, w: 3.6, y0: 0, y1: 8.4, n: 1 } });
      // ---- the two towers ----
      for (const cy of [(yS - 5.7) / 2, (3.2 + yN) / 2]) tower((xW + xT) / 2, cy, xT - xW, cy < 0 ? -5.7 - yS : yN - 3.2, cy < 0 ? -1 : 1);
    });

    function tower(cx, cy, w, d, side) {
      const r = K.rect(cx, cy, w, d), ZS = [0, 10.5, 21, 31.5, 42, 52, 61];
      // shaft: storeys of paired blind lancets, a clock storey with little belfry windows, string courses between
      for (let s = 0; s < ZS.length - 1; s++) {
        const z0 = s ? ZS[s] : -2, z1 = ZS[s + 1], top = s === ZS.length - 2;
        const wn = s === 0 ? null : top ? { t: W.LANCET, w: 1.3, y0: z0 + 1.6, y1: z1 - 1.7, n: 2, m: 2.2 } : { t: W.BLIND, w: 1.8, y0: z0 + 1.7, y1: z1 - 1.1, n: 2, m: 2.2 };
        K.walls(r, z0, z1, BRICK_T, { win: wn, E: z1 });
        if (s) K.band(r, z0 - .3, .3, .22, BRICK_P);
      }
      // clocks on the outer faces of the clock storey
      const faces = [[r[0], r[1]], [r[1], r[2]], [r[2], r[3]], [r[3], r[0]]];   // south, east, north, west
      for (const [k, [a, b]] of faces.entries()) if (k === 3 || (k === 0 && side < 0) || (k === 2 && side > 0)) K.clock(a, b, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, 56.6, 1.9, DIAL, { out: .3 });
      // corner strips, and the cornice under the octagon
      for (const p of r) K.box(p[0], p[1], 1.5, 1.5, -1, 61, BRICK_P, { cap: BRICK_P });
      for (const [a, b] of faces) K.box((a[0] + b[0]) / 2 + (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]) * .14, (a[1] + b[1]) / 2 - (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]) * .14,
        .9, .28, 10.2, 51.7, BRICK_P, { ang: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, cap: BRICK_P });
      K.cornice(r, 60.5, .7, .55, BRICK_P);
      K.cap(r, 61.2, { ...TILE, m: 11, c: '#8f8a84' });
      // octagon: inscribed in the square, broached at the corners, a tall louvred belfry lancet on each face
      const R8 = (Math.min(w, d) - .3) / 2 / Math.cos(Math.PI / 8), oct = K.ngon(cx, cy, R8, 8, Math.PI / 8), Z8 = 78;
      for (let k = 0; k < 4; k++) {
        const q = r[k], v1 = oct[(4 + 2 * k) % 8], v2 = oct[(5 + 2 * k) % 8];     // the diagonal face nearest this corner
        const zt = 65;
        K.poly([[q[0], q[1], 61.2], [v2[0], v2[1], zt], [v1[0], v1[1], zt]], [[0, 4], [3, 0], [0, 0]], TILE, { E: 4 });
        K.poly([[q[0], q[1], 61.2], [v1[0], v1[1], 61.2], [v1[0], v1[1], zt]], [[0, 0], [1, 0], [1, 1]], BRICK_P);
        K.poly([[q[0], q[1], 61.2], [v2[0], v2[1], zt], [v2[0], v2[1], 61.2]], [[0, 0], [1, 1], [1, 0]], BRICK_P);
      }
      K.lathe(cx, cy, 61.2, [[R8, 0, 1], [R8, Z8 - 61.2, 1]], BRICK_T, { n: 8, wall: 1, win: { t: W.BELFRY, w: 2.3, y0: 66, y1: 75.6, n: 1 }, E: Z8 });
      K.detail(() => { for (const p of oct) K.box(p[0], p[1], .7, .7, 61.2, Z8 - .4, BRICK_P, { ang: Math.atan2(p[1] - cy, p[0] - cx) * 180 / Math.PI, cap: BRICK_P }); });
      K.band(oct, 70.8, .25, .18, BRICK_P);
      K.cornice(oct, Z8 - .6, .8, .55, BRICK_P);
      // the welsche Haube: a bell flare off the cornice, a tall rounded body drawn in to the lantern's neck
      const hz = Z8 + .2, Rh = R8 * .97;
      const hp = [[Rh, 0, 1], [Rh * 1.01, .45], [Rh * 1.06, 1.7], [Rh * 1.075, 3.1], [Rh * 1.04, 4.7], [Rh * .93, 6.5], [Rh * .75, 8.4], [Rh * .53, 10.1], [Rh * .33, 11.6], [Rh * .22, 12.9], [Rh * .19, 14.2]];   // full in the shoulder, drawn in to a neck
      K.lathe(cx, cy, hz, hp, COPPER, { seg: K.seg(28) });
      K.detail(() => {                                   // eight ribs down the Haube from the lantern to the cornice
        for (let k = 0; k < 8; k++) {
          const a = (k + .5) / 8 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), tx = -s * .14, ty = c * .14;
          for (let i = 0; i < hp.length - 1; i++) {
            const [r0, z0] = hp[i], [r1, z1] = hp[i + 1], P0 = [cx + c * (r0 + .1), cy + s * (r0 + .1)], P1 = [cx + c * (r1 + .1), cy + s * (r1 + .1)];
            K.quad([P0[0] - tx, P0[1] - ty, hz + z0], [P0[0] + tx, P0[1] + ty, hz + z0], [P1[0] + tx, P1[1] + ty, hz + z1], [P1[0] - tx, P1[1] - ty, hz + z1], COPPER, { E: 14 }, [[0, 14 - z0], [.28, 14 - z0], [.28, 14 - z1], [0, 14 - z1]]);
          }
        }
      });
      K.lantern(cx, cy, hz + 14.2, 1.45, 2.7, COPPER, COPPER, { n: 8, cap: [[1.65, 0, 1], [1.7, .25], [1.5, .8], [1.05, 1.35], [.5, 1.75], [.28, 2.0]], finial: 1.6, finM: GOLD });
    }
  },
  // Neues Rathaus (1867-1908): neo-Gothic, grey shell-limestone fronts round six courtyards, steep slate roofs, a row of
  // pointed gables and pinnacles over Marienplatz, and the 85 m tower with the Glockenspiel oriels and a copper spire.
  rathaus(K) {
    const { W } = K, B0 = K.part('B150951');
    const ST = { m: 1, c: '#8b857a', t: '#a39b8e', f: 1 | 32, seed: .61 }, ST2 = { m: 1, c: '#857f74', t: '#a39b8e', f: 0, seed: .44 };
    const SL = { m: 5, c: '#4a4f57', snow: .8, seed: .3 }, CU = { m: 4, c: '#5c8774', snow: .6 };
    const E = 21.5, R = K.simplify(B0.ring, 2.2), holes = (B0.holes || []).map(h => K.simplify(h, 1.5)).filter(h => h.length > 2);
    const zs = [-2, 6, 10.4, 14.4, 18.3, E];
    for (let j = 0; j < R.length; j++) {
      const a = R[j], b = R[(j + 1) % R.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), front = (b[0] - a[0]) / len > .8;   // outward normal points south
      K.storeys(a, b, zs, ST, i => len < 4 ? null : i === 0 ? { t: front ? W.ARCADE : W.RECT, w: front ? 2.6 : 1.4, y0: front ? 0 : 1.4, y1: front ? 4.8 : 4.2, P: front ? 4.2 : 3.8, m: 1 }
        : { t: W.LANCET, w: 1.5, y0: zs[i] + 1, y1: zs[i + 1] - .6, P: 3.8, m: 1.2, lights: 2 });
      if (front && len > 9) {                          // pointed gables with blind tracery along the Marienplatz front
        const n = Math.floor(len / 9.5);
        for (let k = 0; k < n; k++) {
          const t0 = (k + .5) * len / n - 3.2, ex = (b[0] - a[0]) / len, ey = (b[1] - a[1]) / len, p0 = [a[0] + ex * t0, a[1] + ey * t0], p1 = [p0[0] + ex * 6.4, p0[1] + ey * 6.4];
          K.slab(p0, p1, [[0, E - .5], [6.4, E - .5], [6.4, E + 1], [3.2, E + 7.5], [0, E + 1]], .6, ST2, { out: .3, win: { t: W.BLIND, w: 2.2, y0: E + 1, y1: E + 5.6, n: 1 } });
          K.detail(() => { K.pinnacle(p0[0], p0[1], E - .5, .7, 4.5, ST2, ST2); K.pinnacle(p1[0], p1[1], E - .5, .7, 4.5, ST2, ST2); });
        }
      }
    }
    for (const h of holes) K.walls(h, -2, E, ST, { win: { t: W.RECT, w: 1.3, y0: 12, y1: 14.5, P: 3.6, m: 1 } });
    K.wingRoof(R, E, 5.2, 8, SL, { holes, over: .3 });
    // the tower: shaft, belfry storey with the Glockenspiel balconies, octagon, spire
    const t0 = K.part('P1235'), t1 = K.part('P1236'), t2 = K.part('P1233');
    const r0 = K.simplify(t0.ring, .5), r1 = K.simplify(t1.ring, .5), c = t2.c;
    const r0o = K.offset(r0, .3);                     // the tower stands a little proud of the front
    K.walls(r0o, -2, 40, ST, { win: { t: W.LANCET, w: 1.6, y0: 27, y1: 36.5, n: 2, m: 2, lights: 2 } });
    K.cornice(r0o, 39.3, .7, .5, ST2); K.cap(r0o, 40, { m: 11, c: '#8b857a' });
    K.walls(r1, 40, 60, ST, { win: { t: W.BELFRY, w: 1.6, y0: 49, y1: 57.5, n: 2, m: 1 } });
    for (const [j, [a, b]] of r1.map((p, j) => [j, [p, r1[(j + 1) % r1.length]]])) K.clock(a, b, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, 45, 1.5, { m: 12, c: '#2b3038' });
    K.cornice(r1, 59.4, .6, .45, ST2); K.cap(r1, 60, { m: 11, c: '#8b857a' });
    K.lathe(c[0], c[1], 60, [[3.1, 0, 1], [3.1, 10, 1]], ST, { n: 8, wall: 1, win: { t: W.LANCET, w: 1.1, y0: 62, y1: 68, n: 1 } });
    K.lathe(c[0], c[1], 70, [[3.4, 0, 1], [2.2, 3, 1], [0, 15]], CU, { n: 8 });
    K.finial(c[0], c[1], 85, 2.2, { m: 15, c: '#b98a32' });
    K.detail(() => {
      for (const p of K.parts) if (p.part && p.area < 7 && p.h) { const z = p.h > 30 ? p.minh : E - 3; K.pinnacle(p.c[0], p.c[1], z, 1.1, p.h - z + 2.5, ST2, ST2); }
    });
  },
  // Alter Peter (St. Peter): Munich's oldest parish church, white with ochre trim and a red roof; the 91 m tower with
  // four clocks under a copper Haube, lantern and second little Haube.
  alterPeter(K) {
    const { W } = K, nave = K.part('P1217');
    const PL = { m: 2, c: '#ebe3d2', t: '#d9c79f', f: 1 | 4 | 32 }, PL2 = { m: 2, c: '#e3d8bf', t: '#f1eadb', f: 1 | 4 | 16 | 32 }, TL = { m: 6, c: '#8d4430', snow: .8 };
    const CU = { m: 4, c: '#5c8774', snow: .65 }, win = { t: W.ROUND, w: 2.2, y0: 7, y1: 14.5, P: 5.2, m: 1.5 };
    K.footprint(nave, { wall: PL, roof: TL, roofType: 'gable', eave: 17, rh: 11, win });
    for (const id of ['P1215', 'P1216', 'P1218', 'P1219', 'P1223', 'P1202']) { const p = K.part(id); K.footprint(p, { wall: PL, roof: TL, highToward: nave.c, win: { t: W.ROUND, w: 1.7, y0: 3, y1: Math.max(4.5, (p.h - (p.rh || 0)) - 2), P: 5.2, m: 1.2 } }); }
    K.footprint(K.part('P1199'), { wall: PL, roof: TL, roofType: 'hip', eave: 17, rh: 11, win, simplify: 1 });
    for (const id of ['P1200', 'P1201', 'P1221', 'P1222']) K.footprint(K.part(id), { wall: PL, roof: CU, roofType: 'cone', rh: 4.5 });
    for (const id of ['P1220', 'P1226']) K.footprint(K.part(id), { wall: PL2, roof: TL, highToward: K.part('P1224').c, win: { t: W.ROUND, w: 1.6, y0: 12, y1: 16, P: 4, m: 1 } });
    // the tower
    const tw = K.part('P1224'), top = K.part('P1225'), r = K.simplify(tw.ring, .5), c = top.c;
    for (let j = 0; j < r.length; j++) K.storeys(r[j], r[(j + 1) % r.length], [-2, 18, 30, 42, 56], PL2, i => i === 0 || i === 3 ? null : { t: i === 2 ? W.BELFRY : W.ROUND, w: i === 2 ? 1.6 : 1.3, y0: [0, 22, 33, 0][i], y1: [0, 27, 40, 0][i], n: 2, m: 1 });
    for (let j = 0; j < r.length; j++) { const a = r[j], b = r[(j + 1) % r.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); K.clock(a, b, l / 2, 49, Math.min(2.4, l * .3), { m: 12, c: '#283040' }, { out: .2 }); }
    K.cornice(r, 55.3, .8, .55, { ...PL2, f: 0 }); K.cap(r, 56.1, { m: 11, c: '#a8a090' });
    K.lathe(c[0], c[1], 56.1, [[3.15, 0, 1], [3.15, 8, 1]], PL2, { n: 8, wall: 1, win: { t: W.ROUND, w: 1.1, y0: 58, y1: 62.5, n: 1 } });
    K.lathe(c[0], c[1], 64.1, K.P.welsch(3.3, 12), CU, { seg: K.seg(20) });
    K.lantern(c[0], c[1], 76.1, 1.15, 4, CU, CU, { n: 8, cap: K.P.onion(1.3, 5.4), finial: 3, finM: { m: 15, c: '#b98a32' } });
  },
  // St. Michael (1583-97): the largest Renaissance church north of the Alps; its gabled show front on Neuhauser
  // Strasse rises over a huge saddle roof, the choir closes in a lower polygon to the north.
  stMichael(K) {
    const { W } = K, rec = K.part('B150580');
    const PL = { m: 2, c: '#dcd7cb', t: '#bfb4a0', f: 1 | 4 | 32, seed: .2 }, FR = { m: 2, c: '#e1dccf', t: '#c4b89f', f: 1 | 4 | 8 }, TL = { m: 6, c: '#8a432f', snow: .85 };
    K.at(0, 0, 0, rec.ang, () => {
      const x0 = -42.6, x1 = 33.3, y0 = -17.1, y1 = 17.3, E = 27, RISE = 19, yc = (y0 + y1) / 2;
      const nave = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      K.walls(nave, -2, E, PL, { skip: j => j === 3 || j === 1, win: { t: W.ROUND, w: 3, y0: 9, y1: 20, P: 7.5, m: 2 } });
      const P = K.planes(nave, 'gable', E, RISE, 0);
      K.roofPlanes(nave, P, TL, { over: .6 });
      const ch = [[x1 - .5, -14.1], [41.4, -12.5], [46.9, -5.9], [47.1, 4.5], [41.5, 11.8], [x1 - .5, 12.7]];
      K.walls(ch, -2, 24, PL, { skip: j => j === ch.length - 1, win: { t: W.ROUND, w: 2.6, y0: 8, y1: 19, n: 1, m: 1 } });
      K.tent(ch, [x1 - .5, yc - .7, 37], 24, TL, { open: true, over: .5 });
      K.roofWalls([[x1, y0], [x1, y1], [x1 - .1, y1], [x1 - .1, y0]], P, 24, PL, { skip: j => j !== 0 });
      // the show front: three storeys of pilasters and statue niches, then a stepped gable with volutes
      const a = [x0, y1], b = [x0, y0], L = y1 - y0, half = L / 2;
      K.storeys(a, b, [-2, 11, 20, E], FR, i => [{ t: W.DOOR_R, w: 3.4, y0: 0, y1: 6.5, n: 3, m: 4 }, { t: W.BLIND, w: 1.9, y0: 12.5, y1: 18.5, n: 6, m: 1.5 }, { t: W.ROUND, w: 2.4, y0: 21.3, y1: 26, n: 4, m: 3 }][i], { E });
      const g = [[0, E], [L, E]];
      const steps = [[3.2, E + 7], [7.2, E + 14.5], [11.2, E + 21]];
      for (const [d, z] of steps) { g.push([L - d, z - 7 + 2.2]); g.push([L - d, z]); }
      g.push([half, E + 24.5]);
      for (const [d, z] of steps.slice().reverse()) { g.push([d, z]); g.push([d, z - 7 + 2.2]); }
      K.slab(a, b, g, 1.6, FR, { out: .8, win: { t: W.BLIND, w: 1.8, y0: E + 2, y1: E + 12, n: 3, m: 6 } });
      K.band([[x0 - .6, y0], [x0 - .6, y1]], 11, .4, .35, FR, { open: true });
      K.band([[x0 - .6, y0], [x0 - .6, y1]], 20, .4, .35, FR, { open: true });
      K.finial(x0 - .2, yc, E + 24.5, 2.6, { m: 15, c: '#b98a32' });
    });
  },
};

function generic(K) {
  const wall = { m: 2, c: '#e6dfd0', t: '#f2efe8', f: 1 }, roof = { m: 6, c: '#8a4632', snow: .9 };
  for (const p of K.parts) if (!p.ctx) K.footprint(p, { wall, roof, win: { t: 3, w: 1.2, y0: 4, y1: 6, P: 3.5, m: 1 } });
}
