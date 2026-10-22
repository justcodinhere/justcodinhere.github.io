// Trees by species: slender Norway spruce with drooping, snow-loaded tiers, silver fir, Scots pine (bare orange upper
// trunk, flat clumped crown), bare larches, Swiss stone and dwarf mountain pine high up, and in the towns, parks, avenues
// and on the riverbanks bare lime, beech, oak, maple, chestnut, birch, poplar and willow: trunk and main limbs inside a
// fine, frosted twig crown with snow along the upper branches. Leaves and no snow when winter is off.
// Species and heights come from the pack (tools/trees.py). A forest point is a stand: close to the camera it grows into a
// small group of trees on the local ground slope (the trees thin out again with distance). Three levels of detail: a
// detailed set and a simpler mid set gathered around the camera as it moves, and far blocks of simple shapes; each tree is
// drawn by exactly one of them (a dithered hand-over by distance). The buildings' sun shadows fall on the trees near the camera.
// create(ctx) returns { buildTrees(meta, buildingsMesh) -> Promise<THREE.Group> (with .dispose()), update(dt, alt), onCity(on) }.
export default function create(ctx) {
  const { THREE, V3, D2R, BB, BHS, EXAG, uni, NOISE, HAZE, LIGHT, scene, camera, renderer, llv, terrainKm, heightM, phone, clamp } = ctx;
  const lite = phone();
  const END = `\n#include <tonemapping_fragment>\n      gl_FragColor=linearToOutputTexel(gl_FragColor);`;
  // km: detailed set out to R0 (bare trees to R0B: their twig detail is finer than a pixel beyond), mid set to R1, far
  // blocks to R2; hand-over bands B0..B2; gather margins M0, M1
  const R0B = lite ? .35 : .5, R0 = lite ? .5 : .8, R1 = lite ? 1.8 : 2.6, R2 = lite ? 6.5 : 9.5, B0 = lite ? .18 : .25, B1 = lite ? .4 : .6, B2 = lite ? 1.2 : 1.6;
  const M0 = .12, M1 = .3, KMAX = lite ? 6 : 9;

  /* ---------- species (same order as tools/trees.py) ---------- */
  // crown radius / height, crown base in a stand and in the open, profile (conifers) or fork height (broadleaf),
  // bark (linear RGB), tier droop (conifers) or limb elevation (broadleaf), needles / twigs, twig density, trunk radius / height
  const SPEC = [
    ['spruce', .165, .36, .05, 1, [.075, .055, .045], .85, [.013, .030, .019], 1, .011],
    ['fir', .19, .34, .07, .85, [.11, .105, .10], .3, [.011, .028, .025], 1, .012],
    ['pine', .2, .6, .42, 0, [.075, .06, .05], 0, [.017, .034, .028], 1, .013],
    ['larch', .17, .3, .08, 1, [.09, .07, .055], 0, [.17, .12, .07], .62, .012],
    ['stonepine', .2, .12, .04, .6, [.08, .06, .05], .4, [.016, .034, .022], 1, .014],
    ['mugo', .5, 0, 0, .45, [.06, .05, .04], .3, [.014, .030, .017], 1, .02],
    ['beech', .36, .32, .24, .32, [.12, .12, .115], .55, [.098, .085, .076], .78, .018],
    ['oak', .42, .3, .22, .28, [.08, .07, .06], .22, [.10, .08, .062], .66, .022],
    ['lime', .32, .32, .22, .3, [.09, .08, .07], .62, [.115, .08, .062], .88, .02],
    ['maple', .34, .32, .22, .3, [.10, .09, .08], .5, [.11, .09, .075], .72, .019],
    ['chestnut', .38, .3, .2, .28, [.09, .075, .065], .45, [.12, .09, .07], .82, .022],
    ['birch', .22, .36, .26, .52, [.55, .54, .50], .78, [.10, .068, .06], .7, .012],
    ['poplar', .32, .22, .12, .2, [.12, .11, .10], 1.1, [.12, .10, .08], .7, .018],
    ['willow', .48, .32, .26, .3, [.10, .085, .07], .35, [.19, .135, .065], .8, .022],
    ['fruit', .5, .3, .26, .3, [.08, .065, .055], .3, [.09, .07, .06], .66, .02],
    ['broad', .36, .32, .24, .35, [.13, .12, .10], .55, [.11, .09, .08], .6, .018],
  ];
  const V4 = (a, b, c, d) => new THREE.Vector4(a, b, c, d);
  const SPU = {
    uSpA: { value: SPEC.map(s => V4(s[1], s[2], s[3], s[4])) }, uSpB: { value: SPEC.map(s => V4(...s[5], s[6])) },
    uSpC: { value: SPEC.map(s => V4(...s[7], s[8])) }, uSpD: { value: SPEC.map(s => V4(0, s[9], 0, 0)) },
  };
  const FAM = s => s === 2 ? 1 : s === 3 ? 2 : s >= 6 ? 3 : 0;         // 0 spruce-like, 1 pine, 2 larch, 3 broadleaf

  /* ---------- templates: one tree as parameters the vertex shader turns into shape ---------- */
  // position and aT hold template coordinates, decoded per family in the vertex shaders below.
  function tmpl(build) {
    const o = { P: [], T: [], I: [] }; build(o);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.P, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(o.T, 4));
    g.setIndex(o.I);
    return g;
  }
  const vtx = (o, a, b, c, d, e, f, g) => { o.P.push(a, b, c); o.T.push(d, e, f, g); return o.P.length / 3 - 1; };
  function band(o, a, b) { const n = a.length; for (let s = 0; s < n; s++) { const t = (s + 1) % n; o.I.push(a[s], b[s], a[t], a[t], b[s], b[t]); } }
  function prism(o, rows) { for (let k = 0; k < rows.length - 1; k++) band(o, rows[k], rows[k + 1]); }
  const TAU = Math.PI * 2;
  // spruce-like: trunk, NT tiers of NS branch tips (inner ring at the trunk, tips, and a hanging fringe), a leader on top
  const conB = (NT, NS, fringe, TS, top, sd) => o => {
    if (TS) prism(o, [0, 1].map(y => Array.from({ length: TS }, (_, s) => vtx(o, 0, y, s / TS * TAU + .4, 0, 0, 0, 0))));
    for (let k = 0; k < NT; k++) {
      const tT = (k + 1) / NT, tS = Math.min(1.4 / NT, tT), off = k * 2.39996;
      prism(o, (fringe ? [0, 1, 2] : [0, 1]).map(ring => Array.from({ length: NS }, (_, s) => vtx(o, tT, tS, s / NS * TAU + off, 1, ring, ((s * 7 + k * 3) % 5) / 2 - 1, sd))));
    }
    if (top) {
      const r = Array.from({ length: 4 }, (_, s) => vtx(o, 1, 0, s / 4 * TAU, 2, 0, 0, 0)), ap = vtx(o, 1, 0, 0, 2, 1, 0, 0);
      for (let s = 0; s < 4; s++) o.I.push(r[s], r[(s + 1) % 4], ap);
    }
  };
  // Scots pine: trunk rings, NCL flattened crown clumps (equator of NE points, top, bottom), optional branch to each clump
  const pineB = (TS, ys, NCL, NE, br) => o => {
    prism(o, ys.map(y => Array.from({ length: TS }, (_, s) => vtx(o, y, s / TS * TAU + .3, 0, 0, 0, 0, 0))));
    for (let i = 0; i < NCL; i++) {
      const eq = Array.from({ length: NE }, (_, s) => vtx(o, 0, s / NE * TAU, 0, 1, i, 0, 0)), tp = vtx(o, 0, 0, 0, 1, i, 1, 0), bt = vtx(o, 0, 0, 0, 1, i, 2, 0);
      for (let s = 0; s < NE; s++) { const t = (s + 1) % NE; o.I.push(eq[s], eq[t], tp, eq[t], eq[s], bt); }
      if (br) prism(o, [0, 1].map(e => Array.from({ length: 3 }, (_, s) => vtx(o, e, s / 3 * TAU, 0, 2, i, 0, 0))));
    }
  };
  // bare wood: trunk (TR rings of TS sides), NL limbs (LR rings of LS sides), NB side branches per limb
  const woodB = (TS, TR, NL, LR, LS, NB) => o => {
    prism(o, Array.from({ length: TR }, (_, k) => Array.from({ length: TS }, (_, s) => vtx(o, k / (TR - 1), s / TS * TAU + .5, 0, 0, 0, 0, 0))));
    for (let i = 0; i < NL; i++) {
      prism(o, Array.from({ length: LR }, (_, k) => Array.from({ length: LS }, (_, s) => vtx(o, k / (LR - 1), s / LS * TAU, 0, 1, i, NL, 0))));
      for (let j = 0; j < NB; j++) prism(o, [0, 1].map(k => Array.from({ length: 3 }, (_, s) => vtx(o, k, s / 3 * TAU, j, 2, i, NL, 0))));
    }
  };
  // twig crown: an icosphere (broadleaf) or a cone (larch), drawn from both sides
  const sphB = detail => o => {
    const P = [], key = new Map(), F = [];
    const t = (1 + Math.sqrt(5)) / 2;
    [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .forEach(v => { const l = Math.hypot(...v); P.push(v.map(x => x / l)); });
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const mid = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (!key.has(k)) { const v = P[a].map((x, i) => x + P[b][i]), l = Math.hypot(...v); P.push(v.map(x => x / l)); key.set(k, P.length - 1); } return key.get(k); };
    for (let d = 0; d < detail; d++) { const nf = []; for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); } faces = nf; }
    for (const p of P) vtx(o, p[0], p[1], p[2], 3, 0, 0, 0);
    for (const f of faces) F.push(...f);
    o.I.push(...F);
  };
  const octB = () => o => {
    for (const v of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) vtx(o, ...v, 3, 0, 0, 0);
    o.I.push(0, 2, 4, 4, 2, 1, 1, 2, 5, 5, 2, 0, 4, 3, 0, 1, 3, 4, 5, 3, 1, 0, 3, 5);
  };
  const coneB = NS => o => {
    const rows = [0, .45].map(f => Array.from({ length: NS }, (_, s) => vtx(o, f, s / NS * TAU, 0, 3, 0, 0, 0)));
    band(o, rows[0], rows[1]); const ap = vtx(o, 1, 0, 0, 3, 0, 0, 0);
    for (let s = 0; s < NS; s++) o.I.push(rows[1][s], rows[1][(s + 1) % NS], ap);
  };
  // per program: [detailed, mid, far]
  const T = {
    con: [conB(6, 5, 1, 4, 1, 1), conB(3, 5, 0, 3, 0, 1), conB(1, 4, 0, 0, 0, 0)],
    pine: [pineB(5, [-.06, .45, .97], 4, 6, 1), pineB(3, [-.06, .97], 2, 5, 0), pineB(0, [], 1, 4, 0)],
    wood: [woodB(4, 3, 4, 3, 3, 1), woodB(3, 2, 3, 2, 3, 0), null],
    larchwood: [woodB(4, 2, 6, 2, 3, 0), woodB(3, 2, 0, 2, 3, 0), null],
    shell: [sphB(1), sphB(0), octB()],
    larchshell: [coneB(7), coneB(5), coneB(4)],
  };
  const TPL = {};
  for (const [k, b] of Object.entries(T)) TPL[k] = b.map(f => f && tmpl(f));

  /* ---------- shaders ---------- */
  // iA: ground point (relative to the mesh), height (km); iB: distance it fades out at, -, seed, species + 16 * stand flags
  const VHEAD = NOISE + `attribute vec4 aT; attribute vec4 iA, iB;
    uniform vec4 uLod; uniform mat4 uShadowM;
    uniform vec4 uSpA[16], uSpB[16], uSpC[16], uSpD[16];
    varying vec3 vP, vN, vL, vS, vU, vV; varying vec4 vX, vC1, vC2; varying float vD;
    float hs1(float x){ return fract(sin(x*12.9898+.731)*43758.5453); }
    vec3 gE, gN, gU, gB; float gH, gS, gSp, gF, gD;
    // where this tree stands, and whether this level of detail draws it now
    bool tree(){
      gSp=floor(mod(iB.w,16.)+.5); gF=floor(iB.w/16.+.001);
      vec3 o=vec3(modelMatrix[3]), wp=iA.xyz+o; gD=distance(wp,cameraPosition);
      float hs=fract(iB.z*7.31+.13);
      if(gD<uLod.x+(hs-.5)*uLod.z||gD>=uLod.y+(hs-.5)*uLod.w||gD>iB.x) return false;
      gU=normalize(wp); gE=normalize(vec3(gU.z,0.,-gU.x)); gN=cross(gU,gE);
      gS=iB.z; gH=iA.w; gB=iA.xyz;
      float th=gS*6.2832; vec3 ex=gE*cos(th)+gN*sin(th); gN=gN*cos(th)-gE*sin(th); gE=ex;
      return true;
    }
    void emit(vec3 l, vec3 n){           // l, n in the tree's frame (y up), l in units of its height
      vec3 p=gB+(gE*l.x+gU*l.y+gN*l.z)*gH;
      vP=p; vN=gE*n.x+gU*n.y+gN*n.z; vL=l*gH*1000.; vU=gU; vD=gD;
      vS=(uShadowM*vec4(p,1.)).xyz; vV=normalize(cameraPosition-(p+vec3(modelMatrix[3])));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    }
    #define CULL { gl_Position=vec4(0.,0.,2.,1.); return; }
    // crown shape shared by the bare wood and its twig crown
    void crown(int si, out float W, out float cb, out float fk){
      W=uSpA[si].x*(.85+.3*hs1(gS*3.1))*(gF>.5?.62:1.08);     // crowded crowns are narrow
      cb=(gF>.5?uSpA[si].y:uSpA[si].z)+(hs1(gS*5.7)-.5)*.08; fk=uSpA[si].w*(.85+.3*hs1(gS*2.3));
      if(gSp>11.5&&gSp<12.5&&hs1(gS*9.1)<.6) W*=.42;      // most poplars by the rivers are Lombardy poplars
    }
  `;
  const conVS = VHEAD + `void main(){
      if(!tree()) CULL
      int si=int(gSp); vec4 A=uSpA[si], B=uSpB[si], C=uSpC[si];
      float W=A.x*(.86+.28*hs1(gS*3.1))*(gF>.5?.88:1.12), cb=clamp((gF>.5?A.y:A.z)+(hs1(gS*5.7)-.5)*.1,0.,.7), pw=A.w, dr=B.w;
      vec3 l, n; float sn=0., tag=1., part=aT.x; vec2 cs=vec2(cos(position.z),sin(position.z));
      if(part>.5&&part<1.5&&aT.w<.5) cb=min(cb,.1);     // far cones (no trunk) reach down to the ground
      if(part<.5){
        float y=mix(-.12,cb+(1.-cb)*.75,position.y), r=uSpD[si].y*(1.-.7*position.y);
        l=vec3(cs.x*r,y,cs.y*r); n=vec3(cs.x,0.,cs.y);
      } else if(part<1.5){
        float tT=position.x, tS=position.y, fb=max(tT-tS,0.), ring=aT.y;
        float R=W*pow(max(1.-fb,0.),pw)*(1.+.17*aT.z);
        float yT=cb+(1.-cb)*tT, yP=cb+(1.-cb)*(fb+tS*(.62-.42*dr)*aT.w), yF=yP-(1.-cb)*tS*.7*dr;
        float r=ring<.5?R*.07:ring<1.5?R:R*.84, y=ring<.5?yT:ring<1.5?yP:yF;
        l=vec3(cs.x*r,y,cs.y*r);
        n=ring<1.5?normalize(vec3(cs.x*(yT-yP),R,cs.y*(yT-yP))):normalize(vec3(cs.x,-.3,cs.y));
        sn=ring<.5?1.:ring<1.5?.72:0.; tag=ring<.5?.55:ring<1.5?1.:.75;
      } else {
        bool ap=aT.y>.5; float y=ap?1.03:cb+(1.-cb)*.9, r=ap?0.:W*.06;
        l=vec3(cs.x*r,y,cs.y*r); n=normalize(vec3(cs.x,.5,cs.y)); sn=.6;
      }
      vX=vec4(gSp,gS,(l.y-cb)/(1.-cb),sn); vC1=vec4(B.rgb,part); vC2=vec4(C.rgb,tag);
      emit(l,n);
    }`;
  const pineVS = VHEAD + `void main(){
      if(!tree()) CULL
      int si=int(gSp); vec4 A=uSpA[si];
      float W=A.x*(.85+.3*hs1(gS*3.1))*(gF>.5?1.:1.15), cb=(gF>.5?A.y:A.z)+(hs1(gS*5.7)-.5)*.1;
      vec3 l, n; float sn=0., part=aT.x, i=aT.y; vec2 cs=vec2(cos(position.y),sin(position.y));
      float a=i*2.39996+gS*6.2832, cy=i<.5?.9:cb+(1.-cb)*(.3+.5*hs1(i*3.7+gS*11.)), ro=W*(i<.5?.1:.45+.35*hs1(i*5.1+gS*7.)), rc=W*(i<.5?.62:.5+.25*hs1(i*1.3+gS*3.));
      vec3 c=vec3(cos(a)*ro,cy,sin(a)*ro);
      if(part<.5){
        float y=position.x, r=uSpD[si].y*(1.-.55*clamp(y,0.,1.)); l=vec3(cs.x*r,y,cs.y*r); n=vec3(cs.x,0.,cs.y);
      } else if(part<1.5){
        float ty=aT.z; float fy=.48;
        if(ty<.5){ vec3 d=vec3(cs.x,0.,cs.y)*(1.+.14*sin(position.y*3.+gS*20.)+.1*hs1(i+position.y)); l=c+d*rc-vec3(0.,rc*.08,0.); n=normalize(vec3(d.x,-.15,d.z)); sn=.4; }
        else if(ty<1.5){ l=c+vec3(0.,rc*fy,0.); n=vec3(0.,1.,0.); sn=1.; }
        else { l=c-vec3(0.,rc*fy*.55,0.); n=vec3(0.,-1.,0.); }
      } else {
        vec3 s=vec3(0.,cy-.03,0.), ax=normalize(c-s+1e-5), p1=normalize(cross(ax,vec3(0.,1.,0.))+1e-5), p2=cross(ax,p1);
        n=p1*cs.x+p2*cs.y; l=mix(s,c,position.x)+n*uSpD[si].y*.3;
      }
      vX=vec4(gSp,gS,l.y,sn); vC1=vec4(uSpB[si].rgb,part); vC2=vec4(uSpC[si].rgb,1.);
      emit(l,n);
    }`;
  const woodVS = VHEAD + `void main(){
      if(!tree()) CULL
      int si=int(gSp); float W, cb, fk; crown(si,W,cb,fk);
      bool lx=gSp>2.5&&gSp<3.5; float Ry=(1.-cb)*.5, yc=cb+Ry, rT=uSpD[si].y*(.85+.3*hs1(gS*4.4));
      float part=aT.x, t=position.x; vec2 cs=vec2(cos(position.y),sin(position.y)); vec3 l, n;
      if(part<.5){
        float y=mix(-.08,lx?.97:fk,t), r=rT*(lx?1.-.85*t:1.-.3*t); l=vec3(cs.x*r,y,cs.y*r); n=vec3(cs.x,0.,cs.y);
      } else {
        float i=aT.y, nl=aT.z; vec3 S, M, E; float r0, r1;
        if(lx){                    // larch: a whorl of thin branches up the trunk, drooping then lifting at the tips
          float f=(i+.5)/nl, y=cb+(1.-cb)*f*.9, az=i*2.39996+gS*6.2832, R=W*(1.-f)*.9;
          S=vec3(0.,y,0.); E=vec3(cos(az)*R,y-.015,sin(az)*R); M=mix(S,E,.5)+vec3(0.,-.03,0.); r0=rT*.22; r1=rT*.06;
        } else {
          float az=i/nl*6.2832+gS*6.2832+(hs1(i+gS*9.1)-.5)*.9, be=uSpB[si].w+(hs1(i*2.1+gS)-.5)*.5;
          vec3 R3=vec3(W,Ry,W)*vec3(.85+.3*hs1(gS*8.3),.85+.3*hs1(gS*6.1),.85+.3*hs1(gS*4.9)); S=vec3(0.,fk,0.);
          vec3 Ep=vec3(0.,yc,0.)+vec3(cos(az)*cos(be),sin(be),sin(az)*cos(be))*R3*.8, M0=mix(S,Ep,.5)+vec3(0.,Ry*.12,0.);
          if(part>1.5){            // side branch from along the limb out to the crown's edge
            float j=position.z, tt=.45+.35*j, az2=az+(j>.5?.65:-.65)+(hs1(i*3.3+j+gS)-.5)*.6, be2=be+.35;
            S=mix(mix(vec3(0.,fk,0.),M0,tt),mix(M0,Ep,tt),tt);
            E=vec3(0.,yc,0.)+vec3(cos(az2)*cos(be2),sin(be2),sin(az2)*cos(be2))*R3*.95; M=mix(S,E,.5)+vec3(0.,Ry*.05,0.); r0=rT*.2; r1=rT*.05;
          } else { E=Ep; M=M0; r0=rT*.6; r1=rT*.14; }
        }
        vec3 p=mix(mix(S,M,t),mix(M,E,t),t), ax=normalize(mix(M-S,E-M,t)+1e-5);
        vec3 p1=normalize(cross(ax,abs(ax.y)>.95?vec3(1.,0.,0.):vec3(0.,1.,0.))), p2=cross(ax,p1);
        n=p1*cs.x+p2*cs.y; l=p+n*mix(r0,r1,t);
      }
      vX=vec4(gSp,gS,l.y,0.); vC1=vec4(uSpB[si].rgb,part); vC2=vec4(uSpC[si]);
      emit(l,n);
    }`;
  const shellVS = VHEAD + `void main(){
      if(!tree()) CULL
      int si=int(gSp); float W, cb, fk; crown(si,W,cb,fk);
      vec3 l, n, dq; float yf;
      if(gSp>2.5&&gSp<3.5){         // larch: a slender cone of twigs
        float f=position.x; vec2 cs=vec2(cos(position.y),sin(position.y));
        float R=W*(1.-f)*(1.+.14*(vnoise(vec3(cs*2.,f*3.)+gS*9.)-.5)); l=vec3(cs.x*R,mix(cb-.03,1.02,f),cs.y*R);
        n=normalize(vec3(cs.x*(1.-cb),W,cs.y*(1.-cb))); yf=f*2.-1.; dq=vec3(cs.x*(1.-f),yf,cs.y*(1.-f));
      } else {
        vec3 d=position; float Ry=(1.-cb)*.5; vec3 R3=vec3(W,Ry,W);
        if(gSp>12.5&&gSp<13.5&&d.y<0.) R3.y*=1.45;            // willows hang
        if(gSp>6.5&&gSp<7.5&&d.y>0.) R3.y*=.82;               // oaks spread flat
        float lump=1.+.6*(vnoise(d*1.35+gS*17.)-.5)+.22*(vnoise(d*3.4+gS*5.)-.5);   // lobed, uneven crowns
        R3*=vec3(.85+.3*hs1(gS*8.3),.85+.3*hs1(gS*6.1),.85+.3*hs1(gS*4.9));
        l=vec3(0.,cb+Ry,0.)+d*R3*lump; n=normalize(d/R3); yf=d.y; dq=d;
      }
      vX=vec4(gSp,gS,yf,0.); vC1=vec4(dq,3.); vC2=uSpC[si];
      emit(l,n);
    }`;
  let SHADOWS = false;
  const shadowGLSL = () => SHADOWS ? `precision highp sampler2DShadow;
    uniform sampler2DShadow uShadow; uniform float uShadowOn, uShadowTexel;
    float sunVis(){                // the buildings' shadow map near the camera: one hardware-filtered tap
      if(uShadowOn<.01||any(lessThan(vS.xy,vec2(0.)))||any(greaterThan(vS.xy,vec2(1.)))) return 1.;
      float v=textureLod(uShadow,vec3(vS.xy,vS.z-(.4+uShadowTexel*1.5)*8.4e-5),0.);
      vec2 e=min(vS.xy,1.-vS.xy); return mix(1.,v,uShadowOn*smoothstep(0.,.1,min(e.x,e.y)));
    }` : `float sunVis(){ return 1.; }`;
  const FHEAD = () => NOISE + HAZE + LIGHT + `uniform vec3 uRegionSun; uniform float uWinter, uAlt, uDetail;
    varying vec3 vP, vN, vL, vS, vU, vV; varying vec4 vX, vC1, vC2; varying float vD;
    ` + shadowGLSL() + `
    vec3 lit(vec3 n, vec3 up, vec3 L, float vis){ vec3 a=winterLight(n,up,vec3(0.)); return a+(winterLight(n,up,L)-a)*vis; }
    const vec3 SNOW=vec3(.80,.83,.88);
  `;
  const conFS = () => FHEAD() + `void main(){
      vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
      vec3 up=vU, L=normalize(uRegionSun); float sd=vX.y, ao=vC2.w, part=vC1.w; vec3 col;
      if(part<.5) col=vC1.rgb*(.75+.5*vnoise(vL*vec3(3.,.5,3.)));
      else {
        float k=.5, mk2=.5, br=.5, f2=fwidth(vL.y*3.6);
        if(uDetail<.5){ k=vnoise(vL*vec3(1.3,1.7,1.3)+sd*50.); if(f2<1.) mk2=mix(.5,vnoise(vL*3.6+sd*20.),1.-smoothstep(.4,1.,f2)); }
        vec3 nd=vC2.rgb*(.78+.44*sd)*(.72+.56*mk2);
        float s=vX.w;
        if(uDetail>.5){            // simpler shapes: the tiers' snow shelves as bands, averaged once finer than a pixel
          float t=vX.z*6.+sd*3., st=smoothstep(.45,.7,fract(t)); s=mix(st,.32,smoothstep(.25,.7,fwidth(t)));
        }
        // snow lies along the branches of each tier, the gaps between them stay dark
        float fa=length(fwidth(vL.xz))/max(length(vL.xz),.3)*5.;
        if(uDetail<.5&&fa<1.5) br=mix(.5,.5+.5*sin(atan(vL.z,vL.x)*5.+sd*20.+vX.z*11.),1.-smoothstep(.5,1.5,fa));
        float sn=uWinter*smoothstep(.45,.9,s)*smoothstep(.35,.75,dot(n,up))*smoothstep(.46,.76,.4*k+.3*mk2+.3*br+.04);
        col=mix(nd,SNOW*(.9+.1*k),sn*.9); ao=mix(ao,1.,sn*.6);
        ao*=.72+.28*clamp(vX.z,0.,1.);
      }
      col*=lit(normalize(n+up*.25),up,L,sunVis())*ao;
      col=applyHaze(col,vD,uAlt);
      gl_FragColor=vec4(col,1.);` + END + `}`;
  const pineFS = () => FHEAD() + `void main(){
      vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
      vec3 up=vU, L=normalize(uRegionSun); float sd=vX.y, part=vC1.w; vec3 col;
      if(part>.5&&part<1.5){
        float k=uDetail<.5?vnoise(vL*vec3(1.2,1.6,1.2)+sd*40.):.5, k2=uDetail<.5?vnoise(vL*3.2+sd*9.):.5;
        vec3 nd=vC2.rgb*(.8+.4*sd)*(.72+.56*k2);
        float sn=uWinter*smoothstep(.55,.95,vX.w)*smoothstep(.3,.7,dot(n,up))*smoothstep(.45,.75,.6*k+.4*k2)*(1.-.45*uDetail);   // far: no white speckle
        col=mix(nd,SNOW,sn*.85)*(.7+.3*smoothstep(-.5,.8,dot(n,up)));
      } else {                     // grey-brown plates low down, the pine's orange bark up the stem and in the crown
        float y=vX.z, b=uDetail<.5?vnoise(vL*vec3(3.,.7,3.)):.5;
        col=mix(vC1.rgb*(.75+.5*b),vec3(.30,.115,.05)*(.8+.35*b),smoothstep(.35,.6,y));
        col=mix(col,SNOW,uWinter*smoothstep(.55,.9,dot(n,up))*.8);
      }
      col*=lit(n,up,L,sunVis());
      col=applyHaze(col,vD,uAlt);
      gl_FragColor=vec4(col,1.);` + END + `}`;
  const woodFS = () => FHEAD() + `void main(){
      vec3 n=normalize(vN); vec3 up=vU, L=normalize(uRegionSun); float sp=vX.x, sd=vX.y;
      float b=uDetail<.5?vnoise(vL*vec3(4.,1.,4.)+sd*30.):.5; vec3 col=vC1.rgb*(.55+.35*b);
      if(sp>10.5&&sp<11.5){        // birch: white with dark bands, black near the foot
        float m=uDetail<.5?smoothstep(.62,.75,vnoise(vL*vec3(5.,1.6,5.)+sd*9.)):.2; col=mix(col,vec3(.03,.025,.02),max(m*.85,1.-smoothstep(.6,2.2,vL.y)));
      }
      if(sp>14.5&&uDetail<.5) col=mix(col,vec3(.24,.23,.19),smoothstep(.55,.7,vnoise(vL*vec3(1.2,.8,1.2)+sd)));    // plane-like mottling
      // snow along the tops of the limbs and plastered on the westerly (windward) side of the trunk
      vec3 east=normalize(vec3(up.z,0.,-up.x)), north=cross(up,east), wind=normalize(-east+north*.3);
      float k=uDetail<.5?vnoise(vL*2.3+sd*11.):.5;
      float sn=uWinter*max(smoothstep(.7,.95,dot(n,up))*smoothstep(.35,.6,k),.6*smoothstep(.6,.95,dot(n,wind))*smoothstep(.5,.72,k)*step(.5,vL.y));
      col=mix(col,SNOW,sn*.8);
      col*=lit(n,up,L,sunVis());
      col=applyHaze(col,vD,uAlt);
      gl_FragColor=vec4(col,1.);` + END + `}`;
  const shellFS = () => FHEAD() + `void main(){
      vec3 n=normalize(vN); vec3 up=vU, L=normalize(uRegionSun); float sd=vX.y, dens=vC2.w, yf=vX.z;
      float facing=abs(dot(n,vV));    // front faces only: one layer of crown per tree keeps the overdraw down
      // twigs fan out from the fork: streaks along the crown's meridians (fast around, slow upwards), finer streaks,
      // and clumps and gaps in the tree's own frame; each faded to its mean once finer than a pixel
      float s1=.5, s2=.5, c1=.5;
      if(uDetail<.5){             // the simpler sets are too small on screen for any of it
        vec3 d=normalize(vC1.xyz+1e-5); vec2 ring=normalize(d.xz+1e-4);
        vec3 sq=vec3(ring*5.5,d.y*1.6+sd*7.), sq2=vec3(ring*14.,d.y*3.4+sd*3.);
        float fs=length(fwidth(sq)), fq=length(fwidth(vL));
        float w1=1.-smoothstep(.35,.9,fs), w2=1.-smoothstep(.35,.9,fs*2.5), w3=1.-smoothstep(.3,.9,fq*.35);
        if(w1>0.) s1=mix(.5,vnoise(sq+sd*31.),w1);
        if(w2>0.) s2=mix(.5,vnoise(sq2+5.),w2);
        if(w3>0.) c1=mix(.5,vnoise(vL*.35+sd*40.),w3);
      }
      float t=.4*s1+.25*s2+.35*c1;
      // thin towards the outline (less crown to look through there), thin underneath, denser for some trees than others
      float al=dens*(.75+.5*fract(sd*7.7))*1.05*pow(facing,.8)*smoothstep(.16,.66,t)*(.45+.55*smoothstep(-1.,-.2,yf));
      vec3 tw=vC2.rgb*.82*(.75+.5*s2)*(.8+.4*fract(sd*3.1))*mix(vec3(1.),vec3(1.06,1.,.92),fract(sd*5.3));
      float vis=sunVis(); vec3 a0=winterLight(normalize(n*.4+up*.6),up,vec3(0.))*.8;   // twigs shade each other
      vec3 li=a0+(winterLight(n,up,L)-winterLight(n,up,vec3(0.)))*(.4+.6*vis)*.85;
      vec3 col=mix(tw,vec3(.40,.42,.46),.06*uWinter)*li;        // a touch of hoar frost
      // snow caught along the upper and windward branches
      vec3 east=normalize(vec3(up.z,0.,-up.x)), wind=normalize(-east+cross(up,east)*.3);
      float sn=uWinter*smoothstep(-.1,.7,yf)*max(smoothstep(.2,.75,dot(n,up)),.7*smoothstep(.3,.8,dot(n,wind)))*smoothstep(.52,.74,.6*s2+.4*c1);
      col=mix(col,SNOW*li,sn*.55); al=max(al,dens*.42*sn*smoothstep(0.,.5,facing));
      // summer: a leafy crown instead
      vec3 lf=vec3(.035,.07,.022)*(.7+.6*s2)*li; float als=.92*smoothstep(0.,.25,facing)*smoothstep(.25,.42,t+.1*s2);
      col=mix(lf,col,uWinter); al=mix(als,al,uWinter);
      if(al<.012) discard;
      col=applyHaze(col,vD,uAlt);
      gl_FragColor=vec4(col,al);` + END + `}`;

  /* ---------- materials: one program per kind, a clone per mesh (own origin and shadow matrix) ---------- */
  const shU = { uShadow: { value: null }, uShadowOn: { value: 0 }, uShadowTexel: { value: 1 } };
  // bare crowns are a faint haze beyond a few km: they stop at R2B, the dark conifers carry on to R2
  const R2B = R2 * .6, lodU = [V4(-1e9, R0, 0, B0), V4(R0, R1, B0, B1), V4(R1, R2, B1, B2), V4(R1, R2B, B1, B2), V4(-1e9, R0B, 0, B0), V4(R0B, R1, B0, B1)].map(value => ({ value }));
  let MAT = null;
  function materials() {
    const mk = (vs, fs, transparent) => new THREE.ShaderMaterial({
      uniforms: { ...uni, ...SPU, ...shU, uLod: lodU[0], uShadowM: { value: new THREE.Matrix4() }, uDetail: { value: 0 } },
      vertexShader: vs, fragmentShader: fs, side: transparent ? THREE.FrontSide : THREE.DoubleSide, transparent, depthWrite: !transparent, extensions: { derivatives: true },
    });
    MAT = { con: mk(conVS, conFS(), false), pine: mk(pineVS, pineFS(), false), wood: mk(woodVS, woodFS(), false), shell: mk(shellVS, shellFS(), true) };
  }
  const SHARED = [...Object.keys(uni), ...Object.keys(SPU), ...Object.keys(shU)];
  const mShadow = new THREE.Matrix4(), _t = new V3();
  let shadowSrc = null;                  // a building chunk whose shadow matrix (map from its local space) we re-base
  function onShadow() {
    const u = this.material.uniforms;
    if (!shadowSrc || shU.uShadowOn.value < .01) return;
    _t.copy(this.position).sub(shadowSrc.position);
    u.uShadowM.value.copy(shadowSrc.material.uniforms.uShadowM.value).multiply(mShadow.makeTranslation(_t.x, _t.y, _t.z));
  }
  // programs per family: the opaque part and, for bare trees, the twig crown
  const PROG = [[['con', 'con']], [['pine', 'pine']], [['wood', 'larchwood'], ['shell', 'larchshell']], [['wood', 'wood'], ['shell', 'shell']]];
  function makeMesh(tpl, iA, iB, prog, lod) {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(tpl.index); for (const k of ['position', 'aT']) g.setAttribute(k, tpl.attributes[k]);
    g.setAttribute('iA', iA); g.setAttribute('iB', iB); g.instanceCount = 0; g.boundingSphere = new THREE.Sphere(new V3(), 1);
    const src = MAT[prog], m = src.clone();
    for (const k of SHARED) m.uniforms[k] = src.uniforms[k];
    const bare = prog === 'shell' || prog === 'wood';
    m.uniforms.uLod = lodU[lod === 2 ? (prog === 'shell' ? 3 : 2) : bare ? 4 + lod : lod]; m.uniforms.uDetail.value = lod > 0 ? 1 : 0;
    const mesh = new THREE.Mesh(g, m); mesh.onBeforeRender = onShadow;
    if (prog === 'shell') mesh.renderOrder = 3.5;   // after the buildings' shadow overlay on the ground, before smoke
    return mesh;
  }
  function freeMesh(mesh) {                // keep the shared template buffers alive
    const g = mesh.geometry; for (const k of ['position', 'aT']) g.deleteAttribute(k); g.setIndex(null);
    g.dispose(); mesh.material.dispose();
  }

  /* ---------- the ground exactly as the GPU draws it (two triangles per cell), with its slope ---------- */
  const TNX = lite ? 440 : 720, TNY = lite ? 660 : 1080, HW = 1280, HH = 1920, corner = new Map();
  const gLat = k => BB.S + (BB.N - BB.S) * k / (TNY - 1), gLon = k => BB.W + (BB.E - BB.W) * k / (TNX - 1);
  const DLO = (BB.E - BB.W) / (TNX - 1), DLA = (BB.N - BB.S) / (TNY - 1), KMD = 6371 * D2R;
  function cornerKm(i, j) {
    const key = j * 4096 + i; let v = corner.get(key);
    if (v === undefined) {
      const la = gLat(j), lo = gLon(i), u = i / (TNX - 1), w = j / (TNY - 1);
      const nla = BB.S + (BB.N - BB.S) * (clamp(Math.round(w * HH - .5), 0, HH - 1) + .5) / HH, nlo = BB.W + (BB.E - BB.W) * (clamp(Math.round(u * HW - .5), 0, HW - 1) + .5) / HW;
      const t = terrainKm(la, lo), e = t - .002 - heightM(la, lo) / 1000 * EXAG;
      v = Math.max(t, heightM(nla, nlo) / 1000 * EXAG + .002 + (e < -1e-9 ? e : 0)); corner.set(key, v);
    }
    return v;
  }
  const G = { h: 0, gE: 0, gN: 0 };
  function ground(lat, lon) {
    const fu = (lon - BB.W) / DLO, fv = (lat - BB.S) / DLA;
    if (fu <= 0 || fv <= 0 || fu >= TNX - 1 || fv >= TNY - 1) { G.h = terrainKm(lat, lon); G.gE = G.gN = 0; return G; }
    const i = Math.floor(fu), j = Math.floor(fv), x = fu - i, y = fv - j;
    let dx, dy;
    if (x + y <= 1) { const a = cornerKm(i, j); dx = cornerKm(i + 1, j) - a; dy = cornerKm(i, j + 1) - a; G.h = a + dx * x + dy * y; }
    else { const d = cornerKm(i + 1, j + 1), c = cornerKm(i, j + 1), b = cornerKm(i + 1, j); dx = d - c; dy = d - b; G.h = d - dx * (1 - x) - dy * (1 - y); }
    G.gE = dx / (DLO * KMD * Math.cos(lat * D2R)); G.gN = dy / (DLA * KMD);
    return G;
  }

  /* ---------- a pack's trees ---------- */
  const CLO = .006, CLA = .004, BLO = .04, BLA = .027;       // gather grid (~450 m) and far blocks (~3 km)
  // trees per stand close up: nine of the narrow conifers, six of the wide-crowned broadleaf (fewer on phones)
  const KF = [9, 9, 9, 6].map(k => Math.min(k, KMAX));
  const h1 = x => { const v = Math.sin(x * 12.9898 + .731) * 43758.5453; return v - Math.floor(v); };
  const fr = x => x - Math.floor(x);
  // Child c of stand t, written into out[o..o+7] as iA, iB (positions relative to org): the stand's trees sit on an R2
  // sequence across its cell, on the local ground slope; the first stays out to the far end, the next three to R1,
  // the rest to R0 (each fading at its own distance). Singles are child 0 at their own spot.
  function child(P, t, c, org, out, o) {
    const W = P.W3, B = P.Bv, x = W[t * 3], y = W[t * 3 + 1], z = W[t * 3 + 2], s = B[t * 4 + 2], code = B[t * 4 + 3], fl = code >> 4;
    let px = x, py = y, pz = z, h = P.Hk[t], seed = s, fade = 1e4;
    if (fl) {
      const cell = fl > 1 ? .08 : .04, ox = (fr(.5 + c * .7548776662 + s) - .5) * cell, oy = (fr(.5 + c * .569840291 + fr(s * 13.7)) - .5) * cell;
      const l = Math.hypot(x, y, z), ux = x / l, uy = y / l, uz = z / l, el = Math.hypot(ux, uz), ex = uz / el, ez = -ux / el;
      const nx = uy * ez, ny = uz * ex - ux * ez, nz = -uy * ex, dz = B[t * 4] * ox + B[t * 4 + 1] * oy;     // north = up x east
      px += ex * ox + nx * oy + ux * dz; py += ny * oy + uy * dz; pz += ez * ox + nz * oy + uz * dz;
      seed = fr(s * 91.7 + c * .6180339);
      if (c) { h *= .72 + .48 * h1(seed * 17.3); fade = (c < 2 ? R2 : c < 4 ? R1 : P.fam[t] > 1 ? R0B : R0) * (.7 + .3 * h1(c * 7.13 + s * 31.7)); }
    }
    out[o] = px - org.x; out[o + 1] = py - org.y; out[o + 2] = pz - org.z; out[o + 3] = h;
    out[o + 4] = fade; out[o + 5] = 0; out[o + 6] = seed; out[o + 7] = code;
    return (px - _cp.x) ** 2 + (py - _cp.y) ** 2 + (pz - _cp.z) ** 2;
  }
  const _cp = new V3();
  async function buildTrees(t, bmesh) {
    if (!t || t.v !== 2) return null;
    if (!MAT) {
      const tex = bmesh && bmesh.material && bmesh.material.uniforms && bmesh.material.uniforms.uShadow && bmesh.material.uniforms.uShadow.value;
      SHADOWS = !!(renderer.capabilities.isWebGL2 && tex); shU.uShadow.value = tex || null;
      materials();
    }
    const bin = atob(t.data), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const n = t.n, xy = new Uint16Array(u8.buffer, 0, n * 2), kind = u8.subarray(n * 4, n * 5), hb = u8.subarray(n * 5, n * 6);
    const W3 = new Float64Array(n * 3), Hk = new Float32Array(n), Bv = new Float32Array(n * 4), fam = new Uint8Array(n), lat = new Float32Array(n), lon = new Float32Array(n);
    const p = new V3(); let seed = 9173;
    for (let i = 0; i < n; i++) {
      if (i % 20000 === 19999) await new Promise(r => setTimeout(r, 0));
      const lo = t.ox + xy[i * 2] * t.q / t.kx, la = t.oy + xy[i * 2 + 1] * t.q / t.ky, k = kind[i], sp = k & 15, fl = k >> 4;
      const g = ground(la, lo); llv(la, lo, g.h - .0003, p);
      W3[i * 3] = p.x; W3[i * 3 + 1] = p.y; W3[i * 3 + 2] = p.z; lat[i] = la; lon[i] = lo;
      Hk[i] = hb[i] * .2 / 1000 * BHS;
      seed = (seed * 16807) % 2147483647;
      Bv[i * 4] = fl ? g.gE : 0; Bv[i * 4 + 1] = fl ? g.gN : 0; Bv[i * 4 + 2] = seed / 2147483647; Bv[i * 4 + 3] = sp + 16 * fl;
      fam[i] = FAM(sp);
    }
    // gather grid: tree indices sorted by ~450 m cell
    const lon0 = BB.W, lat0 = BB.S, gx = Math.ceil((BB.E - BB.W) / CLO), gy = Math.ceil((BB.N - BB.S) / CLA);
    const cellOf = i => clamp(Math.floor((lat[i] - lat0) / CLA), 0, gy - 1) * gx + clamp(Math.floor((lon[i] - lon0) / CLO), 0, gx - 1);
    const start = new Uint32Array(gx * gy + 1), order = new Uint32Array(n);
    for (let i = 0; i < n; i++) start[cellOf(i) + 1]++;
    for (let c = 0; c < gx * gy; c++) start[c + 1] += start[c];
    const fill = start.slice(0, gx * gy);
    for (let i = 0; i < n; i++) order[fill[cellOf(i)]++] = i;
    const P = { n, W3, Hk, Bv, fam, start, order, gx, gy, lon0, lat0, blocks: [], dead: false };
    // far blocks: every tree (two of each stand), simple shapes, shown between R1 and R2
    const root = new THREE.Group(), blocks = new Map();
    for (let i = 0; i < n; i++) {
      const key = Math.floor((lon[i] - lon0) / BLO) + ',' + Math.floor((lat[i] - lat0) / BLA);
      let b = blocks.get(key); if (!b) blocks.set(key, b = []); b.push(i);
    }
    for (const list of blocks.values()) {
      await new Promise(r => setTimeout(r, 0));
      const o = new V3(W3[list[0] * 3], W3[list[0] * 3 + 1], W3[list[0] * 3 + 2]), c = new V3();
      for (const i of list) { c.x += W3[i * 3]; c.y += W3[i * 3 + 1]; c.z += W3[i * 3 + 2]; }
      c.multiplyScalar(1 / list.length);
      let rad = 0; for (const i of list) rad = Math.max(rad, Math.hypot(W3[i * 3] - c.x, W3[i * 3 + 1] - c.y, W3[i * 3 + 2] - c.z));
      const meshes = [];
      for (let f = 0; f < 4; f++) {
        const ids = list.filter(i => fam[i] === f); if (!ids.length) continue;
        let m = 0; for (const i of ids) m += Bv[i * 4 + 3] >= 16 ? 2 : 1;
        const A = new Float32Array(m * 4), B = new Float32Array(m * 4), tmp = new Float32Array(8); let k = 0;
        for (const i of ids) for (let ch = 0; ch < (Bv[i * 4 + 3] >= 16 ? 2 : 1); ch++, k++) { child(P, i, ch, o, tmp, 0); A.set(tmp.subarray(0, 4), k * 4); B.set(tmp.subarray(4), k * 4); }
        const progs = PROG[f], [prog, tk] = progs[progs.length - 1];        // far: the crown only
        const mesh = makeMesh(TPL[tk][2], new THREE.InstancedBufferAttribute(A, 4), new THREE.InstancedBufferAttribute(B, 4), prog, 2);
        mesh.geometry.instanceCount = m; mesh.geometry.boundingSphere.set(c.clone().sub(o), rad + .1);
        mesh.position.copy(o); root.add(mesh); meshes.push(mesh);
      }
      P.blocks.push({ c, rad, meshes });
    }
    root.userData.trees = P;
    root.dispose = () => { P.dead = true; for (const b of P.blocks) for (const m of b.meshes) freeMesh(m); P.blocks.length = 0; if (dyn.pack === P) hideDyn(); };
    return root;
  }

  /* ---------- the detailed and mid sets, re-gathered around the camera as it moves ---------- */
  const dynRoot = new THREE.Group(); scene.add(dynRoot);
  const dyn = { pack: null, sets: [0, 1].map(lod => ({ lod, at: new V3(1e9, 0, 0), origin: new V3(), buckets: [] })) };
  function grow(set, f, need) {             // (re)allocate a family's buffers and its meshes
    let b = set.buckets[f];
    if (!b) b = set.buckets[f] = { cap: 0, n: 0, A: null, iA: null, iB: null, meshes: [] };
    const cap = Math.max(512, need * 1.5 | 0), A = new Float32Array(cap * 8);
    if (b.A) A.set(b.A.subarray(0, b.n * 8));
    for (const m of b.meshes) { dynRoot.remove(m); freeMesh(m); }
    b.A = A; b.cap = cap;
    const ib = new THREE.InstancedInterleavedBuffer(A, 8).setUsage(THREE.DynamicDrawUsage);
    b.ib = ib; b.iA = new THREE.InterleavedBufferAttribute(ib, 4, 0); b.iB = new THREE.InterleavedBufferAttribute(ib, 4, 4);
    b.meshes = PROG[f].map(([prog, tk]) => { const m = makeMesh(TPL[tk][set.lod], b.iA, b.iB, prog, set.lod); m.visible = false; dynRoot.add(m); return m; });
    return b;
  }
  const _c = new V3();
  // every tree (stand children included) within [rIn, rOut) of the camera that could show before the next gather
  function gather(P, set, rIn, rOut, kMax, margin) {
    const cp = _cp.copy(camera.position), o = set.origin.copy(ctx.cam.target);
    set.at.copy(cp);
    for (const b of set.buckets) if (b) b.n = 0;
    _c.copy(cp).normalize();
    const la = Math.asin(_c.y) / D2R, lo = Math.atan2(_c.x, _c.z) / D2R, ro = rOut + .06, dla = ro / 111.19, dlo = ro / (111.19 * Math.cos(la * D2R));
    const i0 = clamp(Math.floor((lo - dlo - P.lon0) / CLO), 0, P.gx - 1), i1 = clamp(Math.floor((lo + dlo - P.lon0) / CLO), 0, P.gx - 1);
    const j0 = clamp(Math.floor((la - dla - P.lat0) / CLA), 0, P.gy - 1), j1 = clamp(Math.floor((la + dla - P.lat0) / CLA), 0, P.gy - 1);
    const ri = rIn - .06, W = P.W3, ri2 = rIn > 0 ? rIn * rIn : -1, ro2 = rOut * rOut;
    if (cp.length() - 6371 < rOut + 3) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * P.gx + i;
      for (let k = P.start[c], e = P.start[c + 1]; k < e; k++) {
        const t = P.order[k], dx = W[t * 3] - cp.x, dy = W[t * 3 + 1] - cp.y, dz = W[t * 3 + 2] - cp.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= ro || d < ri) continue;
        const f = P.fam[t], K = P.Bv[t * 4 + 3] >= 16 ? Math.min(kMax, KF[f]) : 1;
        let b = set.buckets[f];
        for (let ch = 0; ch < K; ch++) {
          if (!b || b.n >= b.cap) b = grow(set, f, (b ? b.n : 0) + K);
          const q = b.n * 8, d2 = child(P, t, ch, o, b.A, q);
          if (d2 >= ro2 || d2 < ri2 || Math.sqrt(d2) > b.A[q + 4] + margin) continue;
          b.n++;
        }
      }
    }
    _c.copy(cp).sub(o);
    for (const b of set.buckets) {
      if (!b) continue;
      if (b.n) { b.ib.clearUpdateRanges(); b.ib.addUpdateRange(0, b.n * 8); b.ib.needsUpdate = true; }
      for (const m of b.meshes) { m.visible = b.n > 0; m.geometry.instanceCount = b.n; m.position.copy(o); m.geometry.boundingSphere.set(_c, rOut + .06); }
    }
  }
  function hideDyn() { for (const s of dyn.sets) { s.at.set(1e9, 0, 0); for (const b of s.buckets) if (b) for (const m of b.meshes) m.visible = false; } dyn.pack = null; }

  const _d = new V3();
  function update(dt, alt) {
    const root = ctx.state.trees, P = root && root.userData.trees;
    const on = !!(P && !P.dead && root.parent && !ctx.city && ctx.cam.dist < 60);
    if (root) root.visible = on;
    if (!on) { if (dyn.pack) hideDyn(); return; }
    const cp = camera.position;
    if (dyn.pack !== P) { hideDyn(); dyn.pack = P; }
    // far blocks: only those with trees inside the far band
    for (const b of P.blocks) {
      const d = _d.copy(b.c).distanceTo(cp), vis = d + b.rad > R1 - B1 && d - b.rad < R2 + B2, visB = vis && d - b.rad < R2B + B2;
      for (const m of b.meshes) m.visible = m.material.uniforms.uLod === lodU[3] ? visB : vis;
    }
    const s0 = dyn.sets[0], s1 = dyn.sets[1];
    if (s0.at.distanceTo(cp) > M0 * .9) gather(P, s0, -1, R0 + B0 / 2 + M0, 9, M0);
    if (s1.at.distanceTo(cp) > M1 * .9) gather(P, s1, R0B - B0 / 2 - M1, R1 + B1 / 2 + M1, 4, M1);
    // the buildings' shadow map, while it is on
    const bm = ctx.state.packMesh, bu = bm && bm.material && bm.material.uniforms;
    if (SHADOWS && bu && bu.uShadowOn && bm.userData.chunks && bm.userData.chunks.length) {
      shU.uShadowOn.value = bu.uShadowOn.value; shU.uShadowTexel.value = bu.uShadowTexel.value; shadowSrc = bm.userData.chunks[0];
    } else { shU.uShadowOn.value = 0; shadowSrc = null; }
  }
  function onCity(on) { if (on) hideDyn(); }

  return { buildTrees, update, onCity };
}
