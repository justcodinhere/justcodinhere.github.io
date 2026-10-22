# Building packs v3: footprints + roof type, ridge frame, heights and colours, plus Overture building parts,
# and what the facade shader needs: building class, floors, a regional style, and per-edge masks for party walls
# (shared with a neighbour: blank, no eaves), street fronts (shopfronts) and the Innsbruck Lauben (arcades).
# Run from the data dir: needs ov/building_raw2.pkl, ov/part_raw2.pkl, geo.json; fetches ov/streets.pkl once.
import pickle, json, math, base64, os, re, numpy as np, shapely, shapely.wkb
from shapely.geometry import LineString, Polygon, Point
from shapely.strtree import STRtree
B=pickle.load(open('ov/building_raw2.pkl','rb')); PARTS=pickle.load(open('ov/part_raw2.pkl','rb')); geo=json.load(open('geo.json'))
LAT0=48.0; KX=111320*math.cos(math.radians(LAT0)); KY=110570
m=lambda lon,lat:(lon*KX,lat*KY)
routes={k:LineString([m(*p) for p in geo['routes'][k]]) for k in ('apt_city','muc_ibk','muc_nue','muc_neusch')}
packroute={'munich':'apt_city','inn':'muc_ibk','nue':'muc_nue','neu':'muc_neusch'}
packboxes={'munich':{'munich'},'inn':{'munich','ibk','kufstein','hall','rattenberg'},'nue':{'munich','nue'},'neu':{'munich','fuessen','schwangau'}}
# (no landmark holes: js/buildings.js skips the footprints inside each landmark's mask at runtime, assets/landmarks)
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
# building class -> 0 unknown, 1 house, 2 apartments, 3 small utility (no windows), 4 shops/offices, 5 industrial/halls, 6 farm buildings, 7 civic
CLS={**{k:1 for k in ('house','detached','semidetached_house','terrace','bungalow','farm','cabin')},
     **{k:2 for k in ('apartments','residential','dormitory','hotel')},
     **{k:3 for k in ('garage','garages','shed','carport','roof','hut','allotment_house','service','shelter','outbuilding','toilets','transformer_tower','kiosk','storage_tank','slurry_tank','digester','silo','greenhouse')},
     **{k:4 for k in ('retail','office','commercial','supermarket')},
     **{k:5 for k in ('industrial','warehouse','manufacture','parking','sports_centre','sports_hall','grandstand','transportation','train_station')},
     **{k:6 for k in ('barn','farm_auxiliary','cowshed','stable')},
     **{k:7 for k in ('school','kindergarten','hospital','university','college','public','civic','government','library','fire_station','monastery')}}
