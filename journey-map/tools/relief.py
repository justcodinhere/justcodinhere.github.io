# Per-pack relief maps: 48 px per detail cell (~27 m) of terrain normals from 19 m terrarium elevation (z13),
# in the same atlas slots as the 10 m imagery. R,G = normal x,y (exaggerated like the map); B = fine-minus-coarse height.
import math, os, json, numpy as np, urllib.request, concurrent.futures as cf
from PIL import Image
from scipy.ndimage import map_coordinates
W,E,S_,N=9.9,12.5,46.9,49.7; GX,GY=150,240; CW,CH=(E-W)/GX,(N-S_)/GY; T=48; EXAG=1.6; Z=13
coarse=np.load('dem_eq.npy')
def tx(lon): return (lon+180)/360*2**Z
def ty(lat): r=math.radians(lat); return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*2**Z
os.makedirs('dem13',exist_ok=True)
def tile(xy):
  x,y=xy; p=f'dem13/{x}_{y}.png'
  if not os.path.exists(p):
    for k in range(4):
      try: open(p,'wb').write(urllib.request.urlopen(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png',timeout=60).read()); break
      except Exception: pass
  a=np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
  return a[...,0]*256+a[...,1]+a[...,2]/256-32768
cache={}
def get(x,y):
  if (x,y) not in cache: cache[(x,y)]=tile((x,y))
  return cache[(x,y)]
def sample(lons,lats):   # bilinear over z13 tiles
  X=tx_v(lons)*256-.5; Y=ty_v(lats)*256-.5
  out=np.zeros_like(X)
  x0,x1=int(np.floor(X.min()/256)),int(np.floor(X.max()/256)); y0,y1=int(np.floor(Y.min()/256)),int(np.floor(Y.max()/256))
  M=np.zeros(((y1-y0+1)*256,(x1-x0+1)*256),np.float32)
  for xx in range(x0,x1+1):
    for yy in range(y0,y1+1): M[(yy-y0)*256:(yy-y0+1)*256,(xx-x0)*256:(xx-x0+1)*256]=get(xx,yy)
  return map_coordinates(M,[Y-y0*256,X-x0*256],order=1,mode='nearest')
tx_v=np.vectorize(tx); ty_v=np.vectorize(ty)
def coarse_at(lons,lats):
  hh,ww=coarse.shape
  return map_coordinates(coarse,[(N-lats)/(N-S_)*hh-.5,(lons-W)/(E-W)*ww-.5],order=1,mode='nearest')
def cell_relief(x,y):
  lon0=W+x*CW; lat0=S_+y*CH
  ii=(np.arange(-1,T+1)+.5)/T
  LON,LAT=np.meshgrid(lon0+ii*CW, lat0+CH-ii*CH)        # row 0 = north
  H=sample(LON,LAT); H=np.clip(H,0,None)
  lat=lat0+CH/2; dxm=CW*111320*math.cos(math.radians(lat))/T; dym=CH*110570/T
  gx=(H[1:-1,2:]-H[1:-1,:-2])/(2*dxm); gy=(H[:-2,1:-1]-H[2:,1:-1])/(2*dym)   # +y = north
  nx=-gx*EXAG; ny=-gy*EXAG; nz=np.ones_like(nx); L=np.sqrt(nx*nx+ny*ny+1); nx/=L; ny/=L
  res=H[1:-1,1:-1]-coarse_at(LON[1:-1,1:-1],LAT[1:-1,1:-1])
  return np.dstack([np.clip((nx*.5+.5)*255,0,255),np.clip((ny*.5+.5)*255,0,255),np.clip(128+res/2,0,255)]).astype(np.uint8)
for name in ['munich','inn','nue','neu']:
  idx=np.asarray(Image.open(f'packs/{name}-index.png'))
  ys,xs=np.where(idx[...,2]>0)
  slots=[(int(xs[k]),int(ys[k]),int(idx[ys[k],xs[k],0]),int(idx[ys[k],xs[k],1])) for k in range(len(xs))]
  rows=max(s[3] for s in slots)+1
  atlas=np.zeros((rows*T,32*T,3),np.uint8); atlas[...,0]=128; atlas[...,1]=128; atlas[...,2]=128
  # prefetch tiles in parallel
  need=set()
  for x,y,_,_ in slots:
    for lon in (W+x*CW,W+(x+1)*CW):
      for lat in (S_+y*CH,S_+(y+1)*CH): need.add((int(tx(lon)),int(ty(lat))))
  with cf.ThreadPoolExecutor(16) as ex: list(ex.map(tile,need))
  for x,y,ax,ay in slots: atlas[ay*T:(ay+1)*T,ax*T:(ax+1)*T]=cell_relief(x,y)
  Image.fromarray(atlas).save(f'packs/{name}-relief.jpg',quality=92)
  print(name,len(slots),atlas.shape,os.path.getsize(f'packs/{name}-relief.jpg'),flush=True)
