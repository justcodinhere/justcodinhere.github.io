import fsspec, pyarrow.parquet as pq, re, urllib.request, json, concurrent.futures as cf
base="https://overturemaps-us-west-2.s3.amazonaws.com/"
pref="release/2026-09-23.0/theme=buildings/type=building/"
keys=[];tok=None
while True:
  u=base+"?list-type=2&prefix="+pref+(("&continuation-token="+urllib.parse.quote(tok)) if tok else "")
  x=urllib.request.urlopen(u,timeout=60).read().decode()
  keys+=re.findall(r'<Key>([^<]*)</Key>',x)
  m=re.search(r'<NextContinuationToken>([^<]*)<',x)
  if not m: break
  tok=m.group(1)
fs=fsspec.filesystem('http')
B=(9.9,46.9,12.5,49.7)
def scan(k):
  try:
    f=pq.ParquetFile(fs.open(base+k,block_size=2**20))
    md=f.metadata; names=[md.schema.column(i).path for i in range(md.num_columns)]
    ix={n:i for i,n in enumerate(names)}
    hits=[]
    for r in range(md.num_row_groups):
      rg=md.row_group(r)
      s=lambda n: rg.column(ix[n]).statistics
      xmin=s('bbox.xmin').min; xmax=s('bbox.xmax').max; ymin=s('bbox.ymin').min; ymax=s('bbox.ymax').max
      if xmax>=B[0] and xmin<=B[2] and ymax>=B[1] and ymin<=B[3]: hits.append(r)
    return k,hits
  except Exception as e: return k,str(e)
out={}
with cf.ThreadPoolExecutor(24) as ex:
  for k,h in ex.map(scan,keys):
    if h: out[k]=h; print(k[-60:],h if isinstance(h,str) else len(h),flush=True)
json.dump(out,open('ov/index.json','w'))
