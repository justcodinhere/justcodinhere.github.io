# Landmark footprints: the Overture building outlines and parts of each hand-modelled landmark, in local metres around
# the landmark's origin, plus the mask polygons that tell js/buildings.js which pack footprints the model replaces.
# Writes assets/landmarks/footprints.json. Run from the data dir: needs ov/building_raw2.pkl and ov/part_raw2.pkl
# (tools/ov_buildings2.py), and fetches ov/lm_extra.pkl once for landmarks outside the city boxes (Bergisel, the Wies).
# Local frame: x east, y north in metres on the map's sphere (111195 m per degree), z up; angles in degrees CCW from east.
import pickle, json, math, os, sys, re
import shapely, shapely.wkb
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import unary_union
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'landmarks', 'footprints.json')
K = 111195.0
B = pickle.load(open('ov/building_raw2.pkl', 'rb')); P = pickle.load(open('ov/part_raw2.pkl', 'rb'))

def fetch_extra():
  # Overture buildings and parts in two small boxes the city downloads missed (same row-group scan as tools/ov_index.py)
  import fsspec, pyarrow.parquet as pq, pyarrow.compute as pc, concurrent.futures as cf
  base = "https://overturemaps-us-west-2.s3.amazonaws.com/"
  BOX = {'bergisel': (11.394, 11.406, 47.244, 47.253), 'wies': (10.893, 10.907, 47.677, 47.685)}
  COLS = ['bbox', 'geometry', 'height', 'min_height', 'num_floors', 'class', 'names', 'roof_shape', 'roof_height', 'roof_direction', 'roof_orientation', 'roof_color', 'facade_color', 'roof_material', 'facade_material']
  PCOLS = ['bbox', 'geometry', 'height', 'min_height', 'roof_shape', 'roof_height', 'roof_color', 'facade_color', 'roof_material', 'facade_material', 'names']
  fs = fsspec.filesystem('http')
  hit = lambda x0, x1, y0, y1: [k for k, (w, e, s, n) in BOX.items() if x1 >= w and x0 <= e and y1 >= s and y0 <= n]
  def scan(kr):
    k, rows = kr; md = pq.ParquetFile(fs.open(base + k, block_size=2**20)).metadata; ix = {md.schema.column(i).path: i for i in range(md.num_columns)}
    st = lambda rg, c: rg.column(ix[c]).statistics
    return [(k, r) for r in rows if hit(st(md.row_group(r), 'bbox.xmin').min, st(md.row_group(r), 'bbox.xmax').max, st(md.row_group(r), 'bbox.ymin').min, st(md.row_group(r), 'bbox.ymax').max)]
  def read(a, cols):
    t = pq.ParquetFile(fs.open(base + a[0], block_size=2**22)).read_row_group(a[1], columns=cols)
    bb = t.column('bbox').combine_chunks(); X0, X1, Y0, Y1 = (pc.struct_field(bb, c).to_numpy() for c in ('xmin', 'xmax', 'ymin', 'ymax'))
    cl = {c: t.column(c).to_pylist() for c in cols if c != 'bbox'}; res = []
    for i in range(len(X0)):
      h = hit(X0[i], X1[i], Y0[i], Y1[i])
      if h: rec = {c: cl[c][i] for c in cl}; rec['names'] = (rec.get('names') or {}).get('primary'); rec['area'] = h[0]; res.append(rec)
    return res
  out = {}
  for kind, idxf, cols in (('building', 'ov/index.json', COLS), ('part', 'ov/index_parts.json', PCOLS)):
    idx = json.load(open(idxf))
    with cf.ThreadPoolExecutor(16) as ex: jobs = [j for js in ex.map(scan, idx.items()) for j in js]
    with cf.ThreadPoolExecutor(8) as ex: out[kind] = [x for o in ex.map(lambda a: read(a, cols), jobs) for x in o]
  pickle.dump(out, open('ov/lm_extra.pkl', 'wb')); return out
X = pickle.load(open('ov/lm_extra.pkl', 'rb')) if os.path.exists('ov/lm_extra.pkl') else fetch_extra()
BX = [('B', i, r) for i, r in enumerate(B)] + [('X', i, r) for i, r in enumerate(X['building'])]
PX = [('P', i, r) for i, r in enumerate(P)] + [('Y', i, r) for i, r in enumerate(X['part'])]

