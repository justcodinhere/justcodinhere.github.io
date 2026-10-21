import json, numpy as np
from scipy.ndimage import uniform_filter1d, minimum_filter
H=np.load('dem_eq.npy'); W,E,S_,N=9.9,12.5,46.9,49.7; hh,ww=H.shape
def toPix(lon,lat): return (lon-W)/(E-W)*ww, (N-lat)/(N-S_)*hh
def toLL(x,y): return W+x/ww*(E-W), N-y/hh*(N-S_)
def densify(pts,step_km=.25):
  out=[]
  for (a,b),(c,d) in zip(pts,pts[1:]):
    km=np.hypot((c-a)*74.5,(d-b)*111.2); n=max(1,int(np.ceil(km/step_km)))
    for k in range(n): out.append([a+(c-a)*k/n,b+(d-b)*k/n])
  out.append(pts[-1]); return np.array(out)
def snap(pts,rad_km,only=None):
  P=densify(pts); Q=P.copy()
  pxkm=(E-W)*74.5/ww  # km per px horizontally (~0.15)
  r=int(rad_km/pxkm)
  for i,(lon,lat) in enumerate(P):
    if only and not only(lon,lat): continue
    x,y=toPix(lon,lat); xi,yi=int(x),int(y)
    x0,x1=max(0,xi-r),min(ww,xi+r+1); y0,y1=max(0,yi-r),min(hh,yi+r+1)
    if x1-x0<3 or y1-y0<3: continue
    win=H[y0:y1,x0:x1]
    yy,xx=np.mgrid[y0:y1,x0:x1]
    dist=np.hypot(xx-x,(yy-y)*(110.57/74.5)*((N-S_)/hh)/((E-W)/ww)*0+ (yy-y)*0)  # placeholder
    dist=np.hypot((xx-x)*pxkm,(yy-y)*(N-S_)*111.2/hh)
    cost=win+dist*8.0   # prefer low ground, mild penalty for moving far
    cost[dist>rad_km]=1e9
    k=np.unravel_index(np.argmin(cost),cost.shape)
    Q[i]=toLL(xx[k]+.5,yy[k]+.5)
  # smooth
  Q[:,0]=uniform_filter1d(Q[:,0],9,mode='nearest'); Q[:,1]=uniform_filter1d(Q[:,1],9,mode='nearest')
  Q[0]=P[0]; Q[-1]=P[-1]
  return Q
def rdp(pts,eps):
  pts=np.array(pts)
  if len(pts)<3: return pts.tolist()
  a,b=pts[0],pts[-1]; ab=b-a; L=np.hypot(*ab)+1e-12; q=pts-a
  d=np.abs(ab[0]*q[:,1]-ab[1]*q[:,0])/L; i=np.argmax(d)
  if d[i]>eps: return rdp(pts[:i+1],eps)[:-1]+rdp(pts[i:],eps)
  return [a.tolist(),b.tolist()]
g=json.load(open('geo.json'))
for rv in g['rivers']:
  rad={'Inn':2.2,'Salzach':1.8,'Isar':1.5,'Donau':1.0}[rv['name']]
  rv['pts']=[[round(a,5),round(b,5)] for a,b in rdp(snap(rv['pts'],rad),0.0006)]
  print(rv['name'],len(rv['pts']))
r=g['routes']['muc_ibk']
g['routes']['muc_ibk']=[[round(a,5),round(b,5)] for a,b in rdp(snap(r,1.0,only=lambda lon,lat: lat<47.72),0.0006)]
print('muc_ibk',len(g['routes']['muc_ibk']))
json.dump(g,open('geo_snapped.json','w'),separators=(',',':'))
# debug image around Innsbruck
from PIL import Image, ImageDraw
im=Image.open('sat_ibk.jpg').convert('RGB'); dr=ImageDraw.Draw(im)
IW,IE,IS,IN=11.0,11.8,47.15,47.45
f=lambda c:((c[0]-IW)/(IE-IW)*im.width,(IN-c[1])/(IN-IS)*im.height)
old=json.load(open('geo.json'))
for rv in old['rivers']: dr.line([f(c) for c in rv['pts']],fill=(255,0,0),width=4)
for rv in g['rivers']: dr.line([f(c) for c in rv['pts']],fill=(0,255,255),width=4)
dr.line([f(c) for c in g['routes']['muc_ibk']],fill=(255,0,255),width=4)
im.crop((300,150,1800,900)).resize((1000,500)).save('snap_dbg.png')
