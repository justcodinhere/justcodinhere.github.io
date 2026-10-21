# Forest points per pack from the 10 m imagery: dark green pixels below the tree line, on a jittered 40 m grid,
# capped per pack. Stored as uint16 x, y in 4 m steps from the pack's south-west corner, plus a uint8 size.
import json, math, base64, os, numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter, map_coordinates
W,E,S_,N=9.9,12.5,46.9,49.7; GX,GY=150,240; CW,CH=(E-W)/GX,(N-S_)/GY; T=128
coarse=np.load('dem_eq.npy'); KX=111320*math.cos(math.radians(48.0)); KY=110570
rng=np.random.default_rng(7)
CAP=80000
from shapely.geometry import LineString, Point
from shapely.prepared import prep
geo=json.load(open('geo.json'))
mm=lambda lon,lat:(lon*KX,lat*KY)
ROUTE={'munich':'apt_city','inn':'muc_ibk','nue':'muc_nue','neu':'muc_neusch'}
HOT={'munich':[(48.137,11.575)],'inn':[(47.268,11.393),(47.5836,12.1706),(47.4383,11.8933)],'nue':[(49.454,11.077)],'neu':[(47.5576,10.7498),(47.6811,10.9002)]}
for name in ['munich','inn','nue','neu']:
  idx=np.asarray(Image.open(f'packs/{name}-index.png')); atlas=np.asarray(Image.open(f'packs/{name}.jpg').convert('RGB')).astype(np.float32)
  ys,xs=np.where(idx[...,2]>0)
  ox=W+xs.min()*CW; oy=S_+ys.min()*CH
  band=prep(LineString([mm(*p) for p in geo['routes'][ROUTE[name]]]).buffer(750).union(Point(0,0).buffer(1)))
  hot=[Point(mm(lo,la)).buffer(1600) for la,lo in HOT[name]]
  for hh_ in hot: band=prep(band.context.union(hh_))
  pts=[]
  for k in range(len(xs)):
    x,y=int(xs[k]),int(ys[k]); ax,ay=int(idx[y,x,0]),int(idx[y,x,1])
    t=atlas[ay*T:(ay+1)*T,ax*T:(ax+1)*T]
    r,g,b=t[...,0],t[...,1],t[...,2]
    lum=.2126*r+.7152*g+.0722*b
    mask=uniform_filter(((lum<52)&(g>=r*0.95)&(g>=b*0.9)).astype(np.float32),5)>.6
    gy,gx=np.mgrid[1:T:3,1:T:3]; gx=gx+rng.integers(-1,2,gx.shape); gy=gy+rng.integers(-1,2,gy.shape)
    gx=np.clip(gx,0,T-1); gy=np.clip(gy,0,T-1)
    sel=mask[gy,gx]
    lon=W+x*CW+(gx[sel]+.5)/T*CW; lat=S_+y*CH+CH-(gy[sel]+.5)/T*CH
    hh,ww=coarse.shape
    h=map_coordinates(coarse,[(N-lat)/(N-S_)*hh-.5,(lon-W)/(E-W)*ww-.5],order=1)
    keep=(h<1850)&np.array([band.contains(Point(mm(a,b_))) for a,b_ in zip(lon,lat)],bool)
    for a,b_ in zip(lon[keep],lat[keep]): pts.append((a,b_))
  pts=np.array(pts); rng.shuffle(pts)
  if len(pts)>CAP: pts=pts[:CAP]
  X=np.clip(np.round((pts[:,0]-ox)*KX/4),0,65535).astype('<u2'); Y=np.clip(np.round((pts[:,1]-oy)*KY/4),0,65535).astype('<u2')
  Sz=rng.integers(150,256,len(pts)).astype(np.uint8)
  blob=np.column_stack([X,Y]).astype('<u2').tobytes()+Sz.tobytes()
  pk=json.load(open(f'bpacks2/{name}.json')); pk['trees']=dict(ox=ox,oy=oy,kx=KX,ky=KY,n=int(len(pts)),data=base64.b64encode(blob).decode())
  json.dump(pk,open(f'bpacks2/{name}.json','w'),separators=(',',':'))
  print(name,len(pts),os.path.getsize(f'bpacks2/{name}.json'))
