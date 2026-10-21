#!/usr/bin/env python3
"""Fetch every Overture base/water feature (polygons and centrelines) whose bbox touches the detailed patch.
usage: python3 water_fetch.py DATA_DIR   (needs DATA_DIR/water_index.json from water_index.py) -> DATA_DIR/water_raw.pkl"""
import fsspec, pyarrow.parquet as pq, pyarrow.compute as pc, json, sys, os, pickle, numpy as np, concurrent.futures as cf
base = "https://overturemaps-us-west-2.s3.amazonaws.com/"
D = sys.argv[1]; idx = json.load(open(os.path.join(D, 'water_index.json')))
B = (9.9, 46.9, 12.5, 49.7)
COLS = ['bbox', 'geometry', 'names', 'subtype', 'class', 'source_tags', 'is_intermittent']
fs = fsspec.filesystem('http')
def job(a):
  k, r = a
  t = pq.ParquetFile(fs.open(base + k, block_size=2**22)).read_row_group(r, columns=COLS)
  bb = t.column('bbox').combine_chunks()
  x0, x1 = pc.struct_field(bb, 'xmin').to_numpy(), pc.struct_field(bb, 'xmax').to_numpy()
  y0, y1 = pc.struct_field(bb, 'ymin').to_numpy(), pc.struct_field(bb, 'ymax').to_numpy()
  m = (x1 >= B[0]) & (x0 <= B[2]) & (y1 >= B[1]) & (y0 <= B[3])
  ii = np.where(m)[0]
  if not len(ii): return []
  t = t.take(ii); cols = {c: t.column(c).to_pylist() for c in COLS if c != 'bbox'}
  out = []
  for i in range(len(ii)):
    tags = dict(cols['source_tags'][i] or [])
    out.append({'g': cols['geometry'][i], 'name': (cols['names'][i] or {}).get('primary'), 'sub': cols['subtype'][i], 'cls': cols['class'][i],
                'int': cols['is_intermittent'][i], 'tags': {k: v for k, v in tags.items() if k in ('waterway', 'water', 'natural', 'width', 'intermittent', 'tunnel', 'layer', 'landuse')},
                'bb': (float(x0[ii[i]]), float(y0[ii[i]]), float(x1[ii[i]]), float(y1[ii[i]]))})
  return out
jobs = [(k, r) for k, v in idx.items() for r in v]; res = []
with cf.ThreadPoolExecutor(12) as ex:
  for i, o in enumerate(ex.map(job, jobs)): res += o; print(i, len(jobs), len(res), flush=True)
pickle.dump(res, open(os.path.join(D, 'water_raw.pkl'), 'wb'))