# Each landmark: an anchor (lat, lon) and how to pick its buildings: by Overture name within `r` m of the anchor, or every
# building whose centroid falls in `poly` (local metres round the anchor). Parts are taken when their centroid lies inside a
# picked building (or the poly). `none`: nothing in the packs to replace (the model stands alone). `parts`: only these parts
# (by name, or centroid within `pr` m of a point), when the model is an addition to a building the packs keep.
# `main`: the building whose centroid is the origin (default: the largest picked). `context`: neighbours within this many
# metres are listed too (with ctx: 1) for aligning the model, but stay in the packs (not masked). `skipcls`: building classes
# inside `poly` that are not part of the landmark (the houses on a castle's slope). `near`: other buildings within this
# many metres of the picked ones are listed as ctx too (a castle's crag must not bury them).
LM = {
  'frauenkircheMuc': dict(at=(48.13860, 11.57360), names=['Frauenkirche']),
  'rathaus':         dict(at=(48.13760, 11.57590), names=['Neues Rathaus']),
  'alterPeter':      dict(at=(48.13665, 11.57580), names=['St. Peter']),
  'stMichael':       dict(at=(48.13880, 11.57060), names=['Sankt Michael']),
  'domIbk':          dict(at=(47.26880, 11.39365), names=['Dom zu St. Jakob']),
  'hofkirche':       dict(at=(47.26810, 11.39540), names=['Hofkirche (Schwarzmanderkirche)']),
  'goldenesDachl':   dict(at=(47.26857, 11.39328), parts=[('Goldenes Dachl', 0), (None, 6)], context=20),
  'bergisel':        dict(at=(47.24686, 11.39981), none=1),
  'neuschwanstein':  dict(near=25, at=(47.55760, 10.74930), poly=[(-60, -55), (40, -45), (95, 0), (85, 40), (50, 35), (-10, 20), (-60, -10)]),
  'hohenschwangau':  dict(near=25, at=(47.55530, 10.73620), poly=[(-45, 0), (75, 0), (75, 70), (-45, 70)]),
  'kufstein':        dict(near=25, at=(47.58150, 12.16850), poly=[(-30, -115), (75, -115), (80, 0), (70, 85), (30, 85), (15, 62), (-12, 40), (-25, 15), (-20, -60)]),
  'kaiserburg':      dict(near=25, at=(49.45780, 11.07750), main='Sinwellturm', skipcls=['house', 'apartments', 'retail', 'semidetached_house', 'garage'], poly=[(-215, -38), (-60, -40), (-20, -10), (70, 40), (65, 75), (10, 80), (-60, 55), (-150, 48), (-215, 35)]),
  'stLorenz':        dict(at=(49.45100, 11.07866), names=['St. Lorenz']),
  'frauenkircheNue': dict(at=(49.45405, 11.07820), names=['Frauenkirche']),
  'wieskirche':      dict(at=(47.68050, 10.90050), names=['Wieskirche', 'Wallfahrtsmuseum'], extra=[(42.6, 3.7)]),
}

def geom(rec):
  try: g = shapely.wkb.loads(rec['geometry'])
  except Exception: return None
  return g if g.geom_type in ('Polygon', 'MultiPolygon') else None
def local(g, la0, lo0):
  kx = K * math.cos(math.radians(la0))
  return shapely.transform(g, lambda c: [[(x - lo0) * kx, (y - la0) * K] for x, y in c])
def ring_out(r, ccw):
  co = list(r.coords)[:-1]
  if Polygon(co).exterior.is_ccw != ccw: co = co[::-1]
  return [[round(x, 2), round(y, 2)] for x, y in co]
def rect(p):
  m = p.minimum_rotated_rectangle; c = list(m.exterior.coords)[:4]
  e1 = (c[1][0] - c[0][0], c[1][1] - c[0][1]); e2 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
  l1, l2 = math.hypot(*e1), math.hypot(*e2)
  L, W, ax = (l1, l2, e1) if l1 >= l2 else (l2, l1, e2)
  a = math.degrees(math.atan2(ax[1], ax[0]))
  a = (a + 90) % 180 - 90                                  # an axis, not a direction: keep it in [-90, 90)
  return round(a, 2), round(L, 2), round(W, 2), [round(m.centroid.x, 2), round(m.centroid.y, 2)]
def hexc(c):
  if not c: return None
  c = c.strip().lower(); m = re.fullmatch(r'#?([0-9a-f]{6})', c)
  return '#' + m.group(1) if m else c
