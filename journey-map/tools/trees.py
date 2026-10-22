# Trees per pack, by species. Forest stands: ESA WorldCover tree cover in the 10 m cells on a jittered 40 m grid, leaf
# type from summer Sentinel-2 near infrared (broadleaf crowns are much brighter than conifers) and OSM woods' leaf_type,
# species by region (Franconian pine forests, spruce on the Bavarian plain and in the Alps), elevation and aspect (larch
# on sunny Alpine slopes and towards the tree line, stone pine and dwarf mountain pine at the top), riverside willows and
# poplars. Town, park, avenue and riverbank trees: OpenStreetMap trees and tree rows (genus / leaf_type / height when
# tagged), plus WorldCover's scattered tree pixels where OSM has none, kept clear of buildings.
# Record: uint16 x, y in q-metre steps (2 m, or more for the longest packs) from the pack's south-west corner, then a kind byte (species | flags << 4) and a height
# byte (0.2 m steps). Flags: 1 = forest stand (the map grows a small group of trees around the point), 2 = wide stand
# (twice the spacing, far from the routes). Species codes are the SPECIES list below (js/trees.js uses the same order).
# Run from the data/ folder after tools/trees_fetch.py. Only each pack JSON's "trees" entry is replaced; the rest of the
# file stays byte-identical. Writes {name}.json in each pack folder given as an argument (e.g. bpacks2 ../assets/packs).
import json, math, base64, os, sys, pickle, numpy as np, shapely
from shapely import wkb, STRtree
from PIL import Image
from scipy.ndimage import uniform_filter, gaussian_filter, map_coordinates
W,E,S_,N=9.9,12.5,46.9,49.7; GX,GY=150,240; CW,CH=(E-W)/GX,(N-S_)/GY; T=128
KX=111320*math.cos(math.radians(48.0)); KY=110570; STEP=40.0; CAP=150000
SPECIES=['spruce','fir','pine','larch','stonepine','mugo','beech','oak','lime','maple','chestnut','birch','poplar','willow','fruit','broad']
SP={s:i for i,s in enumerate(SPECIES)}
HGT={'spruce':(22,36),'fir':(22,34),'pine':(17,27),'larch':(20,31),'stonepine':(9,17),'mugo':(1.6,3.2),'beech':(20,30),'oak':(17,27),
     'lime':(14,25),'maple':(13,22),'chestnut':(12,20),'birch':(12,20),'poplar':(20,30),'willow':(8,15),'fruit':(5,8.5),'broad':(14,24)}
GENUS={'Picea':'spruce','Abies':'fir','Pinus':'pine','Larix':'larch','Tsuga':'fir','Pseudotsuga':'fir','Thuja':'spruce','Taxus':'spruce',
  'Juniperus':'spruce','Chamaecyparis':'spruce','Cupressus':'spruce','Sequoiadendron':'fir','Metasequoia':'larch','Ginkgo':'broad',
  'Fagus':'beech','Carpinus':'beech','Quercus':'oak','Tilia':'lime','Acer':'maple','Aesculus':'chestnut','Castanea':'chestnut',
  'Betula':'birch','Populus':'poplar','Salix':'willow','Prunus':'fruit','Malus':'fruit','Pyrus':'fruit','Sorbus':'fruit',
  'Crataegus':'fruit','Cornus':'fruit','Magnolia':'fruit','Corylus':'fruit','Cercis':'fruit','Amelanchier':'fruit'}
GERMAN={'linde':'lime','eiche':'oak','ahorn':'maple','kastanie':'chestnut','birke':'birch','buche':'beech','pappel':'poplar','weide':'willow',
  'fichte':'spruce','tanne':'fir','kiefer':'pine','föhre':'pine','lärche':'larch','zirbe':'stonepine','kirsch':'fruit','apfel':'fruit',
  'birne':'fruit','eberesche':'fruit','vogelbeere':'fruit','mehlbeere':'fruit','weißdorn':'fruit','hainbuche':'beech'}
