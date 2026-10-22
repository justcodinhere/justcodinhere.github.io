#!/usr/bin/env python3
"""Streets for js/streets.js, step 2: pack the Overture extract (streets_fetch.py) into assets/streets/<area>.json.
Each segment becomes a centreline with a kind, a carriageway width and, every 8 m, how far the town floor reaches on
each side: to the facades where houses line the street (measured by casting rays into a 1 m raster of the building
footprints), to a mapped sidewalk, or a default verge in the open. Tunnels, indoor and underground ways go; bridge
spans over the drawn water go too (js/water.js builds those decks). Pedestrian areas, plazas, surface car parks and
platforms are triangulated together with a ring 1.5 m (car parks 4 m) inside the outline, for soft rims.
usage: python3 streets_pack.py DATA_DIR OUT_DIR   (DATA_DIR/streets_raw.pkl; buildings from DATA_DIR/../ov/building_raw2.pkl)
Binary per sub-area, little-endian, each record padded to even length: lines [u8 kind, u8 flags, u8 width (0.25 m),
u8 0, u16 npts, u16 nw, int16 x,y of the first point (0.5 m), int8 dx,dy * (npts-1) (0.5 m), u8 left,right reach * nw
(0.25 m, every 8 m)], then polygons [u8 kind, u8 angle, u16 nv, u16 nt, u16 nb (outline vertices come first, the rest
are the inner rim), int16 x,y * nv (0.25 m), indices * 3nt (u8 below 256 vertices, else u16)]."""
import pickle, json, math, sys, os, base64, struct, collections
import numpy as np, shapely, shapely.wkb, shapely.ops, triangle
from shapely.geometry import box, LineString, MultiLineString, Polygon, MultiPolygon, Point
from shapely.ops import unary_union, linemerge
from PIL import Image, ImageDraw

D, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
os.makedirs(OUT, exist_ok=True)
raw = pickle.load(open(os.path.join(D, 'streets_raw.pkl'), 'rb'))
# area file -> sub-areas (lon0, lat0, lon1, lat1); kept in step with streets_fetch.py. Water for each comes from assets/water.
AREAS = {
  'muc': {'muc': (11.536, 48.124, 11.600, 48.152)},
  'inn': {'inn': (11.376, 47.242, 11.416, 47.279), 'kuf': (12.155, 47.574, 12.181, 47.593), 'rat': (11.887, 47.434, 11.901, 47.444)},
  'nue': {'nue': (11.060, 49.442, 11.094, 49.463)},
  'neu': {'neu': (10.684, 47.549, 10.762, 47.586)},
}
# kinds: carriageway width m (0: floor only), default floor half-width beyond it m
K = dict(motorway=1, trunk=2, primary=3, secondary=4, tertiary=5, residential=6, unclassified=6, living_street=7, service=8,
         pedestrian=9, footway=10, path=11, cycleway=12, track=13, steps=14, bridleway=11)
CW = {1: 22, 2: 16, 3: 12.5, 4: 10.5, 5: 8.5, 6: 6.5, 7: 5.5, 8: 4.2}
STRIP = {9: 8., 10: 2.2, 11: 1.7, 12: 2.2, 13: 3.0, 14: 2.6, 20: 2.9, 21: 3.4, 22: 3.6}   # full strip widths
TRAM, RAIL, XWALK = 20, 21, 22
F_URBAN, F_SETT, F_LOOSE, F_LINK, F_STREETTRAM, F_PLAIN = 1, 2, 4, 8, 16, 32   # plain: no kerb or verge (driveways, car park aisles)
P_PED, P_PLAZA, P_PARK, P_PLAT = 30, 31, 32, 33

def frame(b):
  oy = round((b[1] + b[3]) / 2, 5); ox = round((b[0] + b[2]) / 2, 5)
  return ox, oy, 111320 * math.cos(math.radians(oy)), 110570.
def to_local(g, ox, oy, kx, ky): return shapely.transform(g, lambda c: np.c_[(c[:, 0] - ox) * kx, (c[:, 1] - oy) * ky])

