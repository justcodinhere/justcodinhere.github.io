// Vehicles with character, built in code: a twin-engine long-haul jet (and a narrowbody for the short US hops) in a
// plain white and navy livery, with gear that comes down near the ground, nav lights, strobes, a beacon and faint
// contrails at cruise; Railjet-style trains (a Taurus-style engine and dark red and grey coaches) to Innsbruck, a white
// ICE-style set to Nuremberg and a Munich S-Bahn from the airport, with lit window bands, doors, bogies, roof gear, the
// gaps between the coaches and a raised pantograph under a short run of overhead line; and a dark MPV for the
// Neuschwanstein drive with lit lamps, a little roof snow and slush spray from the wheels in winter.
// index.html still places and scales the groups (ctx.vehicles) and frames the shots; this module only replaces what
// is inside them. Models are built in metres; each group's holder scales them to index.html's units (U metres per
// unit at life size). create(ctx) returns { update(dt, alt), onStep(step), show(...) for ?debug }.
export default function create(ctx) {
  const { THREE, V3, R, D2R, uni, HAZE, LIGHT, NOISE, renderer, enu, llv, meshKm, phone, clamp, lerp, smooth, reduceMotion } = ctx;
  const VH = ctx.vehicles; if (!VH) return {};
  const lite = phone();
  const END = `\n#include <tonemapping_fragment>\n      gl_FragColor=linearToOutputTexel(gl_FragColor);`;
  const v3 = (x, y, z) => new V3(x, y, z), col = h => new THREE.Color(h);

  /* ---------- one material for every body: base colour per vertex, a surface kind that draws the details ---------- */
  // aK.x kinds: 0 paint (aK.y gloss), 1 glass (aK.y interior glow), 2 lamp (aK.y brightness), 3 fuselage (aK.y angle
  // round the body, 0 on top), 4 coach body and 10 train nose (style, car type, length packed in aK.y), 5 van body,
  // 6 rubber, 7 bright metal, 8 fan face, 9 roof (snow in winter; aK.y gloss)
  const GL = `float Fp(float x, float a, float w, float P){ float c=floor(x/P); return c*w+clamp(x-c*P-a, 0., w); }
    float pulse(float x, float f, float a, float w, float P, float lo, float hi){
      float x0=clamp(x-.5*f, lo, hi)-lo, x1=clamp(x+.5*f, lo, hi)-lo; return (Fp(x1, a, w, P)-Fp(x0, a, w, P))/f; }
    float box(float x, float f, float a, float b){ return clamp((min(x+.5*f, b)-max(x-.5*f, a))/f, 0., 1.); }
    float h1(float x){ return fract(sin(x*12.9898+4.1)*43758.5453); }`;
  const bodyVS = `attribute vec3 aCol; attribute vec2 aK; uniform vec3 uRegionSun, uSun; uniform float uAlt, uPull;
    varying vec3 vL, vNm, vN, vV, vUp, vLs, vC; varying vec2 vK;
    void main(){ vec4 p=vec4(position,1.); vec3 nn=normal;
#ifdef USE_INSTANCING
      p=instanceMatrix*p; nn=mat3(instanceMatrix)*nn;
#endif
      vL=position; vNm=normal; vC=aCol; vK=aK; vN=normalize(normalMatrix*nn);
      vUp=mat3(viewMatrix)*normalize((modelMatrix*vec4(0.,0.,0.,1.)).xyz);
      vLs=mat3(viewMatrix)*normalize(mix(uRegionSun,normalize(uSun),smoothstep(400.,2500.,uAlt)));
      vec4 mv=modelViewMatrix*p; float pd=length(mv.xyz), sc=length(modelMatrix[0].xyz);
      mv.xyz*=max(1.-(uPull*sc+.0003*pd)/max(pd,1e-4),.5);   // drawn a touch toward the eye, so wheels never sink into the ground
      vV=mv.xyz; gl_Position=projectionMatrix*mv; }`;
  const bodyFS = NOISE + HAZE + LIGHT + GL + `uniform float uWinter, uAlt, uTime, uGlow;
    uniform vec4 uLiv, uWin, uZ; uniform float uDoor[4];
    varying vec3 vL, vNm, vN, vV, vUp, vLs, vC; varying vec2 vK;
    const vec3 NAVY=vec3(.014,.026,.068), GLASS=vec3(.018,.021,.026), WARM=vec3(1.,.70,.42);
    // the plane's skin: white over a navy belly, navy wrapping the tail up into the fin; cabin windows, doors, cockpit
    vec3 fuselage(vec3 p, float ph, inout float gl, inout float sp){
      float z=p.z, fz=max(fwidth(z),1e-3), fp=max(fwidth(ph),1e-4);
      float tb=uLiv.x+uLiv.y*cos(ph), tail=1.-smoothstep(tb-fz,tb+fz,z), belly=smoothstep(uLiv.z-fp,uLiv.z+fp,ph);
      float nv=max(tail,belly), pin=box(ph,fp,uLiv.z-.05,uLiv.z-.025)*(1.-tail);
      vec3 c=mix(vC,NAVY,nv); c=mix(c,vec3(.42,.44,.47),pin);
      float dm=0., ol=0.;
      for(int i=0;i<4;i++){ float d=uDoor[i];
        float o=box(z,fz,d-.56,d+.56)*box(ph,fp,uWin.x-uWin.y*4.6,uWin.x+uWin.y*1.9);
        float in_=box(z,fz,d-.5,d+.5)*box(ph,fp,uWin.x-uWin.y*4.4,uWin.x+uWin.y*1.7);
        dm+=o; ol+=o-in_; }
      float win=box(ph,fp,uWin.x-uWin.y,uWin.x+uWin.y)*pulse(z,fz,0.,uWin.w,uWin.z,uZ.y,uZ.x)*(1.-min(dm,1.));
      c*=1.-.5*ol;
      // cockpit: four panes leaning back toward the sides
      float a=ph-.3, ck=box(ph,fp,.3,1.28)*box(z+.8*a,fz,uZ.z-1.25,uZ.z), mu=pulse(ph,fp,.0,.04,.33,.3,1.4);
      float g=max(win*.9,ck*(1.-mu));
      gl=mix(gl,.85,g); sp=mix(sp,1.,g);
      return mix(c,GLASS,g);
    }
    // coaches: s style (0 Railjet, 1 ICE, 2 S-Bahn), t type (0 coach, 1 cab car or end car, 2 engine), h half length
    vec3 coach(vec3 p, vec3 nm, float s, float t, float h, inout vec3 em, inout float gl, inout float sp, inout float sn){
      float z=p.z, y=p.y, fz=max(fwidth(z),2e-3), fy=max(fwidth(y),2e-3);
      if(abs(nm.z)>.8) return vec3(.05,.05,.055);                          // the ends, behind the gangways
      vec3 body, skirt, band, roof=vec3(.27,.27,.26); float y0, y1, P, ww, sk, ry;
      if(s<.5){ body=vec3(.20,.012,.017); skirt=vec3(.07,.062,.057); band=vec3(.06,.055,.052); y0=1.92; y1=2.74; P=2.02; ww=1.42; sk=1.12; ry=3.42; }
      else if(s<1.5){ body=vec3(.78,.78,.75); skirt=vec3(.30,.31,.31); band=vec3(.03,.034,.038); y0=1.8; y1=2.56; P=1.88; ww=1.36; sk=.95; ry=3.5; roof=vec3(.42,.43,.42); }
      else { body=vec3(.76,.76,.74); skirt=vec3(.06,.065,.07); band=vec3(.012,.014,.017); y0=1.42; y1=2.56; P=2.55; ww=2.3; sk=.92; ry=3.42; roof=vec3(.40,.41,.40); }
      vec3 c=mix(skirt,body,box(y,fy,sk,9.));
      if(s>.5&&s<1.5) c=mix(c,vec3(.52,.012,.018),box(y,fy,1.2,1.37));   // the ICE's red stripe
      float inB=box(y,fy,y0-.1,y1+.1); c=mix(c,band,inB);
      float lo=-h+2.3, hi=t>.5?h-(s<.5?3.4:s<1.5?6.1:2.3):h-2.3;
      if(t>1.5){ lo=0.; hi=0.; }
      float win=pulse(z,fz,(P-ww)*.5,ww,P,lo,hi)*box(y,fy,y0,y1);
      // doors: plug doors near each end (an S-Bahn has two pairs of wide red ones)
      float dr=0., ol=0., dw=0.;
      if(t<1.5){
        float w=s>1.5?.68:.48, da=s>1.5?h*.5:t>.5?h-(s<.5?4.2:6.9):h-1.7, db=s>1.5?-h*.5:-h+1.7;
        for(int i=0;i<2;i++){
          float dc=i==0?da:db;
          float o=box(z,fz,dc-w,dc+w)*box(y,fy,sk+.02,3.08), in_=box(z,fz,dc-w+.05,dc+w-.05)*box(y,fy,sk+.06,3.03);
          dr+=o; ol+=o-in_;
          dw+=box(z,fz,dc-w+.14,dc+w-.14)*box(y,fy,1.95,2.78)*(1.-(s>1.5?box(z,fz,dc-.03,dc+.03):0.));
        }
        dr=min(dr,1.);
        vec3 dcol=s<.5?vec3(.08,.07,.066):s<1.5?body:vec3(.50,.014,.02);
        c=mix(c,dcol,dr); win*=1.-dr;
      }
      if(t>1.5){                                                            // the engine: grilles high on the sides
        float gr=box(y,fy,2.38,3.22)*(box(abs(z),fz,1.,4.6))*(.55+.45*pulse(z,fz,0.,.06,.12,-9.,9.));
        c=mix(c,vec3(.05,.045,.045),gr*.85);
      }
      c*=1.-.6*min(ol,1.);
      float g=max(win,dw);
      float idx=floor((z-lo)/P);
      em+=WARM*uGlow*g*(.55+.45*h1(idx+s*17.+t*5.))*(.45+.55*smoothstep(-.2,.6,-dot(normalize(vN),normalize(vV))));
      gl=mix(gl,.8,g); sp=mix(sp,1.,g);
      c=mix(c,GLASS,g);
      float rf=box(y,fy,ry,9.); c=mix(c,roof,rf); sn=rf;
      return c;
    }
    // cab ends: t from the tip in metres (d), the windscreen and its black surround per style
    vec3 nose(vec3 p, vec3 nm, float s, float zt, inout vec3 em, inout float gl, inout float sp, inout float sn){
      float d=zt-abs(p.z), y=p.y, ax=abs(p.x), fd=max(fwidth(d),2e-3), fy=max(fwidth(y),2e-3);
      vec3 c; float g=0.; nm.z*=sign(p.z);                                  // either end of an engine
      if(s<.5){
        c=mix(vec3(.07,.062,.057),vec3(.20,.012,.017),box(y,fy,1.12,9.));
        float mask=box(y,fy,2.1,3.78)*step(.15,nm.z), ws=box(y,fy,2.28,3.62)*step(.3,nm.z)*box(ax,fy,0.,1.22);
        c=mix(c,vec3(.035,.032,.03),mask); g=ws;
        g=max(g,box(y,fy,2.42,3.2)*box(d,fd,1.3,2.05)*step(abs(nm.z),.5));     // cab side window
        float rf=box(y,fy,3.75,9.)*step(.5,nm.y); c=mix(c,vec3(.27,.27,.26),rf); sn=rf;
      } else if(s<1.5){
        c=mix(vec3(.30,.31,.31),vec3(.78,.78,.75),box(y,fy,.95,9.));
        c=mix(c,vec3(.52,.012,.018),box(y,fy,1.2,1.37)*smoothstep(2.,3.2,d));
        g=step(.3,nm.y)*box(d,fd,1.45,4.3)*box(ax,fy,0.,.98-.08*(d-1.45));
        g=max(g,box(y,fy,1.8,2.56)*smoothstep(3.6,4.4,d));
        float rf=box(y,fy,3.55,9.)*step(.6,nm.y)*step(4.5,d); c=mix(c,vec3(.42,.43,.42),rf); sn=rf;
      } else {
        c=mix(vec3(.06,.065,.07),vec3(.50,.014,.02),box(y,fy,.92,9.));
        c=mix(c,vec3(.76,.76,.74),box(y,fy,3.35,9.)*step(1.1,d));
        g=box(y,fy,1.95,3.25)*step(.25,nm.z)*box(ax,fy,0.,1.3);
        g=max(g,box(y,fy,1.42,2.56)*step(1.3,d));
        float rf=box(y,fy,3.42,9.)*step(.5,nm.y); c=mix(c,vec3(.40,.41,.40),rf); sn=rf;
      }
      gl=mix(gl,.85,g); sp=mix(sp,1.,g);
      return mix(c,GLASS,g);
    }
    // the MPV: glasshouse with blacked-out pillars, LED lamps, a dark grille, black arches and sills
    vec3 van(vec3 p, vec3 nm, inout vec3 em, inout float gl, inout float sp, inout float sn){
      float z=p.z, y=p.y, ax=abs(p.x), f=max(max(fwidth(z),fwidth(y)),1e-3);
      vec3 c=vC; float g=0.;
      g=max(g,box(y,f,1.1,1.76)*box(z,f,-2.36,.66)*step(.55,abs(nm.x)));                         // side glass
      g=max(g,box(y,f,1.13,1.84)*step(.25,nm.z)*step(.62,z)*box(ax,f,0.,.86));                 // windscreen
      g=max(g,box(y,f,1.14,1.74)*step(nm.z,-.6)*box(ax,f,0.,.72));                             // rear window
      float trim=box(y,f,1.06,1.1)*box(z,f,-2.4,.7)*step(.55,abs(nm.x));
      float dark=max(box(y,f,-1.,.36)*step(.3,abs(nm.x)),0.);                                  // sills
      for(int i=0;i<2;i++){ float wz=i==0?1.6:-1.6; dark=max(dark,(1.-smoothstep(.41-f,.43+f,length(vec2(z-wz,y-.34))))*step(.4,abs(nm.x))); }
      float fr=step(.35,nm.z)*step(2.2,z);
      float gril=fr*box(ax,f,0.,.36)*box(y,f,.47,.84), hl=fr*box(ax,f,.42,.84)*box(y,f,.72,.86);
      float bump=step(.3,nm.z)*step(2.3,z)*box(y,f,0.,.44);
      float tl=step(nm.z,-.5)*box(ax,f,.66,.95)*box(y,f,.96,1.62);
      c=mix(c,vec3(.012,.013,.015),max(dark,max(bump,gril)));
      c=mix(c,vec3(.55,.56,.58),trim+gril*pulse(y,f,0.,.018,.075,.47,.84));
      em+=vec3(1.,.93,.82)*2.2*hl+vec3(.75,.02,.015)*1.3*tl;
      c=mix(c,vec3(.10,.10,.11),hl); c=mix(c,vec3(.22,.01,.01),tl);
      gl=mix(gl,.85,g); sp=mix(sp,1.,g);
      sn=step(1.86,y)*smoothstep(.75,.95,nm.y);
      return mix(c,GLASS,g);
    }
    void main(){
      vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
      vec3 V=normalize(-vV), up=normalize(vUp), L=normalize(vLs), p=vL, nm=normalize(vNm);
      float kind=floor(vK.x+.5), prm=vK.y, gl=.3, sp=.3, sn=0.; vec3 c=vC, em=vec3(0.);
      if(kind<.5) gl=prm;
      else if(kind<1.5){ c=GLASS; gl=.85; sp=1.; em=WARM*uGlow*prm; }
      else if(kind<2.5){ c=vec3(.05); em=vC*prm; gl=.4; }
      else if(kind<3.5){ gl=.45; c=fuselage(p,prm,gl,sp); }
      else if(kind<4.5){ gl=.42; c=coach(p,nm,floor(prm/1000.),floor(mod(prm,1000.)/100.),mod(prm,100.),em,gl,sp,sn); }
      else if(kind<5.5){ gl=.6; sp=.8; c=van(p,nm,em,gl,sp,sn); }
      else if(kind<6.5){ gl=.04; sp=.05; }
      else if(kind<7.5){ gl=.75; sp=1.; }
      else if(kind<8.5){ float r=length(p.xy-vec2(prm,uLiv.w)); c=vec3(.03,.032,.035)*(1.+.8*smoothstep(.8,1.4,r)); gl=.3; }
      else if(kind<9.5){ gl=prm; sn=1.; }
      else { gl=.42; c=nose(p,nm,floor(prm/100.),mod(prm,100.),em,gl,sp,sn); }
      // a dusting of snow on what faces the sky (roofs), patchy at the edges
      float s=sn*uWinter*smoothstep(.55,.85,dot(n,up))*smoothstep(.3,.62,vnoise(p*2.3)+.25);
      c=mix(c,vec3(.80,.83,.88),s*(kind>4.5&&kind<5.5?.95:.7)); gl*=1.-s; sp*=1.-s;
      vec3 col=c*winterLight(n,up,L);
      vec3 r=reflect(-V,n); float fr=.04+.96*pow(1.-max(dot(n,V),0.),5.);
      col=mix(col,winterLight(r,up,L)*.85,clamp(fr*gl+gl*.08,0.,1.));                         // the sky and snow it mirrors
      col+=vec3(.62,.59,.55)*pow(max(dot(r,L),0.),10.+80.*gl)*sp*gl*1.6;
      col+=em;
      col=applyHaze(col,length(vV),uAlt);
      gl_FragColor=vec4(col,1.);` + END + `}`;
  const baseU = () => ({ ...uni, uPull: { value: 1.2 }, uGlow: { value: .75 }, uLiv: { value: new THREE.Vector4() }, uWin: { value: new THREE.Vector4() },
    uZ: { value: new THREE.Vector4() }, uDoor: { value: [99, 99, 99, 99] } });
  const bodyMat = (u = {}) => {
    const U = baseU(); for (const k in u) U[k] = { value: u[k] };
    return new THREE.ShaderMaterial({ uniforms: U, vertexShader: bodyVS, fragmentShader: bodyFS, side: THREE.DoubleSide });
  };

  /* ---------- lights: additive points sized in metres with a floor of a few pixels; strobes, beacon, landing ---------- */
  // aL: x size (m), y channel: 0 steady, 1 strobe (double flash), 2 beacon (slow red pulse), 3 landing / head lamps
  const lampMat = () => new THREE.ShaderMaterial({
    uniforms: { uTime: uni.uTime, uFocal: uni.uFocal, uDpr: { value: 1 }, uOn: { value: 1 }, uLand: { value: 0 } },
    transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute vec3 aCol; attribute vec2 aL; uniform float uTime, uFocal, uDpr, uOn, uLand; varying vec3 vCol;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); float sc=length(modelMatrix[0].xyz), d=max(-mv.z,1e-4);
        mv.xyz*=max(1.-3.*sc/max(length(mv.xyz),1e-4),.5);
        float ch=aL.y, a=1., t;
        if(ch>.5&&ch<1.5){ t=fract(uTime/1.3+position.z*.002); a=step(t,.05)+step(.11,t)*step(t,.16); }
        else if(ch>1.5&&ch<2.5){ t=fract(uTime/1.1+position.y*.01); a=.08+.92*exp(-pow((t-.5)/.09,2.)); }
        else if(ch>2.5) a=uLand;
        a*=uOn;
        float px=aL.x*sc*uFocal/d;
        gl_PointSize=clamp(px*(ch>.5&&ch<1.5?2.4:1.4),(ch>.5&&ch<1.5?6.:ch>1.5&&ch<2.5?3.6:2.6)*uDpr,(ch>.5&&ch<1.5?34.:16.)*uDpr);
        vCol=aCol*a*clamp(px/(2.*uDpr),.55,1.);
        gl_Position=a<.003?vec4(2.,2.,2.,1.):projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vCol; void main(){ vec2 q=gl_PointCoord*2.-1.; float r=dot(q,q); if(r>1.) discard;
        float core=exp(-r*9.), halo=exp(-r*2.8)*(1.-r);
        vec3 c=linearToOutputTexel(vec4(vCol,1.)).rgb, m=max(vCol,vec3(1e-4)); float k=min(1.,max(m.r,max(m.g,m.b)));
        gl_FragColor=vec4(c*(core*1.1+halo*.5),k*(core*.75+halo*.25)); }`,
  });
  const lampMats = [];
  function lamps(list, mat) {            // list of [x, y, z, colour [r,g,b], size m, channel]
    const p = [], c = [], s = [];
    for (const [x, y, z, cl, sz, ch] of list) { p.push(x, y, z); c.push(...cl); s.push(sz, ch || 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(c, 3)); g.setAttribute('aL', new THREE.Float32BufferAttribute(s, 2));
    const m = new THREE.Points(g, mat); m.frustumCulled = false; m.renderOrder = 6; if (!lampMats.includes(mat)) lampMats.push(mat); return m;
  }
  const RED = [2.4, .12, .06], GREEN = [.1, 2.2, .55], WHITE = [2.6, 2.6, 2.5], WARMW = [2.6, 2.2, 1.6], TAIL = [1.6, .05, .03];

  /* ---------- geometry kit: parts merged into one buffer, each vertex with a colour and a surface kind ---------- */
  class Kit {
    constructor() { this.P = []; this.N = []; this.C = []; this.K = []; this.I = []; this.n = 0; }
    add(g, c, k = 0, p = 0, m = null) {
      if (Array.isArray(g)) { for (const x of g) this.add(x, c, k, p, m); return this; }
      const pp = g.userData.prm;
      if (m) g = g.clone().applyMatrix4(m);
      const pos = g.attributes.position, nor = g.attributes.normal, cl = col(c);
      for (let i = 0; i < pos.count; i++) {
        this.P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); this.N.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        this.C.push(cl.r, cl.g, cl.b); this.K.push(k, pp ? pp[i] : p);
      }
      const flip = m && m.determinant() < 0, ix = g.index ? g.index.array : null;
      for (let i = 0; i < (ix ? ix.length : pos.count); i += 3) {
        const a = ix ? ix[i] : i, b = ix ? ix[i + 1] : i + 1, d = ix ? ix[i + 2] : i + 2;
        if (flip) this.I.push(a + this.n, d + this.n, b + this.n); else this.I.push(a + this.n, b + this.n, d + this.n);
      }
      this.n += pos.count; return this;
    }
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
      g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(this.K, 2));
      g.setIndex(this.I); g.computeBoundingSphere(); return g;
    }
    mesh(mat) { const m = new THREE.Mesh(this.geo(), mat); m.frustumCulled = false; return m; }
  }
  const M4 = () => new THREE.Matrix4();
  const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => M4().compose(v3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), v3(sx, sy, sz));
  const MIRX = M4().makeScale(-1, 1, 1);
  const boxG = (w, h, l) => new THREE.BoxGeometry(w, h, l);
  const cylX = (r, w, n = 10) => new THREE.CylinderGeometry(r, r, w, n).rotateZ(Math.PI / 2);
  // A closed skin through rings of points (same count, each a loop), smooth across rings, with flat caps if asked.
  function loft(rings, o = {}) {
    const n = rings[0].length, P = [], prm = [];
    rings.forEach((r, i) => r.forEach((q, j) => { P.push(q.x, q.y, q.z); if (o.prm) prm.push(o.prm(i, j)); }));
    let I = [];
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n; I.push(a, b, a + n, b, b + n, a + n); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    let s = 0; const nr = g.attributes.normal;
    rings.forEach((r, i) => { const c = centre(r); r.forEach((q, j) => { const k = i * n + j; s += (q.x - c.x) * nr.getX(k) + (q.y - c.y) * nr.getY(k) + (q.z - c.z) * nr.getZ(k); }); });
    if (s < 0) { I = I.slice(); for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; } g.setIndex(I); g.computeVertexNormals(); }
    if (o.prm) g.userData.prm = prm;              // otherwise the part takes the value Kit.add is given
    const out = [g];
    if (o.cap0) out.push(cap(rings[0], rings[1], o.prm && o.prm(0, 0)));
    if (o.cap1) out.push(cap(rings[rings.length - 1], rings[rings.length - 2], o.prm && o.prm(rings.length - 1, 0)));
    return out;
  }
  function centre(r) { const c = new V3(); r.forEach(q => c.add(q)); return c.multiplyScalar(1 / r.length); }
  function cap(ring, other, pv) {
    const c = centre(ring), out = c.clone().sub(centre(other)), nn = new V3();
    for (let j = 0; j < ring.length; j++) { const a = ring[j], b = ring[(j + 1) % ring.length]; nn.x += (a.y - b.y) * (a.z + b.z); nn.y += (a.z - b.z) * (a.x + b.x); nn.z += (a.x - b.x) * (a.y + b.y); }
    if (nn.lengthSq() < 1e-10) nn.copy(out); nn.normalize(); if (nn.dot(out) < 0) nn.negate();
    const P = [], N = [], e1 = new V3(), e2 = new V3();
    for (let j = 0; j < ring.length; j++) {
      let a = ring[j], b = ring[(j + 1) % ring.length];
      if (e1.subVectors(a, c).cross(e2.subVectors(b, c)).dot(nn) < 0) [a, b] = [b, a];
      P.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z); for (let k = 0; k < 3; k++) N.push(nn.x, nn.y, nn.z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (pv !== undefined) g.userData.prm = new Array(P.length / 3).fill(pv);
    return g;
  }
  const ell = (z, yc, rx, ry, N, x0 = 0) => Array.from({ length: N }, (_, j) => { const a = j / N * Math.PI * 2; return v3(x0 + rx * Math.sin(a), yc + ry * Math.cos(a), z); });
  // airfoil loop: leading edge at (x, y, zLE), chord c, thickness t (fraction of chord), thickness axis rolled by b (0 = up)
  const AF = [[0, 0], [.025, .55], [.12, .92], [.35, 1], [.65, .66], [1, .08], [1, -.03], [.65, -.3], [.35, -.55], [.12, -.6], [.025, -.38]];
  const foil = (x, y, zLE, c, t, b = 0) => AF.map(([u, w]) => { const h = w * t * c * .5; return v3(x - Math.sin(b) * h, y + Math.cos(b) * h, zLE - u * c); });

  /* ---------- jets ---------- */
  // Long-haul twin (about a 787-9 / A350-900) and a narrowbody (about a 737-800), nose +z, left wing +x, metres.
  const WIDE = { zN: 32, zF: 24.2, zT: -8.5, zE: -32, r: 2.95, ry: 3.05, droop: .5, tailY: 1.45, tailR: .36,
    wing: [[2.0, -1.38, 8.4, 11.8, .15], [3.0, -1.27, 7.8, 11.2, .145], [10.5, -.48, 3.1, 6.9, .12], [20, .52, -2.8, 4.3, .11], [27.4, 1.3, -7.5, 2.7, .1], [29.6, 1.52, -9.6, 1.65, .09], [30.7, 1.62, -11.2, .62, .08]],
    eng: { x: 10.1, y: -2.95, z: 8.9, r: 1.8, len: 6.4 },
    tp: [[.9, .95, -22.6, 6.2, .1], [9.9, 1.98, -29.6, 2.0, .09]], fin: [[2.0, -19.2, 11.6, .11], [3.2, -20.6, 10.2, .11], [12.6, -28.6, 3.5, .1]],
    gearN: { z: 25.4, y: -2.3, len: 2.6, r: .47, w: .32, pair: .3 }, gearM: { x: 4.6, z: -1.3, y: -1.5, len: 3.45, r: .6, w: .42, bogie: 1, track: .56 },
    fairings: [5.6, 13, 19.6], belly: [[9.5, 1.1, .3], [7, 2.4, .8], [2, 2.78, 1.0], [-3, 2.72, .95], [-6.2, 2.0, .6], [-7.8, .8, .2]], bellyY: -2.4,
    win: [1.37, .07, .53, .27], zw: [24.4, -21.6], zc: 30.6, doors: [26.9, 12.7, -8.9, -22.7], liv: [-17.5, 5, 2.06],
    lights: { tip: [30.75, 1.62, -11.45], tail: [0, 1.45, -32.3], top: [0, 3.12, 1.5], bot: [0, -3.15, -4.5], land: [3.6, -1.2, 7.3] } };
  const NARROW = { zN: 19.8, zF: 15.2, zT: -5.8, zE: -19.7, r: 1.88, ry: 2.0, droop: .32, tailY: .95, tailR: .24,
    wing: [[1.4, -.98, 4.9, 7.1, .15], [2.0, -.93, 4.5, 6.6, .14], [6.0, -.56, 2.2, 4.1, .125], [12.5, .05, -1.3, 2.4, .11], [16.6, .44, -3.5, 1.4, .1], [17.15, .78, -3.95, 1.1, .09, .7], [17.35, 1.5, -4.5, .85, .09, 1.35], [17.45, 2.55, -5.25, .5, .08, 1.45]],
    eng: { x: 5.0, y: -1.78, z: 6.6, r: 1.04, len: 4.1 },
    tp: [[.7, .75, -14.0, 4.0, .1], [6.6, 1.36, -18.4, 1.3, .09]], fin: [[1.4, -11.6, 6.8, .11], [2.1, -12.4, 6.1, .11], [8.3, -17.6, 2.3, .1]],
    gearN: { z: 14.2, y: -1.45, len: 1.7, r: .34, w: .24, pair: .22 }, gearM: { x: 2.75, z: -.9, y: -.9, len: 2.1, r: .55, w: .36, bogie: 0, track: .38 },
    fairings: [3.6, 8.2, 12.2], belly: [[5.5, .7, .2], [4, 1.5, .5], [1, 1.75, .62], [-2.5, 1.7, .58], [-4.6, 1.2, .35], [-5.6, .5, .12]], bellyY: -1.55,
    win: [1.38, .105, .51, .25], zw: [13.6, -14.4], zc: 18.6, doors: [16.5, -16.3, 99, 99], liv: [-10.5, 3, 2.06],
    lights: { tip: [17.5, 2.6, -5.5], tail: [0, .95, -19.95], top: [0, 2.05, .5], bot: [0, -2.05, -2.5], land: [2.3, -.85, 4.3] } };
  const WHITEP = 0xdcdad4, WINGG = 0xa9adb1, NAVYP = 0x1f2c4a, METAL = 0xc9ccd0;
  function buildJet(o) {
    const K = new Kit(), N = lite ? 14 : 20, rings = [];
    const fold = j => { const a = j / N * Math.PI * 2; return a > Math.PI ? 2 * Math.PI - a : a; };
    for (const s of [1, .985, .95, .89, .8, .69, .57, .45, .33, .22, .12, .05, 0]) {
      const rr = Math.sqrt(Math.max(0, 1 - Math.pow(s, 2.3)));
      rings.push(ell(o.zF + s * (o.zN - o.zF), -o.droop * Math.pow(s, 1.6), o.r * rr, o.ry * rr * (1 + .04 * s), N));
    }
    for (const t of [.33, .66, 1]) rings.push(ell(o.zF - t * (o.zF - o.zT), 0, o.r, o.ry, N));
    for (const t of [.07, .16, .27, .39, .51, .63, .74, .84, .92, 1]) {
      const top = o.ry - (o.ry - (o.tailY + o.tailR)) * t * t, bot = -o.ry + (o.ry + o.tailY - o.tailR) * Math.pow(t, 1.35);
      rings.push(ell(o.zT - t * (o.zT - o.zE), (top + bot) / 2, o.r - (o.r - o.tailR) * Math.pow(t, 1.4), (top - bot) / 2, N));
    }
    K.add(loft(rings, { prm: (i, j) => fold(j), cap1: true }), WHITEP, 3);
    // wings (light grey), mirrored; the last sections rake back (or curl up into a winglet)
    const wing = loft(o.wing.map(([x, y, z, c, t, b]) => foil(x, y, z, c, t, b || 0)), { cap1: true });
    K.add(wing, WINGG, 0, .35).add(wing, WINGG, 0, .35, MIRX);
    const tp = loft(o.tp.map(([x, y, z, c, t]) => foil(x, y, z, c, t)), { cap1: true });
    K.add(tp, WINGG, 0, .35).add(tp, WINGG, 0, .35, MIRX);
    K.add(loft(o.fin.map(([y, z, c, t]) => foil(0, y, z, c, t, Math.PI / 2)), { cap1: true }), NAVYP, 0, .45);
    K.add(loft(o.belly.map(([z, rx, ry]) => ell(z, o.bellyY, rx, ry, N)), { cap0: true, cap1: true }), NAVYP, 0, .4);
    // flap-track fairings: slim pods under the trailing edge
    const wy = x => { const w = o.wing; for (let i = 1; i < w.length; i++) if (x <= w[i][0]) { const f = (x - w[i - 1][0]) / (w[i][0] - w[i - 1][0]); return [lerp(w[i - 1][1], w[i][1], f), lerp(w[i - 1][2], w[i][2], f), lerp(w[i - 1][3], w[i][3], f)]; } return w[w.length - 1].slice(1, 4); };
    for (const x of o.fairings) {
      const [y, zl, c] = wy(x), z0 = zl - c * .55, len = c * .75 + o.r * .5, rr = o.r * .11;
      const f = loft([0, .2, .5, .8, 1].map(t => ell(z0 - t * len, y - rr * .9 - .12, rr * Math.sin(Math.PI * Math.min(1, t * 1.6 + .08)) * .9, rr * Math.sin(Math.PI * Math.min(1, t * 1.6 + .08)), 6, x)), { cap0: true });
      K.add(f, WINGG, 0, .3).add(f, WINGG, 0, .3, MIRX);
    }
    // engines: navy fan cowl with a bright lip, grey core and plug, dark fan face with a spinner, a pylon to the wing
    const e = o.eng, er = e.r, NE = lite ? 12 : 16, ring = (z, r, yy = 0) => ell(z, e.y + yy, r, r, NE, e.x);
    const parts = [
      [loft([ring(e.z - .55, er * .83), ring(e.z, er * .88), ring(e.z - .25, er * .98)]), METAL, 7],
      [loft([ring(e.z - .25, er * .98), ring(e.z - .9, er), ring(e.z - e.len * .5, er * .98), ring(e.z - e.len * .82, er * .88), ring(e.z - e.len, er * .74)]), NAVYP, 0, .5],
      [loft([ring(e.z - e.len, er * .58), ring(e.z - e.len * 1.12, er * .52), ring(e.z - e.len * 1.32, er * .38)]), 0x6d7177, 0, .3],
      [loft([ring(e.z - e.len * 1.32, er * .27), ring(e.z - e.len * 1.42, er * .17), ring(e.z - e.len * 1.5, .02)]), 0x3a3d41, 0, .2],
      [loft([ring(e.z - .55, er * .83), ring(e.z - 1.0, er * .8)]), 0x26282b, 0, .1],
    ];
    for (const [g, c, k, p] of parts) K.add(g, c, k, p || 0).add(g, c, k, p || 0, MIRX);
    const fan = new THREE.CircleGeometry(er * .8, NE).translate(e.x, e.y, e.z - 1.0);
    K.add(fan, 0x101113, 8, e.x).add(fan, 0x101113, 8, -e.x, MIRX);
    const spin = new THREE.ConeGeometry(er * .27, er * .55, NE).rotateX(Math.PI / 2).translate(e.x, e.y, e.z - 1.0 + er * .27);
    K.add(spin, METAL, 7).add(spin, METAL, 7, 0, MIRX);
    const [wyE, wzE] = wy(e.x), pyl = boxG(er * .28, wyE - (e.y + er * .7), e.len * 1.05);
    pyl.translate(e.x, (wyE + e.y + er * .7) / 2 - .08, wzE - e.len * .45 + .4);
    K.add(pyl, WINGG, 0, .3).add(pyl, WINGG, 0, .3, MIRX);
    const body = K.mesh(bodyMat({ uLiv: new THREE.Vector4(...o.liv, e.y), uWin: new THREE.Vector4(...o.win), uZ: new THREE.Vector4(o.zw[0], o.zw[1], o.zc, 0), uDoor: o.doors }));
    const g = new THREE.Group(); g.add(body);
    // gear legs, each built about its hinge so it can fold away (nose forward, mains inward)
    const gm = bodyMat(), gear = [];
    const leg = (x, gg, main) => {
      const k = new Kit(), L = gg.len, hub = 0x8d9196;
      k.add(new THREE.CylinderGeometry(gg.r * .26, gg.r * .3, L, 8).translate(0, -L / 2, 0), 0xb8bbbf, 7);
      if (main && gg.bogie) {
        k.add(boxG(.28, .3, 3.0).translate(0, -L - .15, 0), 0x70747a, 7);
        for (const dz of [-.95, .95]) for (const dx of [-gg.track, gg.track]) { k.add(cylX(gg.r, gg.w, 12).translate(dx, -L - .25, dz), 0x161616, 6); k.add(cylX(gg.r * .55, gg.w + .02, 10).translate(dx, -L - .25, dz), hub, 7); }
      } else {
        const tr = main ? gg.track : gg.pair;
        k.add(boxG(tr * 2, .14, .2).translate(0, -L, 0), 0x70747a, 7);
        for (const dx of [-tr, tr]) { k.add(cylX(gg.r, gg.w, 12).translate(dx, -L - .05, 0), 0x161616, 6); k.add(cylX(gg.r * .55, gg.w + .02, 10).translate(dx, -L - .05, 0), hub, 7); }
      }
      const m = k.mesh(gm); m.position.set(x, gg.y, main ? gg.z : gg.z); g.add(m); gear.push({ m, main, side: Math.sign(x) }); return m;
    };
    leg(0, o.gearN, false); leg(o.gearM.x, o.gearM, true); leg(-o.gearM.x, o.gearM, true);
    const foot = -(o.gearM.y - o.gearM.len - .25 - o.gearM.r);
    // lights: red port tip, green starboard tip, white tail; white strobes on the tips and tail; red beacons; landing lights
    const L = o.lights, lm = lampMat(), sz = o.r * .16;
    g.add(lamps([[L.tip[0] + .1, L.tip[1], L.tip[2], RED, sz], [-L.tip[0] - .1, L.tip[1], L.tip[2], GREEN, sz], [L.tail[0], L.tail[1], L.tail[2] - .1, WHITE, sz * .8],
      [L.tip[0], L.tip[1], L.tip[2] - .4, WHITE, sz * 1.3, 1], [-L.tip[0], L.tip[1], L.tip[2] - .4, WHITE, sz * 1.3, 1], [L.tail[0], L.tail[1] + .1, L.tail[2] - .1, WHITE, sz, 1],
      [L.top[0], L.top[1] + .1, L.top[2], RED, sz * 1.2, 2], [L.bot[0], L.bot[1] - .1, L.bot[2], RED, sz * 1.2, 2],
      [L.land[0], L.land[1], L.land[2], WARMW, sz * 2.4, 3], [-L.land[0], L.land[1], L.land[2], WARMW, sz * 2.4, 3]], lm));
    // contrails: two soft ribbons from the engines, crossed so they read from above and from the side
    const trail = contrail(e.x, e.y, e.z - e.len * 1.5, o.r);
    g.add(trail.mesh);
    return { g, gear, foot, lm, trail };
  }
  function contrail(x, y, z0, r) {
    const P = [], A = [], I = [], S = 10, LEN = r * 140;
    for (const sx of [x, -x]) for (const vert of [0, 1]) {
      const b = P.length / 3;
      for (let i = 0; i <= S; i++) {
        const t = i / S, z = z0 - r * 6 - t * LEN, w = r * (.12 + 1.6 * Math.pow(t, .8));
        for (const side of [-1, 1]) { P.push(sx + (vert ? 0 : side * w), y + (vert ? side * w : 0), z); A.push(t, side); }
      }
      for (let i = 0; i < S; i++) { const a = b + i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(A, 2)); g.setIndex(I);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...uni, uOn: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `attribute vec2 aT; varying vec2 vT; varying vec3 vP; void main(){ vT=aT; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: NOISE + `uniform float uOn, uTime; varying vec2 vT; varying vec3 vP;
        void main(){ float t=vT.x, e=1.-vT.y*vT.y;
          float a=uOn*.34*pow(1.-t,1.6)*smoothstep(0.,.06,t)*e*(.7+.3*vnoise(vec3(vP.z*.08-uTime*.6,vP.x*.3,vP.y*.3)));
          gl_FragColor=vec4(vec3(.86,.89,.94),a);` + END + `}`,
    });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 5;
    return { mesh, mat };
  }

  /* ---------- trains ---------- */
  // Body cross-section: half width hw from bottom yb to roof yt, sides drawn in above the waist (tb), roof corners rr.
  function tprof(hw, yb, yt, rr = .42, tb = .07, z = 0) {
    const R = [[hw - .1, yb], [hw, yb + .12], [hw, yb + .5 * (yt - yb)]];
    for (let k = 0; k <= 3; k++) { const a = k / 3 * Math.PI / 2; R.push([hw - tb - rr + rr * Math.cos(a), yt - rr + rr * Math.sin(a)]); }
    const pts = [...R.map(([x, y]) => v3(x, y, z)), v3(0, yt + .04, z), ...R.slice().reverse().map(([x, y]) => v3(-x, y, z))];
    return pts;
  }
  const ST = {   // per style: car lengths, gap, body sizes, wheel radius, nose stations [d from tip, half width, top, bottom, corner r]
    railjet: { L: [19.3, 26.5, 26.5, 26.9], gap: 1.0, hw: 1.42, yb: 1.0, yt: 4.02, wr: .46, s: 0, loco: [1.5, 4.2], lamp: [0, 1.55, 1.35, 3.95],
      nose: [[3.0, 1.5, 4.2, 1.0, .45], [1.6, 1.49, 4.15, 1.0, .5], [1.25, 1.47, 4.0, .98, .52], [.95, 1.45, 3.62, .96, .5], [.6, 1.42, 3.05, .94, .46], [.32, 1.36, 2.5, .9, .42], [.12, 1.26, 2.1, .86, .38], [0, 1.08, 1.75, .84, .3]] },
    ice: { L: [25.8, 24.8, 24.8, 25.8], gap: .6, hw: 1.47, yb: .82, yt: 3.86, wr: .46, s: 1, lamp: [1.05, 1.3, 4.35, 3.55],
      nose: [[5.6, 1.47, 3.86, .82, .45], [4.7, 1.46, 3.78, .8, .5], [3.7, 1.42, 3.5, .76, .58], [2.7, 1.33, 3.0, .72, .62], [1.8, 1.18, 2.42, .68, .6], [1.0, .97, 1.86, .64, .52], [.42, .72, 1.42, .6, .42], [.12, .48, 1.18, .58, .3], [0, .26, 1.06, .6, .18]] },
    sbahn: { L: [16.9, 16.4, 16.4, 16.9], gap: .35, hw: 1.51, yb: .8, yt: 3.72, wr: .42, s: 2, lamp: [0, 1.35, .7, 3.45],
      nose: [[1.9, 1.51, 3.72, .8, .45], [1.25, 1.5, 3.68, .8, .48], [.78, 1.47, 3.42, .78, .5], [.42, 1.42, 2.98, .76, .48], [.16, 1.34, 2.42, .74, .42], [0, 1.18, 2.0, .74, .35]] },
  };
  const TRUCK = 0x2c2f33;
  function bogie(K, z, wr, base, frame = 2.1) {
    K.add(boxG(frame, .34, base + 1.0).translate(0, wr + .1, z), TRUCK, 0, .15);
    for (const dz of [-base / 2, base / 2]) for (const dx of [-.76, .76]) K.add(cylX(wr, .14, 10).translate(dx, wr, z + dz), 0x1d1f22, 7);
    K.add(boxG(2.5, .2, .5).translate(0, wr + .25, z + base / 2 + .55), TRUCK, 0, .1);
  }
  // single-arm pantograph, raised to the contact wire (5.6 m) or folded on the roof
  function pantograph(K, z, roof, up) {
    const top = up ? 5.6 : roof + .55, hinge = roof + .32, dz = up ? 1.15 : 1.9, kneeY = up ? (hinge + top) / 2 + .1 : hinge + .12;
    K.add(boxG(1.2, .1, 1.1).translate(0, roof + .12, z), 0x3b3e42, 7);
    for (const dx of [-.5, .5]) K.add(new THREE.CylinderGeometry(.07, .09, .3, 6).translate(dx, roof + .1, z - .4), 0x9b6a4a, 0, .5);
    const arm = (a, b, w) => { const d = new V3().subVectors(b, a), g = boxG(w, w, d.length()); g.lookAt(d); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g; };
    const h = v3(0, hinge, z + .45), k = v3(0, kneeY, z - dz + .45), t = v3(0, top - .08, z + .45);
    K.add(arm(h, k, .09), 0x55595e, 7).add(arm(k, t, .06), 0x55595e, 7).add(arm(v3(0, hinge + .05, z + .1), k, .035), 0x55595e, 7);
    K.add(boxG(1.95, .07, .28).translate(0, top, z + .45), 0x4a4d51, 7);
    for (const dx of [-1.0, 1.0]) K.add(boxG(.25, .06, .2).rotateZ(dx * .6).translate(dx * 1.05, top - .06, z + .45), 0x4a4d51, 7);
  }
  // one car of a set: i 0 lead (cab at +z), 3 rear (the lead car's twin, turned round), else middle
  function buildCar(key, i) {
    const S = ST[key], K = new Kit(), L = S.L[i], h = L / 2, cab = i === 0 || i === 3, N = S.nose;
    const loco = key === 'railjet' && i === 0, nl = cab ? N[0][0] : 0, kind4 = (t, hh) => S.s * 1000 + t * 100 + hh;
    // body: straight part, then the nose loft at the cab end(s)
    const z1 = cab ? h - nl : h, z0 = loco ? -h + nl : -h, bw = loco ? S.loco[0] : S.hw, bt = loco ? S.loco[1] : S.yt;
    const prof = z => tprof(bw, S.yb, bt, .42, .07, z);
    K.add(loft([prof(z0), prof(z1)], { cap0: !loco, cap1: !cab }), 0xffffff, 4, kind4(loco ? 2 : cab ? 1 : 0, Math.min(h, 99)));
    // the nose stations are drawn for the first one's size; stretch them to this car's body
    const [, w0, t0, b0] = N[0], kx = bw / w0, ky = (bt - S.yb) / (t0 - b0), Y = y => S.yb + (y - b0) * ky;
    const nose = loft(N.map(([d, hw, yt, yb, rr]) => tprof(hw * kx, Y(yb), Y(yt), rr, .07 * hw / w0, h - d)), { cap1: true });
    if (cab) K.add(nose, 0xffffff, 10, S.s * 100 + h);
    if (loco) K.add(nose, 0xffffff, 10, S.s * 100 + h, M4().makeScale(1, 1, -1));
    // underframe, bogies, gangways, roof gear
    const fl = S.yb + .02;
    K.add(boxG(S.hw * 1.7, fl - S.wr * 1.2, L * .5).translate(0, (fl + S.wr * 1.2) / 2, 0), 0x202225, 0, .1);
    if (key === 'sbahn') {                       // shared (Jacobs) bogies at the car joints: each car carries the one behind it
      bogie(K, -h, S.wr, 2.2); if (cab) bogie(K, h - 2.4, S.wr, 2.2);
    } else {
      const bc = loco ? 4.95 : h - (cab ? 3.8 : 3.4); bogie(K, bc, S.wr, loco ? 2.9 : 2.5, loco ? 2.4 : 2.1); bogie(K, -(loco ? 4.95 : h - 3.4), S.wr, loco ? 2.9 : 2.5, loco ? 2.4 : 2.1);
    }
    const gw = S.gap / 2 + .08, bel = (z, s) => K.add(boxG(2.3, S.yt - S.yb - .55, gw).translate(0, (S.yt + S.yb) / 2 - .1, z + s * gw / 2), 0x151617, 6);
    if (!loco) { bel(-h, -1); if (!cab) bel(h, 1); }
    const roof = S.yt + .04;
    if (loco) { pantograph(K, -4.4, roof, true); pantograph(K, 4.4, roof, false); K.add(boxG(1.6, .25, 4.0).translate(0, roof + .05, 0), 0x55585c, 7); }
    else {
      if ((key === 'ice' && i === 1) || (key === 'sbahn' && i === 1)) pantograph(K, key === 'sbahn' ? 2.5 : -3, roof, true);
      for (const zz of key === 'sbahn' ? [-4.5] : [h - 6.5, -h + 6.5]) K.add(boxG(1.7, .28, 2.6).translate(0, roof + .06, zz), 0x6a6d70, 9, .25);
    }
    const g = new THREE.Group(), m = K.mesh(trainMat); g.add(m);
    // contact shadow under the car while it stands at life size on the ground
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(S.hw * 2.5, L + 1).rotateX(-Math.PI / 2).translate(0, .06, 0), shadowMat); sh.renderOrder = 1; g.add(sh);
    if (cab) {                                     // two low lamps and one high; red tail lamps for the car at the back
      const [ld, ly, td, ty] = S.lamp, lw = bw * .62, lz = h - ld + .08;
      g.add(lamps([[lw, ly, lz, WARMW, .55, 3], [-lw, ly, lz, WARMW, .55, 3], [0, ty, h - td + .1, WARMW, .5, 3]], headMat));
      g.add(lamps([[lw, ly, lz, TAIL, .45], [-lw, ly, lz, TAIL, .45]], tailMat));
    }
    return g;
  }
  const trainMat = bodyMat(), shadowMat = new THREE.ShaderMaterial({
    uniforms: { uAir: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vU; void main(){ vU=uv; vec4 mv=modelViewMatrix*vec4(position,1.); float pd=length(mv.xyz), sc=length(modelMatrix[0].xyz);
      mv.xyz*=max(1.-(1.5*sc+.0003*pd)/max(pd,1e-4),.5); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uAir; varying vec2 vU; void main(){ vec2 q=abs(vU*2.-1.); float d=length(max(q-vec2(.55,.8),0.)/vec2(.45,.2));
      gl_FragColor=vec4(0.,0.,0.,.5*(1.-uAir)*(1.-smoothstep(.15,1.,d)));` + END + `}`,
  });
  const vanShadow = shadowMat.clone();
  const headMat = lampMat(), tailMat = lampMat(); lampMats.push(headMat, tailMat);
  headMat.uniforms.uLand.value = 1;

  /* ---------- the MPV ---------- */
  function vprof(z, yb, yt, wb, wt, rr) {        // rounded box, drawn in above the waist (1.05 m)
    const belt = Math.min(1.05, yt - rr - .05), R = [[wb - .08, yb], [wb, yb + .1], [wb, belt], [wt, Math.max(belt + .02, yt - rr)]];
    for (let k = 1; k <= 3; k++) { const a = k / 3 * Math.PI / 2; R.push([wt - rr + rr * Math.cos(a), yt - rr + rr * Math.sin(a)]); }
    return [...R.map(([x, y]) => v3(x, y, z)), v3(0, yt + .015, z), ...R.slice().reverse().map(([x, y]) => v3(-x, y, z))];
  }
  function buildVan() {
    const K = new Kit();
    const st = [[-2.56, .34, 1.83, .9, .78, .16], [-2.47, .26, 1.89, .955, .835, .2], [-1.6, .22, 1.9, .965, .845, .2], [.3, .22, 1.9, .965, .845, .2],
      [.72, .22, 1.84, .965, .835, .22], [1.2, .22, 1.56, .96, .81, .24], [1.72, .22, 1.16, .95, .79, .24], [2.2, .23, 1.0, .925, .76, .22], [2.48, .29, .88, .87, .72, .2], [2.58, .36, .76, .76, .64, .16]];
    K.add(loft(st.map(a => vprof(...a)), { cap0: true, cap1: true }), 0x1c2129, 5);
    for (const wz of [1.6, -1.6]) for (const wx of [.86, -.86]) {
      K.add(cylX(.345, .24, 14).translate(wx, .345, wz), 0x141414, 6);
      K.add(cylX(.24, .02, 12).translate(wx + Math.sign(wx) * .12, .345, wz), 0x9fa3a8, 7);
    }
    for (const sx of [1, -1]) K.add(boxG(.2, .13, .09).translate(sx * 1.03, 1.12, .78), 0x1c2129, 0, .6).add(boxG(.12, .04, .05).translate(sx * .95, 1.12, .78), 0x111111, 6);
    const g = new THREE.Group(); g.add(K.mesh(bodyMat()));
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.6).rotateX(-Math.PI / 2).translate(0, .04, 0), vanShadow); sh.renderOrder = 1; g.add(sh);
    g.add(lamps([[.64, .8, 2.6, WARMW, .32, 3], [-.64, .8, 2.6, WARMW, .32, 3], [.82, 1.3, -2.57, TAIL, .26], [-.82, 1.3, -2.57, TAIL, .26]], headMat));
    g.add(spray());
    return g;
  }
  // slush thrown up behind the wheels: points riding short arcs, looping on uTime
  const sprayMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uni.uTime, uFocal: uni.uFocal, uSpray: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aS; uniform float uTime, uFocal, uSpray; varying float vA;
      void main(){ float t=fract(uTime*1.7+aS.w), s=aS.z;
        vec3 p=vec3(aS.x+sign(aS.x)*(.04+.35*t*fract(s*7.1)), .12+1.5*t*(.5+.5*fract(s*13.7))-1.6*t*t, aS.y-.35-2.6*t*(.6+.6*fract(s*3.3)));
        vec4 mv=modelViewMatrix*vec4(p,1.); float sc=length(modelMatrix[0].xyz);
        gl_PointSize=clamp((.3+1.1*t)*sc*uFocal/max(-mv.z,1e-4),1.,48.);
        vA=uSpray*(1.-t)*smoothstep(0.,.12,t)*.55; gl_Position=uSpray<.01?vec4(2.,2.,2.,1.):projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; void main(){ vec2 q=gl_PointCoord*2.-1.; float r=dot(q,q); if(r>1.) discard;
      gl_FragColor=vec4(vec3(.74,.77,.82),vA*(1.-r)*(1.-r));` + END + `}`,
  });
  function spray() {
    const P = [], S = [], n = lite ? 10 : 16;
    for (const wz of [1.6, -1.6]) for (const wx of [.86, -.86]) for (let k = 0; k < (wz < 0 ? n : n / 2); k++) { P.push(0, 0, 0); S.push(wx, wz, Math.random(), Math.random()); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 4));
    const m = new THREE.Points(g, sprayMat); m.frustumCulled = false; m.renderOrder = 5; return m;
  }

  /* ---------- fill the groups index.html places ---------- */
  const clear = o => { for (const c of [...o.children]) o.remove(c); };
  const planes = [VH.plane, VH.plane2].filter(Boolean).map(P => {
    clear(P);
    const hold = new THREE.Group(); hold.scale.setScalar(1 / 60); P.add(hold);
    const w = buildJet(WIDE), nb = buildJet(NARROW);
    nb.g.scale.setScalar(1.4); nb.foot *= 1.4;          // a little larger than life, so the short hops still read on the map
    hold.add(w.g, nb.g); nb.g.visible = false;
    return { P, w, nb, cur: w, gear: 1, shown: false };
  });
  const STY = ['railjet', 'ice', 'sbahn'], holds = [];
  const sets = VH.cars.map((c, i) => {
    clear(c);
    const hold = new THREE.Group(); hold.scale.setScalar(1 / 25); c.add(hold); holds.push(hold);
    const out = {};
    for (const k of STY) {
      const g = buildCar(k, i); if (i === 3) g.scale.z = -1;
      const lamp = g.children.filter(x => x.isPoints);
      if (lamp.length) { lamp[0].visible = i === 0; lamp[1].visible = i === 3; }
      g.visible = false; hold.add(g); out[k] = g;
    }
    return out;
  });
  const offs = k => { const S = ST[k], o = [0]; for (let i = 1; i < 4; i++) o.push(o[i - 1] + (S.L[i - 1] + S.L[i]) / 2 + S.gap); return o.map(x => x / 25); };
  let style = '', pinned = null;
  function setStyle(k) {
    if (k === style) return; style = k;
    sets.forEach(s => STY.forEach(n => { s[n].visible = n === k; }));
    VH.train.userData.offs = offs(k);
  }
  const styleFor = s => { const r = (s && s.routes) || []; return r.includes('aptCity') ? 'sbahn' : r.includes('mucNue') ? 'ice' : 'railjet'; };
  setStyle(styleFor(ctx.step));
  clear(VH.van);
  const vanHold = new THREE.Group(); vanHold.scale.setScalar(1 / 5); VH.van.add(vanHold); vanHold.add(buildVan());

  /* ---------- overhead line near the train: masts and wires along the track, scaled with the train ---------- */
  const OHL = (() => {
    const k = new Kit();
    k.add(boxG(.28, 7.6, .28).translate(3.1, 3.8, 0), 0x5c6064, 7);
    k.add(boxG(2.9, .1, .1).translate(1.75, 7.0, 0), 0x5c6064, 7).add(boxG(2.9, .07, .07).rotateZ(-.32).translate(1.65, 6.4, 0), 0x5c6064, 7);
    k.add(new THREE.CylinderGeometry(.05, .05, .9, 5).translate(.3, 6.4, 0), 0x6f4d38, 0, .4);
    const n = lite ? 22 : 34, mesh = new THREE.InstancedMesh(k.geo(), bodyMat(), n);
    mesh.frustumCulled = false; mesh.visible = false; mesh.count = 0;
    const wires = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: col(0x26292d), transparent: true, opacity: .6 }));
    wires.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3)); wires.frustumCulled = false; wires.visible = false;
    const root = new THREE.Group(); root.add(mesh, wires); ctx.scene.add(root);
    return { mesh, wires, root, n };
  })();
  const _a = new V3(), _b = new V3(), _t = new V3(), _q = new V3(), _m = new THREE.Matrix4(), _x = new V3(), _y = new V3(), _z = new V3(), _o = new V3();
  // Masts every 62 m along the track, drawn while the camera is within a few km (further out they'd only blur into a
  // dark band beside the train); grown with the train, only every 2nd or 4th mast stands, each where it always stands,
  // so the line doesn't slide as the camera zooms.
  function updateOHL() {
    const T = VH.train, ud = T.userData, path = ud.path, k = VH.cars[0].scale.x / .025, show = T.visible && path && !ctx.city && k < 4;
    OHL.mesh.visible = OHL.wires.visible = !!show; if (!show) return;
    const e = fat(k), air = VH.cars[0].userData.air || 0, step = .062 * Math.pow(2, clamp(Math.round(Math.log2(k)), 0, 2));
    const i0 = Math.floor((ud.d - step * OHL.n * .42) / step), sc = k / 1000;
    path.at(clamp(ud.d, 0, path.len), _o); OHL.root.position.copy(_o);
    const pos = OHL.wires.geometry.attributes.position.array; let c = 0, w0 = null, m0 = null;
    for (let i = 0; i < OHL.n; i++) {
      const d = (i0 + i) * step; if (d < 0 || d > path.len) continue;
      path.at(d, _a, _t);
      const n = _q.copy(_a).normalize(), g = meshKm(Math.asin(n.y) / D2R, Math.atan2(n.x, n.z) / D2R);
      _b.copy(n).multiplyScalar(R + lerp(g, _a.length() - R, air)).sub(_o);
      _y.copy(n); _z.copy(_t).addScaledVector(_y, -_t.dot(_y)).normalize(); _x.crossVectors(_y, _z).normalize();
      OHL.mesh.setMatrixAt(c, _m.makeBasis(_x, _y, _z).scale(_q.set(sc * e, sc * e, sc)).setPosition(_b));
      const w = _a.copy(_b).addScaledVector(_y, 5.6 * sc * e), m = _t.copy(_b).addScaledVector(_y, 7.0 * sc * e).addScaledVector(_x, .4 * sc * e);
      if (w0) pos.set([w0.x, w0.y, w0.z, w.x, w.y, w.z, m0.x, m0.y, m0.z, m.x, m.y, m.z], (c - 1) * 12);
      w0 = (w0 || new V3()).copy(w); m0 = (m0 || new V3()).copy(m); c++;
    }
    OHL.mesh.count = c; OHL.mesh.instanceMatrix.needsUpdate = true;
    OHL.wires.geometry.setDrawRange(0, Math.max(0, c - 1) * 4); OHL.wires.geometry.attributes.position.needsUpdate = true;
  }

  // Blown up for a wide shot, a train of true proportions thins to a hairline: widen and heighten it (not lengthen) as it grows.
  const fat = k => 1 + smooth(1.5, 6, k);

  /* ---------- per frame: which jet, gear, lights, contrails; train style; van spray; shadows ---------- */
  let vanPrev = null, vanSpeed = 0;
  function update(dt) {
    const dpr = renderer.getPixelRatio();
    for (const m of lampMats) m.uniforms.uDpr.value = dpr;
    for (const p of planes) {
      if (!p.P.visible) { p.shown = false; continue; }
      const ud = p.P.userData, path = ud.path; if (!path) continue;
      const f = clamp(ud.d / path.len, 0, 1), wide = (path.groundKm || path.len) > 3000, J = wide ? p.w : p.nb;
      if (J !== p.cur) { p.cur.g.visible = false; J.g.visible = true; p.cur = J; }
      ud.foot = J.foot / 60;
      const want = f < .028 || f > .95 ? 1 : 0;
      p.gear = !p.shown || reduceMotion ? want : clamp(p.gear + clamp(want - p.gear, -dt / 1.6, dt / 1.6), 0, 1); p.shown = true;
      const fold = (1 - smooth(0, 1, p.gear)) * Math.PI * .5;
      for (const q of J.gear) { q.m.visible = p.gear > .02; q.m.rotation.set(q.main ? 0 : -fold, 0, q.main ? -q.side * fold : 0); }
      J.lm.uniforms.uLand.value = smooth(.3, 1, p.gear);
      J.trail.mat.uniforms.uOn.value = smooth(.1, .2, f) * (1 - smooth(.8, .9, f));
    }
    const T = VH.train;
    if (T.visible) {
      setStyle(pinned || styleFor(ctx.step));
      VH.cars.forEach((c, i) => { const e = fat(c.scale.x / .025) / 25; holds[i].scale.set(e, e, 1 / 25); });
      shadowMat.uniforms.uAir.value = VH.cars[0].userData.air ?? 1;
    }
    updateOHL();
    const van = VH.van;
    if (van.visible) {
      const s = van.scale.x;
      if (vanPrev && dt > 0) vanSpeed = lerp(vanSpeed, van.position.distanceTo(vanPrev) / dt / s, clamp(dt * 6, 0, 1));
      (vanPrev || (vanPrev = new V3())).copy(van.position);
      sprayMat.uniforms.uSpray.value = ctx.winter * smooth(.8, 6, vanSpeed) * (reduceMotion ? 0 : 1);
      vanShadow.uniforms.uAir.value = van.userData.air ?? 1;
    } else vanPrev = null;
  }

  // ?debug: park a vehicle at lat, lon heading hd (deg), at index.html's scale s (km per unit) and flight moment f
  function show(kind, lat, lon, hd = 0, s = 0, f = .5, sty) {
    if (sty && ST[sty]) { pinned = sty; setStyle(sty); }
    const list = kind === 'train' ? VH.cars : [kind === 'plane2' ? VH.plane2 : VH[kind]];
    const min = kind === 'train' ? .025 : kind === 'van' ? .008 : .06; s = s || min;
    const base = llv(lat, lon, 0), e = enu(base), h = hd * D2R, fw = e.north.clone().multiplyScalar(Math.cos(h)).addScaledVector(e.east, Math.sin(h));
    const o = kind === 'train' ? VH.train.userData.offs : [0];
    list.forEach((obj, i) => {
      const p = base.clone().addScaledVector(fw, -o[i] * s);
      const n = p.clone().normalize(), air = kind.startsWith('plane') ? 0 : 0;
      p.copy(n).multiplyScalar(R + meshKm(Math.asin(n.y) / D2R, Math.atan2(n.x, n.z) / D2R) + (kind.startsWith('plane') ? .093 * s : 0));
      _y.copy(n); _z.copy(fw).addScaledVector(_y, -fw.dot(_y)).normalize(); _x.crossVectors(_y, _z).normalize();
      obj.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z)); obj.position.copy(p); obj.scale.setScalar(s); obj.visible = true; obj.userData.air = air;
    });
    if (kind === 'train') VH.train.visible = true;       // keeps the leg's path, so the overhead line still shows
    if (kind.startsWith('plane')) { list[0].userData.path = { len: 1, groundKm: sty === 'narrow' ? 1000 : 7000 }; list[0].userData.d = f; }
    return 'ok';
  }

  return {
    update,
    onStep(s) { pinned = null; setStyle(styleFor(s)); },
    show,
  };
}
