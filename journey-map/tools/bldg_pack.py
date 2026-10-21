import pickle, json, math, numpy as np, shapely, shapely.wkb
from shapely.geometry import LineString, Polygon
from shapely.ops import transform
raw=pickle.load(open('ov/bldg_raw.pkl','rb')); geo=json.load(open('geo.json'))
LAT0=48.0; KX=111320*math.cos(math.radians(LAT0)); KY=110570
def m(lon,lat): return (lon*KX, lat*KY)
routes={k:LineString([m(*p) for p in geo['routes'][k]]) for k in ('apt_city','muc_ibk','muc_nue','muc_neusch')}
packroute={'munich':'apt_city','inn':'muc_ibk','nue':'muc_nue','neu':'muc_neusch'}
packboxes={'munich':{'munich'},'inn':{'munich','ibk','kufstein','hall','rattenberg'},'nue':{'munich','nue'},'neu':{'munich','fuessen','schwangau'}}
LM=[(48.1386,11.5736,70),(48.1374,11.5755,60),(48.1364,11.5757,30),(48.1388,11.5706,50),(47.2692,11.3938,45),(47.2683,11.3956,40),(49.4577,11.0759,90),(49.4509,11.0786,45),(47.5576,10.7498,120),(47.5553,10.7364,60),(47.5836,12.1706,90),(49.4540,11.0775,25)]
LMm=[(m(lo,la),r) for la,lo,r in LM]
recs=[]
for area,wkb,h,fl,cl,name in raw:
  try: g=shapely.wkb.loads(wkb)
  except: continue
  if g.geom_type=='MultiPolygon': g=max(g.geoms,key=lambda p:p.area)
  if g.geom_type!='Polygon': continue
  pm=Polygon([m(x,y) for x,y in g.exterior.coords])
  a=pm.area
  if a<35: continue
  c=pm.centroid
  if any(math.hypot(c.x-p[0],c.y-p[1])<r for p,r in LMm): continue
  ps=pm.simplify(1.2,preserve_topology=True)
  if ps.geom_type!='Polygon' or len(ps.exterior.coords)<4: continue
  co=list(ps.exterior.coords)[:-1]
  if len(co)>16: ps=pm.simplify(3.0); co=list(ps.exterior.coords)[:-1]
  if len(co)<3 or len(co)>24: continue
  if ps.exterior.is_ccw is False: co=co[::-1]
  if h is None: h=(fl*3.0+1.5) if fl else (6.5 if a<120 else 9.5 if a<400 else 12.)
  h=min(float(h),60.)
  recs.append(dict(area=area,a=a,c=(c.x,c.y),co=co,h=h,church=bool(cl in ('church','cathedral','chapel') or (name and ('kirche' in name.lower() or name.startswith('Dom ')))),name=name))
print('recs',len(recs))
import struct, os
os.makedirs('bpacks',exist_ok=True)
for pk in packroute:
  rt=routes[packroute[pk]]
  sel=[]
  for r in recs:
    if r['area'] in packboxes[pk]: sel.append(r); continue
    if r['area']!='corridor' and r['area'] not in packboxes[pk]:
      # town boxes from other packs still count if near this route
      pass
    if r['a']<90: continue
    d=rt.distance(shapely.Point(r['c']))
    if d<450: sel.append(r)
  # origin
  ox=min(r['c'][0] for r in sel); oy=min(r['c'][1] for r in sel)
  buf=[]
  for r in sel:
    co=r['co']; n=len(co)
    x0=int(round((co[0][0]-ox)*2)); y0=int(round((co[0][1]-oy)*2))
    hd=int(round(r['h']*10)) | (0x4000 if r['church'] else 0)
    buf+= [n, hd, x0>>16, x0&0xffff, y0>>16, y0&0xffff]
    px,py=x0,y0
    for x,y in co[1:]:
      xi=int(round((x-ox)*2)); yi=int(round((y-oy)*2)); buf+=[(xi-px)&0xffff,(yi-py)&0xffff]; px,py=xi,yi
  arr=np.array(buf,dtype=np.int64)&0xffff
  data=arr.astype('<u2').tobytes()
  import base64; meta=dict(ox=ox/KX,oy=oy/KY,kx=KX,ky=KY,count=len(sel),data=base64.b64encode(data).decode())
  json.dump(meta,open(f'bpacks/{pk}.json','w'))
  print(pk,len(sel),len(data))