def water_lonlat(area, bb):
  """The drawn water surfaces (assets/water/<area>.json) as lon/lat polygons."""
  J = json.load(open(os.path.join(ROOT, 'assets/water', area + '.json')))
  buf = base64.b64decode(J['data']); tris = []
  for c in J['chunks']:
    q = np.frombuffer(buf, np.int16, c['nv'] * 2, c['off']).reshape(-1, 2) / 4.
    f = np.frombuffer(buf, np.uint16, c['nt'] * 3, c['off'] + c['nv'] * 4).reshape(-1, 3)
    lon = J['ox'] + (c['x0'] + q[:, 0]) / J['kx']; lat = J['oy'] + (c['y0'] + q[:, 1]) / J['ky']
    P = np.c_[lon, lat]; C = P[f].mean(1)
    near = (C[:, 0] > bb[0] - .01) & (C[:, 0] < bb[2] + .01) & (C[:, 1] > bb[1] - .01) & (C[:, 1] < bb[3] + .01)
    tris += [Polygon(P[t]) for t in f[near]]
  return unary_union([t.buffer(0) for t in tris if t.area > 0])

print('loading buildings', flush=True)
BRAW = pickle.load(open(os.path.join(D, '..', 'ov', 'building_raw2.pkl'), 'rb'))
BG = shapely.from_wkb([b['geometry'] for b in BRAW]); BC = shapely.centroid(BG); BX, BY = shapely.get_x(BC), shapely.get_y(BC)
del BRAW

def flag_ranges(r, names):
  out = []
  for f in (r.get('road_flags') or []) + (r.get('rail_flags') or []):
    if any(v in names for v in (f.get('values') or [])): out.append(tuple(f.get('between') or (0., 1.)))
  return out
def level_ranges(r):
  return [tuple(l.get('between') or (0., 1.)) for l in (r.get('level_rules') or []) if (l.get('value') or 0) < 0]
def keep_parts(line, cut):
  """line minus the normalized [a, b] ranges in cut"""
  if not cut: return [line]
  cut = sorted(cut); keep, t = [], 0.
  for a, b in cut:
    if a > t: keep.append((t, a))
    t = max(t, b)
  if t < 1: keep.append((t, 1.))
  out = []
  for a, b in keep:
    if b - a < 1e-6: continue
    p = shapely.ops.substring(line, a, b, normalized=True)
    if p.geom_type == 'LineString' and p.length > 1: out.append(p)
  return out
def one_value(rules):
  vals = [x.get('value') for x in (rules or []) if x.get('between') is None]
  return vals[0] if vals else ([x.get('value') for x in (rules or [])] or [None])[0]

