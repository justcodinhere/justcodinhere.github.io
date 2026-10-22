#!/usr/bin/env python3
"""Streets for js/streets.js, step 1: Overture transportation segments, pedestrian / plaza land use and surface
car parks around the stop towns, read straight from the release on S3 (row groups whose bbox statistics touch a box).
usage: python3 streets_fetch.py DATA_DIR [seg|lu|inf ...]   -> DATA_DIR/streets_raw.pkl {'seg': [...], 'lu': [...], 'inf': [...]}
Then streets_pack.py builds assets/streets/<area>.json."""
import fsspec, pyarrow.parquet as pq, pyarrow.compute as pc, re, urllib.request, urllib.parse, sys, os, pickle, concurrent.futures as cf
base = "https://overturemaps-us-west-2.s3.amazonaws.com/"
REL = "release/2026-09-23.0/"
D = sys.argv[1]
# (lon0, lat0, lon1, lat1): kept in step with streets_pack.py
BOXES = {
  'muc': (11.536, 48.124, 11.600, 48.152), 'inn': (11.376, 47.242, 11.416, 47.279), 'nue': (11.060, 49.442, 11.094, 49.463),
  'neu': (10.684, 47.549, 10.762, 47.586), 'kuf': (12.155, 47.574, 12.181, 47.593), 'rat': (11.887, 47.434, 11.901, 47.444),
}
def hit(x0, y0, x1, y1): return [k for k, (a, b, c, d) in BOXES.items() if x1 >= a and x0 <= c and y1 >= b and y0 <= d]
def keys(pref):
  out, tok = [], None
  while True:
    u = base + "?list-type=2&prefix=" + pref + (("&continuation-token=" + urllib.parse.quote(tok)) if tok else "")
    x = urllib.request.urlopen(u, timeout=60).read().decode()
    out += re.findall(r'<Key>([^<]*)</Key>', x)
    m = re.search(r'<NextContinuationToken>([^<]*)<', x)
    if not m: break
    tok = m.group(1)
  return out
fs = fsspec.filesystem('http')
def scan(k):
  for _ in range(3):
    try:
      md = pq.ParquetFile(fs.open(base + k, block_size=2**20)).metadata
      ix = {md.schema.column(i).path: i for i in range(md.num_columns)}; rows = []
      for r in range(md.num_row_groups):
        rg = md.row_group(r); s = lambda n: rg.column(ix[n]).statistics
        if hit(s('bbox.xmin').min, s('bbox.ymin').min, s('bbox.xmax').max, s('bbox.ymax').max): rows.append(r)
      return k, rows
    except Exception as e: err = e
  print('scan failed', k, err, flush=True); return k, []
def fetch(theme, typ, cols, keep=None):
  ks = keys(REL + f"theme={theme}/type={typ}/")
  print(theme, typ, len(ks), 'files', flush=True)
  jobs = []
  with cf.ThreadPoolExecutor(24) as ex:
    for k, rows in ex.map(scan, ks): jobs += [(k, r) for r in rows]
  print(' row groups', len(jobs), flush=True)
  def job(a):
    k, r = a
    for _ in range(3):
      try:
        f = pq.ParquetFile(fs.open(base + k, block_size=2**22)); have = set(f.schema_arrow.names)
        t = f.read_row_group(r, columns=['bbox', 'geometry'] + [c for c in cols if c in have]); break
      except Exception as e: err = e
    else: print('read failed', k, r, err, flush=True); return []
    bb = t.column('bbox').combine_chunks()
    x0, y0 = pc.struct_field(bb, 'xmin').to_numpy(), pc.struct_field(bb, 'ymin').to_numpy()
    x1, y1 = pc.struct_field(bb, 'xmax').to_numpy(), pc.struct_field(bb, 'ymax').to_numpy()
    ii = [i for i in range(len(x0)) if hit(x0[i], y0[i], x1[i], y1[i])]
    if not ii: return []
    t = t.take(ii); d = {c: t.column(c).to_pylist() for c in t.column_names if c != 'bbox'}
    out = []
    for j, i in enumerate(ii):
      rec = {c: d[c][j] for c in d}
      if keep and not keep(rec): continue
      rec['box'] = hit(x0[i], y0[i], x1[i], y1[i]); out.append(rec)
    return out
  res = []
  with cf.ThreadPoolExecutor(12) as ex:
    for o in ex.map(job, jobs): res += o
  print(' features', len(res), flush=True)
  return res
what = sys.argv[2:] or ['seg', 'lu', 'inf']          # refetch some parts only, keeping the rest of the pickle
P = os.path.join(D, 'streets_raw.pkl')
out = pickle.load(open(P, 'rb')) if os.path.exists(P) and len(what) < 3 else {}
if 'seg' in what: out['seg'] = fetch('transportation', 'segment', ['id', 'subtype', 'class', 'subclass', 'subclass_rules', 'names', 'road_flags', 'rail_flags',
                                                 'level_rules', 'width_rules', 'road_surface'])
if 'lu' in what: out['lu'] = fetch('base', 'land_use', ['subtype', 'class', 'names', 'surface', 'level'], keep=lambda r: r.get('subtype') == 'pedestrian' or r.get('class') in ('pedestrian', 'plaza', 'traffic_island'))
if 'inf' in what: out['inf'] = fetch('base', 'infrastructure', ['subtype', 'class', 'names', 'surface', 'level'], keep=lambda r: r.get('class') in ('parking', 'platform', 'pedestrian'))
pickle.dump(out, open(P, 'wb'))
print({k: len(v) for k, v in out.items()})
