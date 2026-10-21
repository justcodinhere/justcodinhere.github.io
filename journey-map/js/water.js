// Water: rivers and lakes as living winter water.
// Near the routes and stops, Overture water polygons (assets/water/<area>.json, built by tools/water_pack.py) become
// surfaces draped on the drawn terrain: flow-mapped ripples running downstream, foam along the banks of fast rivers,
// Fresnel reflections of the winter sky, of the real mountain skyline around each stretch and of the houses and trees
// on the far bank, a low sun glint, and snow-covered ice on lake edges in winter. Accurate centrelines (lines.json)
// replace the coarse Natural Earth ribbons inside the detailed patch and fade out where a surface takes over.
// create(ctx) returns { riverRibbon(path, worldW, name), update(dt, alt), onPack(name), onStep(step), onCity(on) }.
export default function create(ctx) {
  const { THREE, V3, R, D2R, BB, BHS, EXAG, uni, NOISE, HAZE, LIGHT, scene, ribbonMeshes, llv, enu, terrainKm, meshKm, heightM, phone, clamp } = ctx;
  const lite = phone();
  const PACK_AREAS = { munich: ['muc'], inn: ['muc', 'inn'], nue: ['muc', 'nue'], neu: ['muc', 'neu'] };
  const LIFT = .0015;                       // km above the drawn ground (the GPU samples a half-float height map)
  const NEAR = 16, FAR = 26;                // km: surfaces hand over to ribbons between these distances

  /* ---------- the terrain mesh exactly as the GPU draws it: two triangles per cell, not a bilinear patch ---------- */
  const TNX = lite ? 440 : 720, TNY = lite ? 660 : 1080;
  // Corner heights are taken as the higher of the filtered and the nearest height texel: some GPUs fetch the
  // half-float height map unfiltered in the vertex shader, and water must never end up under the ground.
  const gLat = k => BB.S + (BB.N - BB.S) * k / (TNY - 1), gLon = k => BB.W + (BB.E - BB.W) * k / (TNX - 1);
  const HW = 1280, HH = 1920, corner = new Map();
  function cornerKm(i, j) {
    const key = j * 4096 + i; let v = corner.get(key);
    if (v === undefined) {
      const la = gLat(j), lo = gLon(i), u = i / (TNX - 1), w = j / (TNY - 1);
      const nla = BB.S + (BB.N - BB.S) * (clamp(Math.round(w * HH - .5), 0, HH - 1) + .5) / HH, nlo = BB.W + (BB.E - BB.W) * (clamp(Math.round(u * HW - .5), 0, HW - 1) + .5) / HW;
      const t = terrainKm(la, lo), e = t - .002 - heightM(la, lo) / 1000 * EXAG;            // keep terrainKm's edge fade
      v = Math.max(t, heightM(nla, nlo) / 1000 * EXAG + .002 + (e < -1e-9 ? e : 0));
      corner.set(key, v);
    }
    return v;
  }
  function groundKm(lat, lon) {
    if (ctx.city) return meshKm(lat, lon);
    const fu = (lon - BB.W) / (BB.E - BB.W) * (TNX - 1), fv = (lat - BB.S) / (BB.N - BB.S) * (TNY - 1);
    if (fu <= 0 || fv <= 0 || fu >= TNX - 1 || fv >= TNY - 1) return terrainKm(lat, lon);
    const i = Math.floor(fu), j = Math.floor(fv), x = fu - i, y = fv - j;
    if (x + y <= 1) { const a = cornerKm(i, j); return a + (cornerKm(i + 1, j) - a) * x + (cornerKm(i, j + 1) - a) * y; }
    const d = cornerKm(i + 1, j + 1);
    return d + (cornerKm(i, j + 1) - d) * (1 - x) + (cornerKm(i + 1, j) - d) * (1 - y);
  }
  const srgb = c => Math.pow(c / 255, 2.2);

  /* ---------- tiling ripple texture, made here: RG = surface slope, B = foam ridges, A = broad patches ---------- */
  function rippleTexture(N) {
    let seed = 9781; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const H = new Float32Array(N * N * 4), sx = new Float32Array(N), cx = new Float32Array(N), sy = new Float32Array(N), cy = new Float32Array(N);
    const waves = (count, k0, k1, pw, ch, slope) => {
      for (let w = 0; w < count; w++) {
        const k = k0 * Math.pow(k1 / k0, rnd()), a = rnd() * Math.PI * 2;
        let kx = Math.round(k * Math.cos(a)), ky = Math.round(k * Math.sin(a)); if (!kx && !ky) kx = 1;
        const amp = Math.pow(Math.hypot(kx, ky), -pw), ph = rnd() * Math.PI * 2;
        for (let i = 0; i < N; i++) { const A = 2 * Math.PI * kx * i / N, B = 2 * Math.PI * ky * i / N + ph; sx[i] = Math.sin(A); cx[i] = Math.cos(A); sy[i] = Math.sin(B); cy[i] = Math.cos(B); }
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const o = (y * N + x) * 4;
          if (slope) { const c = (cx[x] * cy[y] - sx[x] * sy[y]) * amp; H[o] += c * kx; H[o + 1] += c * ky; }   // gradient of amp*sin
          else H[o + ch] += (sx[x] * cy[y] + cx[x] * sy[y]) * amp;
        }
      }
    };
    waves(64, 2, 42, 1.85, 0, true); waves(40, 3, 22, 1.1, 2, false); waves(14, 1, 5, .9, 3, false);
    const rms = c => { let s = 0; for (let i = c; i < H.length; i += 4) s += H[i] * H[i]; return Math.sqrt(s / (N * N)); };
    const rs = Math.max(rms(0), rms(1)), rf = rms(2), rp = rms(3), d = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const o = i * 4;
      d[o] = clamp(128 + H[o] / rs * 48, 0, 255); d[o + 1] = clamp(128 + H[o + 1] / rs * 48, 0, 255);
      d[o + 2] = 255 * Math.pow(clamp(1 - Math.abs(H[o + 2]) / (2.2 * rf), 0, 1), 3);          // thin bright ridges = foam lines
      d[o + 3] = clamp(128 + H[o + 3] / rp * 50, 0, 255);
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true;
    return t;
  }
  const rip = rippleTexture(256);

  /* ---------- surface shader ---------- */
  const VS = `attribute vec2 aXY; attribute vec4 aA, aB, aE; attribute vec3 aCol, aBank; uniform float uPull;
    varying vec3 vL, vCol, vBank; varying vec2 vXY; varying vec4 vA, vB, vE;
    void main(){ vL=position; vXY=aXY; vA=aA; vB=aB; vE=aE; vCol=aCol; vBank=aBank;
      // project through world space as the terrain does (its float32 rounding then moves water and ground together), and pull
      // the depth, not the screen position, toward the eye: the terrain's depth carries ~10 m of float32 noise along the ray
      vec4 mv=viewMatrix*vec4((modelMatrix*vec4(position,1.)).xyz,1.); float d=length(mv.xyz);
      mv.xyz*=max(1.-(uPull+.0004*d)/max(d,.02),.5); gl_Position=projectionMatrix*mv; }`;
  // vA: shore distance m, unit direction to the nearest shore (east, north), height of what stands on that bank (drawn m)
  // vB: flow m/s (east, north), turbulence 0..1, ice width m (255 = frozen over; 1 marks a river reach through town)   vE: cut fade, horizon row, -, bank kind (0 snow, 1 houses, 2 trees)
  const FS = NOISE + HAZE + LIGHT + `
    uniform sampler2D uRip, uHz; uniform vec3 uOrigin, uEast, uNorth, uRegionSun; uniform float uTime, uAlt, uWinter, uFade, uQ;
    varying vec3 vL, vCol, vBank; varying vec2 vXY; varying vec4 vA, vB, vE;
    vec3 skyCol(float s){ return mix(vec3(.70,.75,.82), vec3(.36,.48,.66), smoothstep(0.,.75,s)); }   // pale winter sky, bluer overhead
    void main(){
      vec3 wp=vL+uOrigin, up=normalize(wp), toC=cameraPosition-wp; float dist=length(toC); vec3 V=toC/dist;
      vec3 L=normalize(uRegionSun), lit=winterLight(up,up,L);
      float shore=vA.x, bankH=vA.w, turb=vB.z, iceW=vB.w; vec2 sdir=vA.yz, flow=vB.xy, p=vXY;
      float spd=length(flow), mpp=max(length(fwidth(p)),.02);                      // metres per pixel here
      float lodA=1.-smoothstep(.7,2.4,mpp), lodB=(1.-smoothstep(.18,.6,mpp))*uQ;   // drop ripples that would only alias
      vec2 fd=spd>.01?flow/spd:vec2(0.);
      // flow mapping: two phases half a cycle apart, cross-faded so their resets never show
      float T=3./FLOWK, ph=uTime/T+vnoise(vec3(p/90.,0.))*1.5, t0=fract(ph), t1=fract(ph+.5), w1=abs(1.-2.*t0);   // phase varies in space: no pulsing
      flow*=FLOWK;
      vec2 f=flow*(.3+.7*smoothstep(0.,14.,shore))*2.2, o0=f*T*t0, o1=f*T*t1;
      // broad boils and slicks drifting with the current (smeared along it): the motion that reads from a distance
      vec2 g0=(p-o0)/150.+.13, g1=(p-o1)/150.+.57, gs=fd*(6./150.);
    #ifdef LITE
      vec4 M=mix(texture2D(uRip,g0), texture2D(uRip,g1), w1);
    #else
      vec4 M=mix(texture2D(uRip,g0)+texture2D(uRip,g0-gs), texture2D(uRip,g1)+texture2D(uRip,g1-gs), w1)*.5;
    #endif
      vec2 nM=M.xy*2.-1., nA=vec2(0.), nB=vec2(0.);
      if(lodA>.01) nA=mix(texture2D(uRip,(p-o0)/40.).xy, texture2D(uRip,(p-o1)/40.+.43).xy, w1)*2.-1.;
      if(lodB>.01) nB=mix(texture2D(uRip,(p-o0*1.2)/11.+.17).xy, texture2D(uRip,(p-o1*1.2)/11.+.71).xy, w1)*2.-1.;
      vec2 nS=lodA>.01?(texture2D(uRip,p/26.+vec2(.31,.77)).xy*2.-1.)*turb*lodA:vec2(0.);   // standing waves over gravel
      float patchy=smoothstep(.25,.75,M.a), rough=mix(.05,.36,clamp(turb*1.1+spd*.08,0.,1.))*(.45+1.1*patchy);
      vec2 sl=(nM*.5+nA*.5*lodA+nB*.35*lodB+nS*.4)*rough;
      float sub=rough*(.3+.7*(1.-lodA));                                             // roughness below the pixel: widens the glint
      vec3 n=normalize(up+uEast*sl.x+uNorth*sl.y);
      // what the water mirrors: winter sky, the real skyline of this stretch, and the far bank
      vec3 r=reflect(-V,n); float sE=dot(r,up);
      if(sE<.01){ r=normalize(r+up*(.01-sE)); sE=.01; }
      float az=atan(dot(r,uEast),dot(r,uNorth)), E=asin(clamp(sE,0.,1.));
      float ridge=max(texture2D(uHz,vec2(az/6.28318+.5,vE.y)).r*.8,.035+.02*vnoise(vec3(az*23.,4.,1.)))*(.94+.12*vnoise(vec3(az*9.,1.,2.)));
      float tt=clamp(E/max(ridge,.02),0.,1.), rock=vnoise(vec3(az*34.,tt*4.,3.));
      vec3 mtn=mix(vec3(.03,.05,.04), mix(vec3(.2,.23,.19), vec3(.66,.70,.76)*(.8+.35*rock), uWinter), smoothstep(.22,.62,tt+.2*(rock-.5)));
      mtn=mix(mtn*lit, vec3(.70,.75,.82), .3);
      vec3 env=mix(skyCol(sE), mtn, 1.-smoothstep(ridge-.035,ridge+.01,E));
      vec3 vd=-V; vec2 vh=vec2(dot(vd,uEast),dot(vd,uNorth)); vh/=max(length(vh),1e-4);
      float facing=dot(sdir,vh);
      if(facing>.02 && bankH>.1){
        float tanE=sE/sqrt(max(1.-sE*sE,1e-4)), hr=shore/max(facing,.3)*tanE;     // height where the mirrored ray meets the bank
        float k=vE.w, wS=clamp(1.-k,0.,1.), wT=clamp(k-1.,0.,1.), wH=1.-wS-wT;
        float jag=texture2D(uRip,p/15.+.8).a, th=hr/max(bankH*(1.+wT*(jag-.5)*.6),.5);
        float hit=(1.-smoothstep(.88,1.04,th))*smoothstep(.02,.2,facing);
        vec3 facade=vBank*(.42+.45*max(dot(-(uEast*sdir.x+uNorth*sdir.y),L),0.));
        facade=mix(vec3(dot(facade,vec3(.3,.5,.2))),facade,1.35);                 // a touch more colour: the painted fronts
        facade*=1.-.5*smoothstep(.45,.6,fract(hr/4.1))*step(.12,th)*step(th,.8);   // rows of dark windows
        vec3 house=mix(facade, mix(vec3(.22,.1,.07),vec3(.72,.75,.8),uWinter*.8), smoothstep(.8,.86,th))*mix(.3,1.,smoothstep(0.,.12,th));
        vec3 tree=mix(vec3(.03,.05,.04), vec3(.5,.55,.6), uWinter*.35*step(.62,jag));
        vec3 bankS=mix(vec3(.08,.08,.075), vec3(.78,.81,.86)*lit, smoothstep(.25,.5,th));
        env=mix(env, house*wH+tree*wT+bankS*wS, hit);
      }
      float cv=max(dot(n,V),0.), F=.02+.98*pow(1.-cv,4.5);
      vec3 body=vCol*lit*.84*mix(1.15,.92,smoothstep(0.,25.,shore))*(.93+.14*M.b);
      vec3 col=mix(body, env, F*(.9+.2*(1.-patchy)));
      float sp=max(dot(r,L),0.), ex=mix(1400.,90.,clamp(sub*3.5,0.,1.));
      col+=vec3(1.,.92,.8)*(pow(sp,ex)*ex*.005+pow(sp,30.)*.08)*(.55+.45*patchy);
      col*=mix(.7,1.,smoothstep(0.,1.,shore));                                       // wet dark line at the waterline
      // white water: foam ridges smeared along the flow into streaks, gathering along the banks of fast rivers
      if(turb>.02){
        float fm0=0., fm1=0.;
        for(int k=0;k<FOAM_TAPS;k++){ vec2 q=p-fd*float(k)*(24./float(FOAM_TAPS)); fm0+=texture2D(uRip,(q-o0)/95.+.11).b; fm1+=texture2D(uRip,(q-o1)/95.+.59).b; }
        float fm=mix(fm0,fm1,w1)/float(FOAM_TAPS), bankF=1.-smoothstep(.5,10.,shore);
        float amt=clamp(turb*(.5+.9*bankF)*(.35+1.2*patchy),0.,1.);
        float foam=smoothstep(.6-amt*.32,.86-amt*.32,fm)*min(amt*1.3,1.);           // streaks of white water along the current
        foam=max(foam, (1.-smoothstep(.4,3.5,shore))*smoothstep(.35,.65,fm)*turb*.8);  // lace where the current scrapes the bank
        col=mix(col, vec3(.82,.86,.9)*lit, clamp(foam*1.3,0.,.8)*mix(.55,1.,lodA));
      }
      // ice on still water in winter: snow-dusted from the shore out, a darker band of new ice at its edge
      if(iceW>1.5 && uWinter>.01){
        float nz=texture2D(uRip,p/240.+.23).a, nz2=texture2D(uRip,p/61.+.61).a, edge=iceW>250.?1e5:iceW;
        float ice=(1.-smoothstep(edge*.8,edge,shore+(nz-.5)*min(edge,120.)*.9+(nz2-.5)*min(edge,40.)*.35))*uWinter;
        vec3 iceC=mix(vec3(.56,.63,.69), vec3(.85,.88,.92), smoothstep(.25,.6,nz2*.5+nz*.5))*lit*1.02;  // snow on ice, bare grey-blue patches
        float rim=smoothstep(.05,.3,ice)*(1.-smoothstep(.3,.75,ice));                                     // dark new ice at the open edge
        col=mix(mix(col, vec3(.2,.25,.28)*lit, rim*.5), iceC, smoothstep(.45,.85,ice));
      }
      float a=smoothstep(0.,max(1.6,fwidth(shore)*1.5),shore)*vE.x*uFade*(1.-smoothstep(${NEAR}.,${FAR}.,dist));
      if(a<.004) discard;
      col=applyHaze(col,dist,uAlt);
      gl_FragColor=vec4(col,a);
  #include <tonemapping_fragment>
      gl_FragColor=linearToOutputTexel(gl_FragColor);
    }`;
  function surfaceMat(origin, hz, f) {
    return new THREE.ShaderMaterial({
      uniforms: { ...uni, uRip: { value: rip }, uHz: { value: hz }, uOrigin: { value: origin.clone() }, uEast: { value: f.east }, uNorth: { value: f.north },
        uFade: { value: 0 }, uQ: { value: lite ? .7 : 1 }, uPull: { value: .011 } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: true,
      defines: { ...(lite ? { LITE: 1, FOAM_TAPS: 2 } : { FOAM_TAPS: 4 }), FLOWK: ctx.reduceMotion ? '.35' : '1.' },
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
  }

  /* ---------- bridges: arched decks with parapets and river piers, so the water never swallows a crossing ---------- */
  const bridgeMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uOrigin: { value: new V3() }, uFade: { value: 0 }, uWall: { value: 0 } }, transparent: true, side: THREE.DoubleSide,
    vertexShader: `attribute float aK; uniform float uWall; varying vec3 vL; varying float vK; void main(){ vL=position; vK=aK;
      vec3 w=(modelMatrix*vec4(position,1.)).xyz; vec4 mv=viewMatrix*vec4(w,1.); float d=length(mv.xyz);
      // just enough depth pull to stay ahead of the water's own (which grows as the view steepens): deck height does the rest
      float steep=abs(dot(mv.xyz/max(d,1e-4),(viewMatrix*vec4(normalize(w),0.)).xyz)), pw=.011+.0004*d;
      mv.xyz*=max(1.-(uWall>.5?pw:pw*steep+.002)/max(d,.03),.5); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: NOISE + HAZE + LIGHT + `uniform vec3 uOrigin, uRegionSun; uniform float uAlt, uWinter, uFade; varying vec3 vL; varying float vK;
      void main(){
        vec3 wp=vL+uOrigin, up=normalize(wp), toC=cameraPosition-wp, n=normalize(cross(dFdx(vL),dFdy(vL)));
        if(dot(n,toC)<0.) n=-n;
        float st=.88+.24*vnoise(vL*vec3(2600.,700.,2600.)), k=vK; vec3 c;
        if(k<.5) c=mix(vec3(.15,.15,.16), vec3(.42,.44,.47), uWinter*.3);           // deck: cleared asphalt, a little slush
        else if(k<1.5) c=mix(vec3(.46,.44,.41), vec3(.84,.87,.91), uWinter);          // parapet tops under snow
        else if(k<2.5) c=vec3(.50,.47,.42)*st;                                       // stone faces
        else if(k<3.5) c=vec3(.40,.38,.34)*st;                                       // piers
        else if(k<4.5) c=vec3(.20,.22,.24);                                          // steel (rail bridges)
        else c=mix(vec3(.13,.13,.12), vec3(.55,.52,.47)*st, smoothstep(.25,.5,k-5.));  // quay wall, dark and wet at the waterline
        c*=winterLight(n,up,normalize(uRegionSun));
        float d=length(toC), a=uFade*(1.-smoothstep(${NEAR}.,${FAR}.,d));
        if(a<.01) discard;
        gl_FragColor=vec4(applyHaze(c,d,uAlt),a);
  #include <tonemapping_fragment>
        gl_FragColor=linearToOutputTexel(gl_FragColor);
      }`,
  });
  function buildBridges(list, J, origin) {
    const P = [], K = [], I = [], tmp = new V3();
    const put = (x, y, hk, k) => { llv(J.oy + y / J.ky, J.ox + x / J.kx, hk, tmp).sub(origin); P.push(tmp.x, tmp.y, tmp.z); K.push(k); return P.length / 3 - 1; };
    const gk = (x, y) => groundKm(J.oy + y / J.ky, J.ox + x / J.kx);
    for (const [kind, w, flat, piers] of list) {
      let pts = []; for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
      // reach a few metres past the flagged span so the deck lands on the bank
      const ext = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [a[0] + dx / l * 7, a[1] + dy / l * 7]; };
      pts = [ext(pts[0], pts[1]), ...pts, ext(pts[pts.length - 1], pts[pts.length - 2])];
      const st = [pts[0]];                                   // stations every ~6 m
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
        for (let k = 1; k <= n; k++) st.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      }
      const S = [0]; for (let i = 1; i < st.length; i++) S.push(S[i - 1] + Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]));
      const Lm = S[S.length - 1]; if (Lm < 8) continue;
      const hA = gk(...st[0]) + .0008, hB = gk(...st[st.length - 1]) + .0008, rise = clamp(Lm * .045, 2.5, 6.5) / 1000 * (kind === 2 ? .7 : 1);
      const deck = st.map((q, i) => { const t = S[i] / Lm; return Math.max(hA + (hB - hA) * t + rise * Math.pow(Math.sin(Math.PI * t), .55), gk(...q) + LIFT + .002); });
      const hw = w / 2, pw = kind === 1 ? .35 : .5, ph = (kind === 1 ? .8 : 1.15) * BHS / 1000, th = (kind === 2 ? 1. : 1.8) * BHS / 1000, side = kind === 1 ? 4 : 2;
      // cross-section corners (offset m, height km above the deck, colour) traced as eight faces
      const prof = [[-hw, -th, side], [-hw, ph, 1], [-hw + pw, ph, side], [-hw + pw, 0, 0], [hw - pw, 0, side], [hw - pw, ph, 1], [hw, ph, side], [hw, -th, side]];
      const tan = i => { const a = st[Math.max(0, i - 1)], b = st[Math.min(st.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
      const rows = st.map((q, i) => { const [tx, ty] = tan(i); return { q, rx: ty, ry: -tx }; });
      for (let f = 0; f < 8; f++) {
        const c0 = prof[f], c1 = prof[(f + 1) % 8], k = f === 3 ? 0 : c0[2] === 1 && c1[2] === 1 ? 1 : f === 1 || f === 5 ? 1 : c0[2];
        let prev = null;
        rows.forEach(({ q, rx, ry }, i) => {
          const a = put(q[0] + rx * c0[0], q[1] + ry * c0[0], deck[i] + c0[1], k), b = put(q[0] + rx * c1[0], q[1] + ry * c1[0], deck[i] + c1[1], k);
          if (prev) I.push(prev[0], prev[1], b, prev[0], b, a);
          prev = [a, b];
        });
      }
      for (const i of [0, rows.length - 1]) {                // end caps
        const { q, rx, ry } = rows[i], ids = prof.map(c => put(q[0] + rx * c[0], q[1] + ry * c[0], deck[i] + c[1], side));
        for (let j = 1; j < 7; j++) I.push(ids[0], ids[j], ids[j + 1]);
      }
      for (const fr of piers || []) {                        // stone piers standing in the current
        const s = fr / 1000 * (Lm - 14) + 7; let i = 1; while (i < S.length - 1 && S[i] < s) i++;
        const t = (s - S[i - 1]) / Math.max(1e-6, S[i] - S[i - 1]), q = [st[i - 1][0] + (st[i][0] - st[i - 1][0]) * t, st[i - 1][1] + (st[i][1] - st[i - 1][1]) * t];
        const { rx, ry } = rows[i], tx = -ry, ty = rx, top = deck[i] - th, bot = gk(...q) - .004, a = hw + .8, b = 1.4;
        const cs = [[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, v]) => [q[0] + rx * u + tx * v, q[1] + ry * u + ty * v]);
        for (let j = 0; j < 4; j++) {
          const c0 = cs[j], c1 = cs[(j + 1) % 4], i0 = put(c0[0], c0[1], bot, 3), i1 = put(c1[0], c1[1], bot, 3), i2 = put(c1[0], c1[1], top, 3), i3 = put(c0[0], c0[1], top, 3);
          I.push(i0, i1, i2, i0, i2, i3);
        }
      }
    }
    if (!I.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(K, 1)); g.setIndex(I);
    const m = bridgeMat.clone(); for (const key of Object.keys(uni)) m.uniforms[key] = uni[key];
    m.uniforms.uOrigin.value = origin.clone();
    const mesh = new THREE.Mesh(g, m); mesh.position.copy(origin); mesh.frustumCulled = false;
    return mesh;
  }

  // Stone quays where the river runs through town (houses within ~45 m of the bank): a low wall rising out of the
  // water along each real shore edge, with a snow cap; it gives the town reaches their crisp, built edge.
  function buildWalls(J, NV, NT, X, Y, at, NA, idx, lake, lvl, origin) {
    const key = i => Math.round(X[i] * 4) * 1e7 + Math.round(Y[i] * 4), cnt = new Map(), E = [];
    for (let t = 0; t < NT; t++) for (let e = 0; e < 3; e++) {
      const a = idx[t * 3 + e], b = idx[t * 3 + (e + 1) % 3], ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      cnt.set(k, (cnt.get(k) || 0) + 1); E.push([k, a, b]);
    }
    const s8 = v => (v > 127 ? v - 256 : v), urban = i => at[i * NA + 10] === 1 && !lake[i] && at[i * NA] === 0;      // flagged by the packer: houses line this bank
    const P = [], K = [], I = [], tmp = new V3();
    const put = (x, y, hk, k) => { llv(J.oy + y / J.ky, J.ox + x / J.kx, hk, tmp).sub(origin); P.push(tmp.x, tmp.y, tmp.z); K.push(k); return P.length / 3 - 1; };
    const H = 2.4 * BHS / 1000, out = i => [s8(at[i * NA + 1]) / 127, s8(at[i * NA + 2]) / 127];
    for (const [k, a, b] of E) {
      if (cnt.get(k) !== 1 || !urban(a) || !urban(b)) continue;
      const oa = out(a), ob = out(b), ha = lvl[a] + LIFT, hb = lvl[b] + LIFT;
      const ax = X[a] + oa[0] * .35, ay = Y[a] + oa[1] * .35, bx = X[b] + ob[0] * .35, by = Y[b] + ob[1] * .35;
      const a0 = put(ax, ay, ha - .0015, 5), b0 = put(bx, by, hb - .0015, 5), b1 = put(bx, by, hb + H, 6), a1 = put(ax, ay, ha + H, 6);
      I.push(a0, b0, b1, a0, b1, a1);
      const a2 = put(ax + oa[0] * .8, ay + oa[1] * .8, ha + H, 1), b2 = put(bx + ob[0] * .8, by + ob[1] * .8, hb + H, 1), a3 = put(ax, ay, ha + H, 1), b3 = put(bx, by, hb + H, 1);
      I.push(a3, b3, b2, a3, b2, a2);
    }
    if (!I.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(K, 1)); g.setIndex(I);
    const m = bridgeMat.clone(); for (const k of Object.keys(uni)) m.uniforms[k] = uni[k];
    m.uniforms.uOrigin.value = origin.clone(); m.uniforms.uWall.value = 1;
    const mesh = new THREE.Mesh(g, m); mesh.position.copy(origin); mesh.frustumCulled = false;
    return mesh;
  }

  /* ---------- areas: decode, drape on the terrain, measure the skyline ---------- */
  const areas = new Map();                  // name -> { mesh, bridges, walls, hz, cells, spheres } (mesh null while loading)
  let lines = null;
  async function loadArea(name) {
    const J = await fetch(`assets/water/${name}.json`).then(r => r.json());
    while (ctx.city) await new Promise(r => setTimeout(r, 500));          // heights must be the regular map's
    const bin = atob(J.data), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const { kx, ky, ox, oy } = J, NA = J.attrs;
    let NV = 0, NT = 0; for (const c of J.chunks) { NV += c.nv; NT += c.nt; }
    const X = new Float64Array(NV), Y = new Float64Array(NV), at = new Uint8Array(NV * NA), idx = new Uint32Array(NT * 3);
    let v0 = 0, t0 = 0;
    for (const c of J.chunks) {
      const q = new Int16Array(buf.buffer, c.off, c.nv * 2), f = new Uint16Array(buf.buffer, c.off + c.nv * 4, c.nt * 3);
      at.set(new Uint8Array(buf.buffer, c.off + c.nv * 4 + c.nt * 6, c.nv * NA), v0 * NA);
      for (let i = 0; i < c.nv; i++) { X[v0 + i] = c.x0 + q[i * 2] / 4; Y[v0 + i] = c.y0 + q[i * 2 + 1] / 4; }
      for (let i = 0; i < c.nt * 3; i++) idx[t0 * 3 + i] = f[i] + v0;
      v0 += c.nv; t0 += c.nt;
    }
    await new Promise(r => setTimeout(r, 0));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < NV; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]); }
    const xc = Math.round((x0 + x1) / 2), yc = Math.round((y0 + y1) / 2), latC = oy + yc / ky, lonC = ox + xc / kx;
    const origin = llv(latC, lonC, groundKm(latC, lonC)), frame = enu(origin);
    const lat = new Float64Array(NV), lon = new Float64Array(NV), h = new Float64Array(NV);
    for (let i = 0; i < NV; i++) { lat[i] = oy + Y[i] / ky; lon[i] = ox + X[i] / kx; h[i] = groundKm(lat[i], lon[i]); }
    const s8 = v => (v > 127 ? v - 256 : v);
    // still water (lakes) lies flat at its typical level; the terrain covers it where the coarse mesh climbs the shore
    const lake = new Uint8Array(NV);
    for (let i = 0; i < NV; i++) { const o = i * NA; lake[i] = at[o + 10] > 0 && Math.abs(s8(at[o + 4])) + Math.abs(s8(at[o + 5])) < 3 ? 1 : 0; }
    const par = new Int32Array(NV).map((_, i) => i), find = a => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
    for (let t = 0; t < NT; t++) {
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      if (lake[a] && lake[b] && lake[c]) { par[find(a)] = find(b); par[find(b)] = find(c); }
    }
    const groups = new Map();
    for (let i = 0; i < NV; i++) if (lake[i]) { const k = find(i); if (!groups.has(k)) groups.set(k, { all: [], deep: [] }); const g = groups.get(k); g.all.push(h[i]); if (Math.pow(at[i * NA] / 255, 2) * 1500 > 40) g.deep.push(h[i]); }
    const level = new Map();
    for (const [k, g] of groups) { const s = (g.deep.length > 8 ? g.deep : g.all).sort((a, b) => a - b); level.set(k, s[s.length >> 1]); }
    // a water triangle spans creases of the coarse terrain mesh: sample inside it and raise its corners by any overshoot
    const lvl = new Float64Array(NV);
    for (let i = 0; i < NV; i++) lvl[i] = lake[i] ? Math.max(level.get(find(i)), h[i] - .03) : h[i];
    const raise = new Float64Array(NV), BW = [[.5, .5, 0], [0, .5, .5], [.5, 0, .5], [1 / 3, 1 / 3, 1 / 3]];
    for (let t = 0; t < NT; t++) {
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      if (lake[a] && lake[b] && lake[c]) continue;
      let dev = 0;
      for (const [wa, wb, wc] of BW) dev = Math.max(dev, groundKm(lat[a] * wa + lat[b] * wb + lat[c] * wc, lon[a] * wa + lon[b] * wb + lon[c] * wc) - (lvl[a] * wa + lvl[b] * wb + lvl[c] * wc));
      if (dev > 0) { dev = Math.min(dev * 1.15, .012); raise[a] = Math.max(raise[a], dev); raise[b] = Math.max(raise[b], dev); raise[c] = Math.max(raise[c], dev); }
    }
    for (let i = 0; i < NV; i++) lvl[i] += raise[i];
    // skyline: horizon elevation in 32 directions for each 1.5 km cell of water
    const AZ = 32, cellOf = new Map(), cellList = [];
    const row = new Float32Array(NV);
    for (let i = 0; i < NV; i++) {
      const key = Math.floor(X[i] / 1500) * 100000 + Math.floor(Y[i] / 1500);
      let c = cellOf.get(key); if (!c) { c = { n: 0, la: 0, lo: 0, h: 0, i: cellList.length }; cellOf.set(key, c); cellList.push(c); }
      c.n++; c.la += lat[i]; c.lo += lon[i]; c.h += h[i]; row[i] = c.i;
    }
    const hzData = new Uint8Array(AZ * cellList.length);
    for (const c of cellList) {
      const la0 = c.la / c.n, lo0 = c.lo / c.n, h0 = c.h / c.n, cl = Math.cos(la0 * D2R);
      for (let k = 0; k < AZ; k++) {
        const az = ((k + .5) / AZ - .5) * Math.PI * 2, ca = Math.cos(az) / 111.2, sa = Math.sin(az) / (111.32 * cl);
        let best = 0;
        for (let d = .12; d < 24; d *= 1.2) best = Math.max(best, Math.atan2(terrainKm(la0 + d * ca, lo0 + d * sa) - h0, d) - d / (2 * R));
        hzData[c.i * AZ + k] = clamp(Math.round(best / .8 * 255), 0, 255);
      }
    }
    const hz = new THREE.DataTexture(hzData, AZ, cellList.length, THREE.RedFormat, THREE.UnsignedByteType);
    hz.wrapS = THREE.RepeatWrapping; hz.wrapT = THREE.ClampToEdgeWrapping; hz.magFilter = hz.minFilter = THREE.LinearFilter; hz.needsUpdate = true;
    await new Promise(r => setTimeout(r, 0));
    // vertex buffers
    const pos = new Float32Array(NV * 3), xy = new Float32Array(NV * 2), A = new Float32Array(NV * 4), B = new Float32Array(NV * 4), E = new Float32Array(NV * 4);
    const col = new Float32Array(NV * 3), bank = new Float32Array(NV * 3), tmp = new V3();
    for (let i = 0; i < NV; i++) {
      const o = i * NA;
      llv(lat[i], lon[i], lvl[i] + LIFT, tmp).sub(origin); pos.set([tmp.x, tmp.y, tmp.z], i * 3);
      xy[i * 2] = X[i] - xc; xy[i * 2 + 1] = Y[i] - yc;
      const code = at[o + 3], kind = code === 255 ? 0 : code === 0 ? 0 : code < 100 ? 1 : 2;
      const bh = code === 255 ? 0 : code === 0 ? 2.4 : code < 100 ? code * BHS : 36;
      A.set([Math.pow(at[o] / 255, 2) * 1500, s8(at[o + 1]) / 127, s8(at[o + 2]) / 127, bh], i * 4);
      B.set([s8(at[o + 4]) / 40, s8(at[o + 5]) / 40, at[o + 9] / 255, at[o + 10]], i * 4);
      E.set([code === 255 ? 0 : 1, (row[i] + .5) / cellList.length, 0, kind], i * 4);
      col.set([srgb(at[o + 6]), srgb(at[o + 7]), srgb(at[o + 8])], i * 3);
      const c5 = at[o + 11] | (at[o + 12] << 8);
      bank.set([Math.pow((c5 >> 11) / 31, 2.2), Math.pow(((c5 >> 5) & 63) / 63, 2.2), Math.pow((c5 & 31) / 31, 2.2)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aXY', new THREE.BufferAttribute(xy, 2));
    g.setAttribute('aA', new THREE.BufferAttribute(A, 4)); g.setAttribute('aB', new THREE.BufferAttribute(B, 4)); g.setAttribute('aE', new THREE.BufferAttribute(E, 4));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aBank', new THREE.BufferAttribute(bank, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(g, surfaceMat(origin, hz, frame));
    mesh.position.copy(origin); mesh.frustumCulled = false; mesh.renderOrder = 0;
    // where this area has surfaces (for the ribbons) and where it is (for culling)
    const cells = new Set();
    for (let i = 0; i < NV; i += 2) cells.add(Math.floor(lat[i] / .002) * 1e6 + Math.floor(lon[i] / .003));
    const spheres = J.chunks.map(c => ({ p: llv(oy + c.y0 / ky, ox + c.x0 / kx, h[0]), r: c.r / 1000 }));
    const bridges = J.bridges && J.bridges.length ? buildBridges(J.bridges, J, origin) : null;
    const walls = buildWalls(J, NV, NT, X, Y, at, NA, idx, lake, lvl, origin);
    return { mesh, hz, cells, spheres, bridges, walls };
  }
  function ensure(pack) {
    const names = PACK_AREAS[pack]; if (!names) return;
    for (const [n, a] of areas) if (!names.includes(n)) { if (a.mesh) dropArea(a); areas.delete(n); }   // only the active leg stays resident
    for (const n of names) if (!areas.has(n)) {
      const a = { mesh: null }; areas.set(n, a);
      loadArea(n).then(d => {
        if (areas.get(n) !== a) { dropArea(d); return; }
        Object.assign(a, d); scene.add(d.mesh); if (d.bridges) scene.add(d.bridges); if (d.walls) scene.add(d.walls); markCoverage();
      }).catch(e => { console.warn('water area failed', n, e); });
    }
    markCoverage();
  }
  function dropArea(a) {
    for (const m of [a.mesh, a.bridges, a.walls]) if (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    a.hz.dispose();
  }

  /* ---------- ribbons: clean anti-aliased lines for rivers seen from afar ---------- */
  const RVS = `attribute vec3 aNext; attribute float aSide, aU, aW, aCov; attribute vec3 aC;
    uniform vec2 uRes; uniform float uFocal, uWorldW, uMaxPx; varying float vSide, vPx, vThin, vCov; varying vec3 vW, vC;
    void main(){
      vec4 mP=modelViewMatrix*vec4(position,1.), mN=modelViewMatrix*vec4(aNext,1.);
      vec4 cP=projectionMatrix*mP, cN=projectionMatrix*mN;
      vec2 d=(cN.xy/max(cN.w,1e-4)-cP.xy/max(cP.w,1e-4))*uRes; d=length(d)<1e-5?vec2(1.,0.):normalize(d);
      float w=(uWorldW>0.?uWorldW:aW)*uFocal/max(-mP.z,1e-3), px=clamp(w,1.3,uMaxPx)+1.2;   // true width, plus an AA fringe
      cP.xy+=vec2(-d.y,d.x)*aSide*px/uRes*cP.w; cP.z-=2e-4*cP.w;
      gl_Position=cP; vSide=aSide; vPx=px; vThin=clamp(w/1.3,.25,1.); vCov=aCov; vC=aC; vW=(modelMatrix*vec4(position,1.)).xyz;
    }`;
  const RFS = HAZE + `uniform float uAlt, uClip; uniform vec3 uCol; uniform vec4 uBB; varying float vSide, vPx, vThin, vCov; varying vec3 vW, vC;
    void main(){
      if(uClip>.5){ vec3 q=normalize(vW); float la=degrees(asin(q.y)), lo=degrees(atan(q.x,q.z));
        if(lo>uBB.x && lo<uBB.y && la>uBB.z && la<uBB.w) discard; }
      float d=abs(vSide)*vPx*.5, a=clamp((vPx-1.2)*.5+.6-d,0.,1.)*vThin;
      float dist=length(cameraPosition-vW);
      a*=(1.-vCov*(1.-smoothstep(${NEAR}.,${FAR}.,dist)))*.92*(1.-smoothstep(500.,1400.,uAlt));
      if(a<.004) discard;
      vec3 c=(uCol.r>=0.?uCol:vC)*(1.06-.12*abs(vSide));
      gl_FragColor=vec4(applyHaze(c,dist,uAlt),a);
  #include <tonemapping_fragment>
      gl_FragColor=linearToOutputTexel(gl_FragColor);
    }`;
  const ribbonMat = (o) => new THREE.ShaderMaterial({
    uniforms: { ...uni, uWorldW: { value: o.w || 0 }, uMaxPx: { value: 14 }, uClip: { value: 0 }, uCol: { value: o.col || new THREE.Color(-1, -1, -1) },
      uBB: { value: new THREE.Vector4(BB.W + .02, BB.E - .02, BB.S + .02, BB.N - .02) } },
    vertexShader: RVS, fragmentShader: RFS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  // far-view colour of each river: its body colour with a share of grazing sky
  const RCOL = { Inn: [96, 122, 110], Isar: [86, 146, 134], Donau: [90, 106, 92], Salzach: [104, 120, 110], Lech: [82, 150, 140], Pegnitz: [62, 76, 66], Sill: [112, 132, 122] };
  const rcol = name => { const c = RCOL[name] || [80, 106, 98]; return [0, 1, 2].map(k => srgb(c[k]) * .78 * .8 + [.64, .73, .86][k] * .2); };
  const neRibbons = [];
  function riverRibbon(path, worldW, name) {
    const m = ribbonMat({ w: worldW * .75, col: new THREE.Color().fromArray(rcol(name)) });
    const mesh = new THREE.Mesh(ctx.ribbonGeom(path), m); mesh.renderOrder = 1; mesh.frustumCulled = false;
    scene.add(mesh); ribbonMeshes.push(mesh); neRibbons.push(m);
  }
  // accurate centrelines inside the detailed patch, merged into one draw
  async function loadLines() {
    const J = await fetch('assets/water/lines.json').then(r => r.json());
    const P = [], NX = [], S = [], U = [], W = [], C = [], LL = [], I = [], tmp = new V3();
    for (const ln of J.lines) {
      const pts = [], src = ln.pts;
      ln.pts = [src[0]];
      for (let k = 0; k < src.length - 1; k++) { const a = src[k], b = src[k + 1]; ln.pts.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); }
      ln.pts.push(src[src.length - 1]);
      for (let k = 0; k < ln.pts.length - 1; k++) {
        const [x0, y0] = ln.pts[k], [x1, y1] = ln.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot((x1 - x0) * 74.5, (y1 - y0) * 111.2) / .15));
        for (let s = 0; s < n; s++) pts.push([y0 + (y1 - y0) * s / n, x0 + (x1 - x0) * s / n]);
      }
      const e = ln.pts[ln.pts.length - 1]; pts.push([e[1], e[0]]);
      if (pts.length < 2) continue;
      const base = P.length / 3, w = ln.w, c = rcol(ln.name);
      const wp = pts.map(([la, lo]) => llv(la, lo, groundKm(la, lo) + .006, new V3()));
      for (let i = 0; i < wp.length; i++) {
        const a = wp[i], b = i < wp.length - 1 ? wp[i + 1] : tmp.copy(a).multiplyScalar(2).sub(wp[i - 1]);
        for (const sd of [-1, 1]) { P.push(a.x, a.y, a.z); NX.push(b.x, b.y, b.z); S.push(sd); U.push(0); W.push(w); C.push(...c); }
        LL.push(pts[i][0], pts[i][1]);
        if (i < wp.length - 1) { const q = base + i * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aNext', new THREE.Float32BufferAttribute(NX, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(S, 1)); g.setAttribute('aU', new THREE.Float32BufferAttribute(U, 1));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 1)); g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aCov', new THREE.Float32BufferAttribute(new Float32Array(S.length), 1));
    g.setIndex(I);
    const mesh = new THREE.Mesh(g, ribbonMat({})); mesh.renderOrder = 1; mesh.frustumCulled = false;
    scene.add(mesh); ribbonMeshes.push(mesh); mesh.visible = !ctx.city;
    lines = { mesh, LL };
    for (const m of neRibbons) m.uniforms.uClip.value = 1;
    markCoverage();
  }
  // a ribbon vertex is "covered" when a surface of a loaded area lies within ~250 m
  function markCoverage() {
    if (!lines) return;
    const cov = lines.mesh.geometry.attributes.aCov, LL = lines.LL, loaded = [...areas.values()].filter(a => a.cells);
    for (let i = 0; i < LL.length / 2; i++) {
      const la = Math.floor(LL[i * 2] / .002), lo = Math.floor(LL[i * 2 + 1] / .003);
      let c = 0;
      for (const a of loaded) { for (let dy = -1; dy <= 1 && !c; dy++) for (let dx = -1; dx <= 1 && !c; dx++) if (a.cells.has((la + dy) * 1e6 + lo + dx)) c = 1; if (c) break; }
      cov.array[i * 2] = cov.array[i * 2 + 1] = c;
    }
    cov.needsUpdate = true;
  }
  if (ctx.geo) loadLines().catch(e => console.warn('river lines failed', e));
  else setTimeout(function wait() { if (ctx.geo) loadLines().catch(e => console.warn('river lines failed', e)); else setTimeout(wait, 300); }, 300);

  /* ---------- per frame ---------- */
  const camP = new V3();
  function update(dt, alt) {
    camP.copy(ctx.camera.position);
    for (const a of areas.values()) {
      if (!a.mesh) continue;
      const near = !ctx.city && alt < 60 && a.spheres.some(s => s.p.distanceTo(camP) - s.r < FAR + 4);
      a.mesh.visible = near;
      const u = a.mesh.material.uniforms.uFade; if (near) u.value = Math.min(1, u.value + dt * 1.5);
      for (const m of [a.bridges, a.walls]) if (m) { m.visible = near; m.material.uniforms.uFade.value = u.value; }
    }
  }
  return {
    riverRibbon, update, _dbg: { areas, groundKm },
    onPack(name) { ensure(name); },
    onStep(step) { if (step && step.pack) ensure(step.pack); },
    onCity(on) { for (const a of areas.values()) for (const m of [a.mesh, a.bridges, a.walls]) if (m) m.visible = !on; },
  };
}
