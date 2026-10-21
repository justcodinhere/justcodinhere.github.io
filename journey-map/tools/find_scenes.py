import mgrs, json, urllib.request, re, concurrent.futures as cf
m=mgrs.MGRS()
tiles=set()
for i in range(41):
  for j in range(41):
    lon=9.9+2.6*i/40; lat=46.9+2.8*j/40
    tiles.add(m.toMGRS(lat,lon,MGRSPrecision=0))
print(sorted(tiles))
base="https://sentinel-cogs.s3.us-west-2.amazonaws.com/"
def ls(prefix):
  x=urllib.request.urlopen(base+"?list-type=2&delimiter=/&prefix="+prefix,timeout=60).read().decode()
  return re.findall(r'<Prefix>([^<]*)</Prefix>',x)[1:]
def best(t):
  z,b,sq=t[:2],t[2],t[3:]
  res=[]
  for y in (2022,2023,2024):
    for mo in (7,8,9):
      for p in ls(f"sentinel-s2-l2a-cogs/{int(z)}/{b}/{sq}/{y}/{mo}/"):
        sid=p.rstrip('/').split('/')[-1]
        try:
          it=json.load(urllib.request.urlopen(base+p+sid+".json",timeout=60))
          pr=it['properties']
          res.append((pr.get('eo:cloud_cover',100), -pr.get('s2:data_coverage', pr.get('sentinel:data_coverage',0)), sid, base+p+"TCI.tif"))
        except Exception as e: pass
  res.sort()
  return t,res[:12]
out={}
with cf.ThreadPoolExecutor(8) as ex:
  for t,r in ex.map(best,sorted(tiles)):
    out[t]=r; print(t,[(a,b,c) for a,b,c,_ in r])
json.dump(out,open('scenes.json','w'))
