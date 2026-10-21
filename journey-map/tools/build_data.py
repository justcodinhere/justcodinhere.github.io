import json, numpy as np, sys
sys.path.insert(0,'..')
exec(open('../routes.py').read().split("res={}")[0])
H=np.load('dem_eq.npy'); W,E,S_,N=9.9,12.5,46.9,49.7
def h(c):
  x=int((c[0]-W)/(E-W)*H.shape[1]); y=int((N-c[1])/(N-S_)*H.shape[0])
  x=min(max(x,0),H.shape[1]-1); y=min(max(y,0),H.shape[0]-1); return float(H[y,x])
def rdp(pts,eps):
  pts=np.array(pts)
  if len(pts)<3: return pts.tolist()
  a,b=pts[0],pts[-1]; ab=b-a; L=np.hypot(*ab)+1e-12
  q=pts-a; d=np.abs(ab[0]*q[:,1]-ab[1]*q[:,0])/L
  i=np.argmax(d)
  if d[i]>eps: return rdp(pts[:i+1],eps)[:-1]+rdp(pts[i:],eps)
  return [a.tolist(),b.tolist()]
out={'routes':{},'rivers':[]}
r=route(R,[P['muc_hbf'],P['rosenheim'],P['kufstein'],P['woergl'],P['jenbach'],P['ibk']])
out['routes']['muc_ibk']=rdp(r,0.0015)
r=route(R,[P['muc_hbf'],P['ingolstadt'],P['nue']]); out['routes']['muc_nue']=rdp(r,0.0015)
r=route(D,[P['hilton'],P['landsberg']])
car=[[10.878,48.048],[10.893,47.95],[10.90,47.85],[10.897,47.812],[10.93,47.79],[10.905,47.74],[10.865,47.70],[10.83,47.66],[10.80,47.636],[10.765,47.60],[10.74,47.58],[10.737,47.556],[10.7498,47.5576]]
out['routes']['muc_neusch']=rdp(r,0.0015)+car[1:]
r=route(R,[P['muc_apt'],P['ostbf']]); out['routes']['apt_city']=rdp(r,0.001)+[[11.598,48.128],[11.5925,48.1283]]
for f in ['ne_10m_rivers_lake_centerlines.clip.json','ne_10m_rivers_europe.clip.json']:
  for l,p in lines(f):
    nm=p.get('name')
    if nm not in ('Inn','Isar','Donau','Salzach','Lech'): continue
    l=[c for c in l]
    if h(l[0])<h(l[-1]): l=l[::-1]
    print(nm,len(l),round(h(l[0])),round(h(l[-1])))
    out['rivers'].append({'name':nm,'pts':[[round(a,5),round(b,5)] for a,b in rdp(l,0.0008)]})
for k,v in out['routes'].items(): out['routes'][k]=[[round(a,5),round(b,5)] for a,b in v]; print(k,len(v))
json.dump(out,open('geo.json','w'),separators=(',',':'))
