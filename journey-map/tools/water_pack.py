#!/usr/bin/env python3
"""Water surfaces for js/water.js: Overture water polygons near the routes and stops, merged, clipped, simplified and
triangulated (Shewchuk's Triangle, refined so narrow channels still get interior vertices), with per-vertex attributes
the shader needs: distance to shore, direction to the nearest shore, what stands on that bank (building / tree height),
flow velocity from the nearest OSM waterway centreline (oriented downstream), body colour, turbulence and ice width.
Also writes lines.json: accurate centrelines of the main rivers in the detailed patch for the long-distance ribbons.

Bridges (DATA_DIR/bridges_raw.pkl from water_bridges.py, optional) become deck centrelines with widths and pier positions.

Pipeline: water_index.py -> water_fetch.py -> water_bridges.py -> water_pack.py. Needs `pip install triangle`.
usage: python3 water_pack.py DATA_DIR OUT_DIR   (DATA_DIR/water_raw.pkl from water_fetch.py; OUT_DIR = assets/water)
Per chunk the binary holds int16 x,y (0.25 m) | uint16 triangles | 13 bytes per vertex: shore distance (sqrt-coded),
shore direction (int8 x2), bank code (0 none, 1-99 building m, 114 trees, 255 corridor cut), flow (int8 x2, m/s*40),
colour (sRGB x3), turbulence, ice width m (1 = town reach), bank colour (RGB565).
"""
import pickle, json, math, sys, os, base64, collections
import numpy as np, shapely, shapely.wkb, shapely.ops, triangle
from shapely.geometry import box, LineString, Polygon, MultiPolygon, Point
from shapely.ops import unary_union, linemerge
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix

D, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
os.makedirs(OUT, exist_ok=True)
raw = pickle.load(open(os.path.join(D, 'water_raw.pkl'), 'rb'))
BRP = os.path.join(D, 'bridges_raw.pkl'); BR = pickle.load(open(BRP, 'rb')) if os.path.exists(BRP) else []   # from water_bridges.py
geo = json.load(open(os.path.join(ROOT, 'assets/geo.json')))
R = geo['routes']
CORR = 6000                                   # metres either side of the routes
QMIN = int(os.environ.get('WATER_Q', 18))     # Triangle minimum angle: higher = rounder triangles, more vertices
# area -> routes, stop boxes (lon0, lat0, lon1, lat1, fine) and the building pack used for bank heights
AREAS = {
  'muc': dict(routes=['apt_city'], boxes=[(11.44, 48.08, 11.72, 48.20)], fine=[(11.53, 48.10, 11.63, 48.17)], pack='munich'),
  'inn': dict(routes=['muc_ibk'], fine=[(11.34, 47.25, 11.46, 47.29), (11.48, 47.27, 11.53, 47.29), (11.58, 47.28, 11.62, 47.31),
                                        (11.69, 47.33, 11.74, 47.36), (11.76, 47.40, 11.79, 47.42), (11.88, 47.43, 11.91, 47.45),
                                        (12.05, 47.47, 12.08, 47.50), (12.15, 47.57, 12.19, 47.60), (12.10, 47.84, 12.14, 47.87)],
              boxes=[(11.30, 47.21, 11.50, 47.33), (11.48, 47.27, 11.53, 47.29), (11.58, 47.28, 11.62, 47.31),
                                         (11.69, 47.33, 11.74, 47.36), (11.76, 47.40, 11.79, 47.42), (11.88, 47.43, 11.91, 47.45),
                                         (12.05, 47.47, 12.08, 47.50), (12.15, 47.57, 12.19, 47.60), (12.10, 47.84, 12.14, 47.87)], pack='inn'),
  'nue': dict(routes=['muc_nue'], boxes=[(11.00, 49.40, 11.15, 49.50), (11.40, 48.74, 11.45, 48.77)],
              fine=[(11.04, 49.44, 11.11, 49.465), (11.40, 48.74, 11.45, 48.77)], pack='nue'),
  'neu': dict(routes=['muc_neusch'], boxes=[(10.62, 47.50, 10.85, 47.65)], fine=[(10.68, 47.545, 10.765, 47.59)], pack='neu'),
}
# body looks: speed m/s, sRGB colour, turbulence 0..1
LOOK = {
  'Inn': (2.0, (96, 122, 110), .65), 'Sill': (2.6, (112, 132, 122), 1.), 'Ziller': (2.0, (94, 126, 116), .8),
  'Isar': (1.5, (86, 146, 134), .55), 'Eisbach': (2.6, (90, 146, 136), .9), 'Kleine Isar': (1.2, (84, 140, 128), .4),
  'Auer Mühlbach': (1.6, (78, 128, 116), .45), 'Mittlere-Isar-Kanal': (1.0, (72, 112, 104), .12), 'Schwabinger Bach': (1.3, (76, 120, 108), .35),
  'Donau': (.9, (90, 106, 92), .2), 'Pegnitz': (.45, (56, 70, 60), .08), 'Lech': (1.7, (82, 150, 140), .55), 'Füssener Achen': (1., (70, 120, 112), .3),
  'Mangfall': (1.5, (88, 126, 112), .55), 'Main-Donau-Kanal': (.2, (70, 86, 78), .03), 'Altmühl': (.4, (70, 82, 70), .08),
  'Kufsteiner Ache': (1.4, (90, 120, 108), .5), 'Brandenberger Ache': (2., (92, 130, 118), .8),
  '_river': (1.0, (78, 104, 94), .35), '_stream': (1.3, (74, 98, 88), .5), '_canal': (.6, (72, 96, 88), .12),
}
LAKE = {  # sRGB colour, edge ice width in metres (255 = frozen over), speed for flow-through lakes
  'Alpsee': ((26, 70, 80), 22), 'Schwansee': ((40, 74, 70), 70), 'Forggensee': ((66, 112, 112), 75), 'Hopfensee': ((60, 96, 90), 60),
  'Obersee': ((40, 70, 66), 255), 'Mittersee': ((40, 70, 66), 255), 'Kleinhesseloher See': ((52, 70, 60), 45), 'Wöhrder See': ((58, 72, 62), 14),
  '_lake': ((46, 76, 72), 40), '_pond': ((44, 62, 55), 255), '_reservoir': ((56, 90, 88), 45),
}
SKIP_CLS = {'swimming_pool', 'wastewater', 'sewage', 'fountain', 'reflecting_pool', 'basin', 'fish_pass', 'water_storage', 'spring', 'salt_pool', 'drain', 'ditch'}
SKIP_TAG = {'fountain', 'wastewater', 'basin', 'reflecting_pool', 'salt_pool', 'fish_pass', 'trough', 'pool', 'cooling', 'treatment'}

def proj(lat0):
  kx, ky = 111320 * math.cos(math.radians(lat0)), 110570.
  return kx, ky

def to_local(g, ox, oy, kx, ky):
  return shapely.transform(g, lambda c: np.c_[(c[:, 0] - ox) * kx, (c[:, 1] - oy) * ky])

def route_line(k, ox, oy, kx, ky):
  return LineString([((a - ox) * kx, (b - oy) * ky) for a, b in R[k]])

def wall_tint(t, church, wc):
  """Linear wall colour, mirroring the palette in js/buildings.js (so reflections match the banks)."""
  w = (.52, .45, .36) if t < .25 else (.56, .53, .48) if t < .42 else (.55, .42, .26) if t < .58 else (.50, .36, .31) if t < .72 else (.40, .43, .37) if t < .86 else (.47, .41, .35)
  if church: w = (.66, .64, .60)
  elif wc:
    c = np.array([(wc >> 11) / 31, ((wc >> 5) & 63) / 63, (wc & 31) / 31]) ** 2.2
    w = tuple(np.array(w) * .7 + c * .7 * .3)
  return w