MIX={'town':{'lime':.32,'maple':.26,'chestnut':.1,'broad':.14,'oak':.06,'birch':.05,'fruit':.04,'beech':.03},
     'avenue':{'lime':.45,'maple':.3,'broad':.15,'chestnut':.1},
     'park':{'lime':.2,'maple':.18,'oak':.14,'beech':.12,'chestnut':.1,'broad':.12,'birch':.08,'spruce':.03,'pine':.03},
     'cemetery':{'lime':.3,'maple':.15,'birch':.12,'oak':.08,'spruce':.15,'fir':.05,'broad':.15},
     'river':{'willow':.4,'poplar':.3,'broad':.2,'maple':.1},
     'country':{'oak':.25,'lime':.2,'maple':.15,'birch':.15,'fruit':.15,'broad':.1},
     'orchard':{'fruit':1},
     'alpvillage':{'maple':.3,'lime':.2,'broad':.15,'spruce':.15,'birch':.1,'fruit':.1}}
coarse=np.load('dem_eq.npy'); geo=json.load(open('geo.json'))
ROUTE={'munich':'apt_city','inn':'muc_ibk','nue':'muc_nue','neu':'muc_neusch'}
HOT={'munich':[(48.137,11.575),(48.152,11.592)],'inn':[(47.268,11.393),(47.5836,12.1706),(47.4383,11.8933)],'nue':[(49.454,11.077)],
     'neu':[(47.5576,10.7498),(47.6811,10.9002)]}
rng=np.random.default_rng(7)
mm=lambda lon,lat:(np.asarray(lon)*KX,np.asarray(lat)*KY)
def tags(r): return dict(r.get('source_tags') or [])
def elev(lon,lat):
  hh,ww=coarse.shape
  return map_coordinates(coarse,[(N-lat)/(N-S_)*hh-.5,(lon-W)/(E-W)*ww-.5],order=1,mode='nearest')
def southness(lon,lat):          # +1 on a steep slope facing south, -1 facing north
  d=.0015; gy=(elev(lon,lat+d)-elev(lon,lat-d))/(2*d*KY); gx=(elev(lon+d,lat)-elev(lon-d,lat))/(2*d*KX)
  g=np.hypot(gx,gy)+1e-6; return (gy*.9-gx*.15)/g*np.clip((g-.04)/.2,0,1)
def pick(mix,u):                 # u in [0,1) -> species code, by cumulative weight
  ks=list(mix); w=np.cumsum([mix[k] for k in ks]); w/=w[-1]
  return np.array([SP[k] for k in ks])[np.minimum(np.searchsorted(w,u,side='right'),len(ks)-1)]
def species_of(t):
  for k in ('genus','species','taxon'):
    v=t.get(k)
    if v and v.split()[0].capitalize() in GENUS: return GENUS[v.split()[0].capitalize()]
  for k in ('species:de','genus:de','name'):
    v=(t.get(k) or '').lower()
    for de,s in GERMAN.items():
      if de in v: return s
  return None
def height_of(t):
  try: h=float(str(t.get('height','')).replace('m','').replace(',','.').strip())
  except ValueError: return None
  return h if 3<=h<=45 else None

# ---- shared vector data (metric x = lon*KX, y = lat*KY) ----
land=pickle.load(open('trees/ov_land.pkl','rb')); lu=pickle.load(open('trees/ov_land_use.pkl','rb'))
proj=lambda g: shapely.transform(g,lambda c: c*np.array([KX,KY]))
osm_pts,osm_tags=[],[]; rows=[]; woods=[]; woods_lt=[]
for r in land:
  g=wkb.loads(r['geometry']); c=r.get('class'); t=tags(r)
  if c=='tree' and g.geom_type=='Point': osm_pts.append(g.coords[0]); osm_tags.append(t)
  elif c=='tree_row' and g.geom_type=='LineString': rows.append((proj(g),t))
  elif r.get('subtype')=='forest' and g.geom_type in ('Polygon','MultiPolygon'):
    lt={'broadleaved':.9,'needleleaved':.08,'coniferous':.08,'mixed':.5}.get(t.get('leaf_type'))
    if lt is not None: woods.append(proj(g)); woods_lt.append(lt)
