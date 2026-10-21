import fsspec, pyarrow.parquet as pq, pyarrow.compute as pc, json, math, numpy as np, concurrent.futures as cf
import shapely, shapely.wkb
base="https://overturemaps-us-west-2.s3.amazonaws.com/"
idx=json.load(open('ov/index.json')); geo=json.load(open('geo.json'))
# areas of interest: city boxes + route corridor (0.9 km) in towns
boxes={
 'munich':(11.548,11.600,48.124,48.150),'ibk':(11.375,11.412,47.255,47.278),'nue':(11.064,11.094,49.444,49.462),
 'fuessen':(10.690,10.712,47.562,47.575),'schwangau':(10.725,10.755,47.550,47.580),'hall':(11.500,11.515,47.278,47.286),
 'kufstein':(12.155,12.180,47.575,47.592),'rattenberg':(11.890,11.898,47.436,47.442),
}
def corridor(pts,r):
  s=set()
  for (a,b),(c,d) in zip(pts,pts[1:]):
    km=math.hypot((c-a)*74.5,(d-b)*111.2); n=max(1,int(km/.2))
    for k in range(n+1):
      lon=a+(c-a)*k/n; lat=b+(d-b)*k/n
      s.add((round(lon*200),round(lat*300)))  # ~0.37km cells
  return s
cor=set()
for k in ('muc_ibk','muc_nue','muc_neusch','apt_city'): cor|=corridor(geo['routes'][k],.9)
def in_cor(lon,lat):
  x,y=round(lon*200),round(lat*300)
  return any((x+dx,y+dy) in cor for dx in (-1,0,1) for dy in (-1,0,1))
def inbox(lon,lat):
  for k,(w,e,s,n) in boxes.items():
    if w<=lon<=e and s<=lat<=n: return k
  return None
fs=fsspec.filesystem('http')
BB=(9.9,46.9,12.5,49.7)
def rg_job(args):
  k,r=args
  f=pq.ParquetFile(fs.open(base+k,block_size=2**22))
  t=f.read_row_group(r,columns=['bbox','geometry','height','num_floors','class','subtype','names'])
  bb=t.column('bbox').combine_chunks()
  xmin=pc.struct_field(bb,'xmin').to_numpy(); ymin=pc.struct_field(bb,'ymin').to_numpy()
  m=(xmin>BB[0])&(xmin<BB[2])&(ymin>BB[1])&(ymin<BB[3])
  out=[]
  if not m.any(): return out
  ii=np.where(m)[0]
  g=t.column('geometry').to_pylist(); h=t.column('height').to_pylist(); fl=t.column('num_floors').to_pylist()
  cl=t.column('class').to_pylist(); nm=t.column('names').to_pylist()
  for i in ii:
    lon,lat=float(xmin[i]),float(ymin[i])
    area=inbox(lon,lat)
    if not area and not in_cor(lon,lat): continue
    out.append((area or 'corridor',g[i],h[i],fl[i],cl[i],(nm[i] or {}).get('primary') if nm[i] else None))
  return out
jobs=[(k,r) for k,v in idx.items() for r in v]
res=[]
with cf.ThreadPoolExecutor(12) as ex:
  for i,o in enumerate(ex.map(rg_job,jobs)):
    res+=o
    if i%25==0: print(i,len(jobs),len(res),flush=True)
print('total',len(res))
import pickle; pickle.dump(res,open('ov/bldg_raw.pkl','wb'))