def decode_buildings(pack, ox, oy, kx, ky):
  """Footprints of the building pack (v2) as (polygon, height m) in this area's local metres."""
  m = json.load(open(os.path.join(ROOT, 'assets/packs', pack + '.json')))
  b = base64.b64decode(m['data']); u = np.frombuffer(b, '<u2'); s = np.frombuffer(b, '<i2')
  out, i, N = [], 0, len(u)
  while i < N:
    n, hM = int(u[i]), u[i + 1] / 10
    x = (int(u[i + 12]) << 16) | int(u[i + 13]); y = (int(u[i + 14]) << 16) | int(u[i + 15]); i += 16
    pts = [(x, y)]
    d = s[i:i + 2 * (n - 1)].reshape(-1, 2).astype(np.int64); i += 2 * (n - 1)
    if n > 1: pts += list(map(tuple, np.cumsum(d, 0) + [x, y]))
    p = np.array(pts, float) / 2
    lon, lat = m['ox'] + p[:, 0] / m['kx'], m['oy'] + p[:, 1] / m['ky']
    q = np.c_[(lon - ox) * kx, (lat - oy) * ky]
    church, wc = (int(u[i - 2 * (n - 1) - 13]) >> 8) & 1, int(u[i - 2 * (n - 1) - 5])
    cx, cy = p[:, 0].mean(), p[:, 1].mean()
    tv = ((math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453) % 1 + 1) % 1
    if len(q) >= 3: out.append((Polygon(q), hM, wall_tint(tv, church, wc)))
  t = m.get('trees'); trees = np.zeros((0, 2))
  if t:
    tb = base64.b64decode(t['data']); xy = np.frombuffer(tb, '<u2', t['n'] * 2).reshape(-1, 2).astype(float)
    lon, lat = t['ox'] + xy[:, 0] * 4 / t['kx'], t['oy'] + xy[:, 1] * 4 / t['ky']
    trees = np.c_[(lon - ox) * kx, (lat - oy) * ky]
  return out, trees

def densify_lines(geoms, step):
  """Points every `step` m along lines, with the unit direction of the segment each point lies on."""
  P, T, I = [], [], []
  for gi, g in enumerate(geoms):
    for part in (g.geoms if hasattr(g, 'geoms') else [g]):
      c = np.asarray(part.coords)[:, :2]
      for a, b in zip(c[:-1], c[1:]):
        L = np.hypot(*(b - a))
        if L < 1e-6: continue
        n = max(1, int(L / step)); t = (np.arange(n) + .5) / n
        P.append(a + (b - a) * t[:, None]); T.append(np.repeat([(b - a) / L], n, 0)); I.append(np.full(n, gi))
  if not P: return np.zeros((0, 2)), np.zeros((0, 2)), np.zeros(0, int)
  return np.concatenate(P), np.concatenate(T), np.concatenate(I)

def rings(poly):
  for r in [poly.exterior, *poly.interiors]: yield np.asarray(r.coords)[:-1, :2]

def triangulate(poly, base_area, fine_fn, kd_shore):
  V, S, H, off = [], [], [], 0
  for k, r in enumerate(rings(poly)):
    n = len(r); V.append(r); S.append(np.c_[np.arange(n), (np.arange(n) + 1) % n] + off); off += n
    if k: H.append(Polygon(r).representative_point().coords[0])
  V = np.concatenate(V); S = np.concatenate(S)           # Triangle crashes on repeated points: weld them
  _, first, inv = np.unique(np.round(V, 2), axis=0, return_index=True, return_inverse=True)
  inv = inv.ravel(); V = V[first]; S = inv[S]; S = S[S[:, 0] != S[:, 1]]; S = np.unique(np.sort(S, 1), axis=0)
  A = dict(vertices=V, segments=S)
  if H: A['holes'] = np.array(H)
  t = triangle.triangulate(A, f'pq{QMIN}a{base_area:.0f}')
  v, f = t['vertices'], t['triangles']             # depth samples of this polygon: vertices, centroids, edge midpoints
  smp = np.concatenate([v, v[f].mean(1), (v[f[:, 0]] + v[f[:, 1]]) / 2, (v[f[:, 1]] + v[f[:, 2]]) / 2, (v[f[:, 2]] + v[f[:, 0]]) / 2])
  smp = (cKDTree(smp), kd_shore.query(smp)[0])
  for it in range(3):                          # refine narrow channels and the fine (town) boxes
    v, f = t['vertices'], t['triangles']
    c = v[f].mean(1); e1, e2 = v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]; ar = np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]) / 2
    tgt = fine_fn(c, smp)
    if (ar <= tgt * 1.05).all(): break
    t = triangle.triangulate(dict(vertices=v, segments=t['segments'], triangles=f, triangle_max_area=np.minimum(tgt, ar * 1.01)), f'rpq{QMIN}a')
  return t['vertices'], t['triangles'], t['vertex_markers'].ravel()

