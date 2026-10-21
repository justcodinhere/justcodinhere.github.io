#!/usr/bin/env python3
"""Row-group index of Overture theme=base/type=water for the detailed patch (like ov_index.py).
usage: python3 water_index.py OUT_DIR   -> OUT_DIR/water_index.json {key: [row groups]}"""
import fsspec, pyarrow.parquet as pq, re, urllib.request, urllib.parse, json, sys, os, concurrent.futures as cf
base = "https://overturemaps-us-west-2.s3.amazonaws.com/"
pref = "release/2026-09-23.0/theme=base/type=water/"
B = (9.9, 46.9, 12.5, 49.7)
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
    f = pq.ParquetFile(fs.open(base + k, block_size=2**20))
    md = f.metadata; names = [md.schema.column(i).path for i in range(md.num_columns)]
    ix = {n: i for i, n in enumerate(names)}; hits = []
    for r in range(md.num_row_groups):
      rg = md.row_group(r); s = lambda n: rg.column(ix[n]).statistics
      if s('bbox.xmax').max >= B[0] and s('bbox.xmin').min <= B[2] and s('bbox.ymax').max >= B[1] and s('bbox.ymin').min <= B[3]: hits.append(r)
    return k, hits
  except Exception as e: return k, str(e)
out = {}
with cf.ThreadPoolExecutor(24) as ex:
  for k, h in ex.map(scan, keys):
    if h: out[k] = h; print(k[-60:], h if isinstance(h, str) else len(h), flush=True)
json.dump(out, open(os.path.join(sys.argv[1], 'water_index.json'), 'w'))