# regional styles: 0 town plaster, 1 pastel old town (Innsbruck, Hall, Rattenberg, Kufstein, Fuessen), 2 Mariahilf / St. Nikolaus river row,
# 3 Munich Altstadt, 4 Nuremberg Altstadt, 5 Alpine farmhouse village, 6 lowland village, 7 modern / big boxes
PASTEL=[(47.2680,11.3935,430),(47.2832,11.5085,260),(47.4383,11.8933,230),(47.5830,12.1693,260),(47.5697,10.7000,300)]
def ell(lat,lon,la0,lo0,a_km,b_km): return ((lon-lo0)*74.5/a_km)**2+((lat-la0)*111.2/b_km)**2<1
def style_of(lat,lon,cls,a,fl,h,row):   # h: eave height
  if row: return 2
  if any(math.hypot((lon-lo)*75.4,(lat-la)*111.2)*1000<r for la,lo,r in PASTEL): return 1
  if ell(lat,lon,48.1372,11.5755,.85,.70): return 3
  if ell(lat,lon,49.4532,11.0772,.95,.62): return 4
  if cls in (4,5) or a>1500 or (fl or 0)>=7 or h>21: return 7
  city=ell(lat,lon,48.14,11.57,9,7) or ell(lat,lon,49.45,11.08,6,5) or ell(lat,lon,47.265,11.39,4.5,2.2)
  if city: return 0
  small=a<520 and (fl or 0)<=3 and h<11.5 and cls in (0,1,2,6)
  if lat<47.80 and small: return 5
  return 6 if small else 0
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
  rh=r.get('roof_height'); rhk=rh is not None
  if rh is None:
    rh={0:0,1:.45*W,2:.42*W,3:.5*W,4:.5*W,5:.9*W,6:.2*W,7:1.6*W}[t]
    rh=min(rh,14 if t<4 else 40)
  h=r.get('height'); minh=r.get('min_height') or 0
  fl=r.get('num_floors')
  if h is None:
    eave=(fl*3.0+.5) if fl else (6.5 if a<120 else 9.5 if a<400 else 12.)
    h=eave+rh
  h=min(float(h),160.); rh=min(float(rh),max(0,h-minh-2))
  church=bool(r.get('class') in ('church','cathedral','chapel') or ((r.get('names') or '') and ('kirche' in (r.get('names') or '').lower() or (r.get('names') or '').startswith('Dom '))))
  return dict(area=r['area'],a=a,c=(c.x,c.y),co=co,h=h,minh=float(minh),t=t,rh=rh,rhk=rhk,ang=ang,cx=mrr.centroid.x,cy=mrr.centroid.y,L=L,W=W,
              rc=col565(r.get('roof_color')),fc=col565(r.get('facade_color')),church=church,part=part,poly=pm,
              cls=0 if part else CLS.get(r.get('class'),0),fl=int(min(31,fl)) if fl else 0)
bl=[x for x in (prep(r,False) for r in B) if x]; pa=[x for x in (prep(r,True) for r in PARTS) if x]
print('buildings',len(bl),'parts',len(pa))
# a building drawn as parts is replaced by its parts
tree=STRtree([p['poly'] for p in pa]); drop=set()
for i,b in enumerate(bl):
  for j in tree.query(b['poly']):
    if pa[j]['poly'].intersection(b['poly']).area>.5*pa[j]['poly'].area: drop.add(i); break
bl=[b for i,b in enumerate(bl) if i not in drop]; print('dropped outlines',len(drop))
recs=bl+pa

# ---- per-edge masks ----
polys=[Polygon(r['co']) for r in recs]; ptree=STRtree(polys); H=np.array([r['h']-r['rh'] for r in recs])
E_own=[];E_a=[];E_b=[]
for k,r in enumerate(recs):
  co=r['co']; n=len(co)
  for j in range(n): E_own.append(k); E_a.append(co[j]); E_b.append(co[(j+1)%n])
E_own=np.array(E_own); A=np.array(E_a); Bp=np.array(E_b); D=Bp-A; Ln=np.maximum(np.hypot(D[:,0],D[:,1]),1e-6)
Nrm=np.column_stack([D[:,1],-D[:,0]])/Ln[:,None]          # outward normal of a CCW ring
def inside_other(P,own):
  """for points P (k,2) owned by building own (k,), height of the tallest other footprint containing each point (0 if none)"""
  pi,gi=ptree.query(shapely.points(P),predicate='within'); out=np.zeros(len(P))
  ok=gi!=own[pi]; np.maximum.at(out,pi[ok],H[gi[ok]]); return out
ts=np.array([.2,.5,.8]); hits=np.zeros(len(A))
for t in ts:
  P=A+D*t+Nrm*.9; io=inside_other(P,E_own); hits+=(io>0)&(io>=np.minimum(.6*H[E_own],H[E_own]-1.5))   # a neighbour of at least similar height
