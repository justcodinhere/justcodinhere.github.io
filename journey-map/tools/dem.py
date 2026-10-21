import math, io, urllib.request, numpy as np, concurrent.futures as cf, os
from PIL import Image
W,E,Sth,N=9.9,12.5,46.9,49.7
z=11
def tx(lon): return (lon+180)/360*2**z
def ty(lat):
  r=math.radians(lat); return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*2**z
x0,x1=int(tx(W)),int(tx(E)); y0,y1=int(ty(N)),int(ty(Sth))
os.makedirs('dem',exist_ok=True)
def get(xy):
  x,y=xy; p=f'dem/{z}_{x}_{y}.png'
  if not os.path.exists(p):
    open(p,'wb').write(urllib.request.urlopen(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',timeout=60).read())
  return p
jobs=[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]
with cf.ThreadPoolExecutor(16) as ex: list(ex.map(get,jobs))
nx,ny=x1-x0+1,y1-y0+1
M=np.zeros((ny*256,nx*256),np.float32)
for x,y in jobs:
  a=np.asarray(Image.open(f'dem/{z}_{x}_{y}.png').convert('RGB')).astype(np.float32)
  M[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]=a[...,0]*256+a[...,1]+a[...,2]/256-32768
np.save('dem_merc.npy',M); print(M.shape, M.min(), M.max(), x0,y0)
# resample to equirectangular
OW,OH=1280,1920
lons=W+(np.arange(OW)+.5)/OW*(E-W); lats=N-(np.arange(OH)+.5)/OH*(N-Sth)
px=np.array([tx(l) for l in lons])-x0; py=np.array([ty(l) for l in lats])-y0
px*=256; py*=256
from scipy.ndimage import map_coordinates
gx,gy=np.meshgrid(px-.5,py-.5)
H=map_coordinates(M,[gy,gx],order=1)
H=np.clip(H,0,None)
np.save('dem_eq.npy',H)
v=np.clip(np.round(H),0,65535).astype(np.uint16)
rgb=np.dstack([(v>>8).astype(np.uint8),(v&255).astype(np.uint8),np.zeros_like(v,np.uint8)])
Image.fromarray(rgb).save('height.png',optimize=True)
print(os.path.getsize('height.png'))