out_lines = {}
for area, cfg in AREAS.items():
  if os.environ.get('WATER_ONLY') and area not in os.environ['WATER_ONLY'].split(','): continue
  lon0 = np.mean([b[0] + b[2] for b in cfg['boxes']]) / 2; lat0 = np.mean([b[1] + b[3] for b in cfg['boxes']]) / 2
  pts = np.concatenate([np.array(R[k]) for k in cfg['routes']])
  lat0 = (pts[:, 1].min() + pts[:, 1].max()) / 2; lon0 = (pts[:, 0].min() + pts[:, 0].max()) / 2
  kx, ky = proj(lat0); ox, oy = lon0, lat0
  region = unary_union([route_line(k, ox, oy, kx, ky).buffer(CORR, 16) for k in cfg['routes']] +
                       [box((b[0] - ox) * kx, (b[1] - oy) * ky, (b[2] - ox) * kx, (b[3] - oy) * ky) for b in cfg['boxes']])
  if area != 'muc':                            # Munich's water lives in its own file, shared by every leg
    mc = AREAS['muc']
    mreg = unary_union([route_line(k, ox, oy, kx, ky).buffer(CORR, 16) for k in mc['routes']] +
                       [box((b[0] - ox) * kx, (b[1] - oy) * ky, (b[2] - ox) * kx, (b[3] - oy) * ky) for b in mc['boxes']])
    region = region.difference(mreg)
  fine = unary_union([box((b[0] - ox) * kx, (b[1] - oy) * ky, (b[2] - ox) * kx, (b[3] - oy) * ky) for b in cfg.get('fine', cfg['boxes'])])
  minx, miny, maxx, maxy = region.bounds
  bw, bs, be, bn = ox + minx / kx, oy + miny / ky, ox + maxx / kx, oy + maxy / ky
  # --- pick polygons and centrelines -------------------------------------------------------------
  polys, lakes, lines = [], [], []
  for x in raw:
    b = x['bb']
    if b[2] < bw or b[0] > be or b[3] < bs or b[1] > bn: continue
    if x['cls'] in SKIP_CLS or x['sub'] in ('human_made', 'wastewater', 'physical', 'spring') or x['tags'].get('water') in SKIP_TAG: continue
    g = shapely.wkb.loads(x['g'])
    if g.geom_type in ('LineString', 'MultiLineString'):
      if x['sub'] in ('river', 'stream', 'canal') and not x['tags'].get('tunnel'):
        gl = to_local(g, ox, oy, kx, ky)
        if gl.intersects(region): lines.append((gl, x['name'] or '', x['sub']))
      continue
    if g.geom_type not in ('Polygon', 'MultiPolygon'): continue
    gl = to_local(g, ox, oy, kx, ky).buffer(0)
    if not gl.intersects(region): continue
    a = gl.area; isfine = gl.intersects(fine)
    if x['sub'] in ('river', 'canal', 'stream'):
      if a < (60 if isfine else 400): continue
    elif x['sub'] in ('lake', 'reservoir', 'pond', 'water'):
      if a < (1200 if isfine else 20000): continue
      kind = '_pond' if x['sub'] == 'pond' or a < 30000 else '_reservoir' if x['sub'] == 'reservoir' else '_lake'
      lakes.append((gl, x['name'] or '', kind))
    else: continue
    polys.append(gl)
  print(area, 'polys', len(polys), 'lakes', len(lakes), 'lines', len(lines), flush=True)
  U = unary_union(polys).buffer(.3, join_style='mitre').buffer(-.3, join_style='mitre')
  fineB = fine.buffer(400)                     # towns keep 1 m detail and narrow streams; the open corridor keeps water wider than 14 m
  U = unary_union([U.intersection(fineB).simplify(.9, preserve_topology=True),
                   U.difference(fineB).buffer(-7, join_style='mitre').buffer(7, join_style='mitre').simplify(3.2, preserve_topology=True)]).buffer(.6, join_style='mitre').buffer(-.6, join_style='mitre').simplify(.3)
  Uc = U.intersection(region)
  parts = []
  Uc = shapely.make_valid(Uc)
  Uc = unary_union([g for g in (Uc.geoms if hasattr(Uc, 'geoms') else [Uc]) if g.geom_type in ('Polygon', 'MultiPolygon')])
  for p in (Uc.geoms if hasattr(Uc, 'geoms') else [Uc]):
    if p.geom_type != 'Polygon' or p.area < 60: continue
    holes = [h for h in p.interiors if Polygon(h).area > 120]
    parts.append(Polygon(p.exterior, holes))
  Uc = MultiPolygon(parts)
  # shore = boundary that is real water edge; clip = where the corridor cut the water
  rb = region.boundary
  shoreP, _, _ = densify_lines([Uc.boundary], 1.5)
  rbb = rb.buffer(.8); shapely.prepare(rbb); oncut = shapely.contains_xy(rbb, shoreP[:, 0], shoreP[:, 1])
  clipP, shoreP = shoreP[oncut], shoreP[~oncut]
  # bank objects: tallest building within 22 m of each shore point, or trees within 12 m
  bld, trees = decode_buildings(cfg['pack'], ox, oy, kx, ky)
  bank = np.zeros(len(shoreP), np.uint8); bcol = np.tile([.80, .82, .85], (len(shoreP), 1))   # default: a snowy bank
  if bld:
    tree_ = shapely.STRtree([b[0] for b in bld]); hs = np.array([b[1] for b in bld]); tints = np.array([b[2] for b in bld])
    sp = shapely.points(shoreP)
    qi, qb = tree_.query(sp, predicate='dwithin', distance=45)
    eff = hs[qb] - .35 * shapely.distance(sp[qi], shapely.STRtree([b[0] for b in bld]).geometries.take(qb))   # set-back houses mirror lower
    order = np.argsort(eff); qi, qb, eff = qi[order], qb[order], eff[order]          # the tallest (effective) building wins
    best = np.zeros(len(shoreP)); best[qi] = np.maximum(eff, 0); bcol[qi] = tints[qb]
    bank = np.clip(np.round(best), 0, 99).astype(np.uint8)
    ti, _ = tree_.query(sp, predicate='dwithin', distance=80)          # a town reach: houses line this bank
    town = np.bincount(ti, minlength=len(shoreP)) >= 3
  else: town = np.zeros(len(shoreP), bool)
  if len(trees):
    kt = cKDTree(trees); dd, _ = kt.query(shoreP, distance_upper_bound=12)
    tr = (dd < 12) & (bank == 0); bank[tr] = 100 + 14; bcol[tr] = (.07, .12, .08)
  bcol = np.clip(bcol, 0, 1) ** (1 / 2.2)
  b565 = (np.round(bcol[:, 0] * 31).astype(np.uint16) << 11) | (np.round(bcol[:, 1] * 63).astype(np.uint16) << 5) | np.round(bcol[:, 2] * 31).astype(np.uint16)
  kd_shore = cKDTree(shoreP); kd_clip = cKDTree(clipP) if len(clipP) else None
  # flow: nearest centreline point (downstream direction) for river water; lakes stay still
  LP, LT, LI = densify_lines([g for g, _, _ in lines], 6)
  kd_line = cKDTree(LP) if len(LP) else None
  lake_u = unary_union([g for g, _, _ in lakes]).buffer(3) if lakes else None
  lake_tree = shapely.STRtree([g for g, _, _ in lakes]) if lakes else None
  shapely.prepare(fine)
  def halfwidth(c, smp):
    # local half-width: the deepest sample within reach (so wide rivers stay coarse at their banks)
    dc = kd_shore.query(c)[0]
    hw = np.array([smp[1][j].max() if len(j) else d for j, d in zip(smp[0].query_ball_point(c, np.minimum(2 * dc + 30, 90)), dc)])
    return np.maximum(hw, dc), dc
  def fine_fn(c, smp):
    hw, dc = halfwidth(c, smp)
    infine = shapely.contains_xy(fine, c[:, 0], c[:, 1])
    narrow = np.clip((1.5 * hw) ** 2, 60, None)          # roughly a vertex across mid-sized channels
    base = np.where(infine, 420., 4800.) * (1 + np.clip(dc - 25, 0, None) / 10)   # open lake water can be coarse
    return np.minimum(base, narrow)
  Vs, Fs, Ms, n0 = [], [], [], 0
  for p in parts:
    v, f, mk = triangulate(p, 4800, fine_fn, kd_shore)
    Vs.append(v); Fs.append(f + n0); Ms.append(halfwidth(v, (cKDTree(v), kd_shore.query(v)[0]))[0]); n0 += len(v)
  V = np.concatenate(Vs); F = np.concatenate(Fs); hwv = np.concatenate(Ms)
  nv = len(V); print(area, 'verts', nv, 'tris', len(F), 'boundary', sum(len(r) for p in parts for r in rings(p)), flush=True)
  # exact distance to the shore segments; boundary vertices look straight out over the bank (right-hand normal of a CCW ring)
  SA, SB = [], []
  for pp in parts:
    pp = shapely.geometry.polygon.orient(pp, 1)
    for r in rings(pp): SA.append(r); SB.append(np.roll(r, -1, 0))
  SA, SB = np.concatenate(SA), np.concatenate(SB)
  mid = (SA + SB) / 2; cut = shapely.contains_xy(rbb, mid[:, 0], mid[:, 1])
  def nearest_seg(A_, B_, P_):
    tr = shapely.STRtree(shapely.linestrings(np.stack([A_, B_], 1)))
    (pi, gi), dd = tr.query_nearest(shapely.points(P_), return_distance=True, all_matches=False)
    o = np.argsort(pi); return gi[o], dd[o]
  gi, ds = nearest_seg(SA[~cut], SB[~cut], V)
  a_, b_ = SA[~cut][gi], SB[~cut][gi]; e = b_ - a_
  tq = np.clip(((V - a_) * e).sum(1) / np.maximum((e * e).sum(1), 1e-9), 0, 1)
  sdir = a_ + e * tq[:, None] - V; sl = np.hypot(sdir[:, 0], sdir[:, 1])
  nrm = np.c_[e[:, 1], -e[:, 0]] / np.maximum(np.hypot(e[:, 0], e[:, 1]), 1e-9)[:, None]
  sdir = np.where(sl[:, None] > .05, sdir / np.maximum(sl, 1e-9)[:, None], nrm)
  si = kd_shore.query(V)[1]
  vbank = bank[si]; vb565 = b565[si]; vtown = town[si]
  dclip = nearest_seg(SA[cut], SB[cut], V)[1] if cut.any() else np.full(nv, 1e9)
  ds = np.where(hwv < 6, np.maximum(ds, 2.), ds)   # narrow streams have no inner vertices: don't let the edge fade eat them
  # per-vertex look
  isl = shapely.contains_xy(lake_u, V[:, 0], V[:, 1]) if lake_u is not None else np.zeros(nv, bool)
  col = np.zeros((nv, 3)); spd = np.zeros(nv); turb = np.zeros(nv); ice = np.zeros(nv); flow = np.zeros((nv, 2))
  if kd_line is not None:
    dl, li = kd_line.query(V)
    for j in range(nv):
      g, nm, sub = lines[LI[li[j]]]
      s_, c_, t_ = LOOK.get(nm, LOOK['_' + sub])
      spd[j], col[j], turb[j] = s_, c_, t_; flow[j] = LT[li[j]] * s_
  if lake_tree is not None:
    lv = np.where(isl)[0]
    if len(lv):
      qi, qb = lake_tree.query(shapely.points(V[lv]), predicate='intersects')
      lk = np.full(len(lv), -1); lk[qi] = qb
      for a, j in enumerate(lv):
        if lk[a] < 0: continue
        _, nm, kind = lakes[lk[a]]
        c_, iw = LAKE.get(nm, LAKE[kind])
        col[j] = c_; ice[j] = iw
        if nm == 'Wöhrder See': flow[j] *= .4; turb[j] = .05
        else: flow[j] = 0; turb[j] = 0
  # smooth flow / colour / ice over the mesh so confluences and lake mouths blend
  E = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); E = np.concatenate([E, E[:, ::-1]])
  A = coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(nv, nv)).tocsr(); A.data[:] = 1
  deg = np.asarray(A.sum(1)).ravel() + 1
  for _ in range(5):
    flow = (A @ flow + flow) / deg[:, None]; col = (A @ col + col) / deg[:, None]; turb = (A @ turb + turb) / deg
  for _ in range(2): ice = (A @ ice + ice) / deg
  ice = np.where(isl, np.maximum(ice, 2), np.where(vtown & (ice < 1), 1, np.where(ice < 2, 0, ice)))   # 1 = river through town (quays)
  # --- bridges over this water (towns only): deck centrelines with a width, de-duplicated sidewalks --------
  bridges = []
  if BR:
    W_ = {'motorway': 26, 'trunk': 18, 'primary': 15, 'secondary': 13, 'tertiary': 11, 'residential': 9, 'unclassified': 9, 'living_street': 8,
          'service': 6, 'pedestrian': 8, 'footway': 4, 'path': 3.5, 'cycleway': 4, 'track': 4, 'steps': 3, 'bridleway': 3}
    Uw = U.buffer(2); shapely.prepare(Uw)
    fineW = unary_union([box((b[0] - ox) * kx, (b[1] - oy) * ky, (b[2] - ox) * kx, (b[3] - oy) * ky) for b in cfg['boxes']]).buffer(400)
    cand = []
    for g, sub, cls, rng in BR:
      gl = to_local(shapely.wkb.loads(g), ox, oy, kx, ky)
      if not gl.intersects(fineW) or not gl.intersects(Uw): continue
      for a, b in rng:
        part = shapely.ops.substring(gl, a, b, normalized=True)
        if part.geom_type != 'LineString' or part.length < 6 or part.intersection(Uw).length < 4: continue
        kind = 1 if sub == 'rail' else 2 if cls in ('footway', 'path', 'cycleway', 'steps', 'track', 'bridleway', 'pedestrian') else 0
        w = 8. if kind == 1 else W_.get(cls, 8.)
        cand.append([kind, w, part])
    roads = [c for c in cand if c[0] != 2]
    rtree = shapely.STRtree([c[2] for c in roads]) if roads else None
    for c in cand:
      if c[0] == 2 and rtree is not None:          # a sidewalk drawn beside a road bridge: widen the road instead
        near = rtree.query(c[2], predicate='dwithin', distance=12)
        if len(near):
          r_ = roads[near[0]]
          if c[2].hausdorff_distance(r_[2]) < 25: r_[1] = min(r_[1] + 3, 34); c[0] = -1
    Ui = U.buffer(-5); shapely.prepare(Ui)
    for kind, w, part in cand:
      if kind < 0: continue
      part = part.simplify(.5); L = part.length
      ts = np.arange(0, L, 1.); pp = shapely.line_interpolate_point(part, ts)
      inside = shapely.contains(Ui, pp); piers = []
      if inside.any():                               # piers in the river for long spans, evenly spaced over the water
        ii = np.where(inside)[0]; runs = np.split(ii, np.where(np.diff(ii) > 1)[0] + 1)
        for r_ in runs:
          span = len(r_)
          if span < 44 or kind == 2: continue
          n = int(round(span / 38))
          piers += [int(round((r_[0] + span * k / n) / L * 1000)) for k in range(1, n)]
      cc = np.asarray(part.coords)
      bridges.append([kind, round(w, 1), np.round(cc).astype(int).flatten().tolist(), piers])
  # --- chunk into ~6 km tiles with local origins ----------------------------------------------------
  TS = 6000; C = V[F].mean(1); key = np.floor(C / TS).astype(int)
  groups = collections.defaultdict(list)
  for t, k in enumerate(map(tuple, key)): groups[k].append(t)
  blobs, chunks, off = [], [], 0
  for k, tl in groups.items():
    tl = np.array(tl); ff = F[tl]
    while True:
      uv, inv = np.unique(ff.ravel(), return_inverse=True)
      if len(uv) < 65536: break
      raise SystemExit('chunk too big')
    vv = V[uv]; c0 = (vv.min(0) + vv.max(0)) / 2; c0 = np.round(c0)
    q = np.round((vv - c0) * 4).astype(np.int64)
    assert np.abs(q).max() < 32767, 'chunk extent'
    attr = np.zeros((len(uv), 13), np.uint8)
    attr[:, 0] = np.clip(np.round(np.sqrt(np.clip(ds[uv], 0, 1500) / 1500) * 255), 0, 255)
    attr[:, 1:3] = (np.clip(np.round(sdir[uv] * 127), -127, 127).astype(np.int8)).view(np.uint8)
    attr[:, 3] = np.where(dclip[uv] < .05, 255, vbank[uv])               # 255 marks a vertex on a corridor cut
    attr[:, 4:6] = (np.clip(np.round(flow[uv] * 40), -127, 127).astype(np.int8)).view(np.uint8)
    attr[:, 6:9] = np.clip(np.round(col[uv]), 0, 255)
    attr[:, 9] = np.clip(np.round(turb[uv] * 255), 0, 255)
    attr[:, 10] = np.clip(np.round(ice[uv]), 0, 255)
    attr[:, 11:13] = vb565[uv].astype('<u2').view(np.uint8).reshape(-1, 2)
    idx = inv.reshape(-1, 3).astype('<u2')
    b = q.astype('<i2').tobytes() + idx.tobytes() + attr.tobytes()
    b += b'\0' * ((-len(b)) % 4)
    chunks.append(dict(ox=round(ox + c0[0] / kx, 7), oy=round(oy + c0[1] / ky, 7), nv=int(len(uv)), nt=int(len(idx)), off=off,
                       x0=int(c0[0]), y0=int(c0[1]), r=round(float(np.hypot(*(vv.max(0) - vv.min(0))) / 2), 1)))
    blobs.append(b); off += len(b)
  data = b''.join(blobs)
  json.dump(dict(v=1, ox=ox, oy=oy, kx=kx, ky=ky, attrs=13, chunks=chunks, bridges=bridges, data=base64.b64encode(data).decode()), open(os.path.join(OUT, area + '.json'), 'w'), separators=(',', ':'))
  print(area, 'chunks', len(chunks), 'bytes', len(data), 'bridges', len(bridges), flush=True)