osm_pts=np.array(osm_pts); osm_xy=np.column_stack(mm(osm_pts[:,0],osm_pts[:,1])); osm_tree=STRtree(shapely.points(osm_xy))
wood_tree=STRtree(woods); woods_lt=np.array(woods_lt)
LUK={'park':'park','village_green':'park','garden':'park','recreation_ground':'park','playground':'park','zoo':'park',
     'cemetery':'cemetery','grave_yard':'cemetery','orchard':'orchard','allotments':'orchard',
     'residential':'town','commercial':'town','retail':'town','industrial':'town','school':'town','education':'town','hospital':'town','religious':'town','pedestrian':'town','plaza':'town'}
lu_g,lu_k=[],[]
for r in lu:
  k=LUK.get(r.get('class'))
  if k:
    g=wkb.loads(r['geometry'])
    if g.geom_type in ('Polygon','MultiPolygon'): lu_g.append(proj(g)); lu_k.append(k)
lu_tree=STRtree(lu_g); lu_k=np.array(lu_k)
PRI={'orchard':4,'cemetery':3,'park':2,'town':1}
bl=[wkb.loads(r['geometry']) for r in pickle.load(open('ov/building_raw2.pkl','rb'))]
b_tree=STRtree([proj(g) for g in bl if g.geom_type in ('Polygon','MultiPolygon')]); del bl
wat=[]
for r in pickle.load(open('water/water_raw.pkl','rb')):
  if r.get('cls') in ('river','canal','lake','water','reservoir','basin','oxbow') or (r.get('cls')=='pond' and 'Polygon' in wkb.loads(r['g']).geom_type):
    g=wkb.loads(r['g'])
    if g.geom_type!='Point': wat.append(proj(g))
w_tree=STRtree(wat); del wat
print('vector data: osm trees',len(osm_xy),'rows',len(rows),'woods',len(woods),'landuse',len(lu_g),flush=True)
def near_any(tree,xy,d):
  hit=np.zeros(len(xy),bool)
  if len(xy): i,_=tree.query(shapely.points(xy),predicate='dwithin',distance=d); hit[i]=True
  return hit
def count_near(tree,xy,d):
  c=np.zeros(len(xy),int)
  if len(xy): i,_=tree.query(shapely.points(xy),predicate='dwithin',distance=d); np.add.at(c,i,1)
  return c
def context(xy):
  k=np.full(len(xy),'',object); p=np.zeros(len(xy))
  if len(xy):
    i,j=lu_tree.query(shapely.points(xy),predicate='within')
    for a,b in zip(i,j):
      q=PRI[lu_k[b]]
      if q>p[a]: p[a]=q; k[a]=lu_k[b]
  return k
def wood_prior(xy):
  pr=np.full(len(xy),np.nan)
  if len(xy): i,j=wood_tree.query(shapely.points(xy),predicate='within'); pr[i]=woods_lt[j]
  return pr
def field(X,Y,seed,cell=140.):   # smooth uniform-ish random field: forest stands come in patches
  r=np.random.default_rng(seed); x0,y0=X.min()-500,Y.min()-500
  nx,ny=int((X.max()-x0)/cell)+3,int((Y.max()-y0)/cell)+3
  f=gaussian_filter(r.random((ny,nx)),1.6); f=(f-f.mean())/(f.std()+1e-9)
  v=map_coordinates(f,[(Y-y0)/cell,(X-x0)/cell],order=1)
  return np.clip(.5+.5*np.tanh(v*.9),0,.999)

