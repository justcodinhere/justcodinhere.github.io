import json, math, networkx as nx, numpy as np
from PIL import Image, ImageDraw
def lines(f):
  d=json.load(open(f))
  for ft in d['features']:
    g=ft['geometry']; cs=g['coordinates']
    if g['type']=='LineString': cs=[cs]
    for l in cs: yield l, ft['properties']
def graph(f):
  G=nx.Graph()
  key=lambda c:(round(c[0],4),round(c[1],4))
  for l,p in lines(f):
    for a,b in zip(l,l[1:]):
      ka,kb=key(a),key(b)
      d=math.hypot((a[0]-b[0])*math.cos(math.radians(48)),a[1]-b[1])
      G.add_edge(ka,kb,w=d)
  # connect near-coincident nodes
  nodes=list(G.nodes); A=np.array(nodes)
  for i,n in enumerate(nodes):
    dd=np.hypot((A[:,0]-n[0])*.67,A[:,1]-n[1])
    for j in np.where((dd<0.01)&(dd>0))[0]: G.add_edge(n,nodes[j],w=dd[j]*3)
  return G
def snap(G,p):
  A=np.array(list(G.nodes)); i=np.argmin(np.hypot((A[:,0]-p[0])*.67,A[:,1]-p[1])); return tuple(A[i]), np.hypot((A[i,0]-p[0])*.67,A[i,1]-p[1])*111
def route(G,pts):
  out=[]
  for a,b in zip(pts,pts[1:]):
    sa,da=snap(G,a); sb,db=snap(G,b)
    try: path=nx.shortest_path(G,sa,sb,weight='w')
    except Exception as e: print('NOPATH',a,b); path=[sa,sb]
    print('seg',a,b,'snap km',round(da,1),round(db,1),'n',len(path))
    seg=[list(a)]+[list(p) for p in path]+[list(b)]
    out+= seg if not out else seg[1:]
  return out
R=graph('ne_10m_railroads.clip.json'); D=graph('ne_10m_roads.clip.json')
P={
 'muc_hbf':(11.558,48.140),'hilton':(11.5925,48.1283),'muc_apt':(11.786,48.354),'ostbf':(11.605,48.127),
 'rosenheim':(12.120,47.850),'kufstein':(12.165,47.583),'woergl':(12.064,47.489),'jenbach':(11.778,47.389),
 'ibk':(11.401,47.263),'ingolstadt':(11.437,48.744),'nue':(11.082,49.446),'landsberg':(10.88,48.05),
 'fuessen':(10.70,47.57),'neusch':(10.7498,47.5576),
}
res={}
res['muc_ibk']=route(R,[P['muc_hbf'],P['rosenheim'],P['kufstein'],P['woergl'],P['jenbach'],P['ibk']])
res['muc_nue']=route(R,[P['muc_hbf'],P['ingolstadt'],P['nue']])
res['muc_neusch']=route(D,[P['hilton'],P['landsberg'],P['fuessen'],P['neusch']])
json.dump(res,open('routes_raw.json','w'))
# debug draw
im=Image.open('sat.jpg').convert('RGB'); dr=ImageDraw.Draw(im)
W,E,S_,N=9.9,12.5,46.9,49.7
def px(c): return ((c[0]-W)/(E-W)*im.width,(N-c[1])/(N-S_)*im.height)
for l,p in lines('ne_10m_railroads.clip.json'): dr.line([px(c) for c in l],fill=(90,90,90),width=2)
for k,col in [('muc_ibk',(255,60,60)),('muc_nue',(255,200,0)),('muc_neusch',(0,200,255))]:
  dr.line([px(c) for c in res[k]],fill=col,width=6)
for l,p in lines('ne_10m_rivers_lake_centerlines.clip.json'): dr.line([px(c) for c in l],fill=(80,160,255),width=3)
for l,p in lines('ne_10m_rivers_europe.clip.json'): dr.line([px(c) for c in l],fill=(80,160,255),width=3)
im.resize((683,1024)).save('routes_dbg.png')
