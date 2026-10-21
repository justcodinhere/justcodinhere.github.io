// Signs of life: jackdaws and alpine choughs wheeling over the towns, castles and peaks (now and then a flock sweeps
// past the camera), thin smoke from a sampling of old-town chimneys, Christmas-market huts with warm fronts, garlands
// and light strands on the real market streets, big lit trees at Marienplatz and the Goldenes Dachl, ducks and swans
// resting by the banks, and a light flurry around the camera in winter close-ups.
// Placements (assets/life/life.json) were made offline from Overture footprints, streets and water polygons.
// create(ctx) returns { update(dt, alt), onPack(name), onStep(step), onCity(on) }.
export default function create(ctx) {
  const { THREE, V3, R, D2R, BB, BHS, EXAG, uni, NOISE, HAZE, LIGHT, scene, camera, llv, enu, meshKm, terrainKm, heightM, phone, clamp, lerp, smooth, reduceMotion } = ctx;
  const lite = phone();
  const END = `\n#include <tonemapping_fragment>\n      gl_FragColor=linearToOutputTexel(gl_FragColor);`;
  const root = new THREE.Group(); scene.add(root);
  let data = null, built = false, pack = null, packBuilt = null, cityOn = false, before24 = true;
  fetch('assets/life/life.json').then(r => r.json()).then(d => { data = d; }).catch(e => console.warn('life data', e));
  let seed = 4711; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tmp = new V3(), tmp2 = new V3(), m4 = new THREE.Matrix4(), AX = new V3(), AY = new V3(), AZ = new V3();
  function basisAt(p, hdDeg) {                  // columns: x = up x front, y = up, z = front (heading from north)
    const f = enu(p), h = hdDeg * D2R;
    AZ.copy(f.north).multiplyScalar(Math.cos(h)).addScaledVector(f.east, Math.sin(h));
    AY.copy(f.up); AX.crossVectors(AY, AZ).normalize();
  }

  /* ---------- the ground the GPU draws (two triangles per cell), for things that float on the water ---------- */
  const TNX = lite ? 440 : 720, TNY = lite ? 660 : 1080, HW = 1280, HH = 1920, corner = new Map();
  const gLat = k => BB.S + (BB.N - BB.S) * k / (TNY - 1), gLon = k => BB.W + (BB.E - BB.W) * k / (TNX - 1);
  function cornerKm(i, j) {
    const key = j * 4096 + i; let v = corner.get(key);
    if (v === undefined) {
      const la = gLat(j), lo = gLon(i), u = i / (TNX - 1), w = j / (TNY - 1);
      const nla = BB.S + (BB.N - BB.S) * (clamp(Math.round(w * HH - .5), 0, HH - 1) + .5) / HH, nlo = BB.W + (BB.E - BB.W) * (clamp(Math.round(u * HW - .5), 0, HW - 1) + .5) / HW;
      v = Math.max(terrainKm(la, lo), heightM(nla, nlo) / 1000 * EXAG + .002); corner.set(key, v);
    }
    return v;
  }
  function waterKm(lat, lon) {                  // a touch above the river and lake surfaces (they sit ~1.5 m over this ground)
    const fu = (lon - BB.W) / (BB.E - BB.W) * (TNX - 1), fv = (lat - BB.S) / (BB.N - BB.S) * (TNY - 1);
    const i = Math.floor(fu), j = Math.floor(fv), x = fu - i, y = fv - j;
    let g;
    if (x + y <= 1) { const a = cornerKm(i, j); g = a + (cornerKm(i + 1, j) - a) * x + (cornerKm(i, j + 1) - a) * y; }
    else { const d = cornerKm(i + 1, j + 1); g = d + (cornerKm(i, j + 1) - d) * (1 - x) + (cornerKm(i + 1, j) - d) * (1 - y); }
    return Math.max(g, meshKm(lat, lon)) + .0017;
  }

  /* ---------- shared lit material for huts and trees (instanced, local coordinates around an origin) ---------- */
  // The terrain is drawn from float32 world positions ~6371 km out, so near the camera it lands a metre or two off its
  // true height; things standing on it are pulled toward the eye in view space (depth only, as the water does).
  const PULL = 'float pd=length(mv.xyz); mv.xyz*=max(1.-(uPull+.0004*pd)/max(pd,.02),.5);';
  // aPart: 0 wood, 1 roof, 2 glowing front, 3 garland, 4 awning, 5 fir, 6 star, 7 trunk, 8 chimney stack, 9 chimney cap
  const solidMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uOrigin: { value: new V3() }, uPull: { value: .004 } }, side: THREE.DoubleSide,
    vertexShader: `attribute float aPart, aVar; uniform float uPull; varying vec3 vP, vN, vL; varying float vPart, vVar;
      void main(){ vec4 p=instanceMatrix*vec4(position,1.); vP=p.xyz; vL=position; vPart=aPart; vVar=aVar;
        vN=normalize(mat3(instanceMatrix)*normal); vec4 mv=modelViewMatrix*p; ${PULL} gl_Position=projectionMatrix*mv; }`,
    fragmentShader: NOISE + HAZE + LIGHT + `uniform vec3 uOrigin, uRegionSun; uniform float uWinter, uAlt, uTime; varying vec3 vP, vN, vL; varying float vPart, vVar;
      void main(){
        vec3 up=normalize(uOrigin), n=normalize(vN), L=normalize(uRegionSun); if(!gl_FrontFacing) n=-n;
        vec3 wl=winterLight(n,up,L); float v=vVar, sn=uWinter*smoothstep(.25,.6,dot(n,up));
        vec3 wood=mix(vec3(.15,.08,.042),vec3(.25,.145,.075),fract(v*7.13))*(.82+.3*step(.45,fract(vL.x*2.3+v*3.)));
        vec3 col;
        if(vPart<.5) col=wood*wl;
        else if(vPart<1.5){ vec3 sh=v>.7?vec3(.24,.045,.035):v>.5?vec3(.05,.09,.05):vec3(.1,.064,.04); float rim=step(1.36,abs(vL.z))+step(1.6,abs(vL.x));
          // warm huts shed most of their snow: patches cling near the ridge, the eaves stay dark
          float pat=.6*vnoise(vL*vec3(.9,1.4,.9)+v*9.)+.4*vnoise(vL*2.5+v*3.)+(vL.y-2.6)*.5;
          col=mix(mix(sh,vec3(.80,.83,.88),sn*smoothstep(.42,.58,pat)),wood*.8,clamp(rim,0.,1.))*wl; }
        else if(vPart<2.5){ vec3 g=mix(vec3(1.,.55,.24),vec3(1.,.75,.45),fract(v*13.7)); col=g*(1.7+.2*sin(uTime*1.7+v*50.)); }
        else if(vPart<3.5){ col=vec3(.03,.08,.035)*wl+vec3(1.,.68,.32)*1.4*step(.7,fract(vL.x*2.4+v*5.)); }
        else if(vPart<4.5){ float st=step(.5,fract(vL.x*1.35+.25)); vec3 cr=vec3(.78,.74,.66);
          vec3 a=v<.4?mix(vec3(.42,.04,.035),cr,st):v<.6?mix(vec3(.04,.17,.07),cr,st):wood; col=mix(a,vec3(.80,.83,.88),sn*.85)*wl; }
        else if(vPart<5.5){ float k=vnoise(vL*vec3(70.,50.,70.)); vec3 fir=vec3(.012,.042,.02)*(.65+.7*k);
          col=mix(fir,vec3(.74,.78,.84),.75*uWinter*smoothstep(.6,.92,dot(n,up))*smoothstep(.55,.85,k))*wl; }
        else if(vPart<6.5) col=vec3(1.,.78,.35)*3.;
        else if(vPart<7.5) col=vec3(.12,.08,.05)*wl;
        else if(vPart<8.5){ vec3 c=v<.25?vec3(.30,.08,.045):v<.6?vec3(.56,.52,.45):vec3(.5,.47,.42); col=c*(1.-.25*step(-.5,vL.y))*wl; }   // plaster or brick, like the houses' own stacks
        else col=mix(vec3(.09,.085,.08),vec3(.86,.89,.94),uWinter*.85*step(.8,dot(n,up)))*wl;
        float d=length(cameraPosition-(vP+uOrigin));
        col=applyHaze(col,d,uAlt);
        if(d>7.+hash(gl_FragCoord.xyx)*1.5) discard;      // dithered fade, far beyond where a hut is a pixel
        gl_FragColor=vec4(col,1.);` + END + `}`,
  });
  function matAt(origin, pull = .004) { const m = solidMat.clone(); for (const k of Object.keys(uni)) m.uniforms[k] = uni[k]; m.uniforms.uOrigin.value.copy(origin); m.uniforms.uPull.value = pull; return m; }
  // non-indexed geometry with flat normals and a part id per vertex; metres, y up, front +z
  function builder() {
    const P = [], N = [], A = [], e1 = new V3(), e2 = new V3();
    const tri = (a, b, c, part) => { e1.subVectors(b, a); e2.subVectors(c, a); const n = e1.cross(e2).normalize(); for (const q of [a, b, c]) { P.push(q.x, q.y, q.z); N.push(n.x, n.y, n.z); A.push(part); } };
    const quad = (a, b, c, d, part) => { tri(a, b, c, part); tri(a, c, d, part); };
    const v = (x, y, z) => new V3(x, y, z);
    const box = (x0, x1, y0, y1, z0, z1, part) => {
      quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), part); quad(v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), part);
      quad(v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), part); quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0), part);
      quad(v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), v(x0, y1, z0), part);
    };
    const geo = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1)); return g;
    };
    return { tri, quad, v, box, geo, P, N, A };
  }
  // A market hut, 3 x 2.2 m: plank walls, counter with a warm-lit opening, a propped-up shutter, snowy gable roof, garland.
  function hutGeometry() {
    const { tri, quad, v, box, geo } = builder();
    box(-1.5, 1.5, -1, 2.2, -1.1, 1.1, 0);
    quad(v(-1.28, .92, 1.112), v(1.28, .92, 1.112), v(1.28, 1.86, 1.112), v(-1.28, 1.86, 1.112), 2);
    box(-1.42, 1.42, .82, .94, 1.1, 1.48, 0);
    quad(v(-1.46, 2.1, 1.12), v(-1.46, 1.86, 1.82), v(1.46, 1.86, 1.82), v(1.46, 2.1, 1.12), 4);
    quad(v(-1.75, 2.2, 1.55), v(1.75, 2.2, 1.55), v(1.75, 3.2, 0), v(-1.75, 3.2, 0), 1);
    quad(v(1.75, 2.2, -1.55), v(-1.75, 2.2, -1.55), v(-1.75, 3.2, 0), v(1.75, 3.2, 0), 1);
    tri(v(1.5, 2.2, 1.1), v(1.5, 2.2, -1.1), v(1.5, 3.12, 0), 0); tri(v(-1.5, 2.2, -1.1), v(-1.5, 2.2, 1.1), v(-1.5, 3.12, 0), 0);
    box(-1.62, 1.62, 2.1, 2.24, 1.5, 1.62, 3);
    box(-1.78, 1.78, 3.14, 3.36, -.14, .14, 3);          // fir garland along the ridge
    return geo();
  }
  // A big decorated fir at unit height: drooping tiers, a trunk and a star.
  function bigTreeGeometry() {
    const { tri, v, box, geo } = builder();
    box(-.03, .03, -.05, .1, -.03, .03, 7);
    const tiers = 8, seg = 14;
    for (let k = 0; k < tiers; k++) {
      const y0 = .07 + k * .108, r0 = .245 * (1 - k / (tiers + .6)), top = y0 + .2, rt = r0 * .18;
      for (let s = 0; s < seg; s++) {
        const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2, j0 = (s % 2 ? .9 : 1), j1 = ((s + 1) % 2 ? .9 : 1);
        const b0 = v(Math.cos(a0) * r0 * j0, y0 - .02 * j0, Math.sin(a0) * r0 * j0), b1 = v(Math.cos(a1) * r0 * j1, y0 - .02 * j1, Math.sin(a1) * r0 * j1);
        const t0 = v(Math.cos(a0) * rt, top, Math.sin(a0) * rt), t1 = v(Math.cos(a1) * rt, top, Math.sin(a1) * rt);
        tri(b0, t1, b1, 5); tri(b0, t0, t1, 5);
      }
    }
    const sy = .99, sr = .035;            // star: a little octahedron
    const S = [v(0, sy + sr * 1.4, 0), v(0, sy - sr, 0), v(sr, sy, 0), v(-sr, sy, 0), v(0, sy, sr), v(0, sy, -sr)];
    for (const [a, b] of [[2, 4], [4, 3], [3, 5], [5, 2]]) { tri(S[0], S[b], S[a], 6); tri(S[1], S[a], S[b], 6); }
    return geo();
  }
  function chimneyGeometry() {             // origin at the top: a plastered or brick stack with a cap slab
    const { box, geo } = builder();
    box(-.42, .42, -2.8, -.16, -.42, .42, 8); box(-.55, .55, -.16, 0, -.55, .55, 9);
    return geo();
  }
  // A person in a winter coat, 1.75 m, facing +z: coat (part 10) and head or hat (part 11).
  function personGeometry() {
    const { quad, v, box, geo } = builder();
    const b = [v(-.23, -.6, -.15), v(.23, -.6, -.15), v(.23, -.6, .15), v(-.23, -.6, .15)], t = [v(-.25, 1.42, -.14), v(.25, 1.42, -.14), v(.25, 1.42, .14), v(-.25, 1.42, .14)];
    for (let k = 0; k < 4; k++) quad(b[k], b[(k + 1) % 4], t[(k + 1) % 4], t[k], 10);
    quad(t[3], t[2], t[1], t[0], 10);
    box(-.11, .11, 1.42, 1.72, -.11, .11, 11);
    return geo();
  }
  const hutGeo = hutGeometry(), treeGeo = bigTreeGeometry(), chimGeo = chimneyGeometry(), personGeo = personGeometry();
  // Shoppers browse at the counters and stroll the aisles: all the walking happens here, in each one's own ground frame.
  const crowdMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uOrigin: { value: new V3() }, uT: { value: 0 }, uPull: { value: .004 } },
    vertexShader: `attribute float aPart; attribute vec4 aW; uniform float uT, uPull; varying vec3 vP, vN; varying float vPart, vVar;
      void main(){
        float ph=aW.z+uT*aW.y, s=sin(ph), c=cos(ph);
        // aW.x > 0: pace back and forth along the aisle (local x), turning at the ends; aW.x = 0: stand and sway
        vec3 q=position; float face=aW.x>0.?(c>=0.?1.:-1.):0.;
        if(aW.x>0.) q=vec3(q.z*face,q.y,-q.x*face);
        q.y*=.93+.1*fract(aW.w*7.3); q.x+=.03*sin(uT*1.7+aW.w*40.)*q.y;
        q.x+=aW.x*s;
        vec4 p=instanceMatrix*vec4(q,1.); vP=p.xyz; vPart=aPart; vVar=aW.w;
        vN=normalize(mat3(instanceMatrix)*(aW.x>0.?vec3(normal.z*face,normal.y,-normal.x*face):normal));
        vec4 mv=modelViewMatrix*p; ${PULL} gl_Position=projectionMatrix*mv; }`,
    fragmentShader: NOISE + HAZE + LIGHT + `uniform vec3 uOrigin, uRegionSun; uniform float uAlt; varying vec3 vP, vN; varying float vPart, vVar;
      void main(){
        vec3 up=normalize(uOrigin), n=normalize(vN); float v=vVar;
        vec3 coat=v<.2?vec3(.025,.03,.05):v<.36?vec3(.02,.02,.022):v<.5?vec3(.12,.12,.12):v<.62?vec3(.2,.03,.035):v<.72?vec3(.03,.08,.05):v<.84?vec3(.3,.2,.11):v<.92?vec3(.45,.07,.05):vec3(.55,.55,.52);
        vec3 head=fract(v*17.)<.45?vec3(.52,.36,.27):fract(v*17.)<.7?vec3(.6,.08,.06):fract(v*17.)<.85?vec3(.75,.74,.7):vec3(.05,.05,.06);
        vec3 col=(vPart<10.5?coat:head)*winterLight(n,up,normalize(uRegionSun));
        float d=length(cameraPosition-(vP+uOrigin));
        col=applyHaze(col,d,uAlt);
        if(d>4.+hash(gl_FragCoord.xyx)) discard;
        gl_FragColor=vec4(col,1.);` + END + `}`,
  });

  /* ---------- warm lights: additive points sized in metres, never below a couple of pixels ---------- */
  const lightMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uShow: { value: 1 }, uTw: { value: reduceMotion ? 0 : 1 }, uPull: { value: .0042 } }, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,     // premultiplied: a gold core over snow stays gold
    vertexShader: `attribute vec3 aCol; attribute vec2 aS; uniform float uTime, uFocal, uShow, uTw, uPull; varying vec3 vCol;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); float d=-mv.z; ${PULL}
        float px=aS.x*.001*uFocal/max(d,.01);
        float tw=1.-uTw*.6*smoothstep(.6,1.,sin(uTime*(1.1+aS.y*2.3)+aS.y*71.));
        gl_PointSize=clamp(px*3.,2.6,18.);
        vCol=aCol*tw*clamp(px*1.6,.6,1.)*uShow*(1.-smoothstep(5.,8.,d));
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vCol; void main(){ vec2 q=gl_PointCoord*2.-1.; float r=dot(q,q); if(r>1.) discard;
        float core=exp(-r*10.), halo=exp(-r*3.2)*(1.-r);
        vec3 c=linearToOutputTexel(vec4(vCol,1.)).rgb, m=max(vCol,vec3(1e-4)); float k=max(m.r,max(m.g,m.b));
        gl_FragColor=vec4(c*(core*1.05+halo*.45),k*(core*.7+halo*.22)); }`,
  });
  function lightsMesh(list, origin) {        // list of [world vec, colour [r,g,b], size m]
    const p = new Float32Array(list.length * 3), c = new Float32Array(list.length * 3), s = new Float32Array(list.length * 2);
    list.forEach(([w, col, sz], i) => { p[i * 3] = w.x - origin.x; p[i * 3 + 1] = w.y - origin.y; p[i * 3 + 2] = w.z - origin.z; c.set(col, i * 3); s[i * 2] = sz; s[i * 2 + 1] = rnd(); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(c, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 2));
    const m = new THREE.Points(g, lightMat); m.frustumCulled = false; m.renderOrder = 6; return m;
  }
  const WARM = [1, .36, .09], GOLD = [1, .58, .14], BULB = [1, .47, .13], RED = [1, .1, .05];

  /* ---------- Christmas markets ---------- */
  const markets = [];                        // { tag, group, origin }
  function buildMarkets() {
    const tags = new Map();
    for (const h of data.huts) { if (!tags.has(h[3])) tags.set(h[3], { huts: [], trees: [], strands: [] }); tags.get(h[3]).huts.push(h); }
    for (const t of data.trees) tags.get(t[3])?.trees.push(t);
    for (const s of data.strands) tags.get(s[2])?.strands.push(s);
    for (const [tag, T] of tags) {
      const [la0, lo0] = T.huts[0], origin = llv(la0, lo0, meshKm(la0, lo0)), group = new THREE.Group(), lights = [];
      group.position.copy(origin); const mat = matAt(origin);
      const huts = new THREE.InstancedMesh(hutGeo, mat, T.huts.length), vars = new Float32Array(T.huts.length);
      const K = .0015;                       // 1.5x so they read from a few hundred metres up
      T.huts.forEach(([la, lo, hd], i) => {
        const p = llv(la, lo, meshKm(la, lo)); basisAt(p, hd);
        m4.makeBasis(AX.clone().multiplyScalar(K), AY.clone().multiplyScalar(K), AZ.clone().multiplyScalar(K)); m4.setPosition(tmp.copy(p).sub(origin));
        huts.setMatrixAt(i, m4); vars[i] = rnd();
        for (let k = 0; k < (lite ? 2 : 4); k++) {              // bulbs along the front eave
          const x = lerp(-1.45, 1.45, (k + .5) / (lite ? 2 : 4));
          lights.push([tmp2.copy(p).addScaledVector(AX, x * K).addScaledVector(AY, 2.12 * K).addScaledVector(AZ, 1.66 * K).clone(), BULB, .55]);
        }
        lights.push([tmp2.copy(p).addScaledVector(AY, 1.4 * K).addScaledVector(AZ, 1.5 * K).clone(), WARM, 1.6]);   // glow spilling from the counter
      });
      huts.geometry = hutGeo.clone(); huts.geometry.setAttribute('aVar', new THREE.InstancedBufferAttribute(vars, 1));
      huts.frustumCulled = false; group.add(huts);
      if (T.trees.length) {
        const trees = new THREE.InstancedMesh(treeGeo.clone(), mat, T.trees.length), tv = new Float32Array(T.trees.length);
        T.trees.forEach(([la, lo, h], i) => {
          const p = llv(la, lo, meshKm(la, lo)), H = h * BHS * .001; basisAt(p, 0);
          m4.makeBasis(AX.clone().multiplyScalar(H), AY.clone().multiplyScalar(H), AZ.clone().multiplyScalar(H)); m4.setPosition(tmp.copy(p).sub(origin));
          trees.setMatrixAt(i, m4); tv[i] = .5;
          const n = lite ? 90 : 220, strands = 5;            // garlands of lights spiralling down the tiers
          for (let k = 0; k < n; k++) {
            const f = (k + .5) / n, y = .09 + .84 * f, r = .245 * (1 - (y - .05) / .95) * 1.04 + .01, a = f * 9 * Math.PI + (k % strands) / strands * 2 * Math.PI;
            const col = k % 7 === 0 ? RED : k % 5 === 0 ? GOLD : BULB;
            lights.push([p.clone().addScaledVector(AX, Math.cos(a) * r * H).addScaledVector(AZ, Math.sin(a) * r * H).addScaledVector(AY, (y - .03 * Math.cos(a * 3)) * H), col, .8]);
          }
          lights.push([p.clone().addScaledVector(AY, H * 1.0), GOLD, 3.2]);
        });
        trees.geometry.setAttribute('aVar', new THREE.InstancedBufferAttribute(tv, 1));
        trees.frustumCulled = false; group.add(trees);
      }
      for (const [a, b] of T.strands) {                       // strings of bulbs across the street, sagging between facades
        const pa = llv(a[0], a[1], meshKm(a[0], a[1]) + 6.5 * BHS * .001), pb = llv(b[0], b[1], meshKm(b[0], b[1]) + 6.5 * BHS * .001), up = enu(pa).up;
        const len = pa.distanceTo(pb) * 1000, n = Math.max(4, Math.round(len / (lite ? 1.6 : .9)));
        for (let k = 0; k <= n; k++) { const f = k / n; lights.push([pa.clone().lerp(pb, f).addScaledVector(up, -.0012 * 4 * f * (1 - f)), BULB, .45]); }
      }
      group.add(lightsMesh(lights, origin), crowd(T.huts, origin));
      root.add(group); markets.push({ tag, group, origin });
    }
  }

  function crowd(huts, origin) {               // 1-3 people at each counter and a few strolling past
    const P = [], K = .0015;
    for (const [la, lo, hd] of huts) {
      const p = llv(la, lo, meshKm(la, lo)); basisAt(p, hd);
      const n = (lite ? .7 : 1.6) * (.4 + rnd() * 1.2);
      for (let k = 0; k < n; k++) {
        const walk = rnd() < .45, lat = (rnd() - .5) * (walk ? 1.2 : 3), fwd = walk ? 3.7 + rnd() * 1.2 : 2.4 + rnd() * .9;
        const w = p.clone().addScaledVector(AX, lat * K).addScaledVector(AZ, fwd * K);
        P.push([w, walk ? hd : hd + 180 + (rnd() - .5) * 50, walk ? [2 + rnd() * 6, .25 + rnd() * .3, rnd() * 6.3, rnd()] : [0, 0, rnd() * 6.3, rnd()]]);
      }
    }
    const mesh = new THREE.InstancedMesh(personGeo.clone(), crowdMat, P.length), W = new Float32Array(P.length * 4);
    P.forEach(([w, hd, a], i) => {
      basisAt(w, hd); m4.makeBasis(AX.multiplyScalar(K), AY.multiplyScalar(K), AZ.multiplyScalar(K)); m4.setPosition(tmp.copy(w).sub(origin));
      mesh.setMatrixAt(i, m4); W.set(a, i * 4);
    });
    mesh.geometry.setAttribute('aW', new THREE.InstancedBufferAttribute(W, 4)); mesh.frustumCulled = false;
    const m = crowdMat.clone(); for (const k of Object.keys(crowdMat.uniforms)) m.uniforms[k] = crowdMat.uniforms[k];
    m.uniforms.uOrigin = { value: origin.clone() }; mesh.material = m;
    return mesh;
  }

  /* ---------- chimney smoke: soft rising puffs, drifting with a light westerly ---------- */
  const PUFFS = lite ? 7 : 12;
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uT: { value: 37 }, uUp: { value: new V3(0, 1, 0) }, uWind: { value: new V3(1, 0, 0) }, uShow: { value: 0 }, uK: { value: .0017 } },
    transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 aBase; attribute vec4 aP; uniform float uT, uShow, uK; uniform vec3 uUp, uWind; varying vec2 vUv; varying float vAge, vA, vSeed;
      void main(){
        float age=fract(uT/aP.w+aP.x), k=uK;
        vec3 side=normalize(cross(uUp,uWind));
        float sw=sin(uT*.6+aP.z*40.+age*4.);
        vec3 c=aBase+uUp*(.6+19.*pow(age,.75))*k+uWind*(.3+16.*age*age)*k+side*sw*(.4+3.*age)*k;
        // direction the puff is travelling, so each one is drawn as a streak along the plume
        vec3 dc=uUp*14.*pow(age+.02,-.25)+uWind*32.*age+side*sw*3.;
        float size=(.6+5.*pow(age,.6))*k*(.8+.45*aP.z), st=mix(2.2,1.25,smoothstep(0.,.7,age));
        vec4 mv=modelViewMatrix*vec4(c,1.);
        vec2 ax=(modelViewMatrix*vec4(dc,0.)).xy; ax=length(ax)>1e-6?normalize(ax):vec2(0.,1.);
        mv.xy+=(vec2(ax.y,-ax.x)*position.x+ax*position.y*st)*size;
        vUv=position.xy; vAge=age; vSeed=aP.z;
        vA=aP.y*smoothstep(0.,.05,age)*pow(1.-age,2.1)*uShow*(1.-smoothstep(3.5,7.,-mv.z));
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: NOISE + LIGHT + `uniform vec3 uUp, uRegionSun; varying vec2 vUv; varying float vAge, vA, vSeed;
      void main(){
        float r=length(vUv); if(r>1.||vA<.003) discard;
        float n=vnoise(vec3(vUv*2.3+vSeed*17.,vAge*2.5+vSeed*5.))*.65+vnoise(vec3(vUv*5.1-vSeed*9.,vAge*3.5))*.35;
        float a=min(.75,clamp((1.-smoothstep(.05,1.,r))*(.3+1.2*n)-.1,0.,1.)*vA*mix(1.5,.75,vAge));
        vec3 nv=vec3(vUv,sqrt(max(0.,1.-r*r))), nw=normalize((vec4(nv,0.)*viewMatrix).xyz);
        // thick wood smoke is a warm grey-brown at the stack, thinning to blue-grey: kept well below the snow's brightness
        vec3 tone=mix(vec3(.15,.145,.14),mix(vec3(.22,.235,.27),vec3(.36,.39,.45),smoothstep(.3,.9,vAge)),smoothstep(0.,.25,vAge));
        vec3 col=tone*winterLight(nw,uUp,normalize(uRegionSun))*(.9+.2*n);
        gl_FragColor=vec4(col,a);` + END + `}`,
  });
  let smoke = null, chims = null;
  function buildSmoke(name) {
    if (smoke) { root.remove(smoke); smoke.geometry.dispose(); smoke = null; }
    if (chims) { root.remove(chims); chims.geometry.dispose(); chims = null; }
    const list = (data.smoke[name] || []).filter((_, i) => !lite || i % 2 === 0);
    if (!list.length) return;
    const [la0, lo0] = list[0], origin = llv(la0, lo0, meshKm(la0, lo0)), f = enu(origin);
    const n = list.length * PUFFS, base = new Float32Array(n * 3), P = new Float32Array(n * 4), cv = new Float32Array(list.length);
    chims = new THREE.InstancedMesh(chimGeo.clone(), matAt(origin, 0), list.length);
    list.forEach(([la, lo, top, str], i) => {
      const w = llv(la, lo, meshKm(la, lo) + (top + .7) * BHS * .001);
      basisAt(w, rnd() * 90); m4.makeBasis(AX.multiplyScalar(.0014), AY.multiplyScalar(.0014 * BHS), AZ.multiplyScalar(.0014)); m4.setPosition(tmp.copy(w).sub(origin));
      chims.setMatrixAt(i, m4); cv[i] = rnd();
      tmp.copy(w).addScaledVector(AY, .2 / BHS).sub(origin);
      const life = 7 + rnd() * 4, ph = rnd();
      for (let k = 0; k < PUFFS; k++) { const j = i * PUFFS + k; base.set([tmp.x, tmp.y, tmp.z], j * 3); P.set([(ph + k / PUFFS) % 1, str, rnd(), life], j * 4); }
    });
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3)); g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
    g.instanceCount = n;
    smokeMat.uniforms.uUp.value.copy(f.up);
    const az = 68 * D2R; smokeMat.uniforms.uWind.value.copy(f.east).multiplyScalar(Math.sin(az)).addScaledVector(f.north, Math.cos(az)).normalize();   // blowing toward ENE
    smoke = new THREE.Mesh(g, smokeMat); smoke.position.copy(origin); smoke.frustumCulled = false; smoke.renderOrder = 5;
    chims.geometry.setAttribute('aVar', new THREE.InstancedBufferAttribute(cv, 1)); chims.position.copy(origin); chims.frustumCulled = false;
    root.add(smoke, chims);
  }

  /* ---------- birds: one instanced flock pool, wings flapped in the vertex shader ---------- */
  // Unit wingspan, x across, z forward. Wing vertices (aW = 1) hinge at the shoulder and again mid-wing; aW = 2 is a swan's neck.
  function birdGeometry() {
    const P = [], W = [], push = (w, ...pts) => { for (const p of pts) { P.push(...p); W.push(w); } };
    // body: a little diamond with depth, so a bird seen side-on is still a dash rather than a hairline
    const nose = [0, .01, .25], L = [-.05, 0, .03], Rr = [.05, 0, .03], T = [0, .05, -.01], B = [0, -.04, .0], tail = [0, .005, -.16];
    push(0, nose, L, T, nose, T, Rr, nose, B, L, nose, Rr, B, L, tail, T, T, tail, Rr, L, B, tail, B, Rr, tail);
    push(0, [0, .005, -.12], [-.075, 0, -.34], [.075, 0, -.34]);
    for (const s of [-1, 1]) {
      const rf = [s * .03, .01, .12], rb = [s * .03, .01, -.1], mf = [s * .25, .01, .1], mb = [s * .25, .01, -.12], tf = [s * .47, .01, .02], tb = [s * .5, .01, -.12];
      push(1, rf, mf, mb, rf, mb, rb, mf, tf, tb, mf, tb, mb);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 1));
    return g;
  }
  // Resting waterfowl, unit length: a boat-shaped body, and a neck that stands tall for swans.
  function fowlGeometry() {
    const P = [], W = [], push = (w, ...pts) => { for (const p of pts) { P.push(...p); W.push(w); } };
    const F = [0, .03, .45], B = [0, .07, -.45], Lt = [-.17, .04, 0], Rt = [.17, .04, 0], T = [0, .16, -.05], D = [0, -.04, 0];
    push(0, F, Lt, T, F, T, Rt, B, T, Lt, B, Rt, T, F, D, Lt, F, Rt, D, B, Lt, D, B, D, Rt);
    push(2, [-.025, .08, .28], [.025, .08, .28], [0, .5, .36], [0, .08, .22], [0, .5, .36], [0, .08, .32]);
    push(2, [0, .52, .34], [-.03, .47, .37], [0, .46, .5], [0, .52, .34], [0, .46, .5], [.03, .47, .37]);
    for (const s of [-1, 1]) push(3, [s * .12, .0, .05], [s * .42, .0, -.9], [s * .36, .0, -.93], [s * .12, .0, .05], [s * .36, .0, -.93], [s * .06, .0, -.05]);   // a faint V of ripples behind
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 1));
    return g;
  }
  const birdMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uOrigin: { value: new V3() } }, side: THREE.DoubleSide,
    vertexShader: `attribute float aW; attribute vec4 aFl; varying vec3 vP; varying float vKind, vWake;
      void main(){
        vec3 p=position;
        if(aW>.5&&aW<1.5){
          float s=sign(p.x), d=abs(p.x)-.03, a1=aFl.z+aFl.y*sin(aFl.x), a2=.55*aFl.y*sin(aFl.x-.9)+.1*aFl.z;
          float d1=min(d,.22), d2=max(d-.22,0.);
          p.x=s*(.03+d1*cos(a1)+d2*cos(a1+a2)); p.y+=d1*sin(a1)+d2*sin(a1+a2);
        }
        if(aW>1.5&&aFl.w<2.5) p=vec3(p.x,.07+(p.y-.07)*.32,p.z*.9);       // mallards: a short neck and a round head
        vKind=aFl.w; vWake=step(2.5,aW); vec4 w=instanceMatrix*vec4(p,1.); vP=w.xyz; vec4 mv=modelViewMatrix*w;
      #ifdef PULL
        float d=length(mv.xyz); mv.xyz*=max(1.-(.0135+.0004*d)/max(d,.02),.5);   // the water is drawn pulled ~11 m toward the eye; sit just in front of it
      #endif
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: HAZE + LIGHT + `uniform vec3 uOrigin, uRegionSun; uniform float uAlt; varying vec3 vP; varying float vKind, vWake;
      void main(){
        vec3 n=normalize(cross(dFdx(vP),dFdy(vP))), up=normalize(uOrigin), toC=cameraPosition-(vP+uOrigin); if(dot(n,toC)<0.) n=-n;
        vec3 c=vKind<.5?vec3(.034,.034,.04):vKind<1.5?vec3(.014,.014,.017):vKind<2.5?vec3(.2,.17,.13):vec3(.74,.75,.77);
        vec3 col=c*winterLight(n,up,normalize(uRegionSun));
        if(vWake>.5) col=vec3(.06,.085,.11)*winterLight(up,up,normalize(uRegionSun));
        col+=vec3(.05,.06,.075)*pow(1.-abs(dot(n,normalize(toC))),2.)*step(vKind,2.5);   // a little sky sheen on glossy black feathers
        col=applyHaze(col,length(toC),uAlt);
        gl_FragColor=vec4(col,1.);` + END + `}`,
  });
  const MAXB = lite ? 70 : 150, MAXF = 40;
  const birds = new THREE.InstancedMesh(birdGeometry(), birdMat, MAXB), birdFl = new Float32Array(MAXB * 4);
  birds.geometry.setAttribute('aFl', new THREE.InstancedBufferAttribute(birdFl, 4).setUsage(THREE.DynamicDrawUsage));
  birds.frustumCulled = false; birds.count = 0; root.add(birds);
  const fowlMat = birdMat.clone(); fowlMat.defines = { PULL: 1 }; for (const k of Object.keys(birdMat.uniforms)) fowlMat.uniforms[k] = birdMat.uniforms[k];
  const fowl = new THREE.InstancedMesh(fowlGeometry(), fowlMat, MAXF), fowlFl = new Float32Array(MAXF * 4);
  fowl.geometry.setAttribute('aFl', new THREE.InstancedBufferAttribute(fowlFl, 4)); fowl.frustumCulled = false; fowl.count = 0; root.add(fowl);
  const origin = new V3(); let originSet = false;    // bird and fowl matrices are relative to this, re-anchored as the camera travels
  function anchor(target) {
    if (originSet && origin.distanceTo(target) < 40) return;
    origin.copy(target); originSet = true; birds.position.copy(origin); fowl.position.copy(origin); birdMat.uniforms.uOrigin.value.copy(origin);
  }
  // span m, flap Hz, flap amplitude rad, share of time gliding, cruise km/s, colour id
  const KIND = {
    jackdaw: { span: .68, hz: 4.4, amp: .62, glide: .22, v: .013, c: 0 },
    chough: { span: .78, hz: 3.8, amp: .55, glide: .55, v: .012, c: 1 },
    crow: { span: .98, hz: 3.2, amp: .52, glide: .3, v: .012, c: 1 },
  };
  // Where flocks live: lat, lon, kind, birds, circling radius m, height above the ground m. Choughs come down to Innsbruck in winter.
  const HOMES = [
    [47.2690, 11.3928, 'chough', 18, 220, 95], [47.2712, 11.3885, 'crow', 9, 170, 70], [47.3125, 11.3864, 'chough', 14, 190, 70],
    [47.2490, 11.3995, 'chough', 8, 150, 80], [48.1382, 11.5742, 'jackdaw', 20, 230, 135], [48.1300, 11.5834, 'crow', 9, 190, 60],
    [49.4577, 11.0760, 'jackdaw', 18, 170, 85], [49.4535, 11.0782, 'jackdaw', 10, 210, 95], [47.5578, 10.7495, 'chough', 14, 170, 90],
    [47.5553, 10.7364, 'jackdaw', 8, 130, 70], [47.5836, 12.1706, 'jackdaw', 12, 160, 80], [47.4383, 11.8933, 'jackdaw', 9, 130, 75],
    [47.2833, 11.5083, 'jackdaw', 8, 140, 65], [47.5695, 10.7003, 'jackdaw', 10, 160, 75], [47.3500, 11.7083, 'jackdaw', 8, 140, 65],
  ].map(([lat, lon, kind, n, r, h]) => ({ lat, lon, kind: KIND[kind], n: lite ? Math.ceil(n * .55) : n, r: r / 1000, h: h / 1000, flock: null }));
  function frameAt(p) { const f = enu(p), n = p.clone().normalize(); return { o: p.clone(), ...f, lat: Math.asin(n.y) / D2R, lon: Math.atan2(n.x, n.z) / D2R }; }
  function makeFlock(F, kind, n, path) {
    const b = [];
    for (let i = 0; i < n; i++) b.push({
      lag: i * (.12 + rnd() * .25), f: [.08 + rnd() * .16, .08 + rnd() * .16, .1 + rnd() * .2], ph: [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3, rnd() * 6.3],
      flap: rnd() * 6.3, amp: kind.amp, glideT: rnd() * 2, gliding: false, hz: kind.hz * (.9 + rnd() * .2),
    });
    return { F, kind, birds: b, path, w: 0, on: true, t: rnd() * 100, g0: F.o.length() - R };      // g0: height of the frame origin
  }
  // A home flock wheels around its home on a slowly wandering loop; a sweep follows a curve across the view, then leaves.
  function homePath(H) {
    const rx = H.r * (.8 + rnd() * .4), ry = H.r * (.7 + rnd() * .4), r2 = H.r * .3, w = H.kind.v * 1.4 / H.r, p1 = rnd() * 6.3, p2 = rnd() * 6.3, p3 = rnd() * 6.3;
    return (t, o) => { const a = w * t + p1; o.set(rx * Math.cos(a) + r2 * Math.cos(2.1 * a + p2), ry * Math.sin(a) + r2 * Math.sin(1.6 * a + p2), H.h + .03 * Math.sin(.7 * a + p3)); return o; };
  }
  const flocks = [];
  let sweepIn = 6 + rnd() * 6, X = 2;
  function spawnSweep() {
    const C = camera.position, T = ctx.cam.target, dir = tmp.subVectors(T, C).normalize(), right = new V3().setFromMatrixColumn(camera.matrixWorld, 0);
    const D = clamp(ctx.cam.dist * .24, .08, .7), M = C.clone().addScaledVector(dir, D), F = frameAt(M);
    const gl = terrainKm(F.lat, F.lon), mh = M.length() - R;
    if (mh < gl + .05) M.addScaledVector(F.up, gl + .05 - mh);
    const Ff = frameAt(M), hf = Math.tan(camera.fov * D2R / 2) * camera.aspect * D * 1.15, s = rnd() < .5 ? 1 : -1;
    const loc = v => { tmp2.subVectors(v, Ff.o); return new V3(tmp2.dot(Ff.east), tmp2.dot(Ff.north), tmp2.dot(Ff.up)); };
    const P0 = loc(M.clone().addScaledVector(right, -hf * s).addScaledVector(dir, D * (rnd() - .3) * .5)), P2 = loc(M.clone().addScaledVector(right, hf * s).addScaledVector(dir, D * (rnd() - .3) * .5));
    const P1 = loc(M.clone().addScaledVector(dir, D * (rnd() * .6 - .2)).addScaledVector(Ff.up, D * .12 * (rnd() - .3)));
    const kind = ctx.activePack === 'inn' || ctx.activePack === 'neu' ? (rnd() < .6 ? KIND.chough : KIND.jackdaw) : (rnd() < .6 ? KIND.jackdaw : KIND.crow);
    const len = P0.distanceTo(P1) + P1.distanceTo(P2), T0 = clamp(len / (kind.v * X ** .85), 9, 26);   // drawn X times life size, so they fly about as many wingspans a second
    const n = Math.min(lite ? 12 : 22, MAXB - used()), q = new V3();
    if (n < 4) return;
    const fl = makeFlock(Ff, kind, n, (t, o) => { const u = clamp(t / T0, 0, 1.2), a = 1 - u; o.set(0, 0, 0).addScaledVector(P0, a * a).addScaledVector(P1, 2 * a * u).addScaledVector(P2, u * u); if (u > 1) o.add(q.subVectors(P2, P1).multiplyScalar((u - 1) * 2)); return o; });
    fl.t = 0; fl.sweep = T0 * 1.15 + 4; fl.w = 1; fl.spread = D * .05;
    for (const b of fl.birds) b.lag *= .5;
    flocks.push(fl);
  }
  const used = () => flocks.reduce((s, f) => s + f.birds.length, 0);
  const pA = new V3(), pB = new V3(), pC = new V3(), off = new V3(), vel = new V3(), acc = new V3(), wp = new V3(), Up = new V3(), Fw = new V3();
  function birdLocal(fl, b, t, o) {
    fl.path(t - b.lag, o);
    const s = fl.spread || .03, f = b.f, ph = b.ph;
    o.x += s * (Math.sin(f[0] * t + ph[0]) + .4 * Math.sin(2.3 * f[0] * t + ph[3]));
    o.y += s * (Math.sin(f[1] * t + ph[1]) + .4 * Math.sin(1.9 * f[1] * t + ph[2]));
    o.z += s * .45 * Math.sin(f[2] * t + ph[2]);
    const lat = fl.F.lat + o.y / 110.57, lon = fl.F.lon + o.x / (111.32 * Math.cos(fl.F.lat * D2R)), gz = terrainKm(lat, lon) - fl.g0 + .03;
    if (o.z < gz) o.z = gz + (o.z - gz) * .2;
    return o;
  }
  function updateBirds(dt) {
    const T = ctx.cam.target, d = ctx.cam.dist, show = d < 10 && !reduceMotion;
    X = clamp(1.2 + 1.3 * Math.sqrt(d), 1.6, 5);
    // wake the nearest home flocks, let far ones fade away
    for (const H of HOMES) {
      const hp = H.v || (H.v = llv(H.lat, H.lon, terrainKm(H.lat, H.lon)));
      const want = show && hp.distanceTo(T) < Math.max(3, d * .8);
      if (want && !H.flock && used() + H.n <= MAXB) { H.flock = makeFlock(frameAt(hp), H.kind, H.n, homePath(H)); H.flock.home = H; flocks.push(H.flock); }
      if (H.flock) H.flock.on = want;
    }
    if (show && d < 7 && (sweepIn -= dt) < 0) { sweepIn = 22 + rnd() * 30; spawnSweep(); }
    let k = 0;
    for (let i = flocks.length - 1; i >= 0; i--) {
      const fl = flocks[i];
      fl.t += dt; fl.w = clamp(fl.w + (fl.on ? dt : -dt) / 2.5, 0, 1);
      if (fl.sweep && fl.t > fl.sweep) fl.on = false;
      if (!fl.on && fl.w <= 0) { if (fl.home) fl.home.flock = null; flocks.splice(i, 1); continue; }
      const F = fl.F;
      for (const b of fl.birds) {
        if (k >= MAXB) break;
        birdLocal(fl, b, fl.t - .12, pA); birdLocal(fl, b, fl.t, pB); birdLocal(fl, b, fl.t + .12, pC);
        vel.subVectors(pC, pA); acc.copy(pC).add(pA).addScaledVector(pB, -2).multiplyScalar(1 / (.12 * .12));
        wp.copy(F.o).addScaledVector(F.east, pB.x).addScaledVector(F.north, pB.y).addScaledVector(F.up, pB.z); Fw.copy(F.east).multiplyScalar(vel.x).addScaledVector(F.north, vel.y).addScaledVector(F.up, vel.z * .6).normalize();
        // bank into the turn: lift leans toward the centre of the curve
        const aw = tmp.copy(F.east).multiplyScalar(acc.x).addScaledVector(F.north, acc.y);
        aw.addScaledVector(Fw, -aw.dot(Fw));
        Up.copy(F.up).multiplyScalar(.0098).addScaledVector(aw, 1.6); Up.addScaledVector(Fw, -Up.dot(Fw)).normalize();
        const dc = wp.distanceTo(camera.position), span = clamp(Math.max(fl.kind.span * X * (fl.sweep ? 1.4 : 1), dc * 1000 * .0088), fl.kind.span * 1.5, fl.kind.span * 11) * .001 * fl.w;
        AX.crossVectors(Up, Fw).normalize().multiplyScalar(span); AY.crossVectors(Fw, AX).normalize().multiplyScalar(span); AZ.copy(Fw).multiplyScalar(span);
        m4.makeBasis(AX, AY, AZ); m4.setPosition(wp.sub(origin)); birds.setMatrixAt(k, m4);
        // flap in bursts, glide between them (choughs glide most)
        if ((b.glideT -= dt) < 0) { b.gliding = !b.gliding && rnd() < fl.kind.glide * 1.6; b.glideT = b.gliding ? .6 + rnd() * 1.8 : .8 + rnd() * 2.2; }
        const climb = vel.z / Math.max(1e-6, vel.length());
        b.amp = lerp(b.amp, b.gliding && climb < .15 ? .04 : fl.kind.amp, Math.min(1, dt * 4));
        b.flap += dt * b.hz * 6.283 * (b.amp > .1 ? 1 : .25);
        birdFl.set([b.flap, b.amp, b.gliding ? (fl.kind === KIND.chough ? .26 : .16) : .08, fl.kind.c], k * 4); k++;
      }
    }
    birds.count = k; birds.instanceMatrix.needsUpdate = true; birds.geometry.attributes.aFl.needsUpdate = true;
  }
  // waterfowl: bob and paddle slowly where they rest, only near the camera. They sit on the water surface as drawn
  // (lakes lie flat at their own level): a few thousand of the water meshes' triangles are tested per frame,
  // in the ground plane, until every bird near the camera has its spot; no surface there, no bird.
  let fowlList = null, scan = null, scanAt = -1;
  const inv = new THREE.Matrix4(), qa = new V3(), qb = new V3(), qc = new V3();
  function startScan(T) {
    const pts = fowlList.filter(f => f.v === null && llv(f.lat, f.lon, 0, tmp2).distanceTo(T) < 4.5);
    if (!pts.length) return;
    const meshes = [];
    scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.visible && o.material && o.material.uniforms && o.material.uniforms.uPull && o.geometry.attributes.position) meshes.push(o); });
    if (!meshes.length) return;
    for (const f of pts) { f.at = llv(f.lat, f.lon, waterKm(f.lat, f.lon)); f.best = null; }
    scan = { meshes, pts, mi: 0, ti: 0, loc: null };
  }
  function stepScan(budget) {
    while (scan && budget > 0) {
      const m = scan.meshes[scan.mi], g = m.geometry, P = g.attributes.position.array, I = g.index && g.index.array, nt = (I ? I.length : P.length / 3) / 3;
      if (!scan.loc) {                         // fowl spots and the ground frame in this mesh's own coordinates
        m.updateMatrixWorld(); inv.copy(m.matrixWorld).invert();
        const f0 = enu(scan.pts[0].at), E = f0.east.transformDirection(inv), N = f0.north.transformDirection(inv);
        scan.loc = { E, N, p: scan.pts.map(f => { const l = f.at.clone().applyMatrix4(inv); return [l.dot(E), l.dot(N), f]; }) };
      }
      const { E, N, p } = scan.loc, end = Math.min(nt, scan.ti + budget);
      for (let t = scan.ti; t < end; t++) {
        const ia = I ? I[t * 3] * 3 : t * 9, ib = I ? I[t * 3 + 1] * 3 : t * 9 + 3, ic = I ? I[t * 3 + 2] * 3 : t * 9 + 6;
        qa.set(P[ia], P[ia + 1], P[ia + 2]); qb.set(P[ib], P[ib + 1], P[ib + 2]); qc.set(P[ic], P[ic + 1], P[ic + 2]);
        const ax = qa.dot(E), ay = qa.dot(N), bx = qb.dot(E) - ax, by = qb.dot(N) - ay, cx = qc.dot(E) - ax, cy = qc.dot(N) - ay, det = bx * cy - by * cx;
        if (Math.abs(det) < 1e-12) continue;                    // walls and other edge-on faces
        const x0 = Math.min(0, bx, cx) + ax, x1 = Math.max(0, bx, cx) + ax, y0 = Math.min(0, by, cy) + ay, y1 = Math.max(0, by, cy) + ay;
        for (const [px, py, f] of p) {
          if (px < x0 || px > x1 || py < y0 || py > y1) continue;
          const dx = px - ax, dy = py - ay, u = (dx * cy - dy * cx) / det, v = (bx * dy - by * dx) / det;
          if (u < 0 || v < 0 || u + v > 1) continue;
          const hit = qb.sub(qa).multiplyScalar(u).add(qa).addScaledVector(qc.sub(qa), v).applyMatrix4(m.matrixWorld).clone();
          qa.set(P[ia], P[ia + 1], P[ia + 2]); qb.set(P[ib], P[ib + 1], P[ib + 2]); qc.set(P[ic], P[ic + 1], P[ic + 2]);
          if (!f.best || hit.lengthSq() < f.best.lengthSq()) f.best = hit;     // the water, not a bridge deck above it
        }
      }
      budget -= end - scan.ti; scan.ti = end;
      if (end >= nt) { scan.mi++; scan.ti = 0; scan.loc = null; }
      if (scan.mi >= scan.meshes.length) {
        for (const f of scan.pts) f.v = f.best ? f.best.addScaledVector(enu(f.best).up, .00012) : false;
        scan = null;
      }
    }
  }
  function updateFowl(dt) {
    if (!fowlList) fowlList = data.fowl.map(([lat, lon, kind]) => ({ lat, lon, kind, hd: rnd() * 360, w: (rnd() - .5) * 6, ph: rnd() * 6.3, v: null }));
    const T = ctx.cam.target, d = ctx.cam.dist, t = ctx.time; let k = 0;
    if (d < 5) {                              // the water feature builds its surfaces as packs arrive, so look again now and then
      if (!scan && t > scanAt) { scanAt = t + 2; startScan(T); }
      stepScan(lite ? 3000 : 8000);
    }
    if (d < 5) for (const f of fowlList) {
      if (k >= MAXF) break;
      if (!f.v) continue;
      const v = f.v;
      if (v.distanceTo(T) > 4) continue;
      if (!reduceMotion) f.hd += f.w * dt;
      const len = f.kind ? 1.6 : .6;
      basisAt(v, f.hd); const L = len * clamp(Math.max(X, v.distanceTo(camera.position) * 1000 * .0055 / len), 1.8, 7) * .001;
      const sw = reduceMotion ? 0 : L * .16 * dt;                    // paddling slow circles, a few metres across
      f.ox = (f.ox || 0) + AZ.x * sw; f.oy = (f.oy || 0) + AZ.y * sw; f.oz = (f.oz || 0) + AZ.z * sw;
      wp.copy(v).add(tmp2.set(f.ox, f.oy, f.oz)).addScaledVector(AY, .00004 * Math.sin(t * 1.3 + f.ph)).sub(origin);
      m4.makeBasis(AX.multiplyScalar(L), AY.multiplyScalar(L), AZ.multiplyScalar(L)); m4.setPosition(wp); fowl.setMatrixAt(k, m4);
      fowlFl.set([0, 0, 0, f.kind ? 3 : 2], k * 4); k++;
    }
    fowl.count = k; fowl.instanceMatrix.needsUpdate = true; fowl.geometry.attributes.aFl.needsUpdate = true;
  }

  /* ---------- a light flurry close to the camera: world-anchored flakes wrapped in a box that follows the view ---------- */
  const NF = lite ? 260 : 650;
  const flakeMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uC: { value: new V3() }, uB: { value: .1 }, uUp: { value: new V3(0, 1, 0) }, uWind: { value: new V3(1, 0, 0) }, uShow: { value: 0 } },
    transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aR; uniform vec3 uC, uUp, uWind; uniform float uB, uTime, uFocal, uShow; varying float vA;
      void main(){
        vec3 q=aR.xyz*2.*uB-uUp*uTime*uB*.07*(.7+.6*aR.w)+uWind*uTime*uB*.025+cross(uUp,uWind)*sin(uTime*.9+aR.w*30.)*uB*.02;
        vec3 p=mod(q-uC+uB,2.*uB)-uB+uC;
        vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z;
        float px=uB*.0016*(.5+aR.w)*uFocal/max(d,.001);
        gl_PointSize=clamp(px,1.5,9.);
        vA=uShow*min(1.,px*.5)*(1.-smoothstep(.55,1.,length(p-uC)/uB))*smoothstep(.0,.15,d/uB);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; void main(){ vec2 q=gl_PointCoord*2.-1.; float r=dot(q,q); if(r>1.) discard;
        gl_FragColor=vec4(vec3(.93,.95,1.),vA*(1.-r*r));` + END + `}`,
  });
  const flakes = (() => {
    const a = new Float32Array(NF * 4); for (let i = 0; i < a.length; i++) a[i] = rnd();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NF * 3), 3)); g.setAttribute('aR', new THREE.BufferAttribute(a, 4));
    const m = new THREE.Points(g, flakeMat); m.frustumCulled = false; m.renderOrder = 7; m.visible = false; root.add(m); return m;
  })();
  const flakeO = new V3(); let flakeOSet = false;
  function updateFlakes(dt) {
    const d = ctx.cam.dist, w = ctx.winter;
    const show = reduceMotion ? 0 : w * (1 - smooth(1.5, 4, d)) * (1 - .85 * clamp(ctx.state.snow || 0, 0, 1)) * .75;
    flakeMat.uniforms.uShow.value = show; flakes.visible = show > .01;
    if (!flakes.visible) return;
    if (!flakeOSet || flakeO.distanceTo(camera.position) > 20) {
      flakeO.copy(camera.position); flakeOSet = true; flakes.position.copy(flakeO);
      const f = enu(flakeO); flakeMat.uniforms.uUp.value.copy(f.up); flakeMat.uniforms.uWind.value.copy(f.east).multiplyScalar(.93).addScaledVector(f.north, .37).normalize();
    }
    const B = clamp(d * .16, .03, .3), dir = tmp.subVectors(ctx.cam.target, camera.position).normalize();
    flakeMat.uniforms.uB.value = B; flakeMat.uniforms.uC.value.copy(camera.position).addScaledVector(dir, B * 1.05).sub(flakeO);
  }

  /* ---------- per frame ---------- */
  function update(dt, alt) {
    if (!data) return;
    if (!built) { buildMarkets(); built = true; }
    if (pack && packBuilt !== pack) { buildSmoke(pack); packBuilt = pack; }
    root.visible = !cityOn && !ctx.city;
    if (!root.visible) return;
    const T = ctx.cam.target, d = ctx.cam.dist, cp = camera.position;
    for (const m of markets) m.group.visible = d < 12 && cp.distanceTo(m.origin) < 9 && (m.tag === 'ibk' || before24);
    lightMat.uniforms.uShow.value = 1 - smooth(6, 11, d); if (!reduceMotion) crowdMat.uniforms.uT.value = ctx.time;
    if (smoke) { const s = 1 - smooth(5, 9, d); smokeMat.uniforms.uShow.value = s; if (!reduceMotion) smokeMat.uniforms.uT.value = ctx.time; smoke.visible = s > .01 && cp.distanceTo(smoke.position) < 40; chims.visible = smoke.visible; }
    anchor(T);
    updateBirds(dt); updateFowl(dt); updateFlakes(dt);
  }
  return {
    update,
    onPack(name) { pack = name; if (fowlList) for (const f of fowlList) f.v = null; scan = null; scanAt = -1; },
    // Munich's market closes on Christmas Eve (and Innsbruck's Marktplatz one may too); the old-town market in Innsbruck runs to Epiphany
    onStep(step) { before24 = !/^(day([5-9]|10)|home)/.test(step && step.id || ''); },
    onCity(on) { cityOn = !!on; root.visible = !cityOn; },
    _dbg: { sweep: () => { sweepIn = 0; }, flocks, markets, get smoke() { return smoke; } },
  };
}
