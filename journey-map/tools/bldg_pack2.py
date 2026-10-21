# Building packs v2: footprints + roof type, ridge frame, heights and colours, plus Overture building parts.
import pickle, json, math, base64, os, re, numpy as np, shapely, shapely.wkb
from shapely.geometry import LineString, Polygon, Point
from shapely.strtree import STRtree
B=pickle.load(open('ov/building_raw2.pkl','rb')); PARTS=pickle.load(open('ov/part_raw2.pkl','rb')); geo=json.load(open('geo.json'))
LAT0=48.0; KX=111320*math.cos(math.radians(LAT0)); KY=110570
m=lambda lon,lat:(lon*KX,lat*KY)
routes={k:LineString([m(*p) for p in geo['routes'][k]]) for k in ('apt_city','muc_ibk','muc_nue','muc_neusch')}
packroute={'munich':'apt_city','inn':'muc_ibk','nue':'muc_nue','neu':'muc_neusch'}
packboxes={'munich':{'munich'},'inn':{'munich','ibk','kufstein','hall','rattenberg'},'nue':{'munich','nue'},'neu':{'munich','fuessen','schwangau'}}
LM=[(48.1386,11.5736,70),(48.1374,11.5755,60),(48.1364,11.5757,30),(48.1388,11.5706,50),(47.2692,11.3938,45),(47.2683,11.3956,40),(49.4577,11.0759,90),(49.4509,11.0786,45),(47.5576,10.7498,120),(47.5553,10.7364,60),(47.5836,12.1706,90),(49.4540,11.0775,25),(47.2686,11.3933,12),(47.2490,11.3995,40),(47.6811,10.9002,60),(49.4545,11.0779,25)]
LMm=[(m(lo,la),r) for la,lo,r in LM]
NAMED={'white':'#f2f0ea','red':'#9c3b2c','darkred':'#7a2a20','brown':'#7a4a32','grey':'#8a8a88','gray':'#8a8a88','darkgrey':'#555555','darkgray':'#555555','black':'#2a2a2a',
 'yellow':'#e0c36a','beige':'#d9c9a3','orange':'#c97a3a','green':'#5d8c78','lightgrey':'#c8c8c4','lightgray':'#c8c8c4','silver':'#b8bcc0','pink':'#d8a4a0','blue':'#4a6a8a','maroon':'#6a2a22','cream':'#efe4c8','tan':'#c8a878'}
def col565(c):
  if not c: return 0
  c=c.strip().lower(); c=NAMED.get(c,c)
  mt=re.fullmatch(r'#?([0-9a-f]{6})',c) or re.fullmatch(r'#?([0-9a-f]{3})',c)
  if not mt: return 0
  h=mt.group(1); h=''.join(ch*2 for ch in h) if len(h)==3 else h
  r,g,b=int(h[0:2],16),int(h[2:4],16),int(h[4:6],16)
  return max(1,((r>>3)<<11)|((g>>2)<<5)|(b>>3))
RT={'flat':0,'gabled':1,'gambrel':1,'saltbox':1,'half_hipped':2,'hipped':2,'mansard':2,'pyramidal':3,'dome':4,'round':4,'onion':5,'skillion':6,'cone':7,'spire':7}
def poly_m(wkb):
  g=shapely.wkb.loads(wkb)
  if g.geom_type=='MultiPolygon': g=max(g.geoms,key=lambda p:p.area)
  if g.geom_type!='Polygon': return None
  return Polygon([m(x,y) for x,y in g.exterior.coords])
