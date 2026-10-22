// Munich landmarks on the old-town walk: the Frauenkirche (the reference model for the kit), the Neues and Altes Rathaus,
// Alter Peter, Heilig-Geist, the Mariensaeule, St. Michael, the Buergersaal and the Asamkirche.
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
  // Neues Rathaus (1867-1908, Georg von Hauberrisser): neo-Gothic, grey shell-limestone fronts round six courtyards under
  // steep dark roofs; the ~100 m front on Marienplatz breaks into tall pointed gables with pinnacles and rows of dormers,
  // a corner oriel at Weinstrasse, a turret at Dienerstrasse; the 85 m tower stands west of centre over the gateway, with
  // the Glockenspiel bay at roof height, corner turrets, an octagon and a copper spire carrying the Muenchner Kindl.
  rathaus(K) {
    const { W, F } = K, B0 = K.part('B150951');
    const ST = { m: 1, c: '#958d80', t: '#aca496', f: F.PLINTH | F.EAVES | F.STONEFRAME, seed: .61 };
    const ST2 = { m: 1, c: '#8e8679', t: '#a39b8e', f: 0, seed: .44 }, CAP = { m: 11, c: '#a19989' };
    const SL = { m: 5, c: '#4c4f55', snow: .8, seed: .3 }, CU = { m: 4, c: '#5c8774', snow: .55, seed: .7 };
    const E = 22.5, RISE = 9, DEP = 7, g = RISE / DEP;
    // the outer ring by hand (Overture's carries the turret bumps): the Marienplatz front is edge 0, then Dienerstrasse,
    // Landschaftstrasse, Weinstrasse
    const R = [[-59.03, -28.28], [32.89, -58.6], [47.9, -17.06], [50.49, -17.94], [52.04, -13.37], [62.6, 11.2], [63.69, 10.86], [68.77, 22.16], [29.61, 35.35], [-37.67, 57.36], [-46.26, 31.26], [-60.28, -23.89]];
    const holes = (B0.holes || []).map(h => K.simplify(h, 1.5)).filter(h => h.length > 2 && Math.abs(K.area(h)) > 30);
    const zs = [-2, 6, 10.4, 14.6, 18.6, E];
    for (let j = 0; j < R.length; j++) {
      const a = R[j], b = R[(j + 1) % R.length], len = lenOf(a, b), front = j === 0, P = front ? 4.15 : 3.9;
      K.storeys(a, b, zs, ST, i => len < 4 ? null : i === 0 ? (front ? { t: W.LANCET, w: 2.9, y0: .3, y1: 5.2, P, m: 1.4 } : { t: W.RECT, w: 1.5, y0: 1.2, y1: 4.4, P, m: 1.5 })
        : { t: W.LANCET, w: 1.6, y0: zs[i] + .9, y1: zs[i + 1] - .55, P, m: 1.4, lights: 2 });
    }
    K.band(R, 6, .45, .4, ST2); K.band(R, 14.6, .3, .25, ST2); K.cornice(R, E - .7, .7, .6, ST2);
    for (const h of holes) for (let j = 0; j < h.length; j++) K.storeys(h[j], h[(j + 1) % h.length], [-2, 6, 12.5, 17.5, E], ST2, i => ({ t: i ? W.LANCET : W.RECT, w: 1.3, y0: [1.4, 7.2, 13.4, 18.4][i], y1: [4.2, 10.8, 16, 21][i], P: 3.6, m: 1, lights: 1 }));
    K.wingRoof(R, E, DEP, RISE, SL, { holes, over: .35 });
    // ---- the Marienplatz front: tall gables with blind tracery and pinnacles, small gables between, dormers ----
    const a0 = R[0], b0 = R[1], L0 = lenOf(a0, b0);
    for (const [t, w, h] of [[8.4, 8.6, 12.5], [35.2, 5.6, 8], [46.5, 10.5, 15.5], [60.4, 5.6, 8], [70.5, 9.2, 13], [84.5, 5.6, 8]]) gothicGable(K, a0, b0, t, w, E, h, ST2, SL, { deep: DEP + 1 });
    const fdeg = dirOf(a0, b0) - 90;
    K.detail(() => {
      for (let j = 0; j < R.length; j++) {                   // dormers in two rows, kept clear of the gables
        const a = R[j], b = R[(j + 1) % R.length], len = lenOf(a, b), deg = dirOf(a, b) - 90;
        if (len < 12) continue;
        for (const [zb, w, h, P] of [[E + 2.3, 1.5, 1.7, 4.15], [E + 5.7, 1.1, 1.2, 6.2]]) {
          const n = Math.floor((len - 6) / P), dd = (zb - E) / g;
          for (let i = 0; i <= n; i++) {
            const t = (len - n * P) / 2 + i * P;
            if (j === 0 && [[7.6, 17.8], [20.5, 34.6], [34.4, 41.6], [45.7, 57.8], [59.6, 66.8], [69.7, 80.5], [83.7, 90.9]].some(([u0, u1]) => t > u0 && t < u1)) continue;
            const p = along(a, b, t, -dd);
            K.dormer(p[0], p[1], zb, w, h, deg, g, ST2, { ...SL, snow: .9 }, {});
          }
        }
      }
      // the rulers of Bavaria on brackets between the second-floor windows, each under a little canopy
      for (let k = 1; k < 23; k++) {
        const t = 2.75 + k * 4.15; if (t > 20.8 && t < 34.6) continue;
        const p = along(a0, b0, t, .45), q = along(a0, b0, t, .3);
        K.box(q[0], q[1], .7, .6, 10.25, 10.65, CAP, { ang: fdeg + 90 });
        figure(K, p[0], p[1], 10.65, 2, { m: 1, c: '#a59d8f', seed: .2 });
        K.pinnacle(q[0], q[1], 12.9, .75, 1.6, ST2, ST2, { ang: fdeg });
      }
      // slender piers with pinnacles up the front (the small Overture parts), statues' canopies
      for (const p of K.parts) if (p.part && p.area < 2 && p.h && !(p.minh >= 30)) {
        const z0 = p.minh || 6, h = p.h - z0;
        if (p.area < .6) { K.box(p.c[0], p.c[1], .5, .5, z0, p.h, ST2, { ang: fdeg }); K.pinnacle(p.c[0], p.c[1], p.h, .62, 2.6, ST2, CAP, { ang: fdeg }); }
        else { K.lathe(p.c[0], p.c[1], z0, [[.62, 0, 1], [.62, h, 1]], ST2, { n: 8, wall: 1 }); K.spire(p.c[0], p.c[1], p.h, .72, Math.max(2.4, p.rh || 2), CU, { n: 8 }); }
      }
    });
    // ---- corner oriel at Weinstrasse, turret at Dienerstrasse, the half-turret east of centre ----
    for (const [id, z0, ze, r] of [['P1173', 5.2, 26, 1.3], ['P1203', 5.2, 23.5, 1.25], ['P1205', 3.5, 24.5, .95]]) {
      const c = K.part(id).c;
      K.lathe(c[0], c[1], z0, [[.25, 0, 1], [r * .8, 1.3], [r, 2.4, 1]], ST2, { n: 8 });                         // the corbel
      for (const [y0, y1] of [[z0 + 2.4, 10.4], [10.4, 14.6], [14.6, 18.6], [18.6, ze]]) K.lathe(c[0], c[1], y0, [[r, 0, 1], [r, y1 - y0, 1]], ST, { n: 8, wall: 1, win: { t: W.LANCET, w: r * .5, y0: y0 + .8, y1: y1 - .6, n: 1 } });
      K.cornice(K.ngon(c[0], c[1], r, 8, Math.PI / 8), ze - .5, .5, .25, ST2);
      K.spire(c[0], c[1], ze, r * 1.12, r * 4.4, CU, { n: 8 });
      K.detail(() => K.ball(c[0], c[1], ze + r * 4.4 - .1, .2, GOLD));
    }
    // ---- the tower: shaft with the gateway, the Glockenspiel bay, belfry stage with corner turrets, octagon, spire ----
    const r0 = K.offset(K.ccw(K.part('P1235').ring), .15), r1 = K.ccw(K.part('P1236').ring), c = K.part('P1233').c;
    const tdeg = dirOf(r0[3], r0[0]), rot = tdeg * D + Math.PI / 8;              // r0[3] -> r0[0] is the front
    const shaftW = j => j === 3 ? [{ t: W.DOOR, w: 4.4, y0: 0, y1: 6.8, n: 1 }, { t: W.LANCET, w: 1.8, y0: 8.2, y1: 13, n: 2, m: 2, lights: 2 }, { t: W.LANCET, w: 2.3, y0: 15, y1: 21, n: 2, m: 2, lights: 2 }, null, { t: W.LANCET, w: 1.7, y0: 35, y1: 39.2, n: 2, m: 2, lights: 2 }]
      : [{ t: W.RECT, w: 1.3, y0: 1.5, y1: 4.5, n: 2, m: 2 }, { t: W.LANCET, w: 1.5, y0: 8.2, y1: 13, n: 2, m: 2, lights: 2 }, { t: W.LANCET, w: 2, y0: 15, y1: 21, n: 2, m: 2, lights: 2 }, { t: W.LANCET, w: 1.7, y0: 24, y1: 30.5, n: 2, m: 2, lights: 2 }, { t: W.LANCET, w: 1.7, y0: 35, y1: 39.2, n: 2, m: 2, lights: 2 }];
    for (let j = 0; j < 4; j++) K.storeys(r0[j], r0[(j + 1) % 4], [-2, 7.5, 14, 22.5, 33.5, 40], ST, i => shaftW(j)[i], { E: 40 });
    for (const z of [7.5, 14, 22.5, 33.5]) K.band(r0, z, .3, .25, ST2);
    K.cornice(r0, 39.3, .7, .5, ST2); K.cap(r0, 40, CAP);
    // corner turrets of the shaft (30-40 m) and of the belfry stage (55-63 m)
    for (const p of r0) { K.lathe(p[0], p[1], 27, [[.2, 0, 1], [.85, 2, 1], [.85, 13, 1]], ST2, { n: 8, wall: 1, win: { t: W.LANCET, w: .4, y0: 32, y1: 37.5, n: 1 } }); K.spire(p[0], p[1], 40, .95, 3.6, ST2, { n: 8 }); }
    for (let j = 0; j < 4; j++) K.storeys(r1[j], r1[(j + 1) % 4], [40, 51.5, 60], ST, i => [{ t: W.BELFRY, w: 1.5, y0: 42, y1: 49.5, n: 2, m: 1.2, lights: 1 }, null][i], { E: 60 });
    for (let j = 0; j < 4; j++) { const a = r1[j], b = r1[(j + 1) % 4]; K.clock(a, b, lenOf(a, b) / 2, 55.4, 1.65, { m: 12, c: '#2b3038' }, { out: .2 }); }
    K.cornice(r1, 59.3, .7, .45, ST2); K.cap(r1, 60, CAP);
    for (const p of r1) { K.lathe(p[0], p[1], 52, [[.3, 0, 1], [.75, 1.4, 1], [.75, 7, 1]], ST2, { n: 8 }); K.spire(p[0], p[1], 59, .85, 4, CU, { n: 8 }); }
    // the viewing gallery's balustrade on the stage top, round the octagon
    K.walls(K.offset(r1, -.25), 60, 61.1, ST2, { win: { t: W.ARCADE, w: .5, y0: 60.25, y1: 60.9, P: .75 } });
    K.lathe(c[0], c[1], 60, [[3.2, 0, 1], [3.2, 10, 1]], ST, { n: 8, rot, wall: 1, win: { t: W.LANCET, w: 1.15, y0: 61.6, y1: 68.4, n: 1 } });
    K.cornice(K.ngon(c[0], c[1], 3.2, 8, rot), 69.4, .6, .4, ST2);
    K.spire(c[0], c[1], 70, 3.45, 12.4, CU, { n: 8, rot });
    K.detail(() => {
      for (let k = 0; k < 8; k++) { const a = rot + (k + .5) / 8 * Math.PI * 2; K.pinnacle(c[0] + Math.cos(a) * 3.3, c[1] + Math.sin(a) * 3.3, 70, .45, 2.6, ST2, CU); }
      K.ball(c[0], c[1], 82.2, .28, GOLD);
      figure(K, c[0], c[1], 82.7, 2.3, { m: 16, c: '#1f1b1a' });                  // the Muenchner Kindl in its dark habit
      K.box(c[0], c[1], .12, .12, 84.2, 85.1, GOLD);
    });
    // the Glockenspiel bay: two open storeys of arcades (the jousters above, the coopers below) under a steep little roof
    {
      const a = r0[3], b = r0[0], L = lenOf(a, b), s0 = (L - 6.4) / 2, s1 = s0 + 6.4, dp = 1.7, z0 = 21.4, zm = 27.4, z1 = 33.2;
      const bay = [along(a, b, s0, 0), along(a, b, s0, dp), along(a, b, s1, dp), along(a, b, s1, 0)];      // CCW, back edge last
      K.lathe(...along(a, b, L / 2, .2), z0 - 2.4, [[.3, 0, 1], [2.6, 2.4, 1]], ST2, { n: 4, rot: tdeg * D + Math.PI / 4 });   // corbel
      K.storeys(bay[0], bay[1], [z0, zm, z1], ST, null); K.storeys(bay[2], bay[3], [z0, zm, z1], ST, null);
      K.storeys(bay[1], bay[2], [z0, zm, z1], ST, i => ({ t: W.ARCADE, w: 1.5, y0: [z0 + 1.2, zm + 1][i], y1: [zm - .6, z1 - .5][i], n: 3, m: .4 }));
      K.cap(bay, z0, ST2, { down: 1 });
      for (const z of [z0 + .9, zm + .7]) K.box(...along(a, b, L / 2, dp + .25), 6.9, .5, z - .25, z, CAP, { ang: tdeg });   // balcony ledges
      K.tent([bay[0], bay[1], bay[2], bay[3]], [...along(a, b, L / 2, .2), z1 + 4.2], z1, CU, { open: true, over: .15 });
      K.detail(() => {                                         // the figures, in faded court colours
        const cols = ['#7d2f2a', '#2d4a73', '#d8d0bc', '#b98a32', '#3c5c3a', '#7d2f2a'];
        for (const [zf, hh] of [[z0 + .9, 1.4], [zm + .7, 1.5]]) for (let k = 0; k < 6; k++) { const p = along(a, b, s0 + .7 + k * 1, dp + .28); figure(K, p[0], p[1], zf, hh, { m: 16, c: cols[(k + (zf > zm ? 3 : 0)) % 6] }); }
      });
    }
  },
  // Altes Rathaus (1470-80, Joerg von Halsbach; rebuilt after the war): white, a steep tiled saddle with a ridge turret and
  // a pinnacled Gothic gable to Marienplatz, tall pointed windows of the ballroom; the tower over the old Talburg gate
  // with four corner turrets round its steep spire.
  altesRathaus(K) {
    const { W, F } = K, hall = K.part('P1184'), ne = K.part('P1183'), tw = K.part('B150892');
    const PL = { m: 2, c: '#ede8dd', t: '#cfc4ae', f: F.PLINTH | F.EAVES | F.STONEFRAME, seed: .23 }, PLT = { ...PL, f: F.PLINTH | F.QUOIN | F.STONEFRAME, seed: .57 };
    const PLG = { ...PL, f: F.STONEFRAME, seed: .29 }, TL = { m: 6, c: '#8a4632', snow: .75, seed: .5 }, CAP = { m: 11, c: '#b8ae9e' };
    // the hall: a clean rectangle over the Overture outline (its notch is the tower)
    const A = hall.ring[0], B = hall.ring[1], C = hall.ring[6], Dd = hall.ring[7], HR = K.ccw([A, B, C, Dd]);
    const deg = dirOf(B, C), EH = 12.5, RH = 12.5;
    const P = K.planes(HR, 'gable', EH, RH, deg);
    K.roofPlanes(HR, P, TL, { over: .45 });
    const gw = (j, len) => len > 25 ? { t: W.LANCET, w: 2.1, y0: 6.8, y1: 11.6, P: 4.4, m: 2.6, lights: 2 } : len > 15 ? { t: W.LANCET, w: 2.2, y0: 6.8, y1: 11.6, n: 3, m: 3, lights: 2 } : null;
    K.roofWalls(HR, P, 5.2, PL, { E: EH, win: gw });
    for (let j = 0; j < 4; j++) { const a = HR[j], b = HR[(j + 1) % 4]; K.wall(a, b, -2, 5.2, PL, { win: a === A ? { t: W.ARCADE, w: 3.4, y0: -1, y1: 4.7, n: 2, m: 4.5 } : { t: W.RECT, w: 1.3, y0: 1.6, y1: 4, P: 4.4, m: 2 }, E: EH }); }
    // the Marienplatz gable (A -> B faces north-west): blind tracery, pinnacles stepping up its rakes, a crowning one
    const ga = A, gb = B, GL = lenOf(ga, gb);
    K.wallPoly(ga, gb, [[0, EH + .3], [GL, EH + .3], [GL / 2, EH + RH - .4]], PLG, { out: .06, win: { t: W.BLIND, w: 1.5, y0: EH + 1.6, y1: EH + 7.5, n: 4, m: 3.2 } });
    K.detail(() => {
      for (let k = 0; k <= 4; k++) for (const s of [-1, 1]) {
        const t = GL / 2 + s * GL / 2 * (1 - k / 5), z = EH + RH * k / 5, p = along(ga, gb, t, .35);
        K.pinnacle(p[0], p[1], z - .2, .55, 2.4, PLG, TL);
      }
      const p = along(ga, gb, GL / 2, .35); K.pinnacle(p[0], p[1], EH + RH - .6, .7, 3.4, PLG, TL);
      // the ridge turret over the ballroom
      const q = [(A[0] + B[0]) / 2 * .7 + (C[0] + Dd[0]) / 2 * .3, (A[1] + B[1]) / 2 * .7 + (C[1] + Dd[1]) / 2 * .3];
      K.lathe(q[0], q[1], EH + RH - 2, [[.95, 0, 1], [.95, 3.4, 1]], PLG, { n: 6, wall: 1, win: { t: W.BELFRY, w: .45, y0: EH + RH, y1: EH + RH + 1.1, n: 1 } });
      K.spire(q[0], q[1], EH + RH + 1.4, 1.1, 4.2, TL, { n: 6 });
      K.ball(q[0], q[1], EH + RH + 5.5, .15, GOLD);
    });
    // the north-east wing
    K.footprint(ne, { wall: PL, roof: TL, roofType: 'gable', eave: 12.8, rh: 10.2, deg, win: { t: W.LANCET, w: 1.6, y0: 6.8, y1: 10.8, P: 3.9, m: 1.5, lights: 1 } });
    // the tower over the old gate: square shaft, the arch through it, four corner turrets, the steep tiled spire
    const tr = K.ccw(K.offset(tw.ring, .1)), tc = tw.c, td = dirOf(tr[0], tr[1]);
    for (let j = 0; j < 4; j++) {
      const a = tr[j], b = tr[(j + 1) % 4], len = lenOf(a, b), road = Math.abs(Math.cos((dirOf(a, b) - dirOf(B, C)) * D)) < .5;   // the faces the road runs through
      K.storeys(a, b, [-2, 8, 17, 25, 32], PLT, i => [road ? { t: W.ARCADE, w: 4.3, y0: -1, y1: 6.8, n: 1 } : { t: W.SLIT, w: .5, y0: 2.5, y1: 5, n: 1 }, { t: W.LANCET, w: 1.1, y0: 11, y1: 14.5, n: 1, lights: 1 }, { t: W.SLIT, w: .45, y0: 19, y1: 22, n: 2, m: 2 }, { t: W.LANCET, w: 1.2, y0: 28.6, y1: 31.2, n: 2, m: 1.5 }][i], { E: 32 });
      if (j % 2) K.clock(a, b, len / 2, 25.6 + (j === 1 ? 0 : 0), 1.55, { m: 12, c: '#2a3038' }, { out: .15 });
    }
    K.cornice(tr, 31.4, .6, .4, PLG); K.cap(tr, 32, CAP);
    const R8 = lenOf(tr[0], tr[1]) / 2 * .98;
    K.lathe(tc[0], tc[1], 32, [[R8, 0, 1], [R8 * .66, 6], [R8 * .4, 12.5], [R8 * .14, 21], [0, 24.2]], TL, { n: 8, rot: td * D + Math.PI / 8 });
    for (const p of tr) {
      K.lathe(p[0], p[1], 29.4, [[.25, 0, 1], [.95, 1.5, 1], [.95, 6.6, 1]], PLT, { n: 8, wall: 1, win: { t: W.SLIT, w: .3, y0: 32.5, y1: 34.5, n: 1 } });
      K.spire(p[0], p[1], 36, 1.08, 5, TL, { n: 8 });
      K.detail(() => K.ball(p[0], p[1], 40.9, .13, GOLD));
    }
    K.detail(() => { K.ball(tc[0], tc[1], 56.1, .22, GOLD); K.box(tc[0], tc[1], .1, .1, 56.4, 57.6, GOLD); });
  },
  // Alter Peter (St. Peter, Munich's oldest parish church): a Gothic basilica made Baroque, white with a red roof; the
  // broad 91 m tower (the two Gothic towers joined into one) carries eight clock faces under its gallery and the stacked
  // copper lantern helm of 1607: a great welsche Haube, an open lantern, a second Haube and lantern, a cross.
  alterPeter(K) {
    const { W, F } = K, nave = K.part('P1217');
    const PL = { m: 2, c: '#ece5d6', t: '#d6c8a8', f: F.PLINTH | F.PILASTER | F.EAVES, seed: .35 }, PL2 = { m: 2, c: '#e7dfcc', t: '#f3eee3', f: F.PLINTH | F.PILASTER | F.QUOIN | F.EAVES, seed: .62 };
    const TL = { m: 6, c: '#8d4430', snow: .8, seed: .41 }, CU = { m: 4, c: '#5c8774', snow: .65, seed: .53 }, CAP = { m: 11, c: '#aaa292' };
    const win = { t: W.ROUND, w: 2.2, y0: 7, y1: 14.5, P: 5.2, m: 1.5 };
    K.footprint(nave, { wall: PL, roof: TL, roofType: 'gable', eave: 17, rh: 11, win });
    for (const id of ['P1215', 'P1216', 'P1218', 'P1219', 'P1223', 'P1202']) { const p = K.part(id); K.footprint(p, { wall: PL, roof: TL, highToward: nave.c, win: { t: W.ROUND, w: 1.7, y0: 3, y1: Math.max(4.5, (p.h - (p.rh || 0)) - 2), P: 5.2, m: 1.2 } }); }
    K.footprint(K.part('P1199'), { wall: PL, roof: TL, roofType: 'hip', eave: 17, rh: 11, win, simplify: 1 });
    for (const id of ['P1200', 'P1201']) K.footprint(K.part(id), { wall: PL, roof: CU, roofType: 'onion', rh: 5, win: { t: W.ROUND, w: .7, y0: 10, y1: 12, n: 1 } });
    for (const id of ['P1221', 'P1222']) K.footprint(K.part(id), { wall: PL, roof: CU, roofType: 'cone', rh: 4.5 });
    for (const id of ['P1220', 'P1226']) K.footprint(K.part(id), { wall: PL2, roof: TL, highToward: K.part('P1224').c, win: { t: W.ROUND, w: 1.6, y0: 12, y1: 16, P: 4, m: 1 } });
    // the tower: a broad shaft, its faces in storeys of round-arched windows between corner pilasters
    const r = K.ccw(K.simplify(K.part('P1224').ring, .5)), c = K.part('P1225').c, ZS = [-2, 18, 30, 42, 56];
    for (let j = 0; j < r.length; j++) {
      const a = r[j], b = r[(j + 1) % r.length], l = lenOf(a, b), broad = l > 9;
      K.storeys(a, b, ZS, PL2, i => [null, { t: W.ROUND, w: 1.3, y0: 22, y1: 27, n: broad ? 3 : 1, m: 1 }, { t: W.BELFRY, w: 1.6, y0: 33, y1: 40, n: broad ? 2 : 1, m: 1.2 }, null][i], { E: 56 });
      // the clocks: two side by side on the broad faces, one on the narrow ones (and two more on the drum)
      if (broad) for (const t of [l * .28, l * .72]) K.clock(a, b, t, 49.2, 2, DIAL2, { out: .2 });
      else K.clock(a, b, l / 2, 49.2, 2, DIAL2, { out: .2 });
    }
    for (const z of [18, 30, 42]) K.band(r, z - .2, .3, .22, { ...PL2, f: 0 });
    K.cornice(r, 55.2, .9, .6, { ...PL2, f: 0 }); K.cap(r, 56.1, CAP);
    // the gallery: a railing round the shaft top
    K.detail(() => {
      const g = K.offset(r, .45);
      for (let j = 0; j < g.length; j++) { const a = g[j], b = g[(j + 1) % g.length], l = lenOf(a, b), n = Math.round(l / 1.1); for (let i = 0; i <= n; i++) { const p = along(a, b, i / n * l); K.box(p[0], p[1], .08, .08, 56.1, 57.2, IRON); } }
      K.mould(g, [[-.04, 57.1], [.04, 57.1], [.04, 57.22], [-.04, 57.22]], IRON);
    });
    // the drum, the great Haube, the lantern, the second Haube and lantern, the cross
    const rot = dirOf(r[0], r[1]) * D + Math.PI / 8, Rd = 2.9;
    K.lathe(c[0], c[1], 56.1, [[Rd, 0, 1], [Rd, 7.8, 1]], PL2, { n: 8, rot, wall: 1, win: { t: W.ROUND, w: 1.05, y0: 57.4, y1: 61.6, n: 1 } });
    const V8 = K.ngon(c[0], c[1], Rd, 8, rot);
    for (const k of [1, 5]) K.clock(V8[k], V8[k + 1], lenOf(V8[k], V8[k + 1]) / 2, 62.4, .72, DIAL2, { out: .1 });
    K.cornice(K.ngon(c[0], c[1], Rd, 8, rot), 63.3, .6, .4, { ...PL2, f: 0 });
    K.lathe(c[0], c[1], 63.9, bell(3.55, 8.8), CU, { seg: K.seg(24) });
    K.lantern(c[0], c[1], 73, 1.4, 4.2, CU, CU, { n: 8, cap: bell(1.85, 4.8), finial: null });
    K.lantern(c[0], c[1], 82.35, .7, 2.4, CU, CU, { n: 6, cap: K.P.onion(.85, 2), finial: 3.4, finM: GOLD });
  },
  // Heilig-Geist-Kirche: the Gothic hospital church by the Viktualienmarkt, Baroque inside (the Asam brothers); its
  // neo-Baroque west front of 1885-88 with a scrolled gable and two little onion turrets, a round apse under a hipped roof,
  // and the tower by the choir with a Munich lantern helm.
  heiliggeist(K) {
    const { W, F } = K, nave = K.part('P1253');
    const PL = { m: 2, c: '#ece4d1', t: '#d8ccb2', f: F.PLINTH | F.EAVES, seed: .19 }, FR = { m: 2, c: '#eee6d4', t: '#cdbfa3', f: F.PLINTH | F.PILASTER | F.FRAME, seed: .73 };
    const FR2 = { ...FR, f: F.FRAME }, TL = { m: 6, c: '#8b4531', snow: .8, seed: .66 }, CU = { m: 4, c: '#5c8774', snow: .65, seed: .12 }, CAP = { m: 11, c: '#b0a796' };
    // the nave and its round apse: one hipped roof, gabled at the west front
    const ring = K.ccw(nave.ring), E = 18, gw = (27 - E) / 12.4;
    const iw = ring.findIndex(p => Math.abs(p[0] + 16.63) < .1 && Math.abs(p[1] - 26.53) < .1);   // the west end: (-16.63, 26.53) -> (-29.27, 5.7)
    const planes = K.hipPlanes(ring, E, gw, { gable: [iw] });
    K.roofPlanes(ring, planes, TL, { over: .5 });
    K.roofWalls(ring, planes, -2, PL, { E, win: (j, len) => j === iw ? null : len > 9 ? { t: W.ROUND, w: 2.3, y0: 6.5, y1: 15.2, P: 6.1, m: 2 } : len > 3.4 ? { t: W.ROUND, w: 1.8, y0: 6.5, y1: 15, n: 1 } : null });
    K.cornice(ring, E - .6, .6, .45, { ...PL, f: 0 }, {});
    // the west front: corner turrets, side bays, the centre bay with its scrolled gable
    const a = [-18.4, 27.61], b = [-31.04, 6.78], L = lenOf(a, b), back = 2.1;
    const fr = [a, b, along(a, b, L, -back), along(a, b, 0, -back)];          // a -> b faces north-west
    const seg = [[0, 2.2], [2.2, 7.3], [7.3, 17.1], [17.1, 22.2], [22.2, L]];
    for (const [s0, s1] of seg) {
      const p0 = along(a, b, s0), p1 = along(a, b, s1), w = s1 - s0, mid = w > 9;
      K.storeys(p0, p1, [-2, 7.2, 13.4, 20], w < 3 ? FR2 : FR, i => w < 3 ? null : [mid ? { t: W.DOOR_R, w: 3.1, y0: 0, y1: 5.9, n: 1 } : { t: W.NICHE, w: 1.5, y0: 1.8, y1: 5.6, n: 1 }, mid ? { t: W.ROUND, w: 3.4, y0: 8.4, y1: 17.6, n: 1 } : { t: W.NICHE, w: 1.4, y0: 8.6, y1: 12.2, n: 1 }, mid ? null : { t: W.ROUND, w: 1.4, y0: 14.4, y1: 18.2, n: 1 }][i], { E: 20 });
    }
    K.walls(fr, -2, 20, FR2, { skip: j => j === 0 });
    K.band(fr, 7.2, .35, .35, CAP); K.band(fr, 13.4, .3, .3, CAP); K.cornice(fr, 19.4, .7, .55, { ...FR, f: 0 }); K.cap(K.offset(fr, .2), 20.1, CAP);
    // the gable: a scrolled centre to 32 m over the middle bay, quarter scrolls over the side bays to 24.5 m
    const g0 = along(a, b, 2.2, .1), g1 = along(a, b, 22.2, .1);
    K.slab(g0, g1, sideScrolls(20, 4.6, 5.1, 20), 1.2, FR, { out: .7, win: { t: W.ROUND, w: 2, y0: 21.2, y1: 25.6, n: 1 } });
    const c0 = along(a, b, 7.3, .1), c1 = along(a, b, 17.1, .1);
    K.slab(c0, c1, K.outline.scroll(9.8, 24.4, 7.6, { top: .44, round: true }), 1, FR, { out: .65, win: { t: W.NICHE, w: 1.5, y0: 25.4, y1: 29.4, n: 1 } });
    K.detail(() => { const p = along(a, b, L / 2, .3); K.cross(p[0], p[1], 31.9, 1.6, GOLD, dirOf(a, b)); });
    for (const [s0, s1] of [[0, 2.2], [22.2, L]]) {
      const p = along(a, b, (s0 + s1) / 2, -back / 2 + .1);
      K.lathe(p[0], p[1], 20.1, [[1.05, 0, 1], [1.05, 1.6, 1]], FR2, { n: 8, wall: 1, win: { t: W.ROUND, w: .55, y0: 20.4, y1: 21.4, n: 1 } });
      K.lathe(p[0], p[1], 21.7, K.P.onion(1.1, 2.6), CU, { seg: K.seg(12) });
      K.detail(() => K.finial(p[0], p[1], 24.2, 1.1, GOLD));
    }
    // chapels along the south side, the sacristy round the apse, the annex by the tower
    for (const id of ['P1198', 'P1193', 'P1197']) K.footprint(K.part(id), { wall: PL, roof: TL, roofType: id === 'P1198' ? 'skillion' : 'hip', eave: 8.5, rh: id === 'P1198' ? 3 : 2.5, highToward: nave.c, win: { t: W.ROUND, w: 1.5, y0: 3, y1: 6.6, P: 4.4, m: 1 } });
    for (const id of ['P1252', 'P1251']) K.footprint(K.part(id), { wall: PL, roof: TL, roofType: 'hip', eave: 8, rh: 3.2, simplify: 1, win: { t: W.RECT, w: 1.2, y0: 3, y1: 5.6, P: 3.6, m: 1 } });
    // the tower by the choir: a plain shaft, the clock storey, the lantern helm
    const t0 = K.ccw(K.part('P1249').ring), t1 = K.ccw(K.part('P1246').ring), tc = K.part('P1248').c, trot = dirOf(t1[0], t1[1]) * D + Math.PI / 8;
    for (let j = 0; j < 4; j++) K.wall(t0[j], t0[(j + 1) % 4], -2, 18, PL, { win: { t: W.SLIT, w: .5, y0: 9, y1: 12, n: 1 }, E: 18 });
    K.cap(t0, 18, CAP);
    for (let j = 0; j < 4; j++) {
      const p = t1[j], q = t1[(j + 1) % 4];
      K.storeys(p, q, [18, 30, 37], { ...PL, f: F.QUOIN | F.EAVES }, i => [{ t: W.BELFRY, w: 1.3, y0: 22, y1: 28, n: 1 }, null][i], { E: 37 });
      K.clock(p, q, lenOf(p, q) / 2, 33.4, 1.55, DIAL2, { out: .15 });
    }
    K.cornice(t1, 36.3, .7, .5, { ...PL, f: 0 }); K.cap(t1, 37, CAP);
    K.lathe(tc[0], tc[1], 37, [[3.05, 0, 1], [3.05, 1.1, 1]], { ...PL, f: 0 }, { n: 8, rot: trot });
    K.lathe(tc[0], tc[1], 38.1, bell(3, 7.6), CU, { seg: K.seg(20) });
    K.lantern(tc[0], tc[1], 45.7, 1.05, 3.2, CU, CU, { n: 8, cap: K.P.onion(1.22, 3.4), finial: 2.2, finM: GOLD });
  },
  // Mariensaeule (1638): the red-marble Corinthian column in the middle of Marienplatz with the gilded Virgin (1593) on
  // top, on a pedestal inside a balustrade, four bronze putti fighting plague, war, famine and heresy at its corners.
  mariensaeule(K) {
    const { W } = K, z = K.groundAt(0, 0), MB = { m: 11, c: '#cbc3b5' }, MB2 = { m: 11, c: '#b9b0a1' }, RED = { m: 11, c: '#8c5a4a' };
    const BR = { m: 14, c: '#3f3a33' }, deg = -18;
    K.box(0, 0, 9.6, 9.6, z - 1.2, z + .2, MB2, { ang: deg }); K.box(0, 0, 8.8, 8.8, z + .2, z + .45, MB2, { ang: deg });
    const rail = K.rect(0, 0, 8.4, 8.4, deg);
    K.walls(rail, z + .45, z + 1.35, MB, { win: { t: W.ARCADE, w: .22, y0: .2, y1: .72, P: .34, m: .5 }, vz: z });
    K.mould(rail, [[-.12, z + 1.33], [.12, z + 1.33], [.12, z + 1.48], [-.12, z + 1.48]], MB);
    for (const p of rail) { K.box(p[0], p[1], .7, .7, z + .45, z + 1.9, MB, { ang: deg }); K.detail(() => figure(K, p[0], p[1], z + 1.9, 1.25, BR)); }
    // pedestal, column, capital, the Virgin on the crescent with her crown
    K.box(0, 0, 3, 3, z + .45, z + 1.1, MB2, { ang: deg });
    K.box(0, 0, 2.4, 2.4, z + 1.1, z + 3.3, MB, { ang: deg });
    K.cornice(K.rect(0, 0, 2.4, 2.4, deg), z + 3, .3, .2, MB);
    K.lathe(0, 0, z + 3.3, [[.66, 0, 1], [.66, .28], [.55, .42], [.5, .62, 1], [.47, 3.2], [.42, 5.8, 1], [.5, 5.95], [.62, 6.3], [.72, 6.55, 1]], RED, { seg: K.seg(14) });
    K.box(0, 0, 1.15, 1.15, z + 9.85, z + 10.05, MB, { ang: deg });
    K.lathe(0, 0, z + 10.05, [[.38, 0, 1], [.5, .14], [.36, .26, 1]], GOLD, { seg: K.seg(10) });                 // the crescent
    figure(K, 0, 0, z + 10.2, 2.05, GOLD);
    K.detail(() => K.lathe(0, 0, z + 12.05, [[.16, 0, 1], [.2, .22, 1], [0, .26]], GOLD, { seg: 8 }));
  },
  // St. Michael (1583-97): the largest Renaissance church north of the Alps. Its show front on Neuhauser Strasse rises in
  // three storeys of pilasters and statue niches (the Wittelsbach rulers, St. Michael with the dragon between the
  // portals), then a gable in three scrolled tiers with obelisks; behind it the great saddle roof over the barrel vault,
  // the choir closing to the north in a lower polygon.
  stMichael(K) {
    const { W, F } = K, rec = K.part('B150580');
    const PL = { m: 2, c: '#dfd9cc', t: '#bdb19a', f: F.PLINTH | F.PILASTER | F.EAVES, seed: .2 }, FR = { m: 2, c: '#e4dfd2', t: '#b3a68e', f: F.PLINTH | F.PILASTER | F.FRAME, seed: .48 };
    const FRn = { ...FR, f: F.PILASTER }, TL = { m: 6, c: '#8a432f', snow: .85, seed: .17 }, CAP = { m: 11, c: '#b9ae9b' }, OB = { m: 11, c: '#c9c0b0' };
    K.at(0, 0, 0, rec.ang, () => {
      const x0 = -42.6, x1 = 33.3, y0 = -17.1, y1 = 17.3, E = 27, RISE = 19, yc = (y0 + y1) / 2;
      const nave = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      K.walls(nave, 6.5, E, PL, { skip: j => j === 3 || j === 1, win: { t: W.ROUND, w: 3, y0: 9.5, y1: 21.5, P: 7.5, m: 2.5 } });
      K.walls(nave, -2, 6.5, { ...PL, f: F.PLINTH }, { skip: j => j === 3 || j === 1, win: { t: W.RECT, w: 1.3, y0: 2, y1: 4.6, P: 7.5, m: 2.5 } });
      K.cornice(nave, E - .8, .8, .6, { ...PL, f: 0 }, { open: true });
      const P = K.planes(nave, 'gable', E, RISE, 0);
      K.roofPlanes(nave, P, TL, { over: .6 });
      K.detail(() => {                                        // a few roof hatches in the long roof
        for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const x = x0 + 12 + i * 11.5, zb = E + 5.5, y = yc + s * (17.2 - (zb - E) / (RISE / 17.2)); K.dormer(x, y, zb, 1.2, 1.2, s * 90, RISE / 17.2, PL, { ...TL, snow: .9 }, {}); }
      });
      const ch = [[x1 - .5, -14.1], [41.4, -12.5], [46.9, -5.9], [47.1, 4.5], [41.5, 11.8], [x1 - .5, 12.7]];
      K.walls(ch, -2, 24, PL, { skip: j => j === ch.length - 1, win: { t: W.ROUND, w: 2.6, y0: 8, y1: 19, n: 1, m: 1 } });
      K.tent(ch, [x1 - .5, yc - .7, 37], 24, TL, { open: true, over: .5 });
      K.roofWalls([[x1, y0], [x1, y1], [x1 - .1, y1], [x1 - .1, y0]], P, 24, PL, { skip: j => j !== 0 });
      // ---- the show front (a -> b faces south-west onto the street) ----
      const a = [x0, y1], b = [x0, y0], L = y1 - y0;
      const bays = [0, 4.6, 10.6, 13.6, 20.8, 23.8, 29.8, L];                     // pilaster bays: outer, portal, narrow, centre, narrow, portal, outer
      for (let k = 0; k < bays.length - 1; k++) {
        const p0 = along(a, b, bays[k]), p1 = along(a, b, bays[k + 1]), w = bays[k + 1] - bays[k], kind = [0, 1, 2, 3, 2, 1, 0][k];
        K.storeys(p0, p1, [-2, 11, 20, E], FR, i => [
          [{ t: W.NICHE, w: 1.7, y0: 3.4, y1: 8.8, n: 1 }, { t: W.DOOR_R, w: 3.2, y0: 0, y1: 6.8, n: 1 }, { t: W.NICHE, w: 1.1, y0: 4, y1: 8, n: 1 }, { t: W.NICHE, w: 3.2, y0: 1.6, y1: 9.6, n: 1 }][kind],
          [{ t: W.NICHE, w: 1.5, y0: 12.4, y1: 18.2, n: 1 }, { t: W.ROUND, w: 2.4, y0: 12.6, y1: 18.6, n: 1 }, { t: W.NICHE, w: 1.1, y0: 13, y1: 17.6, n: 1 }, { t: W.NICHE, w: 1.6, y0: 12.4, y1: 18.4, n: 2, m: .6 }][kind],
          [{ t: W.NICHE, w: 1.4, y0: 21.2, y1: 25.8, n: 1 }, { t: W.ROUND, w: 2.2, y0: 21.3, y1: 26.1, n: 1 }, { t: W.NICHE, w: 1, y0: 21.6, y1: 25.4, n: 1 }, { t: W.NICHE, w: 1.5, y0: 21.2, y1: 25.8, n: 2, m: .6 }][kind]][i], { E });
      }
      for (const z of [11, 20]) K.band([a, b], z - .3, .45, .45, CAP, { open: true });
      K.cornice([a, b], E - .9, .9, .7, CAP, { open: true });
      // the gable in three tiers, each narrower, scrolls at the steps, a pediment, obelisks at the corners
      const tiers = [[0, E, 3.4, 7.2], [3.4, E + 7.2, 4, 7], [7.4, E + 14.2, 3.9, 6.8]];
      for (const [d, z, st, h] of tiers) {
        const w = L - 2 * d, p0 = along(a, b, d), p1 = along(a, b, L - d);
        K.slab(p0, p1, sideScrolls(z, st, h, w), 1.5, FRn, { out: .75, win: { t: W.NICHE, w: 1.4, y0: z + 1.4, y1: z + h - 1.1, n: [5, 3, 1][tiers.findIndex(t => t[0] === d)], m: st + .8 } });
        K.band([[x0 - .75, (w / 2 - st) + yc], [x0 - .75, -(w / 2 - st) + yc]], z + h - .35, .35, .35, CAP, { open: true });
      }
      const top = tiers[2], tw2 = L - 2 * (top[0] + top[2]), tz = top[1] + top[3];
      K.slab(along(a, b, top[0] + top[2]), along(a, b, L - top[0] - top[2]), [[0, tz - .3], [tw2, tz - .3], [tw2 / 2, tz + 3.4]], 1.2, FRn, { out: .7 });
      K.detail(() => {
        for (const [d, z, st, h] of tiers) for (const t of [d + st, L - d - st]) { const p = along(a, b, t, .55); obelisk(K, p[0], p[1], z + h, 3.2, OB); }
        const p = along(a, b, L / 2, .5); obelisk(K, p[0], p[1], tz + 3.3, 2.6, OB); K.cross(p[0], p[1], tz + 5.8, 1.6, GOLD, 90);
        // the bronze St. Michael and the dragon in the centre niche, and the rulers in the first-floor niches
        const m = along(a, b, L / 2, .4); figure(K, m[0], m[1], 1.9, 4.4, { m: 14, c: '#3b3630' });
      });
    });
  },
  // Buergersaalkirche (1709-10, Giovanni Antonio Viscardi): the Marian congregation's hall, an upper and a lower church
  // behind a narrow two-storey Baroque front between the houses of Neuhauser Strasse: pilasters, tall windows, the
  // enthroned Madonna over the portal, a pediment and a little roof turret.
  buergersaal(K) {
    const { W, F } = K, rec = K.part('B150598'), r = K.ccw(rec.ring);
    const PL = { m: 2, c: '#e9e1cc', t: '#f4efe3', f: F.PLINTH | F.PILASTER | F.FRAME | F.EAVES, seed: .44 }, PLs = { m: 2, c: '#e3dac6', t: '#efe9dc', f: F.PLINTH | F.EAVES, seed: .81 };
    const TL = { m: 6, c: '#8b4734', snow: .85, seed: .9 }, CAP = { m: 11, c: '#bdb3a2' }, CU = { m: 4, c: '#5c8774', snow: .6 };
    const fi = r.findIndex((p, j) => { const q = r[(j + 1) % 4]; return lenOf(p, q) < 25 && (q[1] + p[1]) / 2 < -15; });   // the street front (south)
    const a = r[fi], b = r[(fi + 1) % 4], L = lenOf(a, b), E = 19;
    const P = K.planes(r, 'hip', E, 7.5, dirOf(r[(fi + 1) % 4], r[(fi + 2) % 4]));
    K.roofPlanes(r, P, TL, { over: .4 });
    K.walls(r, -2, E, PLs, { skip: j => j === fi, win: (j, len) => len > 30 ? { t: W.ROUND, w: 2.2, y0: 10, y1: 16.5, P: 5.6, m: 3 } : null });
    // the front: five bays, portal and Madonna in the middle, tall upper-church windows, a pediment
    const bays = [0, 3.4, 6.6, 11.4, 14.6, L];
    for (let k = 0; k < 5; k++) {
      const p0 = along(a, b, bays[k]), p1 = along(a, b, bays[k + 1]), mid = k === 2;
      K.storeys(p0, p1, [-2, 8.6, E], PL, i => [mid ? { t: W.DOOR_R, w: 2.6, y0: 0, y1: 5.2, n: 1 } : { t: W.RECT, w: 1.4, y0: 2.2, y1: 5.8, n: 1 }, mid ? { t: W.NICHE, w: 2.4, y0: 9.6, y1: 13.6, n: 1 } : { t: W.ROUND, w: 1.7, y0: 10.2, y1: 16.6, n: 1 }][i], { E });
    }
    K.band([along(a, b, 0, .05), along(a, b, L, .05)], 8.4, .45, .4, CAP, { open: true });
    K.cornice([along(a, b, 0, .05), along(a, b, L, .05)], E - .8, .85, .6, CAP, { open: true });
    K.slab(along(a, b, 4.4), along(a, b, L - 4.4), [[0, E - .2], [L - 8.8, E - .2], [(L - 8.8) / 2, E + 3.2]], .8, PL, { out: .55 });
    K.detail(() => {
      const m = along(a, b, L / 2, .2); figure(K, m[0], m[1], 9.8, 2.4, { m: 2, c: '#efe9dc' });
      const p = along(a, b, L / 2, .45); K.cross(p[0], p[1], E + 3.1, 1.2, GOLD, dirOf(a, b));
      for (const t of [4.6, L - 4.6]) { const q = along(a, b, t, .45); K.lathe(q[0], q[1], E, [[.32, 0, 1], [.32, .35], [.22, .5], [.28, .85], [0, 1.1]], CAP, { seg: 8 }); }
    });
    // the little roof turret behind the front
    const q = along(a, b, L / 2, -9);
    K.lathe(q[0], q[1], E + 3, [[.95, 0, 1], [.95, 3.4, 1]], PLs, { n: 8, wall: 1, win: { t: W.BELFRY, w: .5, y0: E + 4, y1: E + 5.8, n: 1 } });
    K.lathe(q[0], q[1], E + 6.4, K.P.onion(1.05, 2.8), CU, { seg: K.seg(12) });
    K.detail(() => K.finial(q[0], q[1], E + 9.2, 1.1, GOLD));
  },
  // Asamkirche (St. Johann Nepomuk, 1733-46): the Asam brothers' own church, a facade only about 8 m wide between the
  // Asam house and the priests' house on Sendlinger Strasse: the portal set in natural rock, St. John of Nepomuk before
  // the great window, the three virtues in the curved gable, a little bell turret set back on the roof.
  asamkirche(K) {
    const { W, F } = K, rec = K.part('B37200'), r = K.ccw(rec.ring);
    const PL = { m: 2, c: '#e3dccd', t: '#c8bca6', f: F.PILASTER | F.FRAME, seed: .52 }, PLs = { m: 2, c: '#dcd3c2', t: '#e9e3d7', f: F.PLINTH | F.EAVES, seed: .14 };
    const TL = { m: 6, c: '#86442f', snow: .85, seed: .58 }, CAP = { m: 11, c: '#bbb19f' }, ROCKM = { m: 9, c: '#8f877b' }, CU = { m: 4, c: '#5c8774', snow: .6 };
    const a = [6.21, -14.58], b = [14.64, -9.44], L = lenOf(a, b), E = 21, fi = r.findIndex(p => Math.abs(p[0] - a[0]) < .05 && Math.abs(p[1] - a[1]) < .05);
    const P = K.planes(r, 'gable', E, 8.5, dirOf(b, [2.64, 5.13]));
    K.roofPlanes(r, P, TL, { over: .3 });
    K.roofWalls(r, P, -2, PLs, { E, skip: j => j === fi });
    K.roofWalls(r, P, E - .6, PLs, { E, skip: j => j !== fi });                 // the gable over the front
    // the front, slightly convex: a rock-framed portal, the great window with the saint, the curved gable
    const mid = along(a, b, L / 2, .9), f0 = along(a, b, 0, .05), f1 = along(a, b, L, .05);
    K.storeys(f0, mid, [-2, 7.6, 16.4, E], PL, i => [null, { t: W.ROUND, w: 2.6, y0: 8.6, y1: 15.6, n: 1, m: .2 }, { t: W.ROUND, w: 1.3, y0: 17.4, y1: 20, n: 1, m: .3 }][i], { E });
    K.storeys(mid, f1, [-2, 7.6, 16.4, E], PL, i => [null, { t: W.ROUND, w: 2.6, y0: 8.6, y1: 15.6, n: 1, m: 1.2 }, { t: W.ROUND, w: 1.3, y0: 17.4, y1: 20, n: 1, m: 1.1 }][i], { E });
    K.wall(along(a, b, 2.4, .95), along(a, b, L - 2.4, .95), -1, 7.6, PL, { win: { t: W.DOOR_R, w: 2.4, y0: 0, y1: 4.9, n: 1 }, E });
    K.rock(K.ccw([along(a, b, .2, .1), along(a, b, 2.6, .1), along(a, b, 2.6, 1.5), along(a, b, .2, 1.5)]), 6.4, ROCKM, { flare: .08, rough: .35, step: .7, cap: ROCKM });
    K.rock(K.ccw([along(a, b, L - 2.6, .1), along(a, b, L - .2, .1), along(a, b, L - .2, 1.5), along(a, b, L - 2.6, 1.5)]), 6.4, ROCKM, { flare: .08, rough: .35, step: .7, cap: ROCKM });
    K.band([f0, mid, f1], 7.5, .4, .45, CAP, { open: true }); K.cornice([f0, mid, f1], 16.2, .6, .5, CAP, { open: true });
    K.slab(along(a, b, .6, .5), along(a, b, L - .6, .5), K.outline.scroll(L - 1.2, E - .4, 5.4, { top: .42, round: true }), .9, PL, { out: .5, win: { t: W.NICHE, w: 1.1, y0: E + .8, y1: E + 3.6, n: 1 } });
    K.detail(() => {
      const m = along(a, b, L / 2, 1.5); figure(K, m[0], m[1], 7.9, 2.3, { m: 2, c: '#ece6da' });            // St. John of Nepomuk
      for (const t of [L * .27, L * .73]) { const q = along(a, b, t, 1.25); figure(K, q[0], q[1], 7.9, 1.5, { m: 2, c: '#e6dfd0' }); }
      const p = along(a, b, L / 2, .8); K.cross(p[0], p[1], E + 5.2, 1.1, GOLD, dirOf(a, b));
    });
    // the little bell turret set back on the roof
    const q = along(a, b, L / 2, -14);
    K.lathe(q[0], q[1], E + 3.5, [[.9, 0, 1], [.9, 3.2, 1]], PLs, { n: 8, wall: 1, win: { t: W.BELFRY, w: .45, y0: E + 4.3, y1: E + 6, n: 1 } });
    K.lathe(q[0], q[1], E + 6.7, K.P.onion(1, 2.4), CU, { seg: K.seg(12) });
    K.detail(() => K.finial(q[0], q[1], E + 9.1, 1, GOLD));
  },
};

