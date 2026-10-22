// Alpine landmarks: Neuschwanstein and Hohenschwangau, Kufstein fortress, and the Wieskirche.
// Builders receive the kit K (js/landmarks.js); local metres round each landmark's footprints.json origin.
const SLATE = { m: 5, c: '#56606b', snow: .75, seed: .2 };
const TILE = { m: 6, c: '#8b4630', snow: .85, seed: .4 };
const CU = { m: 4, c: '#5e8a78', snow: .6 };
const GOLD = { m: 15, c: '#b98a32' };
const DIAL = { m: 12, c: '#2a303a' };

const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
// a building whose parts cover most of it is drawn as its parts (as js/buildings.js does)
const covered = (K, b) => K.parts.filter(p => p.part && !p.ctx && inRing(p.c[0], p.c[1], b.ring)).reduce((t, p) => t + p.area, 0) > .5 * b.area;
const rows = (W, t, w, P, first = 1.2) => (i, len) => len < 3.5 ? null : { t, w, y0: first + i * 4.4, y1: first + i * 4.4 + 2.4, P, m: 1 };

export default {
  // Neuschwanstein (from 1869): white limestone on a crag over the Pöllat gorge; the Palas with its tall gable, the
  // stair tower and the slender corner towers under pointed slate roofs, the red-brick gatehouse at the east end.
  neuschwanstein(K) {
    const { W } = K;
    const LIME = { m: 3, c: '#d9d4c8', t: '#c9c2b4', f: 1, seed: .3 }, BR = { m: 0, c: '#a0614a', t: '#d6d0c4', f: 1 }, ROCK = { m: 9, c: '#8e8a80' };
    // the crag: the height map smooths the ridge away, so the castle stands on its own rock again (about 30 m)
    const lift = K.crag({ H: 30, c: [38, 20], ax: 72, ay: 24, deg: 22, ramp: .6, m: ROCK });
    for (const p of K.parts) {
      if (p.ctx || (!p.part && covered(K, p)) || p.area < 1.5) continue;
      const brick = p.wallMat === 'brick', tower = p.area < 70 && (p.h || 0) > 20;
      const shape = p.roof === 'onion' || p.roof === 'pyramidal' && tower ? 'cone' : undefined;
      K.footprint(p, {
        wall: brick ? BR : LIME, roof: SLATE, roofType: shape, rh: shape === 'cone' ? Math.max(p.rh || 0, Math.sqrt(p.area) * 1.5) : undefined,
        storeys: tower ? null : [0, 5.5, 10, 14.4, 18.8, 23.2, 27.6, 32],
        win: tower ? { t: W.ROUND, w: .9, y0: (p.h || 20) - 9, y1: (p.h || 20) - 7.2, P: 2.6, m: .5 } : rows(W, W.ROUND, 1.1, 2.9),
        z: K.groundAt(p.c[0], p.c[1]) + lift(p.c[0], p.c[1]),
      });
    }
  },
  // Hohenschwangau (rebuilt 1832-37): an ochre-yellow neo-Gothic castle with battlements and round corner towers.
  hohenschwangau(K) {
    const { W } = K, Y = { m: 2, c: '#dfbf73', t: '#efe3c2', f: 1 | 16 | 32, seed: .6 }, ROCK = { m: 9, c: '#8d887d' };
    const main = K.part('Schloss Hohenschwangau');
    const lift = K.crag({ H: 10, c: main.c, ax: 34, ay: 28, ramp: .8, m: ROCK }), zb = K.groundAt(main.c[0], main.c[1]) + lift(main.c[0], main.c[1]);
    for (let j = 0; j < main.ring.length; j++) K.storeys(main.ring[j], main.ring[(j + 1) % main.ring.length], [zb - 3, zb + 4.5, zb + 9, zb + 13.5, zb + 16], Y, (i, len) => i < 3 ? rows(W, W.RECT, 1.2, 3.2, 1.4)(i, len) : null, { vz: zb });
    K.detail(() => K.crenels(main.ring, zb + 16, 1.1, 1.1, .8, .55, Y));
    const inner = K.offset(K.simplify(main.ring, 3), -1.2);
    K.roof(inner, 'hip', zb + 15.8, 6, SLATE, { ang: main.ang, over: 0 });
    // the round corner towers rise over the battlements
    const towers = [];
    for (let j = 0; j < main.ring.length; j++) {
      const p = main.ring[j], d = Math.hypot(p[0] - main.c[0], p[1] - main.c[1]);
      if (d > 12.5 && !towers.some(t => Math.hypot(t[0] - p[0], t[1] - p[1]) < 7)) towers.push(p);
    }
    for (const t of towers) {
      const dx = t[0] - main.c[0], dy = t[1] - main.c[1], l = Math.hypot(dx, dy), c = [t[0] - dx / l * 2.4, t[1] - dy / l * 2.4];
      K.lathe(c[0], c[1], zb - 2, [[2.9, 0, 1], [2.9, 22, 1]], Y, { seg: K.seg(14), wall: 1, vz: zb, win: { t: W.RECT, w: .8, y0: 17, y1: 18.6, P: 3 } });
      K.cap(K.ngon(c[0], c[1], 2.9, K.seg(14)), zb + 20, { m: 11, c: '#a49d90' });
      K.detail(() => K.crenels(K.ngon(c[0], c[1], 2.95, 10), zb + 20, 1, .9, .7, .5, Y));
    }
    for (const p of K.parts) if (!p.ctx && p !== main && p.area > 40) K.footprint(p, { wall: Y, roof: SLATE, eave: p.area > 200 ? 11 : 4.5, rh: p.area > 200 ? 5 : 2.5, storeys: p.area > 200 ? [0, 4, 7.5] : null, win: rows(W, W.RECT, 1.1, 3.1), z: K.groundAt(p.c[0], p.c[1]) + lift(p.c[0], p.c[1]) });
  },
  // Kufstein fortress: rough-cast walls on the rock over the Inn; the huge round Kaiserturm in the middle, the
  // Bürgerturm with the Heroes' Organ at the north end, bastions, barracks and gun platforms.
  kufstein(K) {
    const { W } = K, ST = { m: 2, c: '#c5beb0', t: '#aca595', f: 1 | 16, seed: .45 }, ROCK = { m: 9, c: '#979285' };
    const lift = K.crag({ H: 40, c: [-5, 30], ax: 50, ay: 85, ramp: .45, m: ROCK });       // the fortress rock (the height map lost it)
    const H = { Kaiserturm: [28, 6, 'cone'], 'Bürgerturm': [22, 7, 'cone'], Schlossrondell: [13, 0, 'flat'], 'Obere Schlosskaserne': [12, 6, 'gable'], 'Unterer Schlosskaserne': [9, 5, 'gable'],
      Fuchsturm: [14, 5, 'hip'], 'Tiefer Brunnen': [7, 4, 'hip'], 'Artillerie, Laboratorium': [9, 5, 'gable'], Kriegspulvermagazin: [6, 4, 'gable'], Carolibastion: [8, 0, 'flat'] };
    for (const p of K.parts) {
      if (p.ctx) continue;
      const wallish = p.W < 7.5 && p.L > 20, hr = H[p.name] || (wallish ? [7.5, 0, 'flat'] : p.area < 15 ? [4, 2, 'hip'] : [8, 4, 'gable']);
      const z = K.groundAt(p.c[0], p.c[1]) + lift(p.c[0], p.c[1]);
      K.footprint(p, { wall: ST, roof: TILE, eave: hr[0], rh: hr[1], roofType: hr[2], z,
        storeys: hr[1] ? [0, 4, 7.5, 11] : null,
        win: hr[1] ? (i, len) => len < 4 ? null : { t: i === 0 ? W.SLIT : W.RECT, w: i === 0 ? .5 : 1, y0: 1.8 + i * 3.6, y1: 3.4 + i * 3.6, P: 4, m: 1.2 } : (j, len) => len < 4 ? null : { t: W.SLIT, w: .45, y0: hr[0] - 3, y1: hr[0] - 1.6, P: 4.5, m: 1 } });
      if (hr[2] === 'flat' && !wallish) K.detail(() => K.crenels(K.offset(K.ccw(p.ring), -.3), z + hr[0], 1, 1.2, .9, .6, ST));
    }
  },
  // Wieskirche (1745-54): Dominikus Zimmermann's Rococo pilgrimage church in the meadows; white with ochre pilasters,
  // an oval nave under a tall hipped roof, the deep choir, the tower with its onion, the priests' house behind.
  wieskirche(K) {
    const { W } = K, PL = { m: 2, c: '#efebe1', t: '#d6b36c', f: 1 | 4 | 32, seed: .33 }, PLH = { m: 2, c: '#ece6d8', t: '#d8c49a', f: 1 | 16 | 32 };
    const SLW = { m: 5, c: '#5e656d', snow: .85 };
    const zb = K.groundAt(0, 0);
    K.at(0, 0, zb, K.fp.ang, () => {
      const nave = [[8.9, -7.3], [8.4, 7.6], [-0.2, 13.9], [-11.5, 13.7], [-19.8, 7.6], [-27, 3.6], [-27.4, -.3], [-27, -4.4], [-19.7, -8.4], [-10.7, -13.7], [.3, -13.8]];
      const ring = K.ccw(nave), choir = [[8.6, -7.3], [23.4, -7.1], [23.5, 7.5], [8.4, 7.6]];
      const P = K.hipPlanes(ring, 15, 12.5 / 13.8);
      K.roofPlanes(ring, P, SLW, { over: .5 });
      for (let j = 0; j < ring.length; j++) K.storeys(ring[j], ring[(j + 1) % ring.length], [-3, 11.6, 15], PL, i => [{ t: W.ROUND, w: 2.4, y0: 4.5, y1: 10.6, n: 1 }, { t: W.ROSE, w: 1.6, y0: 12.2, y1: 13.8, n: 1 }][i]);
      const Pc = K.hipPlanes(choir, 13, 9 / 7.5, { gable: [3] });
      K.roofPlanes(choir, Pc, SLW, { over: .45 });
      K.roofWalls(choir, Pc, -3, PL, { skip: j => j === 3, E: 13, win: (j, len) => len > 9 ? { t: W.ROUND, w: 2.2, y0: 4.5, y1: 10.5, P: 4.8, m: 1 } : null });
      // the tower behind the choir
      const t = K.rect(28.3, .4, 6.2, 6.2);
      for (let j = 0; j < 4; j++) K.storeys(t[j], t[(j + 1) % 4], [-3, 14, 24, 31], PL, i => [null, { t: W.ROUND, w: 1.2, y0: 17, y1: 21, n: 1 }, { t: W.BELFRY, w: 1.4, y0: 25.5, y1: 29.5, n: 1 }][i]);
      for (let j = 0; j < 4; j++) { const a = t[j], b = t[(j + 1) % 4]; K.clock(a, b, 3.1, 22.3, 1.2, DIAL, { out: .12 }); }
      K.cornice(t, 30.5, .6, .4, { ...PL, f: 0 }); K.cap(t, 31.1, { m: 11, c: '#a59c8c' });
      K.lathe(28.3, .4, 31.1, [[2.7, 0, 1], [2.7, 3.2, 1]], PL, { n: 8, wall: 1 });
      K.lathe(28.3, .4, 34.3, K.P.onion(3, 7.5), CU, { seg: K.seg(16) });
      K.lantern(28.3, .4, 41.8, .8, 2.2, CU, CU, { n: 6, cap: K.P.onion(.9, 2.4), finial: 1.6, finM: GOLD });
    });
    for (const id of ['X30', 'X31']) { const p = K.part(id); if (p) K.footprint(p, { wall: PLH, roof: SLW, roofType: 'hip', eave: 11, rh: 6, storeys: [0, 3.8, 7.4], win: rows(W, W.RECT, 1.2, 3.1, 1.1) }); }
  },
};
