// Streets: the town floor between the houses. Overture street centrelines (assets/streets/<area>.json, built by
// tools/streets_pack.py) become ribbons draped on the drawn terrain: snow-cleared wet asphalt with slush in the gutters,
// worn lane and tram lines, granite kerbs and pavements reaching to the facades, pale granite setts with a dusting of snow
// in the pedestrian zones and squares, trodden snow on the park paths, snowy ballast and sleepers at the stations, and
// ploughed banks along the roads in the open. Detail is box-filtered in the shader (it never shimmers), strips thinner
// than a pixel are widened and faded, and everything fades into the imagery by ~5 km. Drawn right after the terrain and
// before anything else, without writing depth: houses, water, bridges, huts and trees all simply cover it.
// create(ctx) returns { update(dt, alt), onPack(name), onStep(step), onCity(on) }.
export default function create(ctx) {
  const { THREE, V3, R, BB, EXAG, uni, NOISE, HAZE, LIGHT, scene, llv, enu, terrainKm, phone, clamp } = ctx;
  const lite = phone();
  const PACK_AREAS = { munich: ['muc'], inn: ['muc', 'inn'], nue: ['muc', 'nue'], neu: ['muc', 'neu'] };
  const FAR0 = lite ? 2.2 : 2.8, FAR1 = lite ? 4.2 : 5;      // km: the streets fade into the imagery between these
  const SHOW = FAR1 + 1, KINK = lite ? .9 : .5;              // m: a bend in the reach profile that earns its own station

  /* ---------- the terrain mesh exactly as the GPU draws it: two triangles per cell ---------- */
  const TNX = lite ? 440 : 720, TNY = lite ? 660 : 1080, corner = new Map();
  const gLat = k => BB.S + (BB.N - BB.S) * k / (TNY - 1), gLon = k => BB.W + (BB.E - BB.W) * k / (TNX - 1);
  function cornerKm(i, j) {
    const key = j * 4096 + i; let v = corner.get(key);
    if (v === undefined) { v = terrainKm(gLat(j), gLon(i)); corner.set(key, v); }
    return v;
  }
  function groundKm(lat, lon) {
    const fu = (lon - BB.W) / (BB.E - BB.W) * (TNX - 1), fv = (lat - BB.S) / (BB.N - BB.S) * (TNY - 1);
    if (fu <= 0 || fv <= 0 || fu >= TNX - 1 || fv >= TNY - 1) return terrainKm(lat, lon);
    const i = Math.floor(fu), j = Math.floor(fv), x = fu - i, y = fv - j;
    if (x + y <= 1) { const a = cornerKm(i, j); return a + (cornerKm(i + 1, j) - a) * x + (cornerKm(i, j + 1) - a) * y; }
    const d = cornerKm(i + 1, j + 1);
    return d + (cornerKm(i, j + 1) - d) * (1 - x) + (cornerKm(i + 1, j) - d) * (1 - y);
  }

  /* ---------- shader ---------- */
  // aUV: metres along the line and across it (+ left); polygons: metres in the square's own axes
  // aE: floor reach left / right and carriageway half-width (0.25 m), rim (polygons, 0 at the outline .. 255 inside)
  // aK: kind, pass (0 floor, 1 carriageway, 2 overlay), flags, seed     aN: unit across direction (east, north)
  const VS = `attribute vec2 aUV, aN; attribute vec4 aE, aK; uniform vec3 uEast, uNorth; uniform float uPull, uFocal;
    varying vec3 vL; varying vec2 vUV; varying vec4 vE, vK; varying float vW;
    void main(){
      vec3 p=position; vec4 mv=viewMatrix*vec4((modelMatrix*vec4(p,1.)).xyz,1.);
      // strips narrower than ~1.3 px are widened to that and faded by as much: thin paths far off never sparkle
      float hw=abs(aUV.y), k=1.;
      if(hw>.01 && aK.x<29.5){ k=max(1.,.65*(-mv.z)*1000./uFocal/hw); p+=(uEast*aN.x+uNorth*aN.y)*aUV.y*(k-1.)*.001;
        mv=viewMatrix*vec4((modelMatrix*vec4(p,1.)).xyz,1.); }
      // the terrain carries a metre or two of float32 noise near the eye: pull the depth (not the picture) toward it
      float d=length(mv.xyz); mv.xyz*=max(1.-(uPull+.0005*d)/max(d,.02),.5);
      gl_Position=projectionMatrix*mv; vL=p; vUV=aUV; vE=aE; vK=aK; vW=k; }`;
  const FS = NOISE + HAZE + LIGHT + `
    uniform vec3 uOrigin, uRegionSun, uEast, uNorth; uniform vec4 uBox; uniform float uAlt, uWinter, uSnowLine, uFade, uFar0, uFar1, uDbg;
    varying vec3 vL; varying vec2 vUV; varying vec4 vE, vK; varying float vW;
    const vec3 SNOW=vec3(.84,.87,.91), SLUSH=vec3(.28,.265,.24);              // stone colours lean warm against the blue sky light
    float bt(float x, float s){ return mod(floor(x/exp2(s)), 2.); }
    // box filters over the pixel footprint f: coverage of [a,b], and of pulses [a+kP, a+kP+w]
    float box1(float x, float f, float a, float b){ return clamp((min(x+.5*f,b)-max(x-.5*f,a))/f,0.,1.); }
    float Fp(float x, float a, float w, float P){ float c=floor(x/P); return c*w+clamp(x-c*P-a,0.,w); }
    float pulse(float x, float f, float a, float w, float P){ return (Fp(x+.5*f,a,w,P)-Fp(x-.5*f,a,w,P))/f; }
    // value noise in metres with cells of c m, flattened to its mean once a cell nears the pixel size
    float fn(vec2 p, float c, float mpp){ return mix(.5, vnoise(vec3(p/c,c)), 1.-smoothstep(.3*c,.8*c,mpp)); }
    float fnA(vec2 p, vec2 c, float mpp){ return mix(.5, vnoise(vec3(p/c,c.x+c.y)), 1.-smoothstep(.3*min(c.x,c.y),.8*min(c.x,c.y),mpp)); }   // stretched cells
    // pale granite setts in running bond, joints and stone-to-stone tone fading out with distance
    vec3 granite(vec2 p, float fx, float fy, float mpp, float sd, float warm){
      float row=floor(p.y/.2), x=p.x+.17*mod(row,2.);
      float lod=1.-smoothstep(.05,.18,mpp), h=hash(vec3(floor(x/.34),row,sd*31.));
      vec3 g=mix(vec3(.23,.222,.205),vec3(.27,.24,.204),warm)*(1.+(h-.5)*.3*lod);
      float j=max(pulse(x,fx,0.,.025,.34),pulse(p.y,fy,0.,.025,.2));
      return g*(1.-.3*j)*(.9+.2*fn(p,4.,mpp))*(.95+.1*fn(p+3.1,1.1,mpp));
    }
    vec3 asphaltC(vec2 q, float mpp, float sd){
      float t=(.84+.32*fn(q,7.,mpp)+.12*(sd-.5))*(.93+.14*fn(q*1.9,1.3,mpp));
      return mix(vec3(.085,.08,.074), vec3(.043,.041,.038), uWinter)*t;           // wet in winter, dry grey otherwise
    }
    void main(){
      vec3 wp=vL+uOrigin, up=normalize(wp), toC=cameraPosition-wp; float dist=length(toC); vec3 V=toC/dist;
      vec2 q=vec2(dot(vL,uEast),dot(vL,uNorth))*1000.;                          // local metres, east / north
      vec4 bx=vec4(q-uBox.xy, uBox.zw-q);
      float a=uFade*(1.-smoothstep(uFar0,uFar1,dist))*smoothstep(0.,160.,min(min(bx.x,bx.y),min(bx.z,bx.w)));
      float kind=floor(vK.x+.5), pass=floor(vK.y+.5), flags=floor(vK.z+.5), sd=vK.w/255., W=uWinter;
      // out of town the snow follows the terrain's own (little in the valleys, deep above the snow line); towns keep theirs
      float hM=(length(wp)-${R.toFixed(1)})*1000./${EXAG.toFixed(2)}, ts=smoothstep(uSnowLine-300.,uSnowLine+300.,hM);
      float Wo=W*(.25+.75*ts), Wb=W*(.5+.5*ts);
      float urban=bt(flags,0.), sett=bt(flags,1.), loose=bt(flags,2.), stram=bt(flags,4.);
      float u=vUV.x, v=vUV.y, av=abs(v), rim=vE.w/255.;
      float fu=max(fwidth(u),.003), fv=max(fwidth(v)*vW,.003), mpp=max(length(fwidth(q)),.003), fr=max(fwidth(rim),.01);
      float c=vE.z*.25, e=(v>0.?vE.x:vE.y)*.25, al=1., wet=0.;
      // from a few hundred metres on the network softens into the imagery: paths first, the open country most
      float far=smoothstep(.6,2.2,dist);
      a*=kind>9.5&&kind<14.5 ? (urban>.5 ? mix(1.,.45,far) : .8*(1.-smoothstep(.3,.9,dist))) : mix(1.,urban>.5||kind>8.5?.85:.65,far);   // country paths only close by
      if(a<.004) discard;                                                            // (derivatives above, before any discard)
      vec3 col;
      if(kind>29.5){
        // ---- squares, car parks, platforms ----
        al=smoothstep(0.,.75,rim);
        if(kind<31.5){
          vec3 g=granite(vUV,fu,fv,mpp,sd,.6);
          // granite bands laid in a grid across the square, and a dark course round its edge
          float band=max(pulse(u,fu,0.,.45,kind>30.5?6.:9.),pulse(v,fv,0.,.45,kind>30.5?6.:9.));
          g*=1.+.12*band;
          float trod=smoothstep(.35,.7,fn(q+17.,16.,mpp))*smoothstep(.6,1.,rim);        // where the crowds walk the snow is gone
          float dust=W*clamp(.03+.32*smoothstep(.5,.95,fn(q,9.,mpp)+.15*fn(q,2.,mpp))*(1.-.8*trod),0.,.85);
          col=mix(g, SNOW*.93, dust); wet=W*trod*(1.-dust)*.65;
        } else if(kind<32.5){
          vec3 asp=asphaltC(q,mpp,sd);
          float pk=Wb*clamp(.35+.55*fn(q,5.,mpp),0.,1.);                     // packed snow, tyre-polished patches
          col=mix(asp, mix(SLUSH,SNOW*.8,.6+.3*fn(q*2.,1.4,mpp)), pk); wet=W*(1.-pk)*.8; al*=.85;
        } else {
          float j=max(pulse(u,fu,0.,.03,.6),pulse(v,fv,0.,.03,.6));
          vec3 cs=vec3(.2,.2,.195)*(1.-.35*j)*(.9+.2*fn(q,3.,mpp));
          float dust=W*clamp(.2+.5*fn(q*1.4,2.,mpp),0.,.9);
          col=mix(cs, SNOW*.92, dust);
          float edge=box1(rim,fr,.2,.32);                              // white line along the platform edge
          col=mix(col, vec3(.62,.62,.6), edge*.8); wet=W*(1.-dust)*.4;
        }
      } else if(kind<8.5 && pass<.5){
        // ---- the floor along a road: kerb, pavement to the facades, or a ploughed bank in the open ----
        if(av<c-.3) discard;                                                           // the carriageway pass covers it
        float kerb=box1(av,fv,c,c+.25);
        al=1.-smoothstep(e-max(.8,fv*1.5),e,av);
        if(urban>.5){
          float pw=max(e-c-.25,.5), t=clamp((av-c-.25)/pw,0.,1.);
          float j=max(pulse(u,fu,0.,.025,.5),pulse(av-c,fv,0.,.025,.5));
          vec3 pv=mix(vec3(.155,.148,.136),vec3(.175,.163,.146),sett)*(1.-.2*j)*(.92+.16*fnA(vec2(u,av),vec2(6.,2.),mpp));
          if(sett>.5) pv=granite(vec2(u,av),fu,fv,mpp,sd,.4);
          // snow ploughed off the road onto the kerb: a ridge 0.4-1.3 m wide, broken where people cross
          float rw=.4+.9*fnA(vec2(u,sd*40.),vec2(7.,9.),mpp), gap=smoothstep(.4,.55,fnA(vec2(u,sd*30.+9.),vec2(11.,9.),mpp));
          float ridge=W*(1.-smoothstep(rw*.6,rw,av-c-.25))*gap;
          // trodden and wet down the middle of the pavement, a little snow kept along the walls
          float tread=smoothstep(.12,.4,t)*(1.-smoothstep(.62,.95,t)), wall=.6*smoothstep(e-1.6,e-.5,av);
          float dust=W*clamp(.16+.34*fnA(vec2(u,av),vec2(5.,1.3),mpp)-.3*tread+wall,0.,.85);
          col=mix(pv, mix(SNOW*.76,SNOW*.95,fnA(vec2(u,av),vec2(3.,.8),mpp)), dust);
          col=mix(col, mix(SLUSH*1.5,SNOW*.88,.4+.45*fnA(vec2(u,av),vec2(2.,.5),mpp)), ridge);
          wet=W*.6*(1.-ridge)*(1.-dust)*(.5+.5*tread);
        } else {
          float t=clamp((av-c-.25)/max(e-c-.25,.3),0.,1.);
          vec3 bank=mix(mix(SLUSH*1.6,SNOW*.92,.45+.3*fn(q*2.,1.,mpp)), SNOW*.92, smoothstep(.05,.7,t));
          col=mix(vec3(.11,.1,.085)*(.8+.4*fn(q,3.,mpp)), bank, Wo);                 // gravel shoulder when it's bare
          al*=(.25+.5*(1.-t))*mix(1.,.3,far);
        }
        col=mix(col, mix(vec3(.25,.24,.225),SNOW*.92,W*.25*(1.-urban)), kerb*mix(.5,.9,urban));
      } else if(kind<8.5){
        // ---- carriageway: wet dark asphalt, slush in the gutters, compact snow and wheel ruts on the small streets ----
        vec3 asp=asphaltC(q,mpp,sd);
        float minor=step(5.5,kind), nL=max(2.,floor(2.*c/3.1+.25)), lw=2.*c/nL, x=v+c;
        float lv=mod(x,lw)-lw*.5, rut=1.-smoothstep(.25,.55,abs(abs(lv)-.85));      // the wheel tracks of each lane
        float gut=1.-smoothstep(.25,.7+.8*fnA(vec2(u,0.),vec2(6.,1.),mpp),c-av);          // slush banked in the gutters
        float crown=minor*(.45+.4*fnA(vec2(u,v),vec2(9.,1.5),mpp))*(1.-rut);            // packed snow between the ruts on side streets
        float sl=W*clamp(gut*(.6+.4*fnA(vec2(u,v),vec2(3.,.6),mpp))+crown,0.,1.);
        col=mix(asp, mix(SLUSH, SNOW*.8, minor*.5+.3*fnA(vec2(u,v),vec2(2.,.5),mpp)), sl);
        col*=1.-.15*rut*(1.-sl);
        col*=1.-.35*box1(c-av,fv,0.,.1);                                              // the kerb's shadow line
        wet=W*(1.-sl)*(.75+.25*rut)+(1.-W)*.05;
        // worn lane lines on the main roads (centre solid on the wide ones), dashed centre on the smaller through roads
        float k=floor(x/lw+.5), dl=x-k*lw, inner=step(.5,k)*step(k,nL-.5), centre=step(abs(k-nL*.5),.1);
        float dash=pulse(u,fu,0.,3.,9.), mark=0.;
        if(kind<4.5) mark=box1(dl,fv,-.07,.07)*inner*(centre>.5&&nL>3.5?1.:dash);
        else if(kind<5.5 && c>3.6) mark=box1(dl,fv,-.06,.06)*centre*dash;
        if(urban<.5 && kind<6.5) mark=max(mark, .7*box1(av,fv,c-.48,c-.38));            // edge lines out of town
        mark*=(1.-.8*sl)*(.55+.45*fn(q*2.7,.9,mpp));
        col=mix(col, vec3(.6,.6,.58)*mix(1.,.8,W), mark*.75);
      } else if(kind<9.5){
        // ---- pedestrian street: granite setts facade to facade, a dark gutter course, trodden and wet down the middle ----
        al=1.-smoothstep(e-max(.8,fv*1.5),e,av);
        vec3 g=granite(vec2(u,v),fu,fv,mpp,sd,.6);
        g*=1.+.1*pulse(u,fu,0.,.5,11.)-.22*box1(av,fv,0.,.3);
        float trod=1.-smoothstep(.3*e,.85*e,av+(fnA(vec2(u,v),vec2(8.,2.),mpp)-.5)*1.5);
        float dust=W*clamp(.04+.5*smoothstep(.4,.85,fnA(vec2(u,v),vec2(4.,1.2),mpp))*(1.-.8*trod)+.4*smoothstep(e-2.5,e-.6,av),0.,.9);
        col=mix(g, SNOW*.93, dust); wet=W*trod*(1.-dust)*.7;
      } else if(kind<14.5){
        // ---- footways and paths: cleared paving in town, trodden snow in the parks and out of town ----
        e=vE.x*.25; al=1.-smoothstep(e-max(.35,fv*1.2),e+.05,av);
        if(urban>.5 && loose<.5 && kind<12.5){
          float j=max(pulse(u,fu,0.,.025,.4),pulse(v,fv,0.,.025,.4));
          col=mix(vec3(.18,.18,.175),vec3(.21,.2,.185),sett)*(1.-.35*j)*(.9+.2*fn(q,2.,mpp));
          float sn=W*clamp(.2+.45*fn(q*1.5,1.6,mpp)+smoothstep(.45*e,e,av),0.,.92);
          col=mix(col, SNOW*.94, sn); wet=W*(1.-sn)*.4;
        } else {
          // a worn line through the snow, not a white one: packed, greyer and a little wet down the middle
          float tread=1.-smoothstep(.1*e,.9*e,av+(fn(q*2.,1.3,mpp)-.5)*.5*e);
          if(kind>12.5 && kind<13.5) tread=1.-smoothstep(.15,.45,abs(av-.8)+(fn(q,2.,mpp)-.5)*.3);   // a track's two ruts
          col=mix(SNOW*.82, vec3(.36,.355,.35)*(.85+.3*fn(q*3.,.6,mpp)), tread*.7);
          col=mix(vec3(.15,.125,.095)*(.85+.3*fn(q,1.,mpp)), col, urban>.5?W:Wo);
          al*=mix(.35,.75,tread); wet=W*tread*.25;
        }
        if(kind>13.5){                                                                // steps: risers every 30 cm
          float r=pulse(u,fu,0.,.05,.3); col*=1.-.45*r;
        }
      } else if(kind<20.5){
        // ---- tram track: rails and grooves set in the street, or on their own snowy bed ----
        float r=box1(av,fv,.6825,.7525), gr=box1(av,fv,.7525,.79);
        vec3 steel=vec3(.30,.31,.33);
        if(stram>.5){
          col=mix(vec3(.025),steel,r/max(r+gr,1e-3)); al=clamp(r+gr*.7,0.,1.)*.6; wet=.6;
        } else {
          al=(1.-smoothstep(1.2,1.45+fv,av))*.9;
          float sl=pulse(u,fu,0.,.24,.65)*box1(av,fv,-1.,1.2);
          vec3 bed=mix(vec3(.17,.16,.145)*(.8+.4*fn(q*4.,.5,mpp)), vec3(.3,.295,.285), sl);
          float sn=.5*(W+Wb)*clamp(.6+.6*(fn(q*1.5,1.4,mpp)-.5)-.2*sl,0.,1.);
          col=mix(bed, SNOW*.92, sn); col=mix(col, steel*.55, r*.8); wet=r*.6;
        }
      } else if(kind<21.5){
        // ---- railway: ballast, concrete sleepers every 60 cm, two dark rails through the snow ----
        al=(1.-smoothstep(1.45,1.7+fv,av))*.95;
        float sl=pulse(u,fu,0.,.26,.6)*box1(av,fv,-1.,1.3), r=box1(av,fv,.6825,.7525);
        vec3 bed=mix(vec3(.17,.155,.14)*(.8+.4*fn(q*4.,.5,mpp)), vec3(.3,.295,.285), sl);   // ballast with a touch of rust
        float sn=.5*(W+Wb)*clamp(.6+.6*(fn(q*1.5,1.6,mpp)-.5)-.2*sl+.2*smoothstep(1.,1.6,av),0.,1.);
        col=mix(bed, SNOW*.92, sn); col=mix(col, vec3(.08,.085,.09), r*.85); wet=r*.7;
      } else {
        // ---- zebra crossing: worn white bars, half lost under the slush ----
        e=vE.x*.25; float z=pulse(u,fu,0.,.5,1.)*box1(av,fv,-e,e-.2);
        col=vec3(.6,.6,.58); al=z*.6*(1.-.5*W*fn(q*2.,1.2,mpp));
      }
      if(uDbg>.5){ col=fract(vec3(kind*.37,kind*.61+pass*.3,kind*.13+.2*urban)); al=max(al,.6); }    // debug: colour by kind
      vec3 L=normalize(uRegionSun), lit=winterLight(up,up,L);
      col*=lit;
      // wet surfaces mirror the pale sky and catch the low sun
      if(wet>.01){
        float cv=max(dot(up,V),0.), F=.02+.98*pow(1.-cv,5.); vec3 r=reflect(-V,up);
        vec3 sky=mix(vec3(.64,.655,.68),vec3(.5,.54,.6),smoothstep(0.,.7,max(dot(r,up),0.)));       // a pale, almost grey winter sky
        float pud=smoothstep(.2,.85,fn(q,4.,mpp)+.25*fn(q*3.1,1.3,mpp));              // puddles and drier crowns
        col*=1.-.22*wet;                                                             // wet stone and tar are darker
        col=mix(col, sky*.8, clamp(F*wet*(.25+.75*pud)*.5,0.,1.)); col+=vec3(1.,.92,.8)*pow(max(dot(r,L),0.),60.)*.4*wet*pud;
      }
      col=applyHaze(col,dist,uAlt);
      gl_FragColor=vec4(col,a*al/vW);
  #include <tonemapping_fragment>
      gl_FragColor=linearToOutputTexel(gl_FragColor);
    }`;
  const baseMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uOrigin: { value: new V3() }, uEast: { value: new V3() }, uNorth: { value: new V3() }, uBox: { value: new THREE.Vector4() },
      uFade: { value: 0 }, uPull: { value: .003 }, uDbg: { value: 0 }, uFar0: { value: FAR0 }, uFar1: { value: FAR1 } },
    vertexShader: VS, fragmentShader: FS, depthWrite: false, depthTest: true, transparent: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    extensions: { derivatives: true },
  });

  /* ---------- decode and drape ---------- */
  // layers, drawn in this order inside one mesh: squares, rail beds, paths, road floors, pedestrian streets,
  // carriageways (small roads first), then tram rails and crossings on top
  const layerOf = (kind, pass) => kind >= 30 ? 0 : kind === 21 ? 1 : kind >= 10 && kind <= 14 ? 2 : kind <= 8 && pass === 0 ? 3 : kind === 9 ? 4 : pass === 1 ? 5 + (8 - kind) / 10 : 7;
  function buildSub(S, buf) {
    const { ox, oy, kx, ky } = S, dv = new DataView(buf.buffer, buf.byteOffset + S.off, S.lb + S.pb);
    const latOf = y => oy + y / ky, lonOf = x => ox + x / kx;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const origin = llv(oy, ox, groundKm(oy, ox)), f = enu(origin);
    const P = [], UV = [], E = [], Kk = [], N = [], tmp = new V3();
    const layerList = new Map();
    const tri = (l, a, b, c) => { let L = layerList.get(l); if (!L) layerList.set(l, L = []); L.push(a, b, c); };
    const vert = (x, y, u, v, eL, eR, c, rim, kind, pass, flags, seed, nx, ny) => {
      const la = latOf(y), lo = lonOf(x);
      llv(la, lo, groundKm(la, lo), tmp).sub(origin); P.push(tmp.x, tmp.y, tmp.z); UV.push(u, v);
      E.push(clamp(Math.round(eL * 4), 0, 255), clamp(Math.round(eR * 4), 0, 255), clamp(Math.round(c * 4), 0, 255), rim);
      Kk.push(kind, pass, flags, seed); N.push(Math.round(nx * 127), Math.round(ny * 127));
      return P.length / 3 - 1;
    };
    // terrain grid coordinates of a local point (affine), for splitting at the creases of the drawn mesh
    const gu = x => (lonOf(x) - BB.W) / (BB.E - BB.W) * (TNX - 1), gv = y => (latOf(y) - BB.S) / (BB.N - BB.S) * (TNY - 1);
    function creases(ax, ay, bx, by) {
      const ts = [], add = (g0, g1) => { if (Math.abs(g1 - g0) < 1e-9) return; const lo = Math.min(g0, g1), hi = Math.max(g0, g1); for (let k = Math.floor(lo) + 1; k < hi; k++) ts.push((k - g0) / (g1 - g0)); };
      const u0 = gu(ax), u1 = gu(bx), v0 = gv(ay), v1 = gv(by);
      add(u0, u1); add(v0, v1); add(u0 + v0, u1 + v1);
      return ts.sort((a, b) => a - b);
    }
    let o = 0, nLines = 0, seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) % 256;
    while (o < S.lb) {
      const kind = dv.getUint8(o), flags = dv.getUint8(o + 1), w = dv.getUint8(o + 2) / 4, n = dv.getUint16(o + 4, true), nw = dv.getUint16(o + 6, true);
      let x = dv.getInt16(o + 8, true), y = dv.getInt16(o + 10, true); o += 12;
      const pts = [[x / 2, y / 2]];
      for (let i = 1; i < n; i++) { x += dv.getInt8(o); y += dv.getInt8(o + 1); o += 2; pts.push([x / 2, y / 2]); }
      const rw = []; for (let i = 0; i < nw; i++) { rw.push([dv.getUint8(o) / 4, dv.getUint8(o + 1) / 4]); o += 2; }
      if (o % 2) o++;
      nLines++;
      for (const p of pts) { bx0 = Math.min(bx0, p[0]); by0 = Math.min(by0, p[1]); bx1 = Math.max(bx1, p[0]); by1 = Math.max(by1, p[1]); }
      buildLine(kind, flags, w, pts, rw, rnd());
    }
    function buildLine(kind, flags, w, pts, rw, sd) {
      // stations: the vertices, every crease of the terrain mesh, and kinks in the reach profile
      const segL = []; let Ltot = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segL.push(l); Ltot += l; }
      if (Ltot < 1) return;
      const reach = s => {
        if (!rw.length) return [w / 2, w / 2];
        const t = clamp(s / Ltot, 0, 1) * (rw.length - 1), i = Math.min(Math.floor(t), rw.length - 2), f = t - i;
        if (rw.length === 1) return rw[0];
        return [rw[i][0] + (rw[i + 1][0] - rw[i][0]) * f, rw[i][1] + (rw[i + 1][1] - rw[i][1]) * f];
      };
      const kinks = [];
      for (let i = 1; i < rw.length - 1; i++) {
        if (Math.abs(rw[i - 1][0] + rw[i + 1][0] - 2 * rw[i][0]) > KINK || Math.abs(rw[i - 1][1] + rw[i + 1][1] - 2 * rw[i][1]) > KINK) kinks.push(i / (rw.length - 1) * Ltot);
      }
      const st = [];                    // [x, y, s, tx, ty, miter]
      let s0 = 0, kk = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = segL[i]; if (l < 1e-6) continue;
        const tx = (bx - ax) / l, ty = (by - ay) / l;
        let mx = tx, my = ty, mi = 1;
        if (st.length && i > 0) {                     // corner: miter direction between the two segments
          const p = st[st.length - 1]; mx = p[3] + tx; my = p[4] + ty; const ml = Math.hypot(mx, my);
          if (ml > .35) { mx /= ml; my /= ml; mi = Math.min(2.2, 1 / Math.max(mx * tx + my * ty, .45)); } else { mx = tx; my = ty; }
          p[3] = mx; p[4] = my; p[5] = mi;
        } else st.push([ax, ay, s0, tx, ty, 1]);
        const ts = creases(ax, ay, bx, by);
        while (kk < kinks.length && kinks[kk] < s0 + l) { if (kinks[kk] > s0) ts.push((kinks[kk] - s0) / l); kk++; }
        ts.sort((a, b) => a - b);
        let last = 0;
        for (const t of ts) { if (t - last < .02 || t > .98) continue; st.push([ax + (bx - ax) * t, ay + (by - ay) * t, s0 + l * t, tx, ty, 1]); last = t; }
        s0 += l; st.push([bx, by, s0, tx, ty, 1]);
      }
      if (st.length < 2) return;
      // reach a little past each end, so neighbouring pieces overlap at junctions
      const c = kind <= 8 ? w / 2 : 0;
      const ext = kind <= 8 ? Math.min(c, 3.5) : kind === 9 ? 2 : kind <= 14 ? w * .45 : 0;
      if (ext > 0) {                              // (the end stations move out: no extra vertices)
        const a = st[0], b = st[st.length - 1];
        a[0] -= a[3] * ext; a[1] -= a[4] * ext; a[2] = -ext; b[0] += b[3] * ext; b[1] += b[4] * ext; b[2] += ext;
      }
      const strip = (pass, widths) => {          // widths(station) -> [left, right]; three columns: left edge, centre, right edge
        const lay = layerOf(kind, pass); let prev = null;
        for (const q of st) {
          const [eL, eR] = widths(q[2]), nx = -q[4], ny = q[3], m = q[5];
          const el = Math.max(eL, .05), er = Math.max(eR, .05), r = reach(q[2]);
          const ids = [vert(q[0] + nx * el * m, q[1] + ny * el * m, q[2], el, r[0], r[1], c, 0, kind, pass, flags, sd, nx, ny),
            vert(q[0], q[1], q[2], 0, r[0], r[1], c, 0, kind, pass, flags, sd, nx, ny),
            vert(q[0] - nx * er * m, q[1] - ny * er * m, q[2], -er, r[0], r[1], c, 0, kind, pass, flags, sd, nx, ny)];
          if (prev) { tri(lay, prev[0], prev[1], ids[0]); tri(lay, ids[0], prev[1], ids[1]); tri(lay, prev[1], prev[2], ids[1]); tri(lay, ids[1], prev[2], ids[2]); }
          prev = ids;
        }
      };
      if (kind <= 8) { if (!(flags & 32)) strip(0, s => reach(s)); strip(1, () => [c, c]); }   // driveways and car park aisles: no kerb
      else if (kind === 9) strip(0, s => reach(s));
      else if (kind === 20) strip(2, () => [1.45, 1.45]);
      else if (kind === 21) strip(0, () => [1.7, 1.7]);
      else if (kind === 22) strip(2, () => [w / 2, w / 2]);
      else strip(0, () => [w / 2, w / 2]);
    }
    // polygons: triangles split until they follow the terrain, rim 0 on the outline
    const LIM = lite ? 45 : 30;
    while (o < S.lb + S.pb) {
      const kind = dv.getUint8(o), ang = dv.getUint8(o + 1) / 255 * Math.PI, nv = dv.getUint16(o + 2, true), nt = dv.getUint16(o + 4, true), nb = dv.getUint16(o + 6, true); o += 8;
      const X = [], Y = [], Rm = [];
      for (let i = 0; i < nv; i++) { X.push(dv.getInt16(o, true) / 4); Y.push(dv.getInt16(o + 2, true) / 4); Rm.push(i < nb ? 0 : 255); o += 4; }
      const T = [];
      for (let i = 0; i < nt * 3; i++) { T.push(nv < 256 ? dv.getUint8(o) : dv.getUint16(o, true)); o += nv < 256 ? 1 : 2; }
      if (o % 2) o++;
      const ca = Math.cos(ang), sa = Math.sin(ang), sd = rnd(), mid = new Map(), ids = new Map();
      const midOf = (a, b) => { const k = a < b ? a * 65536 + b : b * 65536 + a; let m = mid.get(k); if (m === undefined) { m = X.length; X.push((X[a] + X[b]) / 2); Y.push((Y[a] + Y[b]) / 2); Rm.push((Rm[a] + Rm[b]) / 2); mid.set(k, m); } return m; };
      const id = i => { let r = ids.get(i); if (r === undefined) { r = vert(X[i], Y[i], X[i] * ca + Y[i] * sa, -X[i] * sa + Y[i] * ca, 0, 0, 0, Math.round(Rm[i]), kind, 0, 0, sd, 0, 0); ids.set(i, r); } return r; };
      const d2 = (a, b) => (X[a] - X[b]) ** 2 + (Y[a] - Y[b]) ** 2;
      const split = (a, b, c, depth) => {
        if (depth < 6 && Math.max(d2(a, b), d2(b, c), d2(c, a)) > LIM * LIM) {
          const ab = midOf(a, b), bc = midOf(b, c), ca_ = midOf(c, a);
          split(a, ab, ca_, depth + 1); split(ab, b, bc, depth + 1); split(ca_, bc, c, depth + 1); split(ab, bc, ca_, depth + 1);
        } else tri(0, id(a), id(b), id(c));
      };
      for (let t = 0; t < nt; t++) split(T[t * 3], T[t * 3 + 1], T[t * 3 + 2], 0);
      for (let i = 0; i < nb; i++) { bx0 = Math.min(bx0, X[i]); by0 = Math.min(by0, Y[i]); bx1 = Math.max(bx1, X[i]); by1 = Math.max(by1, Y[i]); }
    }
    if (!P.length) return null;
    const idx = []; for (const l of [...layerList.keys()].sort((a, b) => a - b)) for (const i of layerList.get(l)) idx.push(i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aUV', new THREE.Float32BufferAttribute(UV, 2));
    g.setAttribute('aE', new THREE.BufferAttribute(new Uint8Array(E), 4)); g.setAttribute('aK', new THREE.BufferAttribute(new Uint8Array(Kk), 4));
    g.setAttribute('aN', new THREE.BufferAttribute(new Int8Array(N), 2, true));
    g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    const m = baseMat.clone(); for (const k of Object.keys(uni)) m.uniforms[k] = uni[k];
    m.uniforms.uOrigin.value.copy(origin); m.uniforms.uEast.value.copy(f.east); m.uniforms.uNorth.value.copy(f.north);
    // the sub-area's box in metres east / north of its origin (its lines were clipped to it): fade toward the cut
    const B = S.box ? S.box : [bx0, by0, bx1, by1];
    m.uniforms.uBox.value.set(B[0], B[1], B[2], B[3]);
    const mesh = new THREE.Mesh(g, m); mesh.position.copy(origin); mesh.frustumCulled = false; mesh.renderOrder = -1;
    mesh.userData.r = Math.hypot(bx1 - bx0, by1 - by0) / 2000; mesh.userData.c = llv(latOf((by0 + by1) / 2), lonOf((bx0 + bx1) / 2), groundKm(latOf((by0 + by1) / 2), lonOf((bx0 + bx1) / 2)));
    return mesh;
  }

  /* ---------- areas: one file per leg, loaded with its pack ---------- */
  const areas = new Map();                     // name -> { meshes: [] | null }
  async function loadArea(name) {
    const J = await fetch(`assets/streets/${name}.json`).then(r => r.json());
    while (ctx.city) await new Promise(r => setTimeout(r, 500));             // heights must be the regular map's
    const bin = atob(J.data), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const meshes = [];
    for (const S of J.subs) {
      await new Promise(r => setTimeout(r, 0));                               // one sub-area per task: no long stall
      const m = buildSub(S, buf); if (m) meshes.push(m);
    }
    corner.clear();
    return meshes;
  }
  function ensure(pack) {
    const names = PACK_AREAS[pack]; if (!names) return;
    for (const [n, a] of areas) if (!names.includes(n)) { if (a.meshes) drop(a.meshes); areas.delete(n); }
    for (const n of names) if (!areas.has(n)) {
      const a = { meshes: null }; areas.set(n, a);
      loadArea(n).then(ms => {
        if (areas.get(n) !== a) { drop(ms); return; }
        a.meshes = ms; for (const m of ms) { m.visible = false; scene.add(m); }
      }).catch(e => console.warn('streets area failed', n, e));
    }
  }
  function drop(ms) { for (const m of ms) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }

  /* ---------- per frame ---------- */
  const camP = new V3(); let lastT = performance.now(), cityOn = false;
  function update(dt, alt) {
    const now = performance.now(); dt = Math.min(.25, Math.max(0, (now - lastT) / 1000)); lastT = now;   // fades run on wall-clock time
    camP.copy(ctx.camera.position);
    for (const a of areas.values()) {
      if (!a.meshes) continue;
      for (const m of a.meshes) {
        const near = !cityOn && !ctx.city && alt < SHOW && m.userData.c.distanceTo(camP) - m.userData.r < SHOW;
        m.visible = near;
        const u = m.material.uniforms.uFade; u.value = near ? Math.min(1, u.value + dt * 1.5) : 0;
      }
    }
  }
  return {
    update, _dbg: { areas, groundKm },
    onPack(name) { ensure(name); },
    onStep(step) { if (step && step.pack) ensure(step.pack); },
    onCity(on) { cityOn = on; for (const a of areas.values()) for (const m of a.meshes || []) m.visible = !on; },
  };
}
