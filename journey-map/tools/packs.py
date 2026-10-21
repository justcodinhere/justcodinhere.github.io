import json, numpy as np, rasterio, sys, os, math, concurrent.futures as cf
from rasterio.vrt import WarpedVRT
from rasterio.transform import from_bounds
from rasterio.enums import Resampling
from PIL import Image
W,E,S_,N=9.9,12.5,46.9,49.7; GX,GY=150,240; CW,CH=(E-W)/GX,(N-S_)/GY; T=128
geo=json.load(open('geo.json')); sc=json.load(open('scenes.json'))
def cells_route(pts,rkm,rkm_alps=None):
  out=set()
  for (a,b),(c,d) in zip(pts,pts[1:]):
    km=math.hypot((c-a)*74.5,(d-b)*111.2); n=max(1,int(km/0.4))
    for k in range(n+1):
      lon=a+(c-a)*k/n; lat=b+(d-b)*k/n
      r=rkm_alps if (rkm_alps and lat<47.75) else rkm
      for dx in np.arange(-r,r+.01,.5):
        for dy in np.arange(-r,r+.01,.5):
          if dx*dx+dy*dy>r*r: continue
          x=int((lon+dx/74.5-W)/CW); y=int((lat+dy/111.2-S_)/CH)
          if 0<=x<GX and 0<=y<GY: out.add((x,y))
  return out
def cells_box(w,e,s,n):
  return {(x,y) for x in range(int((w-W)/CW),int((e-W)/CW)+1) for y in range(int((s-S_)/CH),int((n-S_)/CH)+1)}
R=geo['routes']
MUC=cells_box(11.50,11.66,48.105,48.175)
packs={
 'munich': cells_route(R['apt_city'],1.6)|MUC|cells_box(11.73,11.84,48.33,48.38),
 'inn': cells_route(R['muc_ibk'],1.4,3.2)|MUC|cells_box(11.33,11.47,47.215,47.32),
 'nue': cells_route(R['muc_nue'],1.4)|MUC|cells_box(11.02,11.14,49.42,49.48),
 'neu': cells_route(R['muc_neusch'],1.4)|MUC|cells_box(10.64,10.82,47.52,47.63),
}
for k,v in packs.items(): print(k,len(v))
# all cells needed
allc=set().union(*packs.values())
blocks={}
for x,y in allc: blocks.setdefault((x//8,y//8),set()).add((x,y))
print('cells',len(allc),'blocks',len(blocks))
scenes=[]
for t,lst in sc.items():
  for cc,_,sid,url in lst[:12]: scenes.append((cc,sid,url))
scenes.sort()
# bounds of each scene tile (approx) via rasterio once (cache)
os.makedirs('tiles',exist_ok=True)
bcache={}
def sbounds(url):
  if url in bcache: return bcache[url]
  try:
    with rasterio.open('/vsicurl/'+url) as s:
      from rasterio.warp import transform_bounds
      b=transform_bounds(s.crs,'EPSG:4326',*s.bounds)
  except Exception as e: b=None
  bcache[url]=b; return b
ENV=dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_MULTIRANGE='YES',GDAL_CACHEMAX=256,VSI_CACHE='TRUE')
with rasterio.Env(**ENV):
  with cf.ThreadPoolExecutor(16) as ex: list(ex.map(sbounds,[u for _,_,u in scenes]))
def doblock(bk):
  bx,by=bk; p=f'tiles/b_{bx}_{by}.npy'
  if os.path.exists(p): return bk
  w=W+bx*8*CW; s=S_+by*8*CH; e=w+8*CW; n=s+8*CH
  dst=np.zeros((3,8*T,8*T),np.uint8); filled=np.zeros((8*T,8*T),bool)
  tr=from_bounds(w,s,e,n,8*T,8*T)
  with rasterio.Env(**ENV):
    for cc,sid,url in scenes:
      b=bcache.get(url)
      if not b or b[2]<w or b[0]>e or b[3]<s or b[1]>n: continue
      try:
        with rasterio.open('/vsicurl/'+url) as src:
          with WarpedVRT(src,crs='EPSG:4326',transform=tr,width=8*T,height=8*T,resampling=Resampling.bilinear,src_nodata=0,nodata=0) as v:
            a=v.read()
      except Exception as ex_: continue
      ok=(a.sum(0)>0)&~filled
      dst[:,ok]=a[:,ok]; filled|=ok
      if filled.mean()>0.999: break
  np.save(p,dst); return bk
done=0
with cf.ThreadPoolExecutor(10) as ex:
  for bk in ex.map(doblock,list(blocks)):
    done+=1
    if done%20==0: print('blocks',done,'/',len(blocks),flush=True)
# assemble packs
os.makedirs('packs',exist_ok=True)
for name,cells in packs.items():
  cells=sorted(cells,key=lambda c:(c[1],c[0]))
  cols=32; rows=math.ceil(len(cells)/cols)
  atlas=np.zeros((rows*T,cols*T,3),np.uint8); idx=np.zeros((GY,GX,4),np.uint8)
  cache={}
  for i,(x,y) in enumerate(cells):
    bk=(x//8,y//8)
    if bk not in cache: cache[bk]=np.load(f'tiles/b_{bk[0]}_{bk[1]}.npy')
    b=cache[bk]; lx,ly=x%8,y%8
    tile=b[:,(7-ly)*T:(8-ly)*T,lx*T:(lx+1)*T].transpose(1,2,0)  # north-up rows
    ax,ay=i%cols,i//cols
    atlas[ay*T:(ay+1)*T,ax*T:(ax+1)*T]=tile
    idx[y,x]=[ax,ay,255,0]   # row y counted from south
  Image.fromarray(atlas).save(f'packs/{name}.jpg',quality=82)
  Image.fromarray(idx).save(f'packs/{name}-index.png')
  print(name,len(cells),atlas.shape,os.path.getsize(f'packs/{name}.jpg'))
