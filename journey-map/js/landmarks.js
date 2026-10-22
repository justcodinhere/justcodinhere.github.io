// Landmarks: the trip's churches, castles and towers modelled by hand at true scale on their real Overture footprints
// (assets/landmarks/footprints.json, from tools/lm_footprints.py), replacing the pack buildings there: every landmark
// carries mask polygons, and js/buildings.js skips the footprints and parts whose centroid falls inside one.
// One ShaderMaterial draws them all, lit exactly like the buildings (same winter light, regional sun, haze, tone mapping,
// snow on up-facing roofs, sun shadows from and into the buildings' shadow map), with box-filtered procedural surfaces:
// brick coursing, ashlar, plaster with painted trim, pale limestone, copper patina, slate, plain tiles, gilt tiles, rock,
// and stone tracery windows (lancet, round-arched, rose), clock faces, all from per-vertex facade coordinates.
// The models live in js/lm/<region>.js (builders that receive the kit below; see notes in the kit section), loaded and
// built when the camera first comes near, and dropped again far away.
// create(ctx) returns { update(dt, alt), onCity(on), stats() } and sets ctx.landmarkMask(lat, lon), ctx.landmarksReady.
export default function create(ctx) {
  const { THREE, V3, uni, HAZE, LIGHT, NOISE, D2R, BHS, llv, meshKm, phone, camera } = ctx;
  const lite = phone(), KM = 111195;
  const FAR = lite ? 32 : 45, FAR_D = lite ? 2.4 : 4, BUILD = lite ? 9 : 14, DROP = 45;   // km: fade-out (main, small detail), build and drop distances
  // landmark -> region module (js/lm/<region>.js exports { name(K) {...} })
  const REGION = {
    frauenkircheMuc: 'muc', rathaus: 'muc', alterPeter: 'muc', stMichael: 'muc',
    domIbk: 'ibk', hofkirche: 'ibk', goldenesDachl: 'ibk', bergisel: 'ibk',
    kaiserburg: 'nue', stLorenz: 'nue', frauenkircheNue: 'nue',
    neuschwanstein: 'alps', hohenschwangau: 'alps', kufstein: 'alps', wieskirche: 'alps',
  };

  /* ---------- footprints and masks ---------- */
  const LMS = [];
  const inRing = (x, y, r) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  ctx.landmarksReady = fetch('assets/landmarks/footprints.json').then(r => r.json()).then(J => {
    for (const [name, fp] of Object.entries(J)) {
      if (!REGION[name]) continue;
      const kx = KM * Math.cos(fp.lat * D2R);
      let w = 1e9, e = -1e9, s = 1e9, n = -1e9;
      for (const r of fp.mask) for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
      LMS.push({ name, region: REGION[name], fp, lat: fp.lat, lon: fp.lon, kx, bb: [fp.lon + w / kx, fp.lon + e / kx, fp.lat + s / KM, fp.lat + n / KM], st: 0 });
    }
  }).catch(e => console.warn('landmark footprints', e));
  // true when a pack footprint centred at lat, lon is drawn by a landmark model instead
  ctx.landmarkMask = (lat, lon) => {
    for (const L of LMS) {
      if (lon < L.bb[0] || lon > L.bb[1] || lat < L.bb[2] || lat > L.bb[3]) continue;
      const x = (lon - L.lon) * L.kx, y = (lat - L.lat) * KM;
      for (const r of L.fp.mask) if (inRing(x, y, r)) return true;
    }
    return false;
  };

  /* ---------- the material ---------- */
  // Per vertex: position in local metres (x east, y north, z up x BHS); normal; aP facade coordinates in metres (walls:
  // along the face, height; roofs and caps: along the eave, down the slope from the top); aM = material id + 32 * (window
  // type + 16 * lights), face length, seed, E (walls: height of the wall top / eaves; roofs: slope length; clock: radius);
  // aW window layout (bay pitch, width, sill, apex); aC base colour (sRGB) + baked occlusion; aD trim colour (sRGB) +
  // flags (walls) or snow amount (roofs); aG = ground height under the vertex (true m), window margin at the face ends.
  const vertexShader = `attribute vec2 aP, aG; attribute vec4 aM, aW, aC, aD; uniform mat4 uShadowM;
    varying vec3 vW, vN, vL, vS; varying vec2 vP, vG; varying vec4 vM, vWn, vC, vD;
    void main(){
      vW=mat3(modelMatrix)*position; vN=mat3(modelMatrix)*normal; vL=position*vec3(1., 1., ${(1 / BHS).toFixed(6)});
      vP=aP; vG=aG; vM=aM; vWn=aW; vC=vec4(pow(aC.rgb, vec3(2.2)), aC.a); vD=vec4(pow(aD.rgb, vec3(2.2)), floor(aD.a*255.+.5));
      vS=(uShadowM*vec4(position, 1.)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position, 1.); }`;
  const fragBody = `uniform vec3 uRegionSun, uCamL, uUp; uniform float uWinter, uAlt, uFade, uFar;
    varying vec3 vW, vN, vL; varying vec2 vP, vG; varying vec4 vM, vWn, vC, vD;
    float bt(float x, float s){ return mod(floor(x/exp2(s)), 2.); }
    float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
    // box-filtered pulse train (as in buildings.js): pulses [lo+a+kP, lo+a+kP+w] inside [lo,hi], averaged over the pixel f
    float Fp(float x, float a, float w, float P){ float c=floor(x/P); return c*w+clamp(x-c*P-a, 0., w); }
    float pulse(float x, float f, float a, float w, float P, float lo, float hi){
      float x0=clamp(x-.5*f, lo, hi)-lo, x1=clamp(x+.5*f, lo, hi)-lo; return (Fp(x1, a, w, P)-Fp(x0, a, w, P))/f; }
    float box(float x, float f, float a, float b){ return clamp((min(x+.5*f, b)-max(x-.5*f, a))/f, 0., 1.); }
    float cov(float d, float f){ return 1.-smoothstep(-.5*f, .5*f, d); }       // coverage of a shape's inside (d<0)
    // an arch of span w springing at y=0: pointed (t 1, equilateral) or round (t 2); <0 inside
    float sdArch(float x, float y, float w, float t){ x=abs(x); if(y<0.) return x-w*.5; return t<1.5 ? length(vec2(x+w*.5, y))-w : length(vec2(x, y))-w*.5; }
    void main(){
      vec3 n=normalize(vN), toCam=uCamL-vW; float d=length(toCam); vec3 V=toCam/d;
      if(dot(n, V)<0.) n=-n;
      vec3 up=uUp, L=normalize(uRegionSun);
      float ny=dot(n, up), nyT=ny*${BHS.toFixed(2)}/sqrt(max(1.-ny*ny, 0.)+ny*ny*${(BHS * BHS).toFixed(4)});   // the true slope (heights are drawn x BHS)
      float u=vP.x, h=vP.y, fu=max(fwidth(u), .002), fh=max(fwidth(h), .002), far=max(fu, fh);
      float id=floor(vM.x+.5), mat=mod(id, 32.), wt=mod(floor(id/32.), 16.), nl=floor(id/512.);
      float Lf=vM.y, seed=vM.z, E=vM.w, flags=vD.a, hg=vL.z-vG.x;
      vec3 base=vC.rgb, trim=vD.rgb, col=base, add=vec3(0.);
      float ao=vC.a*mix(.66, 1., smoothstep(-.3, 7., hg)), spec=0., snowK=0., roof=0.;
      float det=1.-smoothstep(.12, .4, far);          // fine texture (courses, joints) fades out as a pixel grows past ~.3 m
      bool wall=mat<3.5||mat>9.5&&mat<11.5;
      if(mat<.5){
        // brick: stretcher bond (9.5 cm courses), mottled at the metre scale, brick by brick close up, patches of older brick
        float cr=.095, row=floor(h/cr), sh=.145*mod(row, 2.);
        float bj=pulse(h, fh, 0., .013, cr, -1e3, 1e3), hj=pulse(u+sh, fu, 0., .013, .29, -1e3, 1e3)*(1.-bj);
        float bv=hh(vec2(floor((u+sh)/.29), row+seed*17.));
        vec3 bc=base*(.86+.28*vnoise(vec3(u*.35, h*.6, seed*9.)))*mix(1., .8+.4*bv, det*.7);
        bc*=1.-.13*smoothstep(.5, .85, vnoise(vec3(u*.07, h*.035, seed)));
        col=mix(bc, base*vec3(1.25, 1.35, 1.45)+.04, (bj+hj)*.75);
      } else if(mat<1.5||mat>2.5&&mat<3.5){
        // ashlar (red sandstone) or pale limestone: coursed blocks, each its own shade close up, weathered grey in places
        float lime=step(2.5, mat), cr=mix(.5, .42, lime), bl=mix(1.15, 1.05, lime), row=floor(h/cr), off=fract(row*.618)*bl;
        float jr=pulse(h, fh, 0., .025, cr, -1e3, 1e3), jv=pulse(u+off, fu, 0., .025, bl, -1e3, 1e3)*(1.-jr);
        float sv=hh(vec2(floor((u+off)/bl), row+seed*13.));
        vec3 sc=base*mix(1., mix(.8+.4*sv, .93+.14*sv, lime), det*.8)*(.9+.2*vnoise(vec3(u*.25, h*.25, seed)));
        sc=mix(sc, sc*vec3(.8, .84, .88), (1.-lime)*smoothstep(.5, .8, vnoise(vec3(u*.15, h*.1, seed+3.))));
        col=mix(sc, mix(base*vec3(.9, .86, .82), base*1.1, lime), (jr+jv)*.7);
      } else if(mat<2.5){
        col=base*(.95+.08*vnoise(vec3(u*.4, h*.4, seed)));                         // smooth lime plaster
      } else if(mat<4.5){
        // copper patina: standing seams, staggered cross seams, verdigris streaks running down, darker run-off
        roof=1.;
        float seam=pulse(u, fu, 0., .05, .6, -1e3, 1e3), cs=pulse(h+.8*hh(vec2(floor(u/.6), seed)), fh, 0., .04, 1.6, -1e3, 1e3);
        vec3 pc=base*(.84+.32*vnoise(vec3(u*2.1, h*.12, seed)));
        pc=mix(pc, pc*vec3(1.1, 1.07, .92), smoothstep(.6, .9, vnoise(vec3(u*.3, h*.2, seed+5.))));
        pc=mix(pc, base*vec3(.56, .62, .6), smoothstep(.62, .85, vnoise(vec3(u*.9, h*.05, seed+2.)))*.6);
        col=pc*(1.-(.2*seam+.12*cs)*mix(.5, 1., det)); spec=.3;
      } else if(mat<5.5){
        roof=1.; float cr=.22, row=floor(h/cr), sh=.17*mod(row, 2.);              // slate courses
        float rl=pulse(h, fh, 0., .035, cr, -1e3, 1e3), jt=pulse(u+sh, fu, 0., .03, .34, -1e3, 1e3)*(1.-rl);
        float tv=hh(vec2(floor((u+sh)/.34), row+seed));
        col=base*mix(1., .85+.3*tv, det)*(1.-.35*rl-.2*jt)*(.92+.16*vnoise(vec3(u*.2, h*.3, seed))); spec=.1;
      } else if(mat<6.5){
        roof=1.; float cr=.17, row=floor(h/cr), sh=.09*mod(row, 2.);              // plain tiles, older darker patches
        float rl=pulse(h, fh, 0., .045, cr, -1e3, 1e3), jt=pulse(u+sh, fu, 0., .025, .18, -1e3, 1e3)*(1.-rl);
        float tv=hh(vec2(floor((u+sh)/.18), row+seed));
        col=base*mix(.9, (1.-.3*rl-.14*jt)*(.88+.24*tv), det)*(.86+.28*vnoise(vec3(u*.12, h*.15, seed)));
      } else if(mat<7.5){
        roof=1.; float cr=.2, row=floor(h/cr), cu=fract((u+.1*mod(row, 2.))/.2)-.5, cv=fract(h/cr);   // gilt fish-scale tiles
        float sc=smoothstep(.2, .5, length(vec2(cu, cv-.1)*vec2(1., 1.2)))*det;
        col=base*(1.-.35*sc)*(.85+.3*vnoise(vec3(u*.8, h*.8, seed))); spec=1.2;
      } else if(mat<8.5){
        float fres=pow(1.-max(dot(n, V), 0.), 3.);
        col=mix(vec3(.018, .02, .028), vec3(.32, .38, .48), .06+.6*fres)*(1.-.5*clamp(pulse(h, fh, 0., .03, .5, -1e3, 1e3)+pulse(u, fu, 0., .03, .45, -1e3, 1e3), 0., 1.)*det); spec=.5;
      } else if(mat<9.5){
        // rock: strata, blotches, lichen greyed by winter, snow on the ledges
        vec3 p=vL; float s=vnoise(vec3(p.x*.06, p.z*.45, p.y*.06)), b=vnoise(p*.21), c=vnoise(p*.9);
        col=base*(.62+.5*s)*(.85+.3*b)*mix(1., .8+.4*c, det);
        col=mix(col, base*vec3(.5, .55, .42), smoothstep(.55, .8, vnoise(p*.12+7.))*.35);
        snowK=smoothstep(.35, .7, nyT+.35*(b-.5))*.95;
      } else if(mat<10.5){
        col=base*(.92+.12*vnoise(vec3(u*.3, h*.2, seed)))*(1.-.12*clamp(pulse(h, fh, 0., .03, .75, -1e3, 1e3)+pulse(u, fu, 0., .03, 2.5, -1e3, 1e3), 0., 1.)*det);
      } else if(mat<11.5){
        col=base*(.92+.12*vnoise(vec3(u*.3, h*.3, seed)))*(1.-.15*pulse(h, fh, 0., .02, .6, -1e3, 1e3)*det);   // dressed stone
      } else if(mat<12.5){
        // clock face (aP: metres from the centre, E: radius): gilt ring, hour marks and hands at ten to three
        float R=E, r=length(vP), a=atan(vP.x, vP.y);
        vec3 gold=vec3(.62, .45, .16);
        float ring=box(r, far, R*.84, R*.95), tick=step(R*.64, r)*step(r, R*.8)*smoothstep(.7, .95, cos(a*12.));
        vec2 hd=vec2(sin(1.48), cos(1.48)), md=vec2(sin(5.24), cos(5.24));
        float hand=box(dot(vP, vec2(hd.y, -hd.x)), far, -R*.05, R*.05)*box(dot(vP, hd), far, -R*.1, R*.5)
                  +box(dot(vP, vec2(md.y, -md.x)), far, -R*.035, R*.035)*box(dot(vP, md), far, -R*.1, R*.76);
        col=mix(base, gold, clamp(ring+tick*.8+hand, 0., 1.)*mix(.6, 1., det));
        col*=1.-.4*box(r, far, R*.95, R*1.05); spec=.4*clamp(ring+hand, 0., 1.);
      } else if(mat<13.5){
        col=base*(1.-.3*pulse(u, fu, 0., .03, .22, -1e3, 1e3)*det)*(.9+.2*vnoise(vec3(u*.5, h*2., seed)));   // boards
      } else if(mat<14.5){ spec=.3;                                                            // dark iron
      } else if(mat<15.5){ col=base*(.9+.2*vnoise(vL*3.)); spec=1.4;                            // gilding
      }
      // ---------------- windows (walls), laid out in bays from the facade coordinates ----------------
      float winO=0.;
      if(wall&&wt>.5){
        float mg=vG.y, P=vWn.x, w=vWn.y, y0=vWn.z, y1=vWn.w, uu=u-mg, Lw=Lf-2.*mg;
        float k=floor(uu/P), cu=uu-(k+.5)*P;
        float inb=box(uu, fu, 0., Lw);
        float pointed=wt<1.5||wt>4.5&&wt<5.5||wt>6.5&&wt<7.5||wt>8.5&&wt<9.5 ? 1. : 0., rnd=wt>1.5&&wt<2.5||wt>5.5&&wt<6.5||wt>9.5 ? 1. : 0.;
        float sp=y1-w*(pointed>.5 ? .866 : rnd>.5 ? .5 : 0.), at=pointed>.5 ? 1. : 2.;
        float dO;
        if(wt>3.5&&wt<4.5) dO=length(vec2(cu, h-(y0+y1)*.5))-w*.5;
        else if(pointed+rnd<.5) dO=max(abs(cu)-w*.5, abs(h-(y0+y1)*.5)-(y1-y0)*.5);
        else dO=max(sdArch(cu, h-sp, w, at), y0-h);
        float aO=(wt>3.5&&wt<4.5 ? .785*w*w : w*(sp-y0)+(pointed>.5 ? .614 : rnd>.5 ? .393 : 0.)*w*w)/(P*max(y1-y0, .1));
        float farW=smoothstep(.35, 1., far*2./max(w, .1));         // narrower than ~2 px: draw the window's average
        float fw=min(.24, w*.12);
        float o=mix(cov(dO, far), aO*box(h, fh, y0, y1), farW)*inb;
        float fr=mix(cov(dO-fw, far)-cov(dO, far), .1*box(h, fh, y0-fw, y1+fw), farW)*inb;
        // tracery: mullions between the lights, each light with its own head, an oculus above; a transom band in tall ones
        float tr=0.;
        if(nl>1.5&&(pointed+rnd>.5)){
          float wl=w/nl, mw=min(.2, wl*.17);
          float mull=pulse(cu+w*.5, fu, wl-mw*.5, mw, wl, 0., w-wl*.5);
          float j=clamp(floor((cu+w*.5)/wl), 0., nl-1.), cj=cu+w*.5-(j+.5)*wl;
          float topS=sp+(wl-mw)*(pointed>.5 ? .866 : .5), yc=(topS+y1)*.5, rc=min((y1-topS)*.36, w*.3);
          float glz=max(cov(sdArch(cj, h-sp, wl-mw, at), far), cov(length(vec2(cu, h-yc))-rc, far)*step(topS, h));
          tr=mix(clamp(mull*step(h, sp)+(1.-glz)*step(sp, h), 0., 1.), .16, farW);
        }
        if(wt>3.5&&wt<4.5){                                       // rose: spokes and two rings
          vec2 q=vec2(cu, h-(y0+y1)*.5); float r=length(q), R=w*.5, a=atan(q.x, q.y);
          float sd=abs(fract(a/6.2832*12.+.5)-.5)*.5236*r;
          tr=mix(clamp((1.-smoothstep(.06, .06+far, sd))*step(R*.3, r)+box(r, far, R*.25, R*.34)+box(r, far, R*.7, R*.76), 0., 1.), .3, farW);
        }
        if(y1-y0>12.&&pointed+rnd>.5){ float yt=y0+(sp-y0)*.56; tr=max(tr, box(h, fh, yt, yt+.3)*(1.-farW)); }
        if(pointed+rnd<.5&&wt<3.5) tr=mix(clamp(box(cu, fu, -.05, .05)+box(h, fh, y0+(y1-y0)*.64, y0+(y1-y0)*.64+.1), 0., 1.), .15, farW);   // a cross bar
        float fres=pow(1.-max(dot(n, V), 0.), 3.);
        vec3 gl=mix(vec3(.018, .02, .028), vec3(.32, .38, .48), .06+.6*fres);
        float pv=hh(vec2(floor(cu/.45)+k*7.+seed*3., floor(h/.6)));
        gl*=mix(1., .75+.5*pv, det*.6); gl=mix(gl, gl*vec3(1.4, .85, .7), step(.86, pv)*det*.5);   // leaded panes, a hint of colour
        gl*=1.-.5*clamp(pulse(h, fh, 0., .03, .6, -1e3, 1e3)+pulse(cu, fu, .2, .03, .45, -1e3, 1e3), 0., 1.)*det;
        gl*=1.-.45*box(dO, far, -.3, 0.)*(1.-farW);               // the reveal's shadow round the glass
        if(wt>4.5&&wt<5.5) gl=vec3(.025, .024, .026)*(1.+1.6*pulse(h, fh, 0., .09, .28, -1e3, 1e3)*det);   // belfry louvres
        if(wt>5.5&&wt<6.5){ gl=vec3(.03, .027, .024); add+=vec3(.5, .3, .12)*.05*o; }                    // open arcade
        if(wt>7.5&&wt<8.5) gl=vec3(.02);                                                               // slit
        if(wt>8.5) gl=vec3(.075, .045, .028)*(1.-.35*pulse(cu, fu, 0., .03, .16, -1e3, 1e3)*det)*(1.-.5*box(cu, fu, -.03, .03));   // a pair of plank doors
        vec3 stoneC=trim*(.92+.1*vnoise(vec3(u*.5, h*.5, seed)));
        if(wt>6.5&&wt<7.5){ col=mix(col, col*.7, o); col=mix(col, col*.85, fr); }                     // blind niche
        else {
          col=mix(col, bt(flags, 6.)>.5 ? stoneC : col*.62, fr);        // the reveal: in shadow, or a stone frame (flag 64)
          col=mix(col, stoneC, o*tr);
          col=mix(col, gl, o*(1.-tr)); spec+=.45*o*(1.-tr);
        }
        if(bt(flags, 3.)>.5) col=mix(col, trim, clamp(cov(dO-.36, far)-cov(dO-fw, far), 0., 1.)*inb*(1.-farW)+.12*farW*inb*box(h, fh, y0, y1));   // painted surrounds
        winO=o;
      }
      // ---------------- wall trim, by flag: plinth, eaves frieze, pilasters, quoins, eaves shade ----------------
      if(wall){
        if(bt(flags, 0.)>.5){ col=mix(col, trim*.82, box(hg, fh, -60., 1.)); col*=1.-.25*box(hg, fh, 1., 1.12)*det; }
        if(bt(flags, 1.)>.5&&E>2.){
          // brick Gothic eaves: a row of little round arches over a sawtooth band, under a projecting course
          float zf=h-(E-1.25), cu2=(fract(u/.9)-.5)*.9;
          float arch=cov(sdArch(cu2, zf-.45, .6, 2.), far)*box(zf, fh, 0., .8)*(1.-winO);
          col*=1.-.42*arch*mix(.45, 1., det);
          col*=1.-.3*pulse(u, fu, 0., .14, .28, -1e3, 1e3)*box(h, fh, E-1.6, E-1.42)*det;
          col=mix(col, col*1.12, box(h, fh, E-.4, E+.05));
        }
        if(bt(flags, 2.)>.5){ float mg=vG.y, P=vWn.x, pw=.85; col=mix(col, trim, pulse(u-mg+pw*.5, fu, 0., pw, P, 0., Lf-2.*mg+pw)*.9*(1.-winO)); }
        if(bt(flags, 4.)>.5){ float qw=mod(floor(h/.55), 2.)>.5 ? .5 : .85; col=mix(col, trim, (box(u, fu, 0., qw)+box(u, fu, Lf-qw, Lf))*step(.6, hg)*step(h, E)); }
        if(bt(flags, 5.)>.5&&E>0.) ao*=1.-.32*smoothstep(E-2.2, E, h)*step(h, E+.3);
        if(bt(flags, 7.)>.5){
          // Franconian half-timbering above the ground floor: posts, a rail at each floor, braces in some of the fields
          float post=pulse(u, fu, 0., .2, 1.45, -1e3, 1e3), rail=pulse(h, fh, 0., .22, 2.9, -1e3, 1e3);
          float cu3=mod(u, 2.9), ch3=mod(h, 2.9), bl=abs(cu3-ch3)*.707, br=abs(2.9-cu3-ch3)*.707;
          float brace=(1.-smoothstep(.07, .07+far, min(bl, br)))*step(.5, hh(vec2(floor(u/2.9), floor(h/2.9)+seed*7.)));
          col=mix(col, trim, clamp(post+rail+brace*det, 0., 1.)*(1.-winO)*step(3.6, hg)*mix(.4, .9, det));
        }
        col*=1.-.07*vnoise(vec3(u*.7, h*.05, seed+9.))*(1.-winO);            // rain streaks
      }
      // ---------------- snow ----------------
      if(roof>.5){
        // a sheet from the top down to a ragged lower edge (more on gentle slopes, less facing the sun), a bare strip at the eaves
        float r=h, re=E, sk=flags/255.;
        float slope=smoothstep(.3, .62, nyT);
        vec3 Lh=L-up*dot(L, up), nh=n-up*ny; float sunF=max(dot(nh, normalize(Lh+1e-6)), 0.)/max(length(nh), 1e-3);
        float cover=uWinter*sk*slope*(1.-.25*sunF);
        float rag=((vnoise(vec3(u*.3, seed, 1.))-.5)*1.5+(vnoise(vec3(u*1.1, seed, 4.))-.5)*.5+(vnoise(vec3(u*4., seed, 2.))-.5)*.14)*clamp(re/8., .15, 1.);
        float rm=re*(cover*1.15-.1)+rag, fe=max(fh, .02);
        float sm=(1.-smoothstep(rm-.5*fe-.04, rm+.5*fe+.04, r))*smoothstep(.15, .35, vnoise(vec3(u*.35, r*.35, seed*3.))+cover*.9)*step(.04, cover);
        float de=re-r, strip=(.2+.4*fract(seed*5.3))*uWinter;
        sm*=smoothstep(strip-.5*fe, strip+.5*fe+.05, de);
        col=mix(col, vec3(.84, .87, .92), uWinter*.22*(1.-sm)*slope*sk*det);                  // snow lingering in the courses
        col=mix(col, vec3(.86, .89, .94)*(.95+.08*vnoise(vec3(u*.9, r*2.2, seed+7.))), sm); spec*=1.-sm;
      } else if(mat<7.5||mat>8.5&&mat<11.5||mat>12.5){
        snowK=max(snowK, smoothstep(.74, .93, nyT));                                             // ledges, sills, copings
        float sm=uWinter*clamp(snowK*smoothstep(.1, .4, vnoise(vec3(vL.xy*.7, vL.z*.3))+snowK*.6), 0., 1.);
        col=mix(col, vec3(.86, .89, .94), sm); spec*=1.-sm;
      }
      // ---------------- light, exactly as buildings.js ----------------
      vec3 amb=winterLight(n, up, -n), sun=winterLight(n, up, L)-amb;
      float vis=sunVis(dot(n, L));
      col=col*(amb*ao+sun*vis)+add;
      col+=vec3(.62, .59, .55)*spec*pow(max(dot(reflect(-V, n), L), 0.), 18.)*vis*.6;
      col=applyHaze(col, d, uAlt);
      float alpha=uFade*(1.-smoothstep(uFar*.62, uFar, d));
      if(alpha<.01) discard;
      gl_FragColor=vec4(col, alpha);
  #include <tonemapping_fragment>
      gl_FragColor=linearToOutputTexel(gl_FragColor);
    }`;
  let fragmentShader = null;
  function material(L, far) {
    const sh = ctx.shadow;            // from buildings.js: the sun shadow map, its GLSL and shared uniforms
    if (!fragmentShader) fragmentShader = HAZE + LIGHT + NOISE + (sh ? sh.glsl : 'float sunVis(float ndl){ return 1.; }\n') + fragBody;
    const m = new THREE.ShaderMaterial({
      uniforms: { ...uni, ...(sh ? sh.uniforms : {}), uFade: L.uFade, uFar: { value: far }, uCamL: L.uCamL, uUp: L.uUp, uShadowM: L.uShadowM },
      vertexShader, fragmentShader, transparent: true, side: THREE.DoubleSide,
    });
    m.forceSinglePass = true;
    return m;
  }

  /* ---------- the kit ---------- */
  // Builders get K: local metres, x east, y north, z up (true heights; the kit applies BHS), origin = the landmark's
  // footprints.json origin with z 0 at the drawn ground there. Rings are arrays of [x, y], counter-clockwise; a wall a->b
  // faces to its right (outwards for a CCW ring). Material specs are plain objects { m: K.M.BRICK, c: '#8f5340', t: trim
  // colour, f: K.F flags (walls), snow: 0..1 (roofs), ao: 0..1, seed }. Windows: o.win = { t: K.W.LANCET, w, y0, y1,
  // n (count) or P (pitch), m (margin at the face ends), lights } - drawn by the shader, centred in equal bays.
  // Geometry goes to the main mesh, or inside K.detail(() => ...) to a second mesh that fades out sooner (small parts).
  const M = { BRICK: 0, ASHLAR: 1, PLASTER: 2, LIME: 3, COPPER: 4, SLATE: 5, TILE: 6, GILT: 7, GLASS: 8, ROCK: 9, CONCRETE: 10, STONE: 11, CLOCK: 12, WOOD: 13, IRON: 14, GOLD: 15, PLAIN: 16 };
  const W = { NONE: 0, LANCET: 1, ROUND: 2, RECT: 3, ROSE: 4, BELFRY: 5, ARCADE: 6, BLIND: 7, SLIT: 8, DOOR: 9, DOOR_R: 10 };
  const F = { PLINTH: 1, FRIEZE: 2, PILASTER: 4, FRAME: 8, QUOIN: 16, EAVES: 32, STONEFRAME: 64, TIMBER: 128 };
  const ROOFISH = new Set([M.COPPER, M.SLATE, M.TILE, M.GILT]);
  const hex = c => typeof c === 'string' ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : c;
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
  function offsetPath(r, d, closed = true) {   // move each edge of a CCW ring (or open path) outward by d, mitred (capped at 3d)
    const n = r.length, en = [], m = closed ? n : n - 1;
    for (let j = 0; j < m; j++) { const a = r[j], b = r[(j + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; en.push([(b[1] - a[1]) / l, -(b[0] - a[0]) / l]); }
    return r.map((p, j) => {
      const n1 = closed ? en[(j + m - 1) % m] : en[Math.max(0, j - 1)], n2 = closed ? en[j % m] : en[Math.min(m - 1, j)];
      let nx = n1[0] + n2[0], ny = n1[1] + n2[1]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const c = Math.max(nx * n2[0] + ny * n2[1], .34);
      return [p[0] + nx * d / c, p[1] + ny * d / c];
    });
  }
  const ringArea = r => { let a = 0; for (let j = 0; j < r.length; j++) { const p = r[j], q = r[(j + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const ccw = r => ringArea(r) < 0 ? r.slice().reverse() : r;
  let seedN = 1;
  const rnd = () => (seedN = seedN * 16807 % 2147483647) / 2147483647;

  function makeKit(L) {
    const g0 = meshKm(L.lat, L.lon), cosL = Math.cos(L.lat * D2R), gcache = new Map();
    const ground = (x, y) => {                // drawn ground under local x, y, in true metres (so that x BHS lands on it)
      const xr = Math.round(x), yr = Math.round(y), key = xr * 16384 + yr;
      let v = gcache.get(key);
      if (v === undefined) { v = (meshKm(L.lat + yr / KM, L.lon + xr / (KM * cosL)) - g0) * 1000 / BHS; gcache.set(key, v); }
      return v;
    };
    const mk = () => ({ p: [], n: [], ap: [], am: [], aw: [], ac: [], ad: [], ag: [], ix: [] });
    const BUF = { main: mk(), detail: mk() };
    let B = BUF.main, T = { c: 1, s: 0, x: 0, y: 0, z: 0 };
    const S = { am: [0, 0, 0, 0], aw: [1, 0, 0, 0], ac: [200, 200, 200, 255], ad: [200, 200, 200, 0], mg: 0 };
    const tx = (x, y) => [T.x + x * T.c - y * T.s, T.y + x * T.s + y * T.c];
    function vtx(x, y, z, nx, ny, nz, u, v) {
      const X = T.x + x * T.c - y * T.s, Y = T.y + x * T.s + y * T.c;
      B.p.push(X, Y, T.z + z); B.n.push(nx * T.c - ny * T.s, nx * T.s + ny * T.c, nz); B.ap.push(u, v);
      B.am.push(S.am[0], S.am[1], S.am[2], S.am[3]); B.aw.push(S.aw[0], S.aw[1], S.aw[2], S.aw[3]);
      B.ac.push(S.ac[0], S.ac[1], S.ac[2], S.ac[3]); B.ad.push(S.ad[0], S.ad[1], S.ad[2], S.ad[3]); B.ag.push(ground(X, Y), S.mg);
      return B.p.length / 3 - 1;
    }
    // set the attributes the following vertices carry: material spec m, options o (win, E, f, ao), face length Lf
    function face(m, o = {}, Lf = 0) {
      const win = o.win;
      let wt = 0, nl = 0, mg = 0, P = 1;
      if (win && win.t) {
        wt = win.t; nl = win.lights || 1; mg = win.m || 0;
        if (win.P) { const n = Math.floor((Lf - 2 * mg) / win.P + .3); if (n < 1) wt = 0; else { P = win.P; mg = (Lf - n * P) / 2; } }
        else P = (Lf - 2 * mg) / Math.max(1, win.n || 1);
        S.aw = [P, win.w, win.y0, win.y1];
      } else S.aw = [1, 0, 0, 0];
      S.mg = mg;
      S.am = [m.m + 32 * (wt + 16 * nl), Lf, m.seed ?? rnd(), o.E ?? 0];
      const c = hex(m.c || '#c8c8c8'), t = hex(m.t || m.c || '#c8c8c8');
      S.ac = [c[0], c[1], c[2], Math.round(255 * (o.ao ?? m.ao ?? 1))];
      S.ad = [t[0], t[1], t[2], ROOFISH.has(m.m) ? Math.round(255 * (m.snow ?? 1)) : (o.f ?? m.f ?? 0)];
    }
    const nrm3 = (a, b, c) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };
    // a planar polygon of 3D points (CCW seen from its front) with facade coordinates uv[i]; concave is fine
    function poly3(P, U, m, o = {}, Lf = 0) {
      if (P.length < 3) return;
      let nx = 0, ny = 0, nz = 0;                       // Newell normal
      for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
      const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return; nx /= l; ny /= l; nz /= l;
      face(m, o, Lf);
      const s0 = B.p.length / 3;
      for (let i = 0; i < P.length; i++) vtx(P[i][0], P[i][1], P[i][2], nx, ny, nz, U[i][0], U[i][1]);
      if (P.length === 3) { B.ix.push(s0, s0 + 1, s0 + 2); return; }
      // triangulate in the polygon's plane
      const ax = Math.abs(nx) > .9 ? [0, 1, 0] : [1, 0, 0], e1 = nrm3([0, 0, 0], [nx, ny, nz], ax).map(v => -v), e2 = [ny * e1[2] - nz * e1[1], nz * e1[0] - nx * e1[2], nx * e1[1] - ny * e1[0]];
      const pts = P.map(p => new THREE.Vector2(p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]));
      const tris = THREE.ShapeUtils.triangulateShape(pts, []);
      const flip = THREE.ShapeUtils.isClockWise(pts);
      for (const t of tris) if (flip) B.ix.push(s0 + t[0], s0 + t[2], s0 + t[1]); else B.ix.push(s0 + t[0], s0 + t[1], s0 + t[2]);
    }
    const K = {
      M, W, F, lite, fp: L.fp, name: L.name, ground, rnd,
      seg: n => Math.max(6, Math.round(n * (lite ? .6 : 1))),       // segment counts scaled down on phones
      part: q => L.fp.parts.find(p => p.id === q || p.name === q),
      parts: L.fp.parts,
      // ---- frames ----
      at(x, y, z, deg, fn) {                            // run fn in a frame moved to x, y, z and turned by deg (CCW)
        const P = T, a = (deg || 0) * D2R, [X, Y] = tx(x, y), c = Math.cos(a), s = Math.sin(a);
        T = { c: P.c * c - P.s * s, s: P.s * c + P.c * s, x: X, y: Y, z: P.z + (z || 0) };
        try { fn(); } finally { T = P; }
      },
      local(r) { return r.map(([x, y]) => { const dx = x - T.x, dy = y - T.y; return [dx * T.c + dy * T.s, -dx * T.s + dy * T.c]; }); },   // root-frame ring -> current frame
      detail(fn) { const P = B; B = BUF.detail; try { fn(); } finally { B = P; } },
      groundMin(r) { return Math.min(...r.map(p => { const [X, Y] = tx(p[0], p[1]); return ground(X, Y); })) - T.z; },
      groundMax(r) { return Math.max(...r.map(p => { const [X, Y] = tx(p[0], p[1]); return ground(X, Y); })) - T.z; },
      groundAt(x, y) { const [X, Y] = tx(x, y); return ground(X, Y) - T.z; },
      // ---- rings ----
      rect(cx, cy, w, d, deg = 0) { const a = deg * D2R, c = Math.cos(a), s = Math.sin(a); return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]); },
      ngon(cx, cy, r, n, rot = 0) { const o = []; for (let k = 0; k < n; k++) { const a = rot + k / n * Math.PI * 2; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; },
      offset: offsetPath, ccw, area: ringArea, clip: clipHalf,
      // drop the little bumps (vertices closer than tol, and nearly straight ones) from a footprint ring
      simplify(r, tol = 1.5) {
        let q = r.slice();
        for (let pass = 0; pass < 4; pass++) {
          const o = [];
          for (let i = 0; i < q.length; i++) {
            const a = o.length ? o[o.length - 1] : q[q.length - 1], p = q[i], b = q[(i + 1) % q.length];
            const ab = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dev = Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / ab;
            if (Math.hypot(p[0] - a[0], p[1] - a[1]) < tol || dev < tol * .35) continue;
            o.push(p);
          }
          if (o.length < 3) break;
          q = o;
        }
        return q;
      },
      // ---- surfaces ----
      poly: poly3,
      quad(a, b, c, d, m, o = {}, uv) { poly3([a, b, c, d], uv || [[0, a[2]], [Math.hypot(b[0] - a[0], b[1] - a[1]), b[2]], [Math.hypot(c[0] - a[0], c[1] - a[1]), c[2]], [0, d[2]]], m, o, o.Lf || 0); },
      // a clock dial on the wall a->b, t m along it, centred at height zc, radius R (material K.M.CLOCK, c: dial colour)
      clock(a, b, t, zc, R, m, o = {}) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ex = (b[0] - a[0]) / len, ey = (b[1] - a[1]) / len, out = o.out ?? .12, n = K.seg(24), P = [], U = [];
        for (let k = 0; k < n; k++) { const q = k / n * Math.PI * 2, x = Math.cos(q) * R * 1.06, z = Math.sin(q) * R * 1.06; P.push([a[0] + ex * (t + x) + ey * out, a[1] + ey * (t + x) - ex * out, zc + z]); U.push([x, z]); }
        poly3(P, U, m, { E: R });
      },
      // a vertical wall a->b from z0 to z1 (numbers, or [atA, atB] for a sloping top); o: win, E (top for the frieze /
      // eaves shade; default z1), u0 (facade u at a), vz (facade height origin), f, ao
      wall(a, b, z0, z1, m, o = {}) {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); if (len < 1e-3) return;
        const nx = dy / len, ny = -dx / len, za = Array.isArray(z0) ? z0 : [z0, z0], zb = Array.isArray(z1) ? z1 : [z1, z1], u0 = o.u0 || 0, vz = o.vz || 0;
        face(m, { ...o, E: (o.E ?? Math.min(zb[0], zb[1])) - vz }, len);
        const i0 = vtx(a[0], a[1], za[0], nx, ny, 0, u0, za[0] - vz), i1 = vtx(b[0], b[1], za[1], nx, ny, 0, u0 + len, za[1] - vz);
        const i2 = vtx(b[0], b[1], zb[1], nx, ny, 0, u0 + len, zb[1] - vz), i3 = vtx(a[0], a[1], zb[0], nx, ny, 0, u0, zb[0] - vz);
        B.ix.push(i0, i1, i2, i0, i2, i3);
      },
      // a planar polygon in the wall plane a->b: pts = [[t (m along a->b), z], ...] (gables, stepped and scrolled outlines)
      wallPoly(a, b, pts, m, o = {}) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ex = (b[0] - a[0]) / len, ey = (b[1] - a[1]) / len, vz = o.vz || 0, d = o.out || 0;
        poly3(pts.map(([t, z]) => [a[0] + ex * t + ey * d, a[1] + ey * t - ex * d, z]), pts.map(([t, z]) => [t + (o.u0 || 0), z - vz]), m, { ...o, E: (o.E ?? 0) - vz }, o.Lf ?? len);
      },
      // the same outline as a slab of thickness th (front at o.out, default th/2 out of the wall line), with its edges
      slab(a, b, pts, th, m, o = {}) {
        const out = o.out ?? th / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]), ex = (b[0] - a[0]) / len, ey = (b[1] - a[1]) / len;
        const P = (t, z, dd) => [a[0] + ex * t + ey * dd, a[1] + ey * t - ex * dd, z];
        K.wallPoly(a, b, pts, m, { ...o, out });
        K.wallPoly(b, a, pts.map(([t, z]) => [len - t, z]).reverse(), m, { ...o, out: th - out });
        const cw = THREE.ShapeUtils.isClockWise(pts.map(p => new THREE.Vector2(p[0], p[1])));
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], q = pts[(i + 1) % pts.length], [s, t] = cw ? [q, p] : [p, q];
          K.quad(P(s[0], s[1], out), P(t[0], t[1], out), P(t[0], t[1], out - th), P(s[0], s[1], out - th), m, o,
            [[0, 0], [Math.hypot(t[0] - s[0], t[1] - s[1]), 0], [Math.hypot(t[0] - s[0], t[1] - s[1]), th], [0, th]]);
        }
      },
      // gable outlines [[t, z], ...] for K.slab / K.wallPoly, L wide from z0 (the eaves) up h
      outline: {
        // a stepped gable: n steps each side, each step's riser and tread equal
        stepped(L, z0, h, n = 4) {
          const o = [[0, z0 - .3], [L, z0 - .3]], dw = L / 2 / (n + .5), dh = h / (n + 1);
          for (let k = 0; k < n; k++) o.push([L - k * dw, z0 + (k + 1) * dh], [L - (k + 1) * dw, z0 + (k + 1) * dh]);
          o.push([L / 2 + dw / 2, z0 + h], [L / 2 - dw / 2, z0 + h]);
          for (let k = n - 1; k >= 0; k--) o.push([(k + 1) * dw, z0 + (k + 1) * dh], [k * dw, z0 + (k + 1) * dh]);
          return o;
        },
        // a Baroque scrolled gable: S-curved volutes rising to a narrow top storey under a triangular or round pediment
        scroll(L, z0, h, o = {}) {
          const top = L * (o.top ?? .36), zt = z0 + h * .78, seg = 8, side = [];
          for (let i = 0; i <= seg; i++) {                 // concave foot, convex shoulder (a smoothstep S)
            const t = i / seg, s = t * t * (3 - 2 * t);
            side.push([(L - top) / 2 * (1 - Math.pow(1 - t, 2.2)) + Math.sin(t * Math.PI) * L * .015, z0 + (zt - z0) * s]);
          }
          const out = [[0, z0 - .3], [L, z0 - .3]];
          for (let i = 0; i < side.length; i++) out.push([L - side[i][0], side[i][1]]);
          if (o.round) { for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI; out.push([L / 2 + Math.cos(a) * top / 2, zt + Math.sin(a) * (z0 + h - zt)]); } }
          else out.push([L / 2, z0 + h]);
          for (let i = side.length - 1; i >= 0; i--) out.push(side[i]);
          return out;
        },
      },
      // a needle spire on n sides (8: an octagonal spire), its faces slightly concave so the tip runs out fine
      spire(cx, cy, z, r, h, m, o = {}) { K.lathe(cx, cy, z, [[r, 0, 1], [r * .62, h * .3], [r * .34, h * .6], [r * .12, h * .88], [0, h]], m, { n: o.n ?? 8, rot: o.rot }); },
      gable(a, b, z0, ze, zr, m, o = {}) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); K.wallPoly(a, b, [[0, z0], [l, z0], [l, ze], [l * (o.at ?? .5), zr], [0, ze]], m, { E: ze, ...o }); },
      // a wall in storeys: zs = [z0, z1, ...], wins(i, len) gives each storey's window row (or null); E: the top of it all
      storeys(a, b, zs, m, wins, o = {}) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let i = 0; i < zs.length - 1; i++) K.wall(a, b, zs[i], zs[i + 1], m, { ...o, E: o.E ?? zs[zs.length - 1], win: typeof wins === 'function' ? wins(i, len) : wins });
      },
      walls(r, z0, z1, m, o = {}) {
        for (let j = 0; j < r.length; j++) {
          if (o.skip && o.skip(j)) continue;
          const a = r[j], b = r[(j + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          K.wall(a, b, z0, z1, m, { ...o, win: typeof o.win === 'function' ? o.win(j, len) : o.win });
        }
      },
      cap(r, z, m, o = {}) {           // a flat (horizontal) polygon, facing up (o.down: facing down); o.holes
        const pts = r.map(p => new THREE.Vector2(p[0], p[1])), holes = (o.holes || []).map(h => h.map(p => new THREE.Vector2(p[0], p[1])));
        const tris = THREE.ShapeUtils.triangulateShape(pts, holes), all = r.concat(...(o.holes || []));
        face(m, { ...o, E: o.E ?? 1000 }, 0);
        const s0 = B.p.length / 3, nz = o.down ? -1 : 1, cw = THREE.ShapeUtils.isClockWise(pts);
        for (const p of all) vtx(p[0], p[1], z, 0, 0, nz, p[0], 0);
        for (const t of tris) if ((cw !== !!o.down)) B.ix.push(s0 + t[0], s0 + t[2], s0 + t[1]); else B.ix.push(s0 + t[0], s0 + t[1], s0 + t[2]);
      },
      prism(r, z0, z1, m, o = {}) { K.walls(r, z0, z1, m, o); if (o.cap !== null) K.cap(r, z1, o.cap || m); },
      box(cx, cy, w, d, z0, z1, m, o = {}) { K.prism(K.rect(cx, cy, w, d, o.ang || 0), z0, z1, m, o); },
      // a moulding swept along a ring (or open path, o.open): prof = [[out, z], ...] from the bottom up (out: metres outward)
      mould(path, prof, m, o = {}) {
        const closed = !o.open, offs = prof.map(([dd]) => offsetPath(path, dd, closed)), n = path.length, m2 = closed ? n : n - 1;
        let u = 0;
        for (let j = 0; j < m2; j++) {
          const j2 = (j + 1) % n, len = Math.hypot(path[j2][0] - path[j][0], path[j2][1] - path[j][1]);
          for (let k = 0; k < prof.length - 1; k++) {
            const A = offs[k][j], Bq = offs[k][j2], C = offs[k + 1][j2], D = offs[k + 1][j], z0 = prof[k][1], z1 = prof[k + 1][1];
            K.quad([A[0], A[1], z0], [Bq[0], Bq[1], z0], [C[0], C[1], z1], [D[0], D[1], z1], m, o, [[u, z0], [u + len, z0], [u + len, z1], [u, z1]]);
          }
          u += len;
        }
      },
      band(r, z, h, out, m, o = {}) { K.mould(r, [[0, z], [out, z], [out, z + h], [out * .3, z + h + out * .5]], m, o); },          // string course with a sloped wash
      cornice(r, z, h, out, m, o = {}) { K.mould(r, [[0, z], [out * .3, z + h * .2], [out * .45, z + h * .5], [out, z + h * .78], [out, z + h], [0, z + h + .02]], m, o); },
      // merlons along a path (o.open for an open wall walk): each mw long with gw gaps, th thick, h high on z
      crenels(path, z, h, mw, gw, th, m, o = {}) {
        const n = path.length, m2 = o.open ? n - 1 : n;
        for (let j = 0; j < m2; j++) {
          const a = path[j], b = path[(j + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.floor((len + gw) / (mw + gw));
          if (k < 1) continue;
          const sp = (len - k * mw) / Math.max(1, k - 1), ex = (b[0] - a[0]) / len, ey = (b[1] - a[1]) / len, deg = Math.atan2(ey, ex) / D2R, off = o.off ?? 0;
          for (let i = 0; i < k; i++) { const t = k === 1 ? len / 2 : mw / 2 + i * (mw + sp); K.box(a[0] + ex * t + ey * off, a[1] + ey * t - ex * off, mw, th, z, z + h, m, { ang: deg }); }
        }
      },
      // ---- roofs ----
      // planes: [{ d: [dx, dy] unit downslope, g: rise per metre, zt, s0 }] meaning z = zt - g * (p . d - s0); every face is
      // the (eaves-offset) footprint clipped to where its plane is lowest, so gables, hips and polygonal ends follow the ring
      roofPlanes(r, planes, m, o = {}) {
        const R = o.over ? offsetPath(r, o.over) : r, lin = P => [-P.g * P.d[0], -P.g * P.d[1], P.zt + P.g * P.s0];
        for (let i = 0; i < planes.length; i++) {
          const P = planes[i], [a1, b1, c1] = lin(P); let poly = R.slice();
          for (let j = 0; j < planes.length && poly.length > 2; j++) { if (j === i) continue; const [a2, b2, c2] = lin(planes[j]); poly = clipHalf(poly, a2 - a1, b2 - b1, c2 - c1 + 1e-7); }
          if (poly.length < 3 || Math.abs(ringArea(poly)) < .01) continue;
          const zf = p => a1 * p[0] + b1 * p[1] + c1, k = P.g > 1e-6 ? Math.sqrt(1 + P.g * P.g) / P.g : 0;
          const P3 = poly.map(p => [p[0], p[1], zf(p)]), zTop = Math.max(...P3.map(q => q[2]));     // v runs down the slope from this face's top
          const U = poly.map((p, q) => [p[0] * -P.d[1] + p[1] * P.d[0], (zTop - P3[q][2]) * k]);
          poly3(P3, U, m, { E: k ? Math.max(...U.map(q => q[1])) : 1000 });
        }
      },
      roofZ(planes, x, y) { let z = Infinity; for (const P of planes) z = Math.min(z, P.zt - P.g * (x * P.d[0] + y * P.d[1] - P.s0)); return z; },
      // planes for a ring in the frame turned by deg: 'gable' | 'hip' | 'halfhip' (o.k: share of the rise hipped) |
      // 'pyramid' | 'skillion' | 'flat', eaves at z with the given rise (o.hw: half width; default from the ring)
      planes(r, type, z, rise, deg = 0, o = {}) {
        const a = deg * D2R, ex = [Math.cos(a), Math.sin(a)], ey = [-ex[1], ex[0]];
        const S = r.map(p => p[0] * ex[0] + p[1] * ex[1]), Tt = r.map(p => p[0] * ey[0] + p[1] * ey[1]);
        const s0 = Math.min(...S), s1 = Math.max(...S), t0 = Math.min(...Tt), t1 = Math.max(...Tt), tc = o.tc ?? (t0 + t1) / 2, hw = o.hw ?? (t1 - t0) / 2;
        const zr = z + rise, g = rise / hw, neg = v => [-v[0], -v[1]];
        if (type === 'flat') return [{ d: ex, g: 0, zt: z, s0: 0 }];
        if (type === 'skillion') return [{ d: neg(ey), g: rise / (2 * hw), zt: zr, s0: -(tc + hw) }];
        const P = [{ d: ey, g, zt: zr, s0: tc }, { d: neg(ey), g, zt: zr, s0: -tc }];
        const k = type === 'halfhip' ? (o.k ?? .4) : type === 'gable' ? 0 : 1;
        if (k > 0) {
          const sc = (s0 + s1) / 2, half = type === 'pyramid' ? 0 : Math.max(0, (s1 - s0) / 2 - k * hw);
          P.push({ d: ex, g, zt: zr, s0: sc + half }, { d: neg(ex), g, zt: zr, s0: -(sc - half) });
        }
        return P;
      },
      // the hipped roof of a convex ring with every edge at the same pitch (rise over the half width hw); o.gable lists edge
      // indices that end in a gable instead (a nave's west end); polygonal choirs come out as their real polygonal hips
      hipPlanes(r, z, g, o = {}) {
        const P = [];
        for (let j = 0; j < r.length; j++) {
          if (o.gable && o.gable.includes(j)) continue;
          const a = r[j], b = r[(j + 1) % r.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < .05) continue;
          const d = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
          P.push({ d, g, zt: z, s0: a[0] * d[0] + a[1] * d[1] });
        }
        return P;
      },
      // walls round a ring up to the roof surface (breaks where the roof line bends); o as K.wall (o.E defaults to the eaves z)
      roofWalls(r, planes, z0, m, o = {}) {
        const lin = P => [-P.g * P.d[0], -P.g * P.d[1], P.zt + P.g * P.s0], L2 = planes.map(lin);
        const zAt = p => { let z = Infinity; for (const [a, b, c] of L2) z = Math.min(z, a * p[0] + b * p[1] + c); return z; };
        let u = 0;
        for (let j = 0; j < r.length; j++) {
          const a = r[j], b = r[(j + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < .01) continue;
          const ts = [0, 1];
          for (let p = 0; p < L2.length; p++) for (let q = p + 1; q < L2.length; q++) {
            const fa = (L2[p][0] - L2[q][0]) * a[0] + (L2[p][1] - L2[q][1]) * a[1] + L2[p][2] - L2[q][2], fb = (L2[p][0] - L2[q][0]) * b[0] + (L2[p][1] - L2[q][1]) * b[1] + L2[p][2] - L2[q][2];
            if ((fa > 0) !== (fb > 0)) { const t = fa / (fa - fb); if (t > .002 && t < .998) ts.push(t); }
          }
          ts.sort((p, q) => p - q);
          const pts = ts.map(t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]), zs = pts.map(zAt);
          const keep = [0];
          for (let k = 1; k < pts.length - 1; k++) {
            const k0 = keep[keep.length - 1], t0 = ts[k0], t2 = ts[k + 1];
            if (Math.abs(zs[k] - (zs[k0] + (zs[k + 1] - zs[k0]) * (ts[k] - t0) / (t2 - t0))) > .02) keep.push(k);
          }
          keep.push(pts.length - 1);
          const win = typeof o.win === 'function' ? o.win(j, len) : o.win, E = o.E ?? Math.min(...zs);
          const out = [[0, z0], [len, z0]]; for (let k = keep.length - 1; k >= 0; k--) out.push([ts[keep[k]] * len, zs[keep[k]]]);
          if (o.skip && o.skip(j)) { u += len; continue; }
          K.wallPoly(a, b, out, m, { ...o, win, E, u0: o.continuous ? u : 0, Lf: len });
          u += len;
        }
      },
      // a roof (and optionally its walls, o.walls = wall material) over ring r: K.planes(...) then the faces
      roof(r, type, z, rise, m, o = {}) {
        const P = o.planes || K.planes(r, type, z, rise, o.ang ?? 0, o);
        K.roofPlanes(r, P, m, o);
        if (o.walls) K.roofWalls(r, P, o.z0 ?? (K.groundMin(r) - 2), o.walls, { E: z, ...o.wallOpts });
        return P;
      },
      // roofs round the edge of any ring (and its courtyards, o.holes): each edge slopes up and in by depth to z + rise, with a
      // flat top over the rest, as on big old-town blocks and palace wings; o.over: eaves overhang
      wingRoof(r, z, depth, rise, m, o = {}) {
        const rings = [ccw(r), ...(o.holes || []).map(h => ccw(h).slice().reverse())], ov = o.over ?? .4, k = Math.hypot(depth + ov, rise + ov * rise / depth);
        const tops = rings.map(q => offsetPath(q, -depth));
        rings.forEach((q, i) => {
          const out = offsetPath(q, ov), inn = tops[i], n = q.length, zl = z - ov * rise / depth;
          for (let j = 0; j < n; j++) {
            const j2 = (j + 1) % n, a = out[j], b = out[j2], c = inn[j2], d = inn[j], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
            poly3([[a[0], a[1], zl], [b[0], b[1], zl], [c[0], c[1], z + rise], [d[0], d[1], z + rise]], [[0, k], [l, k], [l, 0], [0, 0]], m, { E: k });
          }
        });
        K.cap(tops[0], z + rise, m, { holes: tops.slice(1) });
      },
      // pyramid faces from a path (o.open: not closed) up to an apex [x, y, z]: spire faces, polygonal apse roofs
      tent(path, apex, z, m, o = {}) {
        const n = path.length, m2 = o.open ? n - 1 : n, ov = o.over || 0;
        const R = ov ? offsetPath(path, ov, !o.open) : path;
        for (let j = 0; j < m2; j++) {
          const a = R[j], b = R[(j + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey); if (l < .01) continue;
          const dist = Math.abs((apex[0] - a[0]) * ey - (apex[1] - a[1]) * ex) / l, g = (apex[2] - z) / Math.max(dist - ov, .01), ze = z - ov * g;
          const k = Math.sqrt(1 + g * g) / g, re = (apex[2] - ze) * k, t = ((apex[0] - a[0]) * ex + (apex[1] - a[1]) * ey) / l;
          poly3([[a[0], a[1], ze], [b[0], b[1], ze], apex], [[0, re], [l, re], [t, 0]], m, { E: re });
        }
      },
      // ---- turned shapes ----
      // a surface of revolution: prof = [[r, z], ...] from the bottom up (z over z0; a third value 1 marks a sharp corner);
      // o.n sides (0: round, o.seg segments), o.rot; roofs get facade v down the profile from the top (for the snow),
      // o.wall: v = height instead and polygonal faces get u across each face (so windows can sit on octagons)
      lathe(cx, cy, z0, prof, m, o = {}) {
        const n = o.n || 0, seg = n || o.seg || K.seg(20), rot = o.rot ?? (n ? Math.PI / n : 0);
        const rmax = Math.max(...prof.map(p => p[0])), sl = [0];
        for (let k = prof.length - 2; k >= 0; k--) sl.unshift(sl[0] + Math.hypot(prof[k + 1][0] - prof[k][0], prof[k + 1][1] - prof[k][1]));
        const total = sl[0], segN = [];
        for (let k = 0; k < prof.length - 1; k++) { const dr = prof[k + 1][0] - prof[k][0], dz = prof[k + 1][1] - prof[k][1], l = Math.hypot(dr, dz) || 1; segN.push([dz / l, -dr / l]); }
        const nAt = (k, s) => {                         // normal (radial, z) at profile point k on segment s
          const sharp = prof[k][2] || k === 0 || k === prof.length - 1;
          if (sharp) return segN[s];
          const a = segN[k - 1], b = segN[k], x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1; return [x / l, y / l];
        };
        const fw = n ? 2 * Math.sin(Math.PI / n) : 0;
        for (let k = 0; k < prof.length - 1; k++) {
          const [r0, z1] = prof[k], [r1, z2] = prof[k + 1];
          if (r0 < 1e-4 && r1 < 1e-4) continue;
          for (let i = 0; i < seg; i++) {
            const a0 = rot + i / seg * Math.PI * 2, a1 = rot + (i + 1) / seg * Math.PI * 2;
            const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
            let N0, N1, N2, N3;
            if (n) {                                     // flat faces
              const am = (a0 + a1) / 2, cm = Math.cos(am), smm = Math.sin(am), dr = r1 - r0, dz = z2 - z1, cf = Math.cos(Math.PI / n), l = Math.hypot(dz, dr * cf) || 1;
              const nn = [cm * dz / l, smm * dz / l, -dr * cf / l]; N0 = N1 = N2 = N3 = nn;
            } else {
              const na = nAt(k, k), nb = nAt(k + 1, k);
              N0 = [na[0] * c0, na[0] * s0, na[1]]; N1 = [na[0] * c1, na[0] * s1, na[1]]; N2 = [nb[0] * c1, nb[0] * s1, nb[1]]; N3 = [nb[0] * c0, nb[0] * s0, nb[1]];
            }
            const vz = o.vz || 0;
            const U = n && o.wall ? [[0, z0 + z1 - vz], [r0 * fw, z0 + z1 - vz], [r1 * fw, z0 + z2 - vz], [0, z0 + z2 - vz]]
              : o.wall ? [[a0 * rmax, z0 + z1 - vz], [a1 * rmax, z0 + z1 - vz], [a1 * rmax, z0 + z2 - vz], [a0 * rmax, z0 + z2 - vz]]
              : [[a0 * rmax, sl[k]], [a1 * rmax, sl[k]], [a1 * rmax, sl[k + 1]], [a0 * rmax, sl[k + 1]]];
            face(m, { ...o, win: typeof o.win === 'function' ? o.win(i) : o.win, E: o.wall ? (o.E ?? z0 + prof[prof.length - 1][1]) - vz : total }, o.wall ? (n ? r0 * fw : 2 * Math.PI * rmax) : 0);
            const i0 = vtx(cx + r0 * c0, cy + r0 * s0, z0 + z1, ...N0, ...U[0]), i1 = vtx(cx + r0 * c1, cy + r0 * s1, z0 + z1, ...N1, ...U[1]);
            const i2 = vtx(cx + r1 * c1, cy + r1 * s1, z0 + z2, ...N2, ...U[2]), i3 = vtx(cx + r1 * c0, cy + r1 * s0, z0 + z2, ...N3, ...U[3]);
            if (r0 > 1e-4) B.ix.push(i0, i1, i2);
            if (r1 > 1e-4) B.ix.push(i0, i2, i3);
          }
        }
      },
      // profiles [[r, z], ...] for K.lathe, scaled to a base radius r and height h
      P: {
        cone: (r, h) => [[r, 0], [0, h]],
        dome: (r, h, k = 7) => { const o = []; for (let i = 0; i <= k; i++) { const t = i / k * Math.PI / 2; o.push([r * Math.cos(t), h * Math.sin(t)]); } return o; },
        onion: (r, h) => [[r * .82, 0, 1], [r * .98, .07 * h], [r * 1.12, .22 * h], [r * 1.1, .34 * h], [r * .9, .48 * h], [r * .55, .62 * h], [r * .26, .75 * h], [r * .12, .86 * h], [r * .07, h]],
        // a welsche Haube: a short bell flare off the cornice, a tall rounded dome drawn in to a neck for the lantern
        welsch: (r, h) => [[r, 0, 1], [r * 1.04, .03 * h], [r * 1.03, .09 * h], [r * .98, .2 * h], [r * .9, .34 * h], [r * .77, .5 * h], [r * .58, .67 * h], [r * .38, .82 * h], [r * .24, .93 * h], [r * .2, h]],
        ball: (r, k = 5) => { const o = []; for (let i = 0; i <= k; i++) { const t = -Math.PI / 2 + i / k * Math.PI; o.push([r * Math.cos(t), r + r * Math.sin(t)]); } return o; },
        drum: (r, h) => [[r, 0, 1], [r, h, 1]],
      },
      ball(cx, cy, z, r, m) { K.lathe(cx, cy, z, K.P.ball(r), m, { seg: K.seg(10) }); },
      cross(cx, cy, z, h, m, deg = 0) { const t = Math.max(.08, h * .07); K.box(cx, cy, t, t, z, z + h, m, { ang: deg }); K.box(cx, cy, h * .55, t, z + h * .6, z + h * .6 + t, m, { ang: deg }); },
      finial(cx, cy, z, s, m) { K.ball(cx, cy, z, s * .18, m); K.cross(cx, cy, z + s * .34, s * .66, m); },
      // a square pinnacle: shaft, then a pyramid spirelet with a little ball
      pinnacle(cx, cy, z, w, h, m, roofM, o = {}) {
        const r = w / Math.SQRT2;
        K.lathe(cx, cy, z, [[r, 0, 1], [r, h * .42, 1], [r * 1.12, h * .45, 1], [0, h]], m, { n: 4, rot: Math.PI / 4 + (o.ang || 0) * D2R, wall: 1 });
        if (roofM) K.lathe(cx, cy, z + h * .45, [[r * 1.12, 0], [0, h * .55]], roofM, { n: 4, rot: Math.PI / 4 + (o.ang || 0) * D2R });
      },
      // a buttress against the wall at x, y with its outward direction deg: w wide, d deep, z0..z1, o.steps set-offs with washes
      buttress(x, y, deg, w, d, z0, z1, m, o = {}) {
        K.at(x, y, 0, deg, () => {
          const steps = o.steps ?? 2, hs = (z1 - z0) / (steps + 1); let dd = d, z = z0;
          for (let s = 0; s <= steps; s++) {
            const zt = s === steps ? z1 : z + hs, d2 = s === steps ? 0 : dd * .62, wash = Math.min(1.2, (dd - d2) * 1.1);
            K.walls([[0, -w / 2], [dd, -w / 2], [dd, w / 2], [0, w / 2]], z, zt, m, { skip: j => j === 3, E: zt });
            // the sloped wash on top of this stage
            K.quad([dd, -w / 2, zt], [dd, w / 2, zt], [d2, w / 2, zt + wash], [d2, -w / 2, zt + wash], m, {}, [[0, 0], [w, 0], [w, 1], [0, 1]]);
            K.wallPoly([d2, -w / 2], [dd, -w / 2], [[0, zt], [dd - d2, zt], [0, zt + wash]], m, {});
            K.wallPoly([dd, w / 2], [d2, w / 2], [[0, zt], [dd - d2, zt + wash], [dd - d2, zt]].map(([t, zz]) => [t, zz]), m, {});
            z = zt + wash; dd = d2; if (dd < .05) break;
          }
        });
      },
      // a dormer standing on a roof plane of slope g (rise per metre): front centre at x, y on the roof at height zb, facing
      // deg (the downhill direction); w wide, front h high; its own little gable roof runs back into the main roof
      dormer(x, y, zb, w, h, deg, g, wallM, roofM, o = {}) {
        K.at(x, y, 0, deg, () => {
          const zr = zb + h + w * .5, dp = h / g, hw = w / 2, ov = .2, vz = o.vz || 0;
          K.wall([0, -hw], [0, hw], zb - .4, zb + h, wallM, { win: o.win === null ? null : { t: o.win || W.RECT, w: w * .5, y0: zb + h * .22 - vz, y1: zb + h * .85 - vz, n: 1 }, vz });
          K.wallPoly([0, -hw], [0, hw], [[0, zb + h], [w, zb + h], [hw, zr]], wallM, {});
          K.wallPoly([-dp, -hw], [0, -hw], [[0, zb + h], [dp, zb - .4], [dp, zb + h]], wallM, {});
          K.wallPoly([0, hw], [-dp, hw], [[0, zb - .4], [dp, zb + h], [0, zb + h]], wallM, {});
          for (const s of [-1, 1]) {
            const ye = s * (hw + ov), ze = zb + h - .12, xe = -(ze - zb) / g, xr = -(zr + .05 - zb) / g;
            K.quad([ov, ye, ze], [xe, ye, ze], [xr, 0, zr + .05], [ov, 0, zr + .05], roofM, { E: hw + ov }, [[0, hw + ov], [ov - xe, hw + ov], [ov - xr, 0], [0, 0]]);
          }
        });
      },
      // an oriel (a bay window box) on the wall a->b: s0 m along it, w wide, dp deep, z0..z1, with a hipped or tent roof
      oriel(a, b, s0, w, dp, z0, z1, m, roofM, o = {}) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ex = (b[0] - a[0]) / len, ey = (b[1] - a[1]) / len;
        const P = (t, dd) => [a[0] + ex * t + ey * dd, a[1] + ey * t - ex * dd];
        const r = [P(s0, 0), P(s0, dp), P(s0 + w, dp), P(s0 + w, 0)];
        K.walls(r, z0, z1, m, { skip: j => j === 3, win: (j, l) => j === 1 ? o.win : null });
        K.cap(r, z0, m, { down: 1 });
        K.tent(r.slice(0, 3).concat([r[3]]), [...P(s0 + w / 2, 0), z1 + (o.rise ?? w * .5)], z1, roofM, { open: true, over: .15 });
      },
      // an open lantern: n posts round radius r from z to z + h, a ring beam, a cap (prof) and o.finial
      lantern(cx, cy, z, r, h, m, capM, o = {}) {
        const n = o.n || 8, pw = Math.max(.18, r * .22);
        K.lathe(cx, cy, z - .3, [[r * 1.1, 0, 1], [r * 1.1, .3, 1], [0, .3]], m, { n });
        for (let k = 0; k < n; k++) { const a = (k + .5) / n * Math.PI * 2; K.box(cx + Math.cos(a) * r * .9, cy + Math.sin(a) * r * .9, pw, pw, z, z + h, m, { ang: a / D2R }); }
        K.lathe(cx, cy, z + h, [[r * 1.12, 0, 1], [r * 1.12, .35, 1], [0, .35]], m, { n });
        const cp = o.cap || K.P.dome(r * 1.05, r * 1.3);
        K.lathe(cx, cy, z + h + .35, cp, capM, { n: o.capN || 0, seg: K.seg(12) });
        if (o.finial !== null) K.finial(cx, cy, z + h + .35 + cp[cp.length - 1][1], o.finial || r * 2.2, o.finM || capM);
      },
      // a deck bridge from a to b ([x, y, z]), w wide, with a truss (o.truss: height) or an arch under it (o.arch: rise)
      bridge(a, b, w, m, o = {}) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), deg = Math.atan2(b[1] - a[1], b[0] - a[0]) / D2R, th = o.deck ?? .6;
        K.at(a[0], a[1], 0, deg, () => {
          const zA = a[2], zB = b[2], zAt = t => zA + (zB - zA) * t / len;
          K.quad([0, -w / 2, zA], [len, -w / 2, zB], [len, w / 2, zB], [0, w / 2, zA], m, {}, [[0, 0], [len, 0], [len, w], [0, w]]);
          K.wall([0, -w / 2], [len, -w / 2], [zA - th, zB - th], [zA, zB], m); K.wall([len, w / 2], [0, w / 2], [zB - th, zA - th], [zB, zA], m);
          K.quad([0, w / 2, zA - th], [len, w / 2, zB - th], [len, -w / 2, zB - th], [0, -w / 2, zA - th], m, {}, [[0, 0], [len, 0], [len, w], [0, w]]);
          K.detail(() => {
            if (o.truss) {
              const n = Math.max(2, Math.round(len / (o.truss * 1.2))), bw = Math.max(.15, o.truss * .06);
              for (const s of [-1, 1]) {
                const y = s * (w / 2 - bw / 2);
                for (let i = 0; i <= n; i++) { const t = i / n * len; K.box(t, y, bw, bw, zAt(t), zAt(t) + o.truss, o.steel || m); }
                for (let i = 0; i < n; i++) {
                  const t0 = i / n * len, t1 = (i + 1) / n * len, up = i % 2;
                  const p0 = [t0, y, zAt(t0) + (up ? 0 : o.truss)], p1 = [t1, y, zAt(t1) + (up ? o.truss : 0)];
                  K.quad([p0[0], y - bw / 2, p0[2]], [p1[0], y - bw / 2, p1[2]], [p1[0], y - bw / 2, p1[2] + bw], [p0[0], y - bw / 2, p0[2] + bw], o.steel || m);
                  K.quad([p1[0], y + bw / 2, p1[2]], [p0[0], y + bw / 2, p0[2]], [p0[0], y + bw / 2, p0[2] + bw], [p1[0], y + bw / 2, p1[2] + bw], o.steel || m);
                }
                K.box(len / 2, y, len, bw, (zA + zB) / 2 + o.truss - bw, (zA + zB) / 2 + o.truss, o.steel || m, { cap: o.steel || m });
              }
            }
          });
          if (o.arch) {
            const n = K.seg(12), r = o.arch;
            for (const s of [-1, 1]) {
              const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([t * len, zAt(t * len) - th - r * (1 - (2 * t - 1) ** 2)]); }
              const outline = pts.concat([[len, zB - th], [0, zA - th]]);
              K.wallPoly(s > 0 ? [len, w / 2] : [0, -w / 2], s > 0 ? [0, w / 2] : [len, -w / 2], s > 0 ? outline.map(([t, z]) => [len - t, z]).reverse() : outline, m, {});
            }
          }
          for (const t of o.piers || []) { const gz = K.groundAt(t, 0); K.box(t, 0, 1.6, w * .8, gz - 3, zAt(t) - th, m); }
        });
      },
      // ---- castle rock ----
      // a rocky base under a ring (the castle's outline) from zTop down into the drawn terrain: resampled every o.step m,
      // flaring out by o.flare per metre of drop and broken up by o.rough m; o.cap: material for the top (courtyard)
      rock(r, zTop, m, o = {}) {
        const step = o.step || 4, flare = o.flare ?? .3, rough = o.rough ?? 2.2, sd = o.seed ?? 3.7;
        const pts = [];
        for (let j = 0; j < r.length; j++) {
          const a = r[j], b = r[(j + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(len / step));
          for (let i = 0; i < k; i++) pts.push([a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]);
        }
        const N = pts.length, nrmv = pts.map((p, i) => {
          const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l];
        });
        const nz = (i, j) => { const x = Math.sin(i * 12.9898 + j * 78.233 + sd) * 43758.5453; return x - Math.floor(x) - .5; };
        const ZT = typeof zTop === 'function' ? zTop : () => zTop, zts = pts.map(p => ZT(p[0], p[1]));
        const NL = Math.max(2, Math.ceil(Math.max(...pts.map((p, i) => zts[i] - K.groundAt(p[0], p[1]))) / step) + 1);
        const G = [], arc = [0];
        for (let i = 1; i <= N; i++) arc.push(arc[i - 1] + Math.hypot(pts[i % N][0] - pts[i - 1][0], pts[i % N][1] - pts[i - 1][1]));
        for (let i = 0; i < N; i++) {
          const p = pts[i], nn = nrmv[i], zt = zts[i];
          let zb = K.groundAt(p[0], p[1]) - 3;
          for (let it = 0; it < 2; it++) { const dd = flare * Math.max(0, zt - zb); zb = Math.min(zb, K.groundAt(p[0] + nn[0] * dd, p[1] + nn[1] * dd) - 3); }
          const col = [];
          for (let j = 0; j <= NL; j++) {
            const t = j / NL, z = zt + (zb - zt) * t, dd = flare * (zt - z) + (j ? rough * (nz(i, j) + .5 * nz(i * .5 | 0, j + 9)) : 0) + (j ? .6 : 0);
            col.push([p[0] + nn[0] * dd, p[1] + nn[1] * dd, z]);
          }
          G.push(col);
        }
        face(m, { E: 0 }, 0);
        const base = B.p.length / 3;
        for (let i = 0; i <= N; i++) for (let j = 0; j <= NL; j++) {
          const c = G[i % N][j], cl = G[(i + N - 1) % N][j], cr = G[(i + 1) % N][j], cu = G[i % N][Math.max(0, j - 1)], cd = G[i % N][Math.min(NL, j + 1)];
          const tu = [cr[0] - cl[0], cr[1] - cl[1], cr[2] - cl[2]], tv = [cu[0] - cd[0], cu[1] - cd[1], cu[2] - cd[2]];
          let nx = tu[1] * tv[2] - tu[2] * tv[1], ny = tu[2] * tv[0] - tu[0] * tv[2], nzv = tu[0] * tv[1] - tu[1] * tv[0]; const l = Math.hypot(nx, ny, nzv) || 1;
          vtx(c[0], c[1], c[2], nx / l, ny / l, nzv / l, arc[i], c[2]);
        }
        for (let i = 0; i < N; i++) for (let j = 0; j < NL; j++) {
          const a = base + i * (NL + 1) + j, b = a + NL + 1;
          B.ix.push(a, b, b + 1, a, b + 1, a + 1);
        }
        if (o.cap) K.cap(r, ZT(r[0][0], r[0][1]), o.cap);
        return pts;
      },
      // the convex hull of some points (castle outlines)
      hull(P) {
        const q = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lo = [], hi = [];
        for (const p of q) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
        for (const p of q.reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
        return lo.slice(0, -1).concat(hi.slice(0, -1));
      },
      // a castle crag: the drawn terrain inside a convex ring raised by lift(x, y) (true m; the height map is too coarse
      // for these rocks), as terraces of rock that hold snow on the gentle parts, with a rocky skirt round the edge down
      // into the terrain. Build the castle's buildings at K.groundAt(x, y) + lift(x, y).
      mound(r, lift, m, o = {}) {
        const step = o.step || (lite ? 7 : 5), rings = [];
        let ring = [];
        for (let j = 0; j < r.length; j++) {                 // resample the outline every step metres
          const a = r[j], b = r[(j + 1) % r.length], k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
          for (let i = 0; i < k; i++) ring.push([a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]);
        }
        ring = ccw(ring); rings.push(ring);
        for (let k = 0; k < 80; k++) {
          const prev = rings[rings.length - 1], q = offsetPath(prev, -step), A = ringArea(q);
          let ok = A > step * step * 3 && A < ringArea(prev);
          for (let j = 0; ok && j < q.length; j++) { const j2 = (j + 1) % q.length; ok = (q[j2][0] - q[j][0]) * (prev[j2][0] - prev[j][0]) + (q[j2][1] - q[j][1]) * (prev[j2][1] - prev[j][1]) > 0; }
          if (!ok) break;
          rings.push(q);
        }
        const Z = p => { const l = lift(p[0], p[1]), t = Math.min(1, Math.max(0, (l - .5) / 2.5)); return K.groundAt(p[0], p[1]) + l - 1.2 * (1 - t * t * (3 - 2 * t)); };   // sinks under the terrain where the lift runs out
        for (let k = 0; k < rings.length - 1; k++) {
          const A = rings[k], Bq = rings[k + 1], n = A.length;
          for (let j = 0; j < n; j++) {
            const j2 = (j + 1) % n, P = [A[j], A[j2], Bq[j2], Bq[j]].map(p => [p[0], p[1], Z(p)]);
            poly3([P[0], P[1], P[2]], [[0, 0], [1, 0], [1, 1]], m, {}); poly3([P[0], P[2], P[3]], [[0, 0], [1, 1], [0, 1]], m, {});
          }
        }
        const inner = rings[rings.length - 1], pts = inner.map(p => new THREE.Vector2(p[0], p[1]));
        face(m, {}, 0);
        const s0 = B.p.length / 3;
        for (const p of inner) vtx(p[0], p[1], Z(p), 0, 0, 1, 0, 0);
        for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) B.ix.push(s0 + t[0], s0 + t[1], s0 + t[2]);
        K.rock(ring, (x, y) => Z([x, y]) - .3, m, { flare: o.flare ?? .45, rough: o.rough ?? 2.4, step: o.skirtStep || 4 });
        return Z;
      },
      // a castle's crag in one call: lift = H inside an ellipse (centre c, half axes ax, ay, turned deg), easing to 0 by
      // (1 + ramp) times that, and to 0 round the neighbouring houses (ctx records), under the hull of all the landmark's
      // outlines grown by out; returns lift(x, y)
      crag(o) {
        const a = (o.deg || 0) * D2R, ca = Math.cos(a), sa = Math.sin(a), ramp = o.ramp ?? .5, sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
        const keep = L.fp.parts.filter(p => p.ctx).map(p => [p.c[0], p.c[1], Math.sqrt(p.area / Math.PI)]);
        const memo = new Map(), lift = (x, y) => {
          const key = Math.round(x * 2) * 65536 + Math.round(y * 2); let v0 = memo.get(key);
          if (v0 !== undefined) return v0;
          const dx = x - o.c[0], dy = y - o.c[1], u = (dx * ca + dy * sa) / o.ax, v = (-dx * sa + dy * ca) / o.ay, q = Math.hypot(u, v);
          let k = 1 - sm((q - 1) / ramp);
          for (let i = 0; i < keep.length && k > 0; i++) { const [cx, cy, r] = keep[i]; k *= sm((Math.hypot(x - cx, y - cy) - r - 2) / 14); }
          v0 = o.H * k; memo.set(key, v0); return v0;
        };
        const P = []; for (const p of L.fp.parts) if (!p.ctx) P.push(...p.ring);
        K.mound(offsetPath(K.hull(P), o.out ?? 6), lift, o.m || { m: M.ROCK, c: '#8e8a80' }, o);
        return lift;
      },
      // ---- whole buildings from a footprints.json record (heights over its own ground, true metres) ----
      // o: wall, roof (material specs), win (layout or fn(j, len)), roofType, h, rh, eave, z (base), deg (roof axis)
      footprint(rec, o = {}) {
        const P = T; T = { c: 1, s: 0, x: 0, y: 0, z: 0 };
        try {
          const r = ccw(o.ring || (o.simplify ? K.simplify(rec.ring, o.simplify) : rec.ring)), zb = o.z ?? K.groundAt(rec.c[0], rec.c[1]), z0 = o.z0 ?? (K.groundMin(r) - 2);
          let shape = o.roofType ?? ({ gabled: 'gable', hipped: 'hip', half_hipped: 'halfhip', pyramidal: 'pyramid', skillion: 'skillion', flat: 'flat', dome: 'dome', onion: 'onion', cone: 'cone', spire: 'cone', round: 'dome' }[rec.roof] || (rec.part ? 'flat' : 'hip'));
          const W2 = rec.W || 10, rh = o.rh ?? rec.rh ?? { gable: .55 * W2, hip: .5 * W2, halfhip: .5 * W2, pyramid: .6 * W2, skillion: .2 * W2, flat: 0, dome: .5 * W2, onion: .9 * W2, cone: 1.4 * W2 }[shape];
          if (shape === 'pyramid' && r.length >= 6) shape = 'cone';        // a pyramid over a polygon or circle: its own faces
          const h = o.h ?? rec.h ?? (o.eave ?? 12) + rh, eave = o.eave ?? Math.max((rec.minh || 0) + 2, h - rh);
          const minz = rec.minh ? zb + rec.minh : z0;
          let deg = o.deg ?? rec.ang ?? 0;
          if (o.highToward && shape === 'skillion') { const a = deg * D2R, q = o.highToward; if ((q[0] - rec.c[0]) * -Math.sin(a) + (q[1] - rec.c[1]) * Math.cos(a) < 0) deg += 180; }
          if (shape === 'dome' || shape === 'onion' || shape === 'cone') {
            const n = r.length <= 9 ? r.length : 0, R0 = n ? r.reduce((t, p) => t + Math.hypot(p[0] - rec.c[0], p[1] - rec.c[1]), 0) / n : Math.sqrt(rec.area / Math.PI);
            K.walls(r, minz, zb + eave, o.wall, { win: o.win, vz: zb });
            const prof = shape === 'dome' ? K.P.dome(R0, rh) : shape === 'onion' ? K.P.onion(R0, rh) : K.P.cone(R0, rh);
            K.lathe(rec.c[0], rec.c[1], zb + eave, prof, o.roof, { n, rot: n ? Math.atan2(r[0][1] - rec.c[1], r[0][0] - rec.c[0]) : 0 });
          } else {
            const Pl = K.planes(r, shape, zb + eave, rh, deg, o);
            K.roofPlanes(r, Pl, o.roof, { over: o.over ?? (shape === 'flat' ? 0 : .4) });
            if (o.storeys) {                            // walls in storeys up to the eaves (o.win(i, len) per storey), gables above
              const zs = [minz, ...o.storeys.filter(z => z < eave - .5).map(z => zb + z), zb + eave];
              for (let j = 0; j < r.length; j++) K.storeys(r[j], r[(j + 1) % r.length], zs, o.wall, typeof o.win === 'function' ? o.win : () => o.win, { vz: zb, E: zb + eave });
              K.roofWalls(r, Pl, zb + eave, o.wall, { vz: zb, E: zb + eave });
            } else K.roofWalls(r, Pl, minz, o.wall, { win: o.win, vz: zb, E: zb + eave, f: o.f });
          }
          if (o.rock) K.rock(K.offset(r, o.rockOut ?? 1.2), zb - .4, o.rock, { flare: o.flare ?? .3, rough: o.rough ?? 1.6 });
          return { zb, eave: zb + eave, h: zb + h, ring: r };
        } finally { T = P; }
      },
    };
    K._finish = () => {
      const out = {};
      for (const key of ['main', 'detail']) {
        const b = BUF[key], nv = b.p.length / 3; if (!nv) continue;
        const pos = new Float32Array(b.p), nor = new Float32Array(nv * 3);
        for (let i = 0; i < nv; i++) {
          pos[i * 3 + 2] *= BHS;
          const x = b.n[i * 3], y = b.n[i * 3 + 1], z = b.n[i * 3 + 2] / BHS, l = Math.hypot(x, y, z) || 1;
          nor[i * 3] = x / l; nor[i * 3 + 1] = y / l; nor[i * 3 + 2] = z / l;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('aP', new THREE.BufferAttribute(new Float32Array(b.ap), 2)); g.setAttribute('aG', new THREE.BufferAttribute(new Float32Array(b.ag), 2));
        g.setAttribute('aM', new THREE.BufferAttribute(new Float32Array(b.am), 4)); g.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(b.aw), 4));
        g.setAttribute('aC', new THREE.BufferAttribute(new Uint8Array(b.ac), 4, true)); g.setAttribute('aD', new THREE.BufferAttribute(new Uint8Array(b.ad), 4, true));
        g.setIndex(new THREE.BufferAttribute(nv < 65536 ? new Uint16Array(b.ix) : new Uint32Array(b.ix), 1));
        g.computeBoundingSphere();
        out[key] = g;
      }
      return out;
    };
    return K;
  }

  /* ---------- building, showing and dropping ---------- */
  const regions = {};
  const loadRegion = r => regions[r] || (regions[r] = import(`./lm/${r}.js`).then(m => m.default));
  const stats = {};
  let busy = false;
  async function build(L) {
    L.st = 1; busy = true;
    try {
      const mod = await loadRegion(L.region), fn = mod && mod[L.name];
      if (!fn) throw new Error('no builder for ' + L.name);
      if (ctx.city) { L.st = 0; return; }
      seedN = 1 + (L.name.length * 7919 + L.name.charCodeAt(0) * 31) % 2147483646;
      const K = makeKit(L), t0 = performance.now();
      fn(K);
      const geo = K._finish();
      L.origin = llv(L.lat, L.lon, meshKm(L.lat, L.lon));
      const up = L.origin.clone().normalize(), east = new V3(up.z, 0, -up.x).normalize(), north = new V3().crossVectors(up, east);
      const basis = new THREE.Matrix4().makeBasis(east, north, up);
      L.uFade = { value: 0 }; L.uCamL = { value: new V3() }; L.uUp = { value: up }; L.uShadowM = { value: new THREE.Matrix4() };
      L.meshes = [];
      for (const [key, far] of [['main', FAR], ['detail', FAR_D]]) {
        const g = geo[key]; if (!g) continue;
        const mesh = new THREE.Mesh(g, material(L, far));
        mesh.position.copy(L.origin); mesh.quaternion.setFromRotationMatrix(basis); mesh.scale.setScalar(.001);
        mesh.updateMatrixWorld(); mesh.userData.far = far; mesh.frustumCulled = true;
        if (ctx.shadow) { mesh.layers.enable(ctx.shadow.layer); ctx.shadow.meshes.add(mesh); }
        ctx.scene.add(mesh); L.meshes.push(mesh);
      }
      L.radius = Math.max(...L.meshes.map(m => m.geometry.boundingSphere.radius)) * .001;
      if (ctx.shadow) L.uShadowM.value.copy(ctx.shadow.matrix).multiply(L.meshes[0].matrixWorld);
      const tris = L.meshes.map(m => m.geometry.index.count / 3);
      stats[L.name] = { tris: tris.reduce((a, b) => a + b, 0), main: tris[0], detail: tris[1] || 0, ms: Math.round(performance.now() - t0) };
      L.st = 2;
    } catch (e) { L.st = 3; console.error('landmark ' + L.name + ' failed', e); }
    finally { busy = false; }
  }
  function drop(L) {
    for (const m of L.meshes || []) { ctx.scene.remove(m); m.geometry.dispose(); m.material.dispose(); if (ctx.shadow) ctx.shadow.meshes.delete(m); }
    L.meshes = null; L.st = 0;
  }
  const camL = new V3();
  let last = performance.now();
  function update() {
    const now = performance.now(), rdt = Math.min(.5, (now - last) / 1000); last = now;     // fades run on the wall clock (the journey may be paused)
    if (!LMS.length) return;
    camL.copy(camera.position);
    let next = null, nd = Infinity;
    for (const L of LMS) {
      if (!L.wp) L.wp = llv(L.lat, L.lon, 0);
      const dk = camL.distanceTo(L.wp);
      if (L.st === 0 && dk < BUILD && dk < nd) { next = L; nd = dk; }
      if (L.st === 2) {
        if (dk > DROP) { drop(L); continue; }
        L.uCamL.value.copy(camL).sub(L.origin);
        L.uFade.value = Math.min(1, L.uFade.value + rdt * 1.5);
        const dd = camL.distanceTo(L.origin);
        for (const m of L.meshes) m.visible = !ctx.city && dd < m.userData.far + L.radius;
      }
    }
    if (next && !busy && !ctx.city) build(next);
  }
  function onCity(on) { if (on) for (const L of LMS) for (const m of L.meshes || []) m.visible = false; }
  // rebuild(name): drop a landmark and build it again (for working on a model from the console)
  const rebuild = name => { const L = LMS.find(l => l.name === name); if (!L) return null; if (L.meshes) drop(L); return build(L).then(() => stats[name]); };
  return { update, onCity, rebuild, stats: () => stats, list: LMS };
}