def rec_out(tag, i, r, g):
  ps = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
  p = max(ps, key=lambda q: q.area).simplify(.15, preserve_topology=True)
  a, L, W, c = rect(p)
  o = dict(id=f'{tag}{i}', name=r.get('names'), part=int(tag in 'PY'), ring=ring_out(p.exterior, True), holes=[ring_out(h, False) for h in p.interiors if Polygon(h).area > 4],
           area=round(p.area, 1), c=[round(p.centroid.x, 2), round(p.centroid.y, 2)], ang=a, L=L, W=W, rc=c,
           h=r.get('height') and round(float(r['height']), 2), minh=r.get('min_height') and round(float(r['min_height']), 2),
           roof=r.get('roof_shape'), rh=r.get('roof_height') and round(float(r['roof_height']), 2), roofColor=hexc(r.get('roof_color')),
           wallColor=hexc(r.get('facade_color')), roofMat=r.get('roof_material'), wallMat=r.get('facade_material'),
           cls=r.get('class'), floors=r.get('num_floors'))
  return {k: v for k, v in o.items() if v not in (None, [], '')}

out = {}
for name, s in LM.items():
  la, lo = s['at']; kx = K * math.cos(math.radians(la))
  near = lambda g, rr: math.hypot((g.centroid.x - lo) * kx, (g.centroid.y - la) * K) < rr
  picked, parts = [], []
  if 'names' in s or 'poly' in s:
    sel = Polygon(s['poly']) if 'poly' in s else None
    for tag, i, r in BX:
      g = geom(r)
      if g is None or not near(g, 400): continue
      gl = local(g, la, lo)
      if r.get('class') in s.get('skipcls', []): continue
      if sel is not None and sel.contains(gl.centroid) or (r.get('names') in s.get('names', []) and near(g, 120)) or any(gl.contains(Point(e)) for e in s.get('extra', [])): picked.append((tag, i, r, gl))
    shell = unary_union([q[3] for q in picked]).buffer(2.0) if picked else None
    for tag, i, r in PX:
      g = geom(r)
      if g is None or not near(g, 400): continue
      gl = local(g, la, lo)
      if shell is not None and shell.contains(gl.centroid) or sel is not None and sel.contains(gl.centroid): parts.append((tag, i, r, gl))
  if 'parts' in s:
    for tag, i, r in PX:
      g = geom(r)
      if g is None or not near(g, 60): continue
      gl = local(g, la, lo)
      for nm, rr in s['parts']:
        if nm and r.get('names') == nm or not nm and math.hypot(*gl.centroid.coords[0]) < rr and gl.area < 40: parts.append((tag, i, r, gl)); break
  recs = picked + parts
  if not recs and 'none' not in s: print('WARNING nothing picked for', name)
  # origin: the centroid of the main (first, largest picked) building, so the model's numbers stay small
  main = max(picked, key=lambda q: (bool(s.get('main')) and q[2].get('names') == s['main'], q[3].area)) if picked else (max(parts, key=lambda q: q[3].area) if parts else None)
  if main:
    cx, cy = main[3].centroid.x, main[3].centroid.y
    la0, lo0 = la + cy / K, lo + cx / kx
  else: la0, lo0 = la, lo
  # redo every outline round the final origin
  rs = []
  for tag, i, r, _ in recs: rs.append(rec_out(tag, i, r, local(geom(r), la0, lo0)))
  mask = unary_union([Polygon(q['ring']) for q in rs]).buffer(1.0, join_style=2) if rs else None
  if 'near' in s and recs:
    ids = {f'{t}{i}' for t, i, _, _ in recs}
    zone = unary_union([local(geom(r), la0, lo0) for _, _, r, _ in recs]).buffer(s['near'])
    for tag, i, r in BX:
      g = geom(r)
      if g is None or f'{tag}{i}' in ids or not near(g, 500): continue
      gl = local(g, la0, lo0)
      if gl.intersects(zone) and gl.area > 15: rs.append(dict(rec_out(tag, i, r, gl), ctx=1))
  if 'context' in s:
    ids = {f'{t}{i}' for t, i, _, _ in recs}
    for tag, i, r in BX + PX:
      g = geom(r)
      if g is None or f'{tag}{i}' in ids or not near(g, s['context']) or g.area * kx * K < 40: continue
      rs.append(dict(rec_out(tag, i, r, local(g, la0, lo0)), ctx=1))
  mrings = [] if mask is None else [ring_out(m.exterior, True) for m in (mask.geoms if mask.geom_type == 'MultiPolygon' else [mask])]
  d = dict(lat=round(la0, 7), lon=round(lo0, 7), mask=[[[round(x, 1), round(y, 1)] for x, y in m] for m in mrings], parts=rs)
  if main: d['ang'], d['L'], d['W'] = rs[recs.index(main)]['ang'], rs[recs.index(main)]['L'], rs[recs.index(main)]['W']
  out[name] = d
  print(f'{name:16s} {len(picked):3d} buildings {len(parts):3d} parts  origin {la0:.6f} {lo0:.6f}  axis {d.get("ang")}  {d.get("L")} x {d.get("W")} m')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