def pack_sub(name, b, area):
  ox, oy, kx, ky = frame(b)
  BOXL = box((b[0] - ox) * kx, (b[1] - oy) * ky, (b[2] - ox) * kx, (b[3] - oy) * ky)
  # buildings raster (1 m) for the facade rays
  x0, y0, x1, y1 = BOXL.bounds; x0 -= 40; y0 -= 40; x1 += 40; y1 += 40
  W, H = int(x1 - x0) + 1, int(y1 - y0) + 1
  sel = np.where((BX > b[0] - .002) & (BX < b[2] + .002) & (BY > b[1] - .002) & (BY < b[3] + .002))[0]
  img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
  BL = []
  for i in sel:
    g = to_local(BG[i], ox, oy, kx, ky)
    for p in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
      if p.geom_type != 'Polygon' or p.area < 6: continue
      c = np.asarray(p.exterior.coords); dr.polygon([(x - x0, y1 - y) for x, y in c], fill=255); BL.append(p)
  bmask = np.asarray(img) > 0
  print(name, 'buildings', len(BL), 'raster', W, H, flush=True)
  water = to_local(water_lonlat(area, b), ox, oy, kx, ky).intersection(BOXL.buffer(200)); shapely.prepare(water)
  Uw = water.buffer(2); shapely.prepare(Uw)
  # ---- segments -> pieces with kind, width, flags
  segs = [r for r in raw['seg'] if name in r['box']]
  pieces, sidewalks = [], []
  for r in segs:
    st, cls, sub = r['subtype'], r['class'], r.get('subclass') or one_value(r.get('subclass_rules'))
    if st == 'rail':
      kind = TRAM if cls in ('tram', 'light_rail') else RAIL if cls in ('standard_gauge', 'narrow_gauge') else None
    elif st == 'road': kind = K.get(cls)
    else: kind = None
    if kind is None: continue
    if kind == 10 and sub == 'crosswalk': kind = XWALK
    if kind == 12 and sub == 'cycle_crossing': continue
    g = to_local(shapely.from_wkb(r['geometry']), ox, oy, kx, ky)
    if g.geom_type != 'LineString' or not g.intersects(BOXL): continue
    if flag_ranges(r, ('is_under_construction', 'is_abandoned', 'is_disused')) == [(0., 1.)]: continue
    cut = flag_ranges(r, ('is_tunnel', 'is_indoor', 'is_covered')) + level_ranges(r)
    for a, bb in flag_ranges(r, ('is_bridge',)):           # a span over the drawn water: water.js has its deck
      sp = shapely.ops.substring(g, a, bb, normalized=True)
      if sp.length > 0 and sp.intersection(Uw).length >= 4: cut.append((a, bb))
    surf = one_value(r.get('road_surface'))
    flags = (F_SETT if surf in ('paving_stones', 'sett', 'cobblestone') else 0) | (F_LOOSE if surf in ('unpaved', 'gravel', 'dirt', 'fine_gravel', 'ground', 'grass') else 0)
    if sub == 'link': flags |= F_LINK
    wv = one_value(r.get('width_rules'))
    if kind <= 8:
      w = CW[kind] * (.62 if sub == 'link' else 1)
      if sub == 'driveway': w = 3.; flags |= F_PLAIN
      elif sub == 'parking_aisle': w = 5.5; flags |= F_PLAIN
      elif sub == 'alley': w = 3.5
      if wv and 2.5 <= wv <= 30: w = float(wv)
    else:
      w = STRIP[kind]
      if wv and kind in (9, 10, 11, 12, 13, 14) and .8 <= wv <= 30: w = float(wv)
    nm = ((r.get('names') or {}).get('primary') or '') if isinstance(r.get('names'), dict) else ''
    for p in keep_parts(g, cut):
      p = p.intersection(BOXL)
      for q in (p.geoms if p.geom_type == 'MultiLineString' else [p]):
        if q.geom_type != 'LineString' or q.length < 1.5: continue
        if kind == 10 and sub == 'sidewalk': sidewalks.append(q); continue
        pieces.append([kind, flags, round(w * 4) / 4, nm, q])
  # ---- polygons
  polys = []
  def add_poly(g, kind, minA=40):
    g = to_local(g, ox, oy, kx, ky)
    if g.geom_type not in ('Polygon', 'MultiPolygon'): return
    g = g.buffer(0).intersection(BOXL).difference(water)
    for p in (g.geoms if hasattr(g, 'geoms') else [g]):
      if p.geom_type == 'Polygon' and p.area > minA: polys.append([kind, p.simplify(.5)])
  ground = lambda r: (r.get('level') or 0) == 0
  for r in raw['lu']:
    if name in r['box'] and r['class'] in ('pedestrian', 'plaza') and ground(r): add_poly(shapely.from_wkb(r['geometry']), P_PLAZA if r['class'] == 'plaza' else P_PED)
  for r in raw['inf']:
    if name in r['box'] and r['class'] in ('parking', 'platform') and ground(r):
      add_poly(shapely.from_wkb(r['geometry']), P_PARK if r['class'] == 'parking' else P_PLAT, 150 if r['class'] == 'parking' else 40)
  # car parks and platforms under a roof (multi-storey, station halls) are hidden anyway; platforms only beside surface track
  if BL:
    bu = unary_union(BL); shapely.prepare(bu)
    polys = [p for p in polys if p[0] not in (P_PARK, P_PLAT) or p[1].intersection(bu).area < .5 * p[1].area]
  tr = [p[4] for p in pieces if p[0] in (RAIL, TRAM)]
  trt = shapely.STRtree(tr) if tr else None
  polys = [p for p in polys if p[0] != P_PLAT or (trt is not None and len(trt.query(p[1], predicate='dwithin', distance=6)))]
  ped = unary_union([p[1] for p in polys if p[0] in (P_PED, P_PLAZA)]).buffer(-1.5) if polys else Polygon(); shapely.prepare(ped)
  # paths inside pedestrian areas are part of the paving; sidewalks become part of their street's pavement
  pieces = [p for p in pieces if not (p[0] in (10, 11, 12) and ped.contains(p[4].interpolate(.5, normalized=True)))]
  # tram tracks running in a street (vs on their own bed)
  roads = [p[4] for p in pieces if p[0] <= 8]
  rt = shapely.STRtree(roads) if roads else None
  for p in pieces:
    if p[0] == TRAM and rt is not None:
      mid = p[4].interpolate(.5, normalized=True)
      if len(rt.query(mid, predicate='dwithin', distance=6)): p[1] |= F_STREETTRAM
  # ---- merge pieces of one street into long lines
  groups = collections.defaultdict(list)
  for kind, flags, w, nm, g in pieces: groups[(kind, flags, w, nm if kind <= 9 else '')].append(g)
  lines = []
  for (kind, flags, w, nm), gs in groups.items():
    m = linemerge(gs) if len(gs) > 1 else gs[0]
    for g in (m.geoms if m.geom_type == 'MultiLineString' else [m]):
      g = g.simplify(.25)
      if g.length >= (5 if kind in (10, 11, 12, 13) else 2): lines.append([kind, flags, w, g])
  # ---- sidewalks raster (buffered to their width) for the pavement reach
  img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
  for s in sidewalks:
    pg = s.buffer(1.2, cap_style='flat')
    for p in (pg.geoms if hasattr(pg, 'geoms') else [pg]):
      if p.geom_type == 'Polygon': dr.polygon([(x - x0, y1 - y) for x, y in p.exterior.coords], fill=255)
  smask = np.asarray(img) > 0
  def look(mask, P):
    ix = np.clip((P[..., 0] - x0).astype(int), 0, W - 1); iy = np.clip((y1 - P[..., 1]).astype(int), 0, H - 1)
    return mask[iy, ix]
  # ---- per line: facade / sidewalk reach every 8 m
  T = np.arange(.5, 30.01, .5)
  out_lines = []
  for kind, flags, w, g in lines:
    L = g.length; n = max(2, int(math.ceil(L / 8)) + 1); s = np.linspace(0, L, n)
    pts = lambda t: shapely.get_coordinates(shapely.line_interpolate_point(g, t))
    P, P2, P1 = pts(s), pts(np.minimum(L, s + 1)), pts(np.maximum(0, s - 1))
    tg = P2 - P1; tg /= np.maximum(np.linalg.norm(tg, axis=1, keepdims=True), 1e-9); nl = np.c_[-tg[:, 1], tg[:, 0]]
    half = w / 2 if kind <= 8 else 0.
    reach = []
    urban_hits = 0
    for side in (1, -1):
      R_ = P[:, None, :] + side * nl[:, None, :] * T[None, :, None]
      hb = look(bmask, R_); hs = look(smask, R_)
      fac = np.where(hb.any(1), T[np.argmax(hb, 1)], 99.)
      # farthest sidewalk cell before the facade, contiguous from near the kerb
      swd = np.zeros(n)
      for i in range(n):
        if kind > 8: break
        k = np.where(hs[i] & (T < fac[i]) & (T < half + 12))[0]
        if len(k): swd[i] = T[k[-1]] + .3
      urban_hits += int(((fac < half + 14) | (swd > 0)).sum())
      if kind <= 8:
        ed = np.where(fac < half + 9, fac + .8, np.where(swd > 0, np.maximum(swd, half + 1.5), half + 2.6))
      elif kind == 9:
        ed = np.where(fac < 24, fac + .8, w / 2 + 1)
      else:
        ed = np.full(n, w / 2)
      ed = np.maximum(ed, half + .6 if kind <= 8 else w / 2 * .8)
      # median then rate-limited, so a gap between houses doesn't notch the pavement
      if n >= 5 and kind <= 9:
        ed = np.array([np.median(ed[max(0, i - 2):i + 3]) for i in range(n)])
        for i in range(1, n): ed[i] = min(ed[i], ed[i - 1] + 4)
        for i in range(n - 2, -1, -1): ed[i] = min(ed[i], ed[i + 1] + 4)
      reach.append(np.clip(np.round(ed * 4), 0, 255).astype(np.uint8))
    if urban_hits > .3 * n * 2 or kind in (9,): flags |= F_URBAN
    out_lines.append((kind, flags, w, g, reach[0], reach[1]))      # left (+normal), right
  # ---- polygons: the outline plus a ring 1.5 m inside it (the soft rim), constrained Delaunay, no extra points;
  # js/streets.js splits long triangles itself so they follow the terrain
  def ring_pts(rg, tol):
    rg = LineString(rg).simplify(tol).segmentize(40); return np.asarray(rg.coords)[:-1]
  out_polys = []
  for kind, p in polys:
    if p.is_empty or p.geom_type != 'Polygon': continue
    V, S, holes, o = [], [], [], 0
    def add_ring(rg):
      nonlocal o
      if len(rg) < 3: return False
      V.extend(rg.tolist()); S.extend([[o + i, o + (i + 1) % len(rg)] for i in range(len(rg))]); o += len(rg); return True
    for k, r_ in enumerate([p.exterior] + list(p.interiors)):
      rg = ring_pts(r_.coords, .6)
      if add_ring(rg) and k: holes.append(Polygon(r_).representative_point().coords[0])
    if not V: continue
    nb = len(V)
    rim = p.buffer(-4. if kind == P_PARK else -1.5)     # car parks fade out over a wider rim
    for q in (rim.geoms if hasattr(rim, 'geoms') else [rim]):
      if q.geom_type != 'Polygon' or q.area < 20: continue
      for r_ in [q.exterior] + list(q.interiors): add_ring(ring_pts(r_.coords, .8))
    if len(V) == nb: V.append(list(p.representative_point().coords[0]))   # too small for a rim: one inner point
    A = dict(vertices=np.array(V), segments=np.array(S))
    if holes: A['holes'] = np.array(holes)
    try: t = triangle.triangulate(A, 'p')
    except Exception: continue
    tv, tt = t['vertices'], t['triangles']
    if len(tv) > 65000 or not len(tt) or len(tv) != len(V): continue     # Triangle added points: skip this one
    mr = p.minimum_rotated_rectangle; mc = np.asarray(mr.exterior.coords)
    ang = math.atan2(mc[1][1] - mc[0][1], mc[1][0] - mc[0][0]) % math.pi
    out_polys.append((kind, int(round(ang / math.pi * 255)) & 255, tv, tt, nb))
  # ---- binary
  bl = bytearray(); cnt = collections.Counter()
  for kind, flags, w, g, rl, rr in out_lines:
    c = np.round(np.asarray(g.coords) * 2).astype(np.int64)          # 0.5 m grid, then int8 steps (split where longer)
    q = [c[0]]
    for a_, b_ in zip(c[:-1], c[1:]):
      k = int(math.ceil(np.abs(b_ - a_).max() / 127)) if (b_ != a_).any() else 0
      for j in range(1, k + 1): q.append(a_ + np.round((b_ - a_) * j / k).astype(np.int64))
    c = np.array(q)
    if len(c) < 2 or np.abs(c[0]).max() > 32767: continue
    d = np.diff(c, axis=0)
    nw = len(rl) if kind <= 9 else 0                # paths, tracks and crossings keep their own width
    bl += struct.pack('<BBBBHHhh', kind, flags, min(255, int(round(w * 4))), 0, len(c), nw, int(c[0][0]), int(c[0][1]))
    bl += d.astype('<i1').tobytes() + (np.c_[rl, rr].astype(np.uint8).tobytes() if nw else b'')
    if len(bl) % 2: bl += b'\0'
    cnt[kind] += 1
  bp = bytearray()
  for kind, ang, tv, tt, nb in out_polys:
    c = np.round(tv * 4).astype(np.int32)
    if np.abs(c).max() > 32767: continue
    bp += struct.pack('<BBHHH', kind, ang, len(c), len(tt), nb) + c.astype('<i2').tobytes() + tt.astype('<u1' if len(c) < 256 else '<u2').tobytes()
    if len(bp) % 2: bp += b'\0'
    cnt[kind] += 1
  print(name, 'lines', len(out_lines), 'polys', len(out_polys), 'bytes', len(bl) + len(bp), dict(sorted(cnt.items())), flush=True)
  return dict(name=name, ox=ox, oy=oy, kx=kx, ky=ky, box=[round(v, 1) for v in BOXL.bounds], lb=len(bl), pb=len(bp)), bytes(bl) + bytes(bp)

for area, subs in AREAS.items():
  if len(sys.argv) > 3 and area not in sys.argv[3:]: continue
  meta, blob = [], b''
  for nm, b in subs.items():
    m, data = pack_sub(nm, b, area); m['off'] = len(blob); meta.append(m); blob += data
  json.dump(dict(v=1, subs=meta, data=base64.b64encode(blob).decode()), open(os.path.join(OUT, area + '.json'), 'w'), separators=(',', ':'))
  print(area, 'file', os.path.getsize(os.path.join(OUT, area + '.json')), flush=True)