# --- accurate centrelines of the main rivers inside the detailed patch (for the long-distance ribbons) ---
MAIN = {'Inn': .09, 'Isar': .06, 'Donau': .14, 'Salzach': .08, 'Lech': .06, 'Loisach': .035, 'Ammer': .03, 'Amper': .035, 'Mangfall': .03,
        'Ziller': .035, 'Sill': .03, 'Altmühl': .035, 'Pegnitz': .03, 'Iller': .04, 'Wertach': .035, 'Paar': .025, 'Vils': .025, 'Naab': .035,
        'Main-Donau-Kanal': .04, 'Alz': .03, 'Tiroler Achen': .03, 'Großache': .03, 'Saalach': .035, 'Regen': .035}
BBB = box(9.9, 46.9, 12.5, 49.7)
lg = collections.defaultdict(list)
for x in raw:
  if x['name'] in MAIN and x['sub'] in ('river', 'canal') and not x['tags'].get('tunnel'):
    g = shapely.wkb.loads(x['g'])
    if g.geom_type == 'LineString': lg[x['name']].append(g)
lines_out = []
for nm, gs in lg.items():
  m = linemerge(unary_union(gs)) if len(gs) > 1 else gs[0]
  for part in (m.geoms if hasattr(m, 'geoms') else [m]):
    part = part.intersection(BBB)
    for p in (part.geoms if hasattr(part, 'geoms') else [part]):
      if p.geom_type != 'LineString' or p.length < .02: continue
      s = p.simplify(.0005)
      lines_out.append(dict(name=nm, w=MAIN[nm], pts=[[round(a, 4), round(b, 4)] for a, b in s.coords]))
json.dump(dict(lines=lines_out), open(os.path.join(OUT, 'lines.json'), 'w'), separators=(',', ':'))
print('lines', len(lines_out), sum(len(l['pts']) for l in lines_out))
