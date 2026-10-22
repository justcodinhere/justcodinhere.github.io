# Inputs for tools/trees.py, per 10 m detail cell (128 x 128, like the atlas tiles) of every pack:
#   trees/wc.pkl   ESA WorldCover 2021 class (10 = tree cover, 20 shrubs, 50 built-up, 80 water ...)
#   trees/nir.pkl  summer Sentinel-2 B08 (near infrared, L2A DN): broadleaf crowns are far brighter than conifers
# plus OpenStreetMap trees, tree rows, woods (with leaf_type) and land use (parks, cemeteries, orchards) via Overture:
#   trees/ov_land.pkl, trees/ov_land_use.pkl
# Run from the data/ folder (scenes.json, packs/); needs rasterio, mgrs, fsspec, pyarrow.
import json, os, re, sys, pickle, collections, urllib.request, urllib.parse, concurrent.futures as cf
import numpy as np, rasterio, mgrs, fsspec, pyarrow.parquet as pq, pyarrow.compute as pc
from rasterio.warp import reproject, transform_bounds, Resampling
from rasterio.transform import from_bounds
from PIL import Image
W,E,S_,N=9.9,12.5,46.9,49.7; GX,GY=150,240; CW,CH=(E-W)/GX,(N-S_)/GY; T=128
PACKS=['munich','inn','nue','neu']
os.makedirs('trees',exist_ok=True)
def bounds(x,y): return (W+x*CW, S_+y*CH, W+(x+1)*CW, S_+(y+1)*CH)
allc=set()
for n in PACKS:
  idx=np.asarray(Image.open(f'packs/{n}-index.png')); ys,xs=np.where(idx[...,2]>200); allc|={(int(a),int(b)) for a,b in zip(xs,ys)}
allc=sorted(allc)
ENV=dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_MULTIRANGE='YES',GDAL_CACHEMAX=1024)
def grab(url,cs,rs,dtype):
  out={}
  with rasterio.Env(**ENV):
    with rasterio.open('/vsicurl/'+url) as src:
      for c in cs:
        w,s,e,n=bounds(*c); dst=np.zeros((T,T),dtype)
        reproject(rasterio.band(src,1),dst,dst_transform=from_bounds(w,s,e,n,T,T),dst_crs='EPSG:4326',resampling=rs,src_nodata=0,dst_nodata=0)
        out[c]=dst
  return out
what=sys.argv[1:] or ['wc','nir','land','land_use']
if 'wc' in what:
  groups=collections.defaultdict(list)
  for c in allc:
    w,s,e,n=bounds(*c); groups[f'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N{int((s+n)/2//3*3):02d}E{int((w+e)/2//3*3):03d}_Map.tif'].append(c)
  res={}
  with cf.ThreadPoolExecutor(4) as ex:
    for o in ex.map(lambda kv: grab(kv[0],kv[1],Resampling.nearest,np.uint8),groups.items()): res.update(o)
  pickle.dump(res,open('trees/wc.pkl','wb')); print('wc',len(res),'of',len(allc))
