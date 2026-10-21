# Mid band: 20 m Sentinel-2 tiles (64 px per detail cell) out to ~6 km either side of each route,
# for cells the 10 m corridor doesn't already cover. Written into the same index (B=128) with its own atlas.
import json, numpy as np, rasterio, os, math, concurrent.futures as cf
from rasterio.vrt import WarpedVRT
from rasterio.transform import from_bounds
from rasterio.enums import Resampling
from PIL import Image
exec(open('../packs.py').read().split("for k,v in packs.items()")[0])   # reuse grid, scenes and route-cell helpers
T2=64
MID={'munich':cells_route(R['apt_city'],5.0),'inn':cells_route(R['muc_ibk'],6.0,4.5),'nue':cells_route(R['muc_nue'],6.0),'neu':cells_route(R['muc_neusch'],6.0,4.5)}
scenes=[]
for t,lst in sc.items():
  for cc,_,sid,url in lst[:12]: scenes.append((cc,sid,url))
scenes.sort()
ENV=dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_MULTIRANGE='YES',GDAL_CACHEMAX=256,VSI_CACHE='TRUE')
bc=json.load(open('scene_bounds.json')) if os.path.exists('scene_bounds.json') else {}
def sb(url):
  if url in bc: return bc[url]
  try:
    with rasterio.Env(**ENV), rasterio.open('/vsicurl/'+url) as s:
      from rasterio.warp import transform_bounds; b=list(transform_bounds(s.crs,'EPSG:4326',*s.bounds))
  except Exception: b=None
  bc[url]=b; return b
with cf.ThreadPoolExecutor(16) as ex: list(ex.map(sb,[u for _,_,u in scenes]))
json.dump(bc,open('scene_bounds.json','w'))
os.makedirs('tiles_mid',exist_ok=True)
def block(bk):
  bx,by=bk; p=f'tiles_mid/b_{bx}_{by}.npy'
  if os.path.exists(p): return
  w=W+bx*8*CW; s=S_+by*8*CH; e=w+8*CW; n=s+8*CH
  dst=np.zeros((3,8*T2,8*T2),np.uint8); filled=np.zeros((8*T2,8*T2),bool)
  tr=from_bounds(w,s,e,n,8*T2,8*T2)
  with rasterio.Env(**ENV):
    for cc,sid,url in scenes:
      b=bc.get(url)
      if not b or b[2]<w or b[0]>e or b[3]<s or b[1]>n: continue
      try:
        with rasterio.open('/vsicurl/'+url,overview_level=0) as src, WarpedVRT(src,crs='EPSG:4326',transform=tr,width=8*T2,height=8*T2,resampling=Resampling.bilinear,src_nodata=0,nodata=0) as v:
          a=v.read()
      except Exception: continue
      ok=(a.sum(0)>0)&~filled; dst[:,ok]=a[:,ok]; filled|=ok
      if filled.mean()>.999: break
  np.save(p,dst)
for name in MID:
  idx=np.array(Image.open(f'packs/{name}-index.png'))
  cells=sorted([c for c in MID[name] if idx[c[1],c[0],2]==0],key=lambda c:(c[1],c[0]))
  blocks=sorted({(x//8,y//8) for x,y in cells})
  with cf.ThreadPoolExecutor(10) as ex: list(ex.map(block,blocks))
  cols=64; rows=math.ceil(len(cells)/cols)
  atlas=np.zeros((rows*T2,cols*T2,3),np.uint8); cache={}
  for i,(x,y) in enumerate(cells):
    bk=(x//8,y//8)
    if bk not in cache: cache[bk]=np.load(f'tiles_mid/b_{bk[0]}_{bk[1]}.npy')
    b=cache[bk]; lx,ly=x%8,y%8
    ax,ay=i%cols,i//cols
    atlas[ay*T2:(ay+1)*T2,ax*T2:(ax+1)*T2]=b[:,(7-ly)*T2:(8-ly)*T2,lx*T2:(lx+1)*T2].transpose(1,2,0)
    idx[y,x]=[ax,ay,128,255]
  Image.fromarray(atlas).save(f'packs/{name}-mid.jpg',quality=84)
  Image.fromarray(idx).save(f'packs/{name}-index.png')
  print(name,len(cells),atlas.shape,os.path.getsize(f'packs/{name}-mid.jpg'),flush=True)