party=hits>=2
print('edges',len(A),'party',party.sum())
SBOX=[(11.548,11.600,48.124,48.150),(11.375,11.412,47.255,47.278),(11.064,11.094,49.444,49.462),(10.690,10.712,47.562,47.575),(11.500,11.515,47.278,47.286),(12.155,12.180,47.575,47.592),(11.890,11.898,47.436,47.442)]
def fetch_streets():
  # Overture road segments in the old-town boxes (row groups picked by their bbox statistics, as in ov_index.py)
  import fsspec, pyarrow.parquet as pq, pyarrow.compute as pc, urllib.request, urllib.parse, concurrent.futures as cf
  base="https://overturemaps-us-west-2.s3.amazonaws.com/"; pref="release/2026-09-23.0/theme=transportation/type=segment/"; keys=[]; tok=None
  while True:
    x=urllib.request.urlopen(base+"?list-type=2&prefix="+pref+(("&continuation-token="+urllib.parse.quote(tok)) if tok else ""),timeout=60).read().decode()
    keys+=re.findall(r'<Key>([^<]*)</Key>',x); mt=re.search(r'<NextContinuationToken>([^<]*)<',x)
    if not mt: break
    tok=mt.group(1)
  fs=fsspec.filesystem('http'); hit=lambda x0,x1,y0,y1: any(x1>=w and x0<=e and y1>=s_ and y0<=n_ for w,e,s_,n_ in SBOX)
  def scan(k):
    try:
      f=pq.ParquetFile(fs.open(base+k,block_size=2**20)); md=f.metadata; ix={md.schema.column(i).path:i for i in range(md.num_columns)}
      st=lambda rg,c: rg.column(ix[c]).statistics
      return [(k,r) for r in range(md.num_row_groups) if hit(st(md.row_group(r),'bbox.xmin').min,st(md.row_group(r),'bbox.xmax').max,st(md.row_group(r),'bbox.ymin').min,st(md.row_group(r),'bbox.ymax').max)]
    except Exception: return []
  def rg(a):
    t=pq.ParquetFile(fs.open(base+a[0],block_size=2**22)).read_row_group(a[1],columns=['bbox','geometry','subtype','class','names'])
    bb=t.column('bbox').combine_chunks(); X0,X1,Y0,Y1=(pc.struct_field(bb,c).to_numpy() for c in ('xmin','xmax','ymin','ymax'))
    sub,cl,nm,g=(t.column(c).to_pylist() for c in ('subtype','class','names','geometry'))
    return [dict(name=(nm[i] or {}).get('primary'),cls=cl[i],coords=list(shapely.wkb.loads(g[i]).coords)) for i in range(len(X0)) if sub[i]=='road' and hit(X0[i],X1[i],Y0[i],Y1[i])]
  with cf.ThreadPoolExecutor(24) as ex: jobs=[j for js in ex.map(scan,keys) for j in js]
  with cf.ThreadPoolExecutor(12) as ex: res=[s for o in ex.map(rg,jobs) for s in o]
  pickle.dump(res,open('ov/streets.pkl','wb')); return res
S=pickle.load(open('ov/streets.pkl','rb')) if os.path.exists('ov/streets.pkl') else fetch_streets()
ROAD={'pedestrian','living_street','residential','tertiary','secondary','primary','unclassified','service','unknown','footway'}
lines=[LineString([m(*p) for p in s['coords']]) for s in S if s['cls'] in ROAD and len(s['coords'])>1]
stree=STRtree(lines)
# street front: walking out along the normal you reach a street centreline (within 3.5 m) before entering another building
mid=A+D*.5; lonm=mid[:,0]/KX; latm=mid[:,1]/KY
inbox=np.zeros(len(A),bool)
for w,e,s_,n_ in SBOX: inbox|=(lonm>w)&(lonm<e)&(latm>s_)&(latm<n_)
street=np.zeros(len(A),bool); blocked=np.zeros(len(A),bool)
for d in (1.5,4,7,10,13,16):
  P=mid+Nrm*d
  near=np.zeros(len(A),bool); qi=stree.query_nearest(shapely.points(P),max_distance=3.5,return_distance=False)[0]; near[qi]=True
  street|=near&~blocked; blocked|=inside_other(P,E_own)>0