def prep(r,part):
  try: pm=poly_m(r['geometry'])
  except Exception: return None
  if pm is None or not pm.is_valid or pm.area<(8 if part else 35): return None
  c=pm.centroid
  if any(math.hypot(c.x-p[0],c.y-p[1])<rr for p,rr in LMm): return None
  ps=pm.simplify(.6 if part else 1.0,preserve_topology=True)
  if ps.geom_type!='Polygon': return None
  co=list(ps.exterior.coords)[:-1]
  if len(co)>20: ps=pm.simplify(2.5); co=list(ps.exterior.coords)[:-1]
  if len(co)<3 or len(co)>28: return None
  if not Polygon(co).exterior.is_ccw: co=co[::-1]
  mrr=ps.minimum_rotated_rectangle; mc=list(mrr.exterior.coords)[:4]
  e1=np.subtract(mc[1],mc[0]); e2=np.subtract(mc[2],mc[1]); l1,l2=np.hypot(*e1),np.hypot(*e2)
  L,W,ax=(l1,l2,e1) if l1>=l2 else (l2,l1,e2)
  ang=math.atan2(ax[1],ax[0])
  a=pm.area; rect=a/max(mrr.area,1)
  shape=(r.get('roof_shape') or '').lower()
  if shape=='' or shape not in RT:
    if part: t=0
    elif a>1800 or rect<.55: t=0 if a>1800 else 2
    else: t=1 if (a<320 and rect>.8) else 2
  else: t=RT[shape]
  if (r.get('roof_orientation') or '')=='across' and t in (1,2,6): ang+=math.pi/2; L,W=W,L
  rh=r.get('roof_height')
  if rh is None:
    rh={0:0,1:.45*W,2:.42*W,3:.5*W,4:.5*W,5:.9*W,6:.2*W,7:1.6*W}[t]
    rh=min(rh,14 if t<4 else 40)
  h=r.get('height'); minh=r.get('min_height') or 0
  if h is None:
    fl=r.get('num_floors')
    eave=(fl*3.0+.5) if fl else (6.5 if a<120 else 9.5 if a<400 else 12.)
    h=eave+rh
  h=min(float(h),160.); rh=min(float(rh),max(0,h-minh-2))
  church=bool(r.get('class') in ('church','cathedral','chapel') or ((r.get('names') or '') and ('kirche' in (r.get('names') or '').lower() or (r.get('names') or '').startswith('Dom '))))
  return dict(area=r['area'],a=a,c=(c.x,c.y),co=co,h=h,minh=float(minh),t=t,rh=rh,ang=ang,cx=mrr.centroid.x,cy=mrr.centroid.y,L=L,W=W,
              rc=col565(r.get('roof_color')),fc=col565(r.get('facade_color')),church=church,part=part,poly=pm)
bl=[x for x in (prep(r,False) for r in B) if x]; pa=[x for x in (prep(r,True) for r in PARTS) if x]
print('buildings',len(bl),'parts',len(pa))
# a building drawn as parts is replaced by its parts
tree=STRtree([p['poly'] for p in pa]); drop=set()
for i,b in enumerate(bl):
  for j in tree.query(b['poly']):
    if pa[j]['poly'].intersection(b['poly']).area>.5*pa[j]['poly'].area: drop.add(i); break
bl=[b for i,b in enumerate(bl) if i not in drop]; print('dropped outlines',len(drop))
recs=bl+pa
os.makedirs('bpacks2',exist_ok=True)
for pk in packroute:
  rt=routes[packroute[pk]]; sel=[]
  for r in recs:
    if r['area'] in packboxes[pk]: sel.append(r); continue
    if r['a']<90 and not r['part']: continue
    if rt.distance(Point(r['c']))<450: sel.append(r)
  ox=min(r['c'][0] for r in sel)-50; oy=min(r['c'][1] for r in sel)-50
  buf=[]
  for r in sel:
    co=r['co']; n=len(co)
    x0=int(round((co[0][0]-ox)*2)); y0=int(round((co[0][1]-oy)*2))
    flags=(1 if r['church'] else 0)|(2 if r['part'] else 0)
    a10=int(round(math.degrees(r['ang'])*10))%3600
    hd=[n,int(r['h']*10),int(r['minh']*10),r['t']|(flags<<8),int(r['rh']*10),a10,
        (int(round((r['cx']-co[0][0])*2)))&0xffff,(int(round((r['cy']-co[0][1])*2)))&0xffff,int(r['L']*2),int(r['W']*2),r['rc'],r['fc'],x0>>16,x0&0xffff,y0>>16,y0&0xffff]
    buf+=hd; px,py=x0,y0
    for x,y in co[1:]:
      xi=int(round((x-ox)*2)); yi=int(round((y-oy)*2)); buf+=[(xi-px)&0xffff,(yi-py)&0xffff]; px,py=xi,yi
  data=(np.array(buf,dtype=np.int64)&0xffff).astype('<u2').tobytes()
  meta=dict(v=2,ox=ox/KX,oy=oy/KY,kx=KX,ky=KY,count=len(sel),data=base64.b64encode(data).decode())
  json.dump(meta,open(f'bpacks2/{pk}.json','w'),separators=(',',':'))
  print(pk,len(sel),len(data))
