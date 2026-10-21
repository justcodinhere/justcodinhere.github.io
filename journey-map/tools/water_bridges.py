#!/usr/bin/env python3
"""Bridges over the water surfaces in the towns: Overture transportation segments flagged is_bridge.
usage: python3 water_bridges.py DATA_DIR   -> DATA_DIR/bridges_raw.pkl  [(lon/lat LineString wkb, subtype, class, [bridge ranges])]"""
import fsspec, pyarrow.parquet as pq, re, urllib.request, urllib.parse, json, sys, os, pickle, numpy as np, concurrent.futures as cf
import pyarrow.compute as pc
base = "https://overturemaps-us-west-2.s3.amazonaws.com/"
pref = "release/2026-09-23.0/theme=transportation/type=segment/"
D = sys.argv[1]
# town boxes (lon0, lat0, lon1, lat1): the stops and the Inn valley towns, where bridges cross the drawn water
BOXES = [(11.44, 48.08, 11.72, 48.20), (11.30, 47.21, 11.50, 47.33), (11.48, 47.27, 11.53, 47.29), (11.58, 47.28, 11.62, 47.31),
         (11.69, 47.33, 11.74, 47.36), (11.76, 47.40, 11.79, 47.42), (11.88, 47.43, 11.91, 47.45), (12.05, 47.47, 12.08, 47.50),
         (12.15, 47.57, 12.19, 47.60), (12.10, 47.84, 12.14, 47.87), (11.00, 49.40, 11.15, 49.50), (11.40, 48.74, 11.45, 48.77),
         (10.62, 47.50, 10.85, 47.65)]
def hit(x0, y0, x1, y1): return any(x1 >= b[0] and x0 <= b[2] and y1 >= b[1] and y0 <= b[3] for b in BOXES)
keys, tok = [], None
while True:
  u = base + "?list-type=2&prefix=" + pref + (("&continuation-token=" + urllib.parse.quote(tok)) if tok else "")
  x = urllib.request.urlopen(u, timeout=60).read().decode()
  keys += re.findall(r'<Key>([^<]*)</Key>', x)
  m = re.search(r'<NextContinuationToken>([^<]*)<', x)
  if not m: break
  tok = m.group(1)
fs = fsspec.filesystem('http')
def scan(k):
  try:
    md = pq.ParquetFile(fs.open(base + k, block_size=2**20)).metadata
    ix = {md.schema.column(i).path: i for i in range(md.num_columns)}; hits = []
    for r in range(md.num_row_groups):
      rg = md.row_group(r); s = lambda n: rg.column(ix[n]).statistics
      if hit(s('bbox.xmin').min, s('bbox.ymin').min, s('bbox.xmax').max, s('bbox.ymax').max): hits.append(r)
    return k, hits
  except Exception as e: return k, []
jobs = []
with cf.ThreadPoolExecutor(24) as ex:
  for k, h in ex.map(scan, keys): jobs += [(k, r) for r in h]
print('row groups', len(jobs), flush=True)
COLS = ['bbox', 'geometry', 'subtype', 'class', 'road_flags', 'rail_flags', 'level_rules']
def job(a):
  k, r = a
  t = pq.ParquetFile(fs.open(base + k, block_size=2**22)).read_row_group(r, columns=COLS)
  bb = t.column('bbox').combine_chunks()
  x0, x1 = pc.struct_field(bb, 'xmin').to_numpy(), pc.struct_field(bb, 'xmax').to_numpy()
  y0, y1 = pc.struct_field(bb, 'ymin').to_numpy(), pc.struct_field(bb, 'ymax').to_numpy()
  m = np.array([hit(*v) for v in zip(x0, y0, x1, y1)])
  ii = np.where(m)[0]; out = []
  if not len(ii): return out
  t = t.take(ii); cols = {c: t.column(c).to_pylist() for c in COLS if c != 'bbox'}
  for i in range(len(ii)):
    rng = []
    for fl in (cols['road_flags'][i] or []) + (cols['rail_flags'][i] or []):
      if 'is_bridge' in (fl.get('values') or []): rng.append(fl.get('between') or [0, 1])
    if rng: out.append((cols['geometry'][i], cols['subtype'][i], cols['class'][i], rng))
  return out
res = []
with cf.ThreadPoolExecutor(12) as ex:
  for i, o in enumerate(ex.map(job, jobs)): res += o; print(i, len(jobs), len(res), flush=True) if i % 10 == 0 else None
pickle.dump(res, open(os.path.join(D, 'bridges_raw.pkl'), 'wb'))
print('bridges', len(res))