def run(name):
  idx=np.asarray(Image.open(f'packs/{name}-index.png')); atlas=np.asarray(Image.open(f'packs/{name}.jpg').convert('RGB'))
  wc=pickle.load(open('trees/wc.pkl','rb')); nir=pickle.load(open('trees/nir.pkl','rb'))
  ys,xs=np.where(idx[...,2]>200); cells=set(zip(xs.tolist(),ys.tolist()))
  ox=W+xs.min()*CW; oy=S_+ys.min()*CH
  line=shapely.LineString(np.column_stack(mm(*np.array(geo['routes'][ROUTE[name]]).T)))
  hot=[shapely.Point(*mm(lo,la)) for la,lo in HOT[name]]
  def reach(xy):                 # how far from the track or a stop (stops count 900 m closer)
    P=shapely.points(xy); d=shapely.distance(line,P)
    for h in hot: d=np.minimum(d,shapely.distance(h,P)-900)
    return d
  # ---- forest stands and scattered tree pixels, cell by cell ----
  St=[]; Sg=[]
  for (x,y) in sorted(cells):
    w,s,e,n=W+x*CW,S_+y*CH,W+(x+1)*CW,S_+(y+1)*CH
    c=wc.get((x,y)); ni=nir.get((x,y))
    if c is None: continue
    tree=(c==10).astype(np.float32); shrub=(c==20).astype(np.float32)
    if tree.sum()+shrub.sum()<4: continue
    frac=uniform_filter(tree,5); sfr=uniform_filter(shrub,5)
    nr=(ni.astype(np.float32)-1000)/10000 if ni is not None else np.full((T,T),.14,np.float32)
    nt=uniform_filter(nr*tree,5)/np.maximum(frac,1e-3)
    # jittered global 40 m grid: each anchor belongs to the cell it falls in
    X0,X1=w*KX,e*KX; Y0,Y1=s*KY,n*KY
    I=np.arange(math.ceil(X0/STEP-.5),math.floor(X1/STEP-.5)+1); J=np.arange(math.ceil(Y0/STEP-.5),math.floor(Y1/STEP-.5)+1)
    I,J=np.meshgrid(I,J); I=I.ravel(); J=J.ravel()
    X=(I+.5)*STEP+rng.uniform(-.33,.33,I.size)*STEP; Y=(J+.5)*STEP+rng.uniform(-.33,.33,I.size)*STEP
    px=np.clip(((X-X0)/(X1-X0)*T).astype(int),0,T-1); py=np.clip(((Y1-Y)/(Y1-Y0)*T).astype(int),0,T-1)
    fr=frac[py,px]; tr=tree[py,px]>0; sh=sfr[py,px]
    keep=(fr>=.5)|((sh>=.45)&(fr<.5))
    St.append(np.column_stack([X[keep],Y[keep],fr[keep],nt[py,px][keep],sh[keep],I[keep],J[keep]]))
    # scattered trees (hedgerows, gardens, field trees): about one tree per three pixels where the cover is thin
    ty,tx=np.where((tree>0)&(frac<.5))
    if len(tx):
      sel=rng.random(len(tx))<.34; tx,ty=tx[sel],ty[sel]
      gx=X0+(tx+rng.random(len(tx)))/T*(X1-X0); gy=Y1-(ty+rng.random(len(tx)))/T*(Y1-Y0)
      Sg.append(np.column_stack([gx,gy,nt[ty,tx]]))
  St=np.concatenate(St) if St else np.zeros((0,7)); Sg=np.concatenate(Sg) if Sg else np.zeros((0,3))
  # ---- stands: reach, spacing, conflicts with buildings and OSM-mapped trees ----
  d=reach(St[:,:2]); wide=d>=1300
  keep=(d<2400)&(~wide|((St[:,5]%2==0)&(St[:,6]%2==0)))
  St,d,wide=St[keep],d[keep],wide[keep]
  nb=near_any(b_tree,St[:,:2],15); dup=count_near(osm_tree,St[:,:2],22)>=2
  to_single=nb&(St[:,2]>=.5)&~dup             # stands right by houses become single trees (their groups would hit walls)
  Sg=np.vstack([Sg,St[to_single][:,[0,1,3]]]); keep=~nb&~dup; St,d,wide=St[keep],d[keep],wide[keep]
  # ---- scattered trees: drop those on/next to buildings, near OSM trees, or far out ----
  dg=reach(Sg[:,:2]); keep=(dg<2000)&~near_any(b_tree,Sg[:,:2],3)&~near_any(osm_tree,Sg[:,:2],10); Sg=Sg[keep]
  # ---- OSM trees and tree rows in this pack's cells ----
  ci=((osm_pts[:,0]-W)/CW).astype(int); cj=((osm_pts[:,1]-S_)/CH).astype(int)
  m=np.array([(a,b) in cells for a,b in zip(ci,cj)]) if len(ci) else np.zeros(0,bool)
  Oxy=osm_xy[m]; Ot=[osm_tags[i] for i in np.where(m)[0]]
  inb=np.zeros(len(Oxy),bool)
  if len(Oxy): i,_=b_tree.query(shapely.points(Oxy),predicate='within'); inb[i]=True
  inb|=reach(Oxy)>1500 if len(Oxy) else inb          # every leg starts in Munich: its street trees only near the line
  Oxy=Oxy[~inb]; Ot=[t for t,b in zip(Ot,inb) if not b]
  Rxy,Rt,Rid=[],[],[]
  for k,(g,t) in enumerate(rows):
    c=g.centroid
    if (int((c.x/KX-W)/CW),int((c.y/KY-S_)/CH)) not in cells: continue
    L=g.length; nstep=max(1,int(L/9))
    for q in range(nstep+1):
      p=g.interpolate(min(L,(q+rng.uniform(.1,.9))*L/(nstep+1)))
      Rxy.append((p.x+rng.normal(0,.6),p.y+rng.normal(0,.6))); Rt.append(t); Rid.append(k)
  Rxy=np.array(Rxy).reshape(-1,2)
  if len(Rxy):
    keep=~near_any(b_tree,Rxy,2.5)&(reach(Rxy)<1500); Rxy=Rxy[keep]; Rt=[t for t,kk in zip(Rt,keep) if kk]; Rid=np.array(Rid)[keep]
  print(name,'stands',len(St),'(wide',int(wide.sum()),') scattered',len(Sg),'osm',len(Oxy),'row trees',len(Rxy),flush=True)
  # ---- species ----
  def ll(xy): return xy[:,0]/KX, xy[:,1]/KY
  def region(lon,lat,h): return np.where(lat>48.95,'fr',np.where((lat<47.72)|(h>900),'alp','plain'))
  # stands
  lon,lat=ll(St[:,:2]); h=elev(lon,lat); so=southness(lon,lat); rg=region(lon,lat,h)
  u1=field(St[:,0],St[:,1],11); u2=.65*field(St[:,0],St[:,1],12,90.)+.35*rng.random(len(St)); u3=rng.random(len(St))
  sm=lambda a,b,x: np.clip((x-a)/(b-a),0,1)**2*(3-2*np.clip((x-a)/(b-a),0,1))
  pbr=sm(.128,.198,St[:,3]); pb=pbr.copy()
  pr=wood_prior(St[:,:2]); hp=~np.isnan(pr); pb[hp]=.4*pb[hp]+.6*pr[hp]
  alp=rg=='alp'
  pb*=np.where(alp,1-sm(1250,1550,h),1)
  riv=near_any(w_tree,St[:,:2],35)&(h<1000)
  urb=(np.isin(context(St[:,:2]),['park','town','cemetery'])|near_any(b_tree,St[:,:2],60))&(h<900)   # park and town groves are mostly broadleaf
  pb[urb]=.35*pb[urb]+.65*.85
  pb[riv]=np.maximum(pb[riv],.75)
  broad=u2<pb
  sp=np.zeros(len(St),int)
  # conifers: cumulative weights by region and height; larch on sunny slopes and from the bright-crowned conifers up high
  larch=np.where(alp,.06+.22*np.clip(so,0,1)*sm(850,1300,h)+.3*sm(1450,1850,h)+.5*pbr*sm(1000,1500,h),np.where(rg=='fr',.04,.05))
  stone=np.where(alp&(lat<47.32),.25*sm(1550,1850,h),0)
  pine=np.where(rg=='fr',.66,np.where(rg=='plain',.12,.05+.08*np.clip(so,0,1)*(h<1100)))
  fir=np.where(alp,.14*(1-sm(1300,1600,h)),np.where(rg=='fr',.02,.05))
  tot=larch+stone+pine+fir; spruce=np.clip(1-tot,.15,1); z=spruce+tot
  cdf=np.cumsum(np.column_stack([spruce,fir,pine,larch,stone])/z[:,None],1)
  ci_=np.minimum((u1[:,None]>cdf).sum(1),4); sp[:]=np.array([SP['spruce'],SP['fir'],SP['pine'],SP['larch'],SP['stonepine']])[ci_]
  # broadleaf stands
  bm={'fr':{'oak':.35,'beech':.3,'birch':.2,'maple':.1,'broad':.05},'plain':{'beech':.45,'oak':.2,'maple':.15,'birch':.1,'broad':.1},'alp':{'beech':.6,'maple':.25,'broad':.1,'birch':.05}}
  for r_,mix in bm.items():
    q=broad&(rg==r_)&~riv; sp[q]=pick(mix,u3[q])
  q=broad&riv; sp[q]=pick(MIX['river'],u3[q])
  # dwarf mountain pine: shrub cover high up, and the top of the northern limestone ranges
  mug=((St[:,4]>=.45)&(St[:,2]<.5)&alp&(h>1400))|(alp&(h>1780)&(lat>47.28)&(u3<.55))
  sp[mug]=SP['mugo']
  print(' broadleaf share of stands:',{r_:round(float(broad[rg==r_].mean()),2) for r_ in ('fr','plain','alp') if (rg==r_).any()},flush=True)
  bad=(St[:,2]<.5)&~mug; St,sp,h,wide,d=St[~bad],sp[~bad],h[~bad],wide[~bad],d[~bad]
  hs=np.array([HGT[SPECIES[k]] for k in sp]); hq=hs[:,0]+(hs[:,1]-hs[:,0])*rng.beta(2.2,2.2,len(sp))
  hq*=np.where(sp==SP['mugo'],1,1-.42*sm(1350,1950,h))    # shorter towards the tree line
  kinds_st=sp|np.where(wide,2,1)<<4
  # scattered (WorldCover) and OSM trees: context mix, or tags
  def single_species(xy,nt,tg,row_id=None):
    lon,lat=ll(xy); h=elev(lon,lat); rg=region(lon,lat,h); ctx=context(xy); riv=near_any(w_tree,xy,30)
    town=(ctx=='town')|near_any(b_tree,xy,35); u=rng.random(len(xy))
    if row_id is not None and len(xy):                  # one species along each row
      _,inv=np.unique(row_id,return_inverse=True); u=np.random.default_rng(3).random(inv.max()+1)[inv]
    sp=np.zeros(len(xy),int); hq=np.zeros(len(xy))
    for i in range(len(xy)):
      t=tg[i] if tg is not None else {}
      s=species_of(t); ht=height_of(t)
      if s is None:
        lt=t.get('leaf_type'); den=t.get('denotation','')
        if lt=='needleleaved' or (nt is not None and nt[i]<.095 and not town[i] and ctx[i] not in ('park','orchard','cemetery')) or (h[i]>1250 and lt!='broadleaved'):
          s='pine' if (rg[i]=='fr' and u[i]<.6) or (rg[i]=='plain' and u[i]<.3) else ('fir' if u[i]>.85 else 'spruce')
        elif ctx[i]=='orchard': s='fruit'
        elif riv[i] and h[i]<1000: s=SPECIES[pick(MIX['river'],u[i:i+1])[0]]
        elif ctx[i]=='cemetery': s=SPECIES[pick(MIX['cemetery'],u[i:i+1])[0]]
        elif ctx[i]=='park' or den=='park': s=SPECIES[pick(MIX['park'],u[i:i+1])[0]]
        elif den in ('avenue','street','alley') or (row_id is not None and town[i]): s=SPECIES[pick(MIX['avenue'],u[i:i+1])[0]]
        elif town[i] or den=='urban': s=SPECIES[pick(MIX['alpvillage' if rg[i]=='alp' and h[i]>750 else 'town'],u[i:i+1])[0]]
        elif row_id is not None: s=SPECIES[pick({'poplar':.3,'lime':.25,'oak':.2,'birch':.15,'maple':.1},u[i:i+1])[0]]
        else: s=SPECIES[pick(MIX['country'],u[i:i+1])[0]]
      sp[i]=SP[s]; lo,hi=HGT[s]
      hq[i]=ht if ht else (lo+(hi-lo)*rng.beta(2.2,2.2))*(1-.35*sm(1300,1900,h[i]))
    return sp,hq
  sg_sp,sg_h=single_species(Sg[:,:2],Sg[:,2],None)
  os_sp,os_h=single_species(Oxy,None,Ot)
  rw_sp,rw_h=single_species(Rxy,None,Rt,Rid)
  XY=np.vstack([St[:,:2],Sg[:,:2],Oxy,Rxy]); K=np.concatenate([kinds_st,sg_sp,os_sp,rw_sp]); H=np.concatenate([hq,sg_h,os_h,rw_h])
  pri=np.concatenate([np.where(wide,0,np.clip(5-d/500,2,5)),2.5-reach(Sg[:,:2])/1000,4.5-reach(np.vstack([Oxy,Rxy]))/800])
  if len(XY)>CAP:                                       # over budget: thin the far, wide stands first
    o=np.argsort(-(pri+rng.random(len(pri))*.8)); keepi=np.sort(o[:CAP]); XY,K,H=XY[keepi],K[keepi],H[keepi]
  o=rng.permutation(len(XY)); XY,K,H=XY[o],K[o],H[o]
  Q=max(2.,math.ceil(max(XY[:,0].max()-ox*KX,XY[:,1].max()-oy*KY)/65000*2)/2)
  Xq=np.clip(np.round((XY[:,0]-ox*KX)/Q),0,65535).astype('<u2'); Yq=np.clip(np.round((XY[:,1]-oy*KY)/Q),0,65535).astype('<u2')
  blob=np.column_stack([Xq,Yq]).astype('<u2').tobytes()+K.astype(np.uint8).tobytes()+np.clip(np.round(H/.2),1,255).astype(np.uint8).tobytes()
  cnt=np.bincount(K&15,minlength=16)
  print(name,'total',len(XY),{SPECIES[i]:int(c) for i,c in enumerate(cnt) if c},'stands',int(((K>>4)>0).sum()),flush=True)
  return dict(v=2,ox=ox,oy=oy,kx=KX,ky=KY,q=Q,n=int(len(XY)),data=base64.b64encode(blob).decode())
def write(path,trees):
  s=open(path).read(); i=s.rfind(',"trees":')
  head=s[:i] if i>0 else s[:-1]
  assert s.endswith('}') and head.startswith('{')
  out=head+',"trees":'+json.dumps(trees,separators=(',',':'))+'}'
  json.loads(out); open(path,'w').write(out)
  print(' wrote',path,os.path.getsize(path),flush=True)
dirs=sys.argv[1:] or ['bpacks2']
for name in ['munich','inn','nue','neu']:
  t=run(name)
  for dd in dirs: write(f'{dd}/{name}.json',t)