street&=inbox&~party&(Ln>2.5)
# Lauben: the arcaded fronts on Herzog-Friedrich-Strasse in Innsbruck's old town (Goldenes Dachl down to the Burggraben)
HF=LineString([m(11.39321,47.26852),m(11.39329,47.26827),m(11.39332,47.26816),m(11.39337,47.26799),m(11.39357,47.26728)])
arc=street&(shapely.distance(shapely.points(mid),HF)<11)&(np.abs((D/Ln[:,None])@np.array([.27,.96]))>.7)
print('street fronts',street.sum(),'arcade',arc.sum())
# Mariahilf / St. Nikolaus: the first row of houses along the north bank, facing the old town across the Inn
ROW=[LineString([m(*p) for p in s['coords']]) for s in S if s['name'] in ('Mariahilfstraße','Innstraße') and all(11.38<p[0]<11.40 and p[1]<47.2735 for p in s['coords'])]
rowu=shapely.union_all(ROW) if ROW else None
off=0; emask={}
for k,r in enumerate(recs):
  n=len(r['co']); sl=slice(off,off+n); off+=n
  lon,lat=r['c'][0]/KX,r['c'][1]/KY
  row=rowu is not None and not r['part'] and rowu.distance(Point(r['c']))<26
  r['style']=style_of(lat,lon,r['cls'],r['a'],r['fl'],r['h']-r['rh'],row)
  r['party']=party[sl]; r['street']=street[sl]; r['arc']=arc[sl]
def words(bits):
  out=[]
  for i in range(0,len(bits),16): out.append(sum(1<<j for j,b in enumerate(bits[i:i+16]) if b))
  return out
os.makedirs('bpacks2',exist_ok=True)
for pk in packroute:
  rt=routes[packroute[pk]]; sel=[]
  for r in recs:
    if r['area'] in packboxes[pk]: sel.append(r); continue
    if r['a']<90 and not r['part']: continue
    if rt.distance(Point(r['c']))<450: sel.append(r)
  ox=min(r['c'][0] for r in sel)-50; oy=min(r['c'][1] for r in sel)-50
  buf=[]; st=np.zeros(8,int)
  for r in sel:
    co=r['co']; n=len(co)
    x0=int(round((co[0][0]-ox)*2)); y0=int(round((co[0][1]-oy)*2))
    flags=(1 if r['church'] else 0)|(2 if r['part'] else 0)
    a10=int(round(math.degrees(r['ang'])*10))%3600
    hs=bool(r['street'].any()); ha=bool(r['arc'].any()); st[r['style']]+=1
    info=r['cls']|(r['style']<<3)|(r['fl']<<7)|(int(r['rhk'])<<12)|(int(hs)<<13)|(int(ha)<<14)
    hd=[n,int(r['h']*10),int(r['minh']*10),r['t']|(flags<<8),int(r['rh']*10),a10,
        (int(round((r['cx']-co[0][0])*2)))&0xffff,(int(round((r['cy']-co[0][1])*2)))&0xffff,int(r['L']*2),int(r['W']*2),r['rc'],r['fc'],x0>>16,x0&0xffff,y0>>16,y0&0xffff,info]
    buf+=hd; px,py=x0,y0
    for x,y in co[1:]:
      xi=int(round((x-ox)*2)); yi=int(round((y-oy)*2)); buf+=[(xi-px)&0xffff,(yi-py)&0xffff]; px,py=xi,yi
    buf+=words(r['party'])
    if hs: buf+=words(r['street'])
    if ha: buf+=words(r['arc'])
  data=(np.array(buf,dtype=np.int64)&0xffff).astype('<u2').tobytes()
  meta=dict(v=3,ox=ox/KX,oy=oy/KY,kx=KX,ky=KY,count=len(sel),data=base64.b64encode(data).decode())
  json.dump(meta,open(f'bpacks2/{pk}.json','w'),separators=(',',':'))
  print(pk,len(sel),len(data),'styles',st.tolist())
