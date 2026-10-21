// 3D buildings from Overture / OpenStreetMap footprints: walls, real roof shapes, towers and spires.
// create(ctx) returns { buildBuildings(buffer, meta) -> Promise<THREE.Mesh> }.
export default function create(ctx) {
  const { THREE, V3, uni, HAZE, LIGHT, D2R, BHS, llv, ground, meshKm, phone } = ctx;
  const bldgMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uOrigin: { value: new V3() }, uFade: { value: 0 } },
    side: THREE.DoubleSide, transparent: true,
    vertexShader: `attribute float aTint, aH, aRC, aWC; varying vec3 vL, vRC, vWC; varying float vTint, vH; uniform vec3 uOrigin;
      vec3 c565(float c){ if(c<.5) return vec3(-1.); return pow(vec3(floor(c/2048.)/31., floor(mod(c,2048.)/32.)/63., mod(c,32.)/31.),vec3(2.2)); }
      void main(){ vL=position; vTint=aTint; vH=aH; vRC=c565(aRC); vWC=c565(aWC); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: HAZE + LIGHT + `uniform vec3 uOrigin, uRegionSun; uniform float uWinter, uAlt, uFade; varying vec3 vL, vRC, vWC; varying float vTint, vH;
      void main(){
        vec3 n=normalize(cross(dFdx(vL),dFdy(vL)));
        vec3 wp=vL+uOrigin, up=normalize(uOrigin), toCam=cameraPosition-wp;
        if(dot(n,toCam)<0.) n=-n;
        float t=fract(vTint), church=step(1.,vTint);
        float roof=smoothstep(.25,.45,dot(n,up));
        vec3 wall=t<.25?vec3(.52,.45,.36):t<.42?vec3(.56,.53,.48):t<.58?vec3(.55,.42,.26):t<.72?vec3(.50,.36,.31):t<.86?vec3(.40,.43,.37):vec3(.47,.41,.35);
        vec3 rf=t<.5?vec3(.27,.12,.08):t<.78?vec3(.16,.14,.13):vec3(.31,.17,.11);
        if(church>.5){ wall=vec3(.66,.64,.60); rf=vec3(.18,.20,.21); }
        if(vWC.r>=0.) wall=mix(wall,vWC*.7,.3); if(vRC.r>=0.) rf=mix(rf,vRC*.6,.3);
        float patchy=.38+.42*fract(vTint*7.3)+.2*fract(vTint*31.7);
        rf=mix(rf,vec3(.72,.75,.80),uWinter*patchy*smoothstep(.35,.6,dot(n,up)));
        vec3 col=mix(wall,rf,roof);
        col*=winterLight(n,up,normalize(uRegionSun))*mix(.62,1.,smoothstep(0.,.8,vH));
        float d=length(toCam);
        col=applyHaze(col,d,uAlt);
        float a=uFade*(1.-smoothstep(28.,45.,d));
        if(a<.01) discard;
        gl_FragColor=vec4(col,a); 
  #include <tonemapping_fragment>
        gl_FragColor=linearToOutputTexel(gl_FragColor);
      }`,
  });
  // Footprints come in 0.5 m units with a roof type and ridge frame (from the minimum rotated rectangle).
  // Pitched roofs are cut into planar faces by clipping the footprint against each roof plane's region,
  // so gables, hips and pyramids follow the real outline; walls pick up the roof line at each break.
  const ROOF = { FLAT: 0, GABLE: 1, HIP: 2, PYRAMID: 3, DOME: 4, ONION: 5, SKILLION: 6, CONE: 7 };
  const PROFILES = {
    [ROOF.DOME]: [[1, 0], [.97, .25], [.87, .5], [.7, .7], [.45, .87], [0, 1]],
    [ROOF.ONION]: [[1, 0], [1.18, .2], [1.12, .4], [.75, .62], [.3, .8], [.1, .9], [0, 1]],
    [ROOF.CONE]: [[1, 0], [0, 1]],
  };
  function clipHalf(poly, ax, ay, b) {      // keep the part of poly where ax*x + ay*y + b >= 0
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const fp = ax * p[0] + ay * p[1] + b, fq = ax * q[0] + ay * q[1] + b;
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  }
  async function buildBuildings(buf, meta) {
    const u = new Uint16Array(buf), s16 = new Int16Array(buf), N = u.length;
    const pos = [], tint = [], hv = [], rc = [], wc = [], idx = [];
    const origin = ground(meta.oy + 0.05, meta.ox + 0.05), tmp = new V3(), skipSmall = phone();
    let i = 0;
    let slice = 0;
    while (i < N) {
      if (++slice % 1200 === 0) await new Promise(r => setTimeout(r, 0));
      const n = u[i], hM = u[i + 1] / 10, minH = u[i + 2] / 10, type = u[i + 3] & 255, flags = u[i + 3] >> 8;
      let rh = u[i + 4] / 10;
      const ang = u[i + 5] / 10 * D2R, ocx = s16[i + 6] / 2, ocy = s16[i + 7] / 2, L = u[i + 8] / 2, W = u[i + 9] / 2;
      const roofC = u[i + 10], wallC = u[i + 11];
      let x = (u[i + 12] << 16) | u[i + 13], y = (u[i + 14] << 16) | u[i + 15];
      i += 16;
      const ring = [[x / 2, y / 2]];
      for (let j = 1; j < n; j++) { x += s16[i]; y += s16[i + 1]; i += 2; ring.push([x / 2, y / 2]); }
      const church = flags & 1, part = flags & 2;
      let cx = 0, cy = 0, area = 0;
      for (let j = 0; j < n; j++) { const a = ring[j], b = ring[(j + 1) % n]; cx += a[0]; cy += a[1]; area += a[0] * b[1] - b[0] * a[1]; }
      cx /= n; cy /= n; area = Math.abs(area) / 2;
      if (skipSmall && !part && area < 90) continue;
      const lonOf = xx => meta.ox + xx / meta.kx, latOf = yy => meta.oy + yy / meta.ky;
      const base = meshKm(latOf(cy), lonOf(cx));
      // roof frame: v along the ridge, w across it, centred on the footprint's rectangle
      const c0 = [ring[0][0] + ocx, ring[0][1] + ocy], ex = [Math.cos(ang), Math.sin(ang)], ey = [-ex[1], ex[0]];
      const toV = p => (p[0] - c0[0]) * ex[0] + (p[1] - c0[1]) * ex[1], toW = p => (p[0] - c0[0]) * ey[0] + (p[1] - c0[1]) * ey[1];
      let hw = Math.max(1, W / 2), hl = Math.max(hw, L / 2);
      if (type === ROOF.PYRAMID) hl = hw = Math.max(hw, (hl + hw) / 2);
      const pitched = type === ROOF.GABLE || type === ROOF.HIP || type === ROOF.PYRAMID || type === ROOF.SKILLION;
      if (!pitched && type !== ROOF.DOME && type !== ROOF.ONION && type !== ROOF.CONE) rh = 0;
      const eave = Math.max(minH + 2, hM - rh), d = hl - hw;
      // roof planes: each region is convex (a list of half-planes in v/w) with a height function
      const hp = (av, aw, b) => [av * ex[0] + aw * ey[0], av * ex[1] + aw * ey[1], b - av * (c0[0] * ex[0] + c0[1] * ex[1]) - aw * (c0[0] * ey[0] + c0[1] * ey[1])];
      let regions;
      if (type === ROOF.GABLE) regions = [
        { cut: [hp(0, 1, 0)], z: p => eave + rh * (1 - toW(p) / hw) },
        { cut: [hp(0, -1, 0)], z: p => eave + rh * (1 + toW(p) / hw) }];
      else if (type === ROOF.HIP || type === ROOF.PYRAMID) regions = [
        { cut: [hp(0, 1, 0), hp(-1, 1, d), hp(1, 1, d)], z: p => eave + rh * (1 - toW(p) / hw) },
        { cut: [hp(0, -1, 0), hp(-1, -1, d), hp(1, -1, d)], z: p => eave + rh * (1 + toW(p) / hw) },
        { cut: [hp(1, 0, 0), hp(1, -1, -d), hp(1, 1, -d)], z: p => eave + rh * (hl - toV(p)) / hw },
        { cut: [hp(-1, 0, 0), hp(-1, -1, -d), hp(-1, 1, -d)], z: p => eave + rh * (hl + toV(p)) / hw }];
      else if (type === ROOF.SKILLION) regions = [{ cut: [], z: p => eave + rh * (toW(p) + hw) / (2 * hw) }];
      else regions = [{ cut: [], z: () => pitched ? eave : (rh ? eave : hM) }];
      const roofZ = p => { let z = Infinity; for (const r of regions) { if (r.cut.every(([a, b, c]) => a * p[0] + b * p[1] + c >= -1e-6)) z = Math.min(z, r.z(p)); } return z === Infinity ? eave : z; };
      // walls: break each edge where it crosses a roof region boundary so gable ends get their peak
      const lines = regions.flatMap(r => r.cut);
      const wallRing = [];
      for (let j = 0; j < n; j++) {
        const a = ring[j], b = ring[(j + 1) % n], ts = [];
        for (const [la, lb, lc] of lines) {
          const fa = la * a[0] + lb * a[1] + lc, fb = la * b[0] + lb * b[1] + lc;
          if ((fa > 0) !== (fb > 0) && Math.abs(fa - fb) > 1e-9) ts.push(fa / (fa - fb));
        }
        wallRing.push(a);
        for (const t of ts.sort((p, q) => p - q)) if (t > .01 && t < .99) wallRing.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      const tv = church ? 1.5 : ((Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453) % 1 + 1) % 1;
      const bot = part && minH > 0 ? minH : -20;
      const put = (p, z, h) => {
        llv(latOf(p[1]), lonOf(p[0]), base + z * BHS / 1000, tmp).sub(origin);
        pos.push(tmp.x, tmp.y, tmp.z); tint.push(tv); hv.push(h); rc.push(roofC); wc.push(wallC);
        return pos.length / 3 - 1;
      };
      const m = wallRing.length, b0 = pos.length / 3;
      for (const p of wallRing) put(p, bot, 0);
      for (const p of wallRing) put(p, roofZ(p), 1);
      for (let j = 0; j < m; j++) { const j2 = (j + 1) % m; idx.push(b0 + j, b0 + j2, b0 + m + j2, b0 + j, b0 + m + j2, b0 + m + j); }
      // roof faces
      for (const r of regions) {
        let poly = ring.slice();
        for (const [a, b, c] of r.cut) { poly = clipHalf(poly, a, b, c); if (poly.length < 3) break; }
        if (poly.length < 3) continue;
        const pts = poly.map(p => new THREE.Vector2(p[0], p[1]));
        const tris = THREE.ShapeUtils.triangulateShape(pts, []);
        const s0 = pos.length / 3;
        for (const p of poly) put(p, r.z(p), 1);
        for (const t of tris) idx.push(s0 + t[0], s0 + t[1], s0 + t[2]);
      }
      // domes, onions and spires sit on the eave as a turned profile
      const prof = PROFILES[type];
      if (prof && rh > 0) {
        const R0 = Math.sqrt(area / Math.PI), seg = 14, s0 = pos.length / 3;
        for (const [rr, zz] of prof) for (let k = 0; k < seg; k++) {
          const a = k / seg * Math.PI * 2; put([cx + Math.cos(a) * R0 * rr, cy + Math.sin(a) * R0 * rr], eave + zz * rh, 1);
        }
        for (let q = 0; q < prof.length - 1; q++) for (let k = 0; k < seg; k++) {
          const a = s0 + q * seg + k, b = s0 + q * seg + (k + 1) % seg;
          idx.push(a, b, b + seg, a, b + seg, a + seg);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hv, 1));
    g.setAttribute('aRC', new THREE.Float32BufferAttribute(rc, 1));
    g.setAttribute('aWC', new THREE.Float32BufferAttribute(wc, 1));
    g.setIndex(idx);
    const mat = bldgMat.clone();
    for (const key of Object.keys(uni)) mat.uniforms[key] = uni[key];
    mat.uniforms.uOrigin.value.copy(origin);
    const mesh = new THREE.Mesh(g, mat); mesh.position.copy(origin); mesh.frustumCulled = false;
    return mesh;
  }

  return { buildBuildings };
}