const D = Math.PI / 180, DIAL2 = { m: 12, c: '#283040' }, IRON = { m: 14, c: '#2b2b2d' };
const lenOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dirOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / D;
// the point t m along a -> b, out m to its right (outwards on a counter-clockwise ring)
function along(a, b, t, out = 0) { const L = lenOf(a, b), ex = (b[0] - a[0]) / L, ey = (b[1] - a[1]) / L; return [a[0] + ex * t + ey * out, a[1] + ey * t - ex * out]; }
// a standing figure h tall (robe, shoulders, head) for statues, putti, the Glockenspiel
function figure(K, x, y, z, h, m) {
  K.lathe(x, y, z, [[h * .17, 0, 1], [h * .16, h * .28], [h * .12, h * .6], [h * .13, h * .72], [h * .06, h * .8], [h * .08, h * .87], [h * .07, h * .96], [0, h]], m, { seg: K.seg(8) });
}
// the Munich lantern Haube: a short flare off the cornice, a full belly, drawn in to the lantern's neck (r base radius, h high)
const bell = (r, h) => [[r, 0, 1], [r * 1.06, .06 * h], [r * 1.13, .18 * h], [r * 1.11, .32 * h], [r * .99, .46 * h], [r * .79, .61 * h], [r * .55, .75 * h], [r * .37, .87 * h], [r * .31, h]];
function obelisk(K, x, y, z, h, m) {
  K.box(x, y, .55, .55, z, z + .3, m); K.lathe(x, y, z + .3, [[.2, 0, 1], [.11, h - .55], [0, h - .3]], m, { n: 4, rot: Math.PI / 4 }); K.ball(x, y, z + h - .4, .12, GOLD);
}
// a Renaissance or Baroque gable tier outline w wide from z, h high, with scrolls st wide stepping in at both sides
function sideScrolls(z, st, h, w) {
  const o = [[0, z - .3], [w, z - .3]], n = 7;
  for (let i = 0; i <= n; i++) { const t = i / n, s = t * t * (3 - 2 * t); o.push([w - st * (1 - Math.cos(t * Math.PI / 2)), z + h * .62 * s + (t > .5 ? 0 : 0)]); }
  o.push([w - st, z + h]); o.push([st, z + h]);
  for (let i = n; i >= 0; i--) { const t = i / n, s = t * t * (3 - 2 * t); o.push([st * (1 - Math.cos(t * Math.PI / 2)), z + h * .62 * s]); }
  return o;
}
// a pointed neo-Gothic gable on the wall a -> b, from t0 for w m over the eaves z0, h high: blind tracery and an oculus,
// pinnacles at its feet and a finial; a little cross roof behind ties it into the main roof (o.deep m back)
function gothicGable(K, a, b, t0, w, z0, h, m, roofM, o = {}) {
  const W = K.W, p0 = along(a, b, t0), p1 = along(a, b, t0 + w), d = o.deep ?? 8, ang = dirOf(a, b);
  K.slab(p0, p1, [[0, z0 - 1.2], [w, z0 - 1.2], [w, z0 + .7], [w / 2, z0 + h], [0, z0 + .7]], .7, m, { out: .5, win: { t: W.BLIND, w: w * .44, y0: z0 + .9, y1: z0 + h * .6, n: 1, lights: 2 } });
  const q0 = along(a, b, t0 + .3, -d), q1 = along(a, b, t0 + w - .3, -d);
  K.roof(K.ccw([along(a, b, t0 + .3, .1), along(a, b, t0 + w - .3, .1), q1, q0]), 'gable', z0 + .7, h - 1.6, roofM, { ang: ang + 90, over: .2 });
  K.detail(() => {
    for (const t of [t0, t0 + w]) { const p = along(a, b, t, .55); K.pinnacle(p[0], p[1], z0 - .4, .7, Math.max(4, h * .42), m, m, { ang }); }
    const p = along(a, b, t0 + w / 2, .55); K.pinnacle(p[0], p[1], z0 + h - .5, .5, 2.4, m, m, { ang });
    // crockets: little knobs climbing the rakes
    const n = Math.max(2, Math.round(h / 2.2));
    for (let i = 1; i < n; i++) for (const s of [0, 1]) { const t = s ? t0 + w - w / 2 * i / n : t0 + w / 2 * i / n, p2 = along(a, b, t, .55); K.box(p2[0], p2[1], .28, .28, z0 + .7 + (h - .7) * i / n, z0 + .7 + (h - .7) * i / n + .32, m, { ang }); }
  });
}
