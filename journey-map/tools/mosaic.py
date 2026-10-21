import json, numpy as np, rasterio, sys
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from PIL import Image
import concurrent.futures as cf
W,E,Sth,N=[float(v) for v in sys.argv[1:5]]; OW,OH=int(sys.argv[5]),int(sys.argv[6]); ovl=int(sys.argv[7]); out=sys.argv[8]
dst_t=from_bounds(W,Sth,E,N,OW,OH)
sc=json.load(open('scenes.json'))
jobs=[]
for t,lst in sc.items():
  for rank,(cc,_,sid,url) in enumerate(lst[:12]): jobs.append((rank,cc,sid,url))
def run(j):
  rank,cc,sid,url=j
  dst=np.zeros((3,OH,OW),np.uint8)
  try:
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_MULTIRANGE='YES',GDAL_CACHEMAX=512):
      with rasterio.open('/vsicurl/'+url, overview_level=ovl) as src:
        for b in range(3):
          reproject(rasterio.band(src,b+1),dst[b],dst_transform=dst_t,dst_crs='EPSG:4326',resampling=Resampling.bilinear,src_nodata=0,dst_nodata=0)
  except Exception as e: print('ERR',sid,e,flush=True); return j,None
  print('ok',sid,flush=True); return j,dst
res=[]
with cf.ThreadPoolExecutor(8) as ex:
  for j,d in ex.map(run,jobs):
    if d is not None: res.append((j[0],j[1],d))
res.sort(key=lambda r:(r[0],r[1]))
M=np.zeros((3,OH,OW),np.uint8); filled=np.zeros((OH,OW),bool)
for _,_,d in res:
  valid=(d.sum(0)>0)&~filled
  # erode valid edges a bit to avoid dark fringe
  M[:,valid]=d[:,valid]; filled|=valid
print('unfilled',(~filled).mean())
Image.fromarray(M.transpose(1,2,0)).save(out,quality=86)
