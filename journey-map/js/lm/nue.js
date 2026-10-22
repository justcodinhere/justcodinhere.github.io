// Nuremberg landmarks: the Kaiserburg on its sandstone ridge, St. Lorenz and the Frauenkirche on the Hauptmarkt.
// Builders receive the kit K (js/landmarks.js); local metres round each landmark's footprints.json origin.
const SS = { m: 1, c: '#9a5c48', t: '#a86b55', f: 1 | 32, seed: .37 };          // red Burgsandstein ashlar
const SS2 = { m: 1, c: '#94584a', t: '#a86b55', f: 0, seed: .71 };
const TILE = { m: 6, c: '#8e4630', snow: .85, seed: .3 };
const SLATE = { m: 5, c: '#4d535b', snow: .8 };
const CU = { m: 4, c: '#5e8a78', snow: .6 };
const ROCK = { m: 9, c: '#8a5e4c' };
const GOLD = { m: 15, c: '#b98a32' };

// every part of a footprints.json record set as its own block: heights, roof shapes and colours from the data; lean-to
// roofs rise towards the middle of the parts of the same height (a nave's halves, a choir's segments)
function parts(K, wall, roof, o = {}) {
  const P = K.parts.filter(p => !p.ctx && p.part), groups = new Map();
  for (const p of P) { const k = p.h || 0; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  for (const p of P) {
    if (p.area < 1.2) continue;
    const g = groups.get(p.h || 0), c = [g.reduce((t, q) => t + q.c[0], 0) / g.length, g.reduce((t, q) => t + q.c[1], 0) / g.length];
    const small = p.area < 12 && (p.h || 0) - (p.minh || 0) > 3;
    K.footprint(p, { wall: small ? SS2 : wall, roof: p.roofMat === 'copper' ? CU : roof, highToward: c, over: p.area < 30 ? .15 : .4, win: o.win ? o.win(p) : null, ...(o.each ? o.each(p) : {}) });
  }
}

// edge j of a part's ring faces (roughly) west
const westward = (p, j) => { const a = p.ring[j], b = p.ring[(j + 1) % p.ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return (b[1] - a[1]) / l < -.8; };

export default {
  // Kaiserburg: the imperial castle along the sandstone ridge over the old town: Palas and Kemenate in the west, the
  // double chapel and the Heidenturm, the round Sinwellturm, the Kaiserstallung granary and the Fünfeckturm in the east.
  kaiserburg(K) {
    const { W, F } = K;
    const TIMB = { m: 2, c: '#e7ddc8', t: '#4e3426', f: 1 | 128, seed: .5 };
    const lift = K.crag({ H: 20, c: [-5, 30], ax: 125, ay: 32, deg: 12, ramp: .5, m: ROCK });    // the sandstone ridge
    const H = { Palas: [15, 9], Kemenate: [14, 9], Kaiserkapelle: [17, 6], Kastellanhaus: [11, 7], Himmelsstallung: [10, 6], Kaiserstallung: [12, 13], Finanzstadel: [10, 7], Burgamtsmannhaus: [12, 8], Hasenburg: [9, 5], Luginsland: [20, 6] };
    for (const p of K.parts) {
      if (p.ctx || p.part || p.name === 'Sinwellturm') continue;
      const hr = H[p.name], timber = p.wallMat === 'timber_framing', thin = p.W < 4.5;
      const eave = p.h ? undefined : hr ? hr[0] : thin ? 7 : p.area < 70 ? 7.5 : 9.5, rh = p.h ? undefined : hr ? hr[1] : thin ? 0 : Math.min(7, p.W * .55);
      const win = (i, len) => len < 4 ? null : i === 0 ? { t: W.SLIT, w: .5, y0: 2.5, y1: 4.2, P: 4.5, m: 1.2 } : { t: timber ? W.RECT : W.ROUND, w: 1.1, y0: 1, y1: 2.6, P: 3.2, m: 1 };
      K.footprint(p, { wall: timber ? TIMB : SS, roof: TILE, eave, rh, roofType: thin ? 'flat' : undefined, storeys: thin ? null : [0, 4.2, 7.2, 10.2, 13.2], win, z: K.groundAt(p.c[0], p.c[1]) + lift(p.c[0], p.c[1]) });
    }
    // the Sinwellturm: a round tower with a gallery under its roof, and a spire
    const s = K.part('Sinwellturm'), zb = K.groundAt(s.c[0], s.c[1]) + lift(s.c[0], s.c[1]), R = Math.sqrt(s.area / Math.PI);
    K.lathe(s.c[0], s.c[1], zb - 3, [[R, 0, 1], [R, 24.8, 1]], SS, { seg: K.seg(20), wall: 1, vz: zb, win: { t: W.SLIT, w: .45, y0: 12, y1: 14, P: 5 } });
    K.lathe(s.c[0], s.c[1], zb + 21.6, [[R + .5, 0, 1], [R + .5, 1, 1], [R - .1, 1.1, 1]], SS2, { seg: K.seg(20) });
    K.lathe(s.c[0], s.c[1], zb + 21.8, [[R - .3, 0, 1], [R - .3, 4, 1]], { m: 2, c: '#e4dccb', t: '#4e3426', f: 0 }, { seg: K.seg(20), wall: 1, vz: zb, win: { t: W.RECT, w: .9, y0: 22.6, y1: 24.6, P: 3 } });
    K.lathe(s.c[0], s.c[1], zb + 25.8, [[R + .2, 0, 1], [R * .45, 4.5], [R * .2, 6.5], [.15, 10.5]], TILE, { seg: K.seg(16) });
    K.ball(s.c[0], s.c[1], zb + 36, .35, GOLD);
  },
  // St. Lorenz: the Gothic hall church in red sandstone; twin west towers with octagonal tops, little gables round the
  // base of their copper spires; a hall choir under one steep roof.
  stLorenz(K) {
    const { W } = K;
    parts(K, SS, TILE, {
      win: p => p.id === 'P3890' ? (j, len) => westward(p, j) ? { t: W.ROSE, w: 7.6, y0: 17, y1: 24.6, n: 1 } : null      // the rose between the towers
        : p.area > 150 && (p.h || 0) < 40 ? (i, len) => len > 5 ? { t: W.LANCET, w: 2.2, y0: 3, y1: Math.max(6, (p.h || 15) - (p.rh || 0) - 2), P: 5.6, m: 1, lights: 2 } : null
        : p.area > 60 && (p.h || 0) >= 45 && (p.h || 0) <= 50 ? (i, len) => ({ t: W.BELFRY, w: 1.6, y0: 40, y1: 47, n: 1 }) : null,
    });
  },
  // Frauenkirche (1352-62): the Emperor's chapel on the Hauptmarkt; a stepped and pinnacled west gable with blind tracery
  // over the porch that carries the Männleinlaufen clock.
  frauenkircheNue(K) {
    const { W } = K;
    parts(K, SS, TILE, { win: p => p.area > 100 ? (i, len) => len > 6 ? { t: W.LANCET, w: 2.4, y0: 4, y1: 14, P: 5.5, m: 1.2, lights: 2 } : null : null });
    const g = K.part('P3557');
    if (g) {
      // the show gable: west face of the gable strip, stepped in three tiers, pinnacles on every step
      K.at(g.c[0], g.c[1], 0, g.ang + 90, () => {
        const L = g.L, z0 = 15, a = [-1.8, L / 2], b = [-1.8, -L / 2], steps = [[0, z0 + 3], [2.6, z0 + 6.5], [5.2, z0 + 10], [7.8, z0 + 13.5]];
        const out = [[0, z0], [L, z0]];
        for (const [d, z] of steps) out.push([L - d, z], [L - d - 2.6, z]);
        out.push([L / 2, z0 + 18]);
        for (const [d, z] of steps.slice().reverse()) out.push([d + 2.6, z], [d, z]);
        K.slab(a, b, out.map(([t, z]) => [L - t, z]).reverse(), 1.4, SS2, { out: .9, win: { t: W.BLIND, w: 1.4, y0: z0 + 1, y1: z0 + 9, n: 5, m: 3 } });
        K.detail(() => { for (const [d, z] of steps) for (const t of [d, L - d]) K.pinnacle(-1.4, L / 2 - t, z, .7, 3.4, SS2, SS2); K.pinnacle(-1.4, 0, z0 + 18, .9, 4, SS2, SS2); });
      });
    }
    const pr = K.part('P4100');                       // the clock over the porch, under the Männleinlaufen
    if (pr) for (let j = 0; j < pr.ring.length; j++) if (westward(pr, j)) { const a = pr.ring[j], b = pr.ring[(j + 1) % pr.ring.length]; K.clock(a, b, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, 17, 1.25, { m: 12, c: '#2a303a' }, { out: .15 }); }
  },
};