if 'nir' in what:
  # Every scene rank of each MGRS tile whose footprint holds a cell, least cloudy first, merged until the cell is full
  # (orbit swaths leave whole tiles half empty, so the best scene often has nothing over a given cell).
  sc=json.load(open('scenes.json'))
  def tile_fp(t):
    for r in sc[t][:12]:
      try:
        with rasterio.Env(**ENV):
          with rasterio.open('/vsicurl/'+r[3].replace('TCI.tif','B08.tif')) as s: return t,transform_bounds(s.crs,'EPSG:4326',*s.bounds)
      except Exception: continue
    return t,None
  with cf.ThreadPoolExecutor(12) as ex: fps={t:b for t,b in ex.map(tile_fp,[t for t in sc if sc[t]]) if b}
  acc={c:np.zeros((T,T),np.uint16) for c in allc}
  full=lambda c:(acc[c]==0).mean()<.05
  def job(t):
    b=fps[t]; cs=[c for c in allc if bounds(*c)[0]>=b[0] and bounds(*c)[2]<=b[2] and bounds(*c)[1]>=b[1] and bounds(*c)[3]<=b[3]]
    for r in sc[t][:12]:
      cs=[c for c in cs if not full(c)]
      if not cs: return
      try: got=grab(r[3].replace('TCI.tif','B08.tif'),cs,Resampling.bilinear,np.uint16)
      except Exception: continue
      for c,a in got.items(): m=(acc[c]==0)&(a>0); acc[c][m]=a[m]
  with cf.ThreadPoolExecutor(6) as ex: list(ex.map(job,list(fps)))
  res={c:a for c,a in acc.items() if full(c)}
  pickle.dump(res,open('trees/nir.pkl','wb')); print('nir',len(res),'of',len(allc))
base="https://overturemaps-us-west-2.s3.amazonaws.com/"; REL="release/2026-09-23.0/"; BOX=(10.6,47.2,12.3,49.5)
cs=set(allc)
def hitbox(x0,y0,x1,y1):
  i0,i1=int((x0-W)/CW),int((x1-W)/CW); j0,j1=int((y0-S_)/CH),int((y1-S_)/CH)
  if i1-i0>40 or j1-j0>40: return True                     # huge polygons: keep, they are clipped later
  return any((i,j) in cs for i in range(i0,i1+1) for j in range(j0,j1+1))
def keys(pref):
  out=[]; tok=None
  while True:
    x=urllib.request.urlopen(base+"?list-type=2&prefix="+pref+(("&continuation-token="+urllib.parse.quote(tok)) if tok else ""),timeout=60).read().decode()
    out+=re.findall(r'<Key>([^<]*)</Key>',x); m=re.search(r'<NextContinuationToken>([^<]*)<',x)
    if not m: return out
    tok=m.group(1)
fs=fsspec.filesystem('http')
def scan(k):
  md=pq.ParquetFile(fs.open(base+k,block_size=2**20)).metadata
  ix={md.schema.column(i).path:i for i in range(md.num_columns)}; rows=[]
  for r in range(md.num_row_groups):
    st=lambda n: md.row_group(r).column(ix[n]).statistics
    if st('bbox.xmax').max>=BOX[0] and st('bbox.xmin').min<=BOX[2] and st('bbox.ymax').max>=BOX[1] and st('bbox.ymin').min<=BOX[3]: rows.append(r)
  return k,rows
def job(a):
  k,r=a; f=pq.ParquetFile(fs.open(base+k,block_size=2**22)); have=set(f.schema_arrow.names)
  t=f.read_row_group(r,columns=['bbox','geometry']+[c for c in ('class','subtype','names','source_tags') if c in have])
  bb=t.column('bbox').combine_chunks(); g=lambda n: pc.struct_field(bb,n).to_numpy()
  x0,y0,x1,y1=g('xmin'),g('ymin'),g('xmax'),g('ymax')
  ii=[i for i in range(len(x0)) if x1[i]>=BOX[0] and x0[i]<=BOX[2] and y1[i]>=BOX[1] and y0[i]<=BOX[3] and hitbox(x0[i],y0[i],x1[i],y1[i])]
  d={c:t.column(c).to_pylist() for c in t.column_names if c!='bbox'}
  return [{c:d[c][i] for c in d} for i in ii]
for typ in ('land','land_use'):
  if typ not in what: continue
  with cf.ThreadPoolExecutor(24) as ex: jobs=[(k,r) for k,rows in ex.map(scan,keys(REL+f'theme=base/type={typ}/')) for r in rows]
  res=[]
  with cf.ThreadPoolExecutor(12) as ex:
    for o in ex.map(job,jobs): res+=o
  pickle.dump(res,open(f'trees/ov_{typ}.pkl','wb')); print(typ,len(res))
