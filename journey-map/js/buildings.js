// 3D buildings from Overture / OpenStreetMap footprints: walls with procedural facades in each region's style, real roof
// shapes with eaves, tiles and snow, chimneys and dormers, towers and spires.
// Buildings cast sun shadows on each other and on the ground near the camera (WebGL2).
// create(ctx) returns { buildBuildings(buffer, meta) -> Promise<THREE.Mesh>, update(dt), onCity(on) }.
export default function create(ctx) {
  const { THREE, V3, uni, HAZE, LIGHT, NOISE, D2R, BHS, llv, meshKm, phone, renderer, scene, cam, clamp } = ctx;
  const SHADOWS = renderer.capabilities.isWebGL2, SM = phone() ? 1024 : 2048, SHADOW_LAYER = 7;
  const SHADOW_GLSL = SHADOWS ? `precision highp sampler2DShadow;
    uniform sampler2DShadow uShadow; uniform float uShadowOn, uShadowTexel; varying vec3 vS;
    // sun visibility from the buildings' depth map: 4 hardware-filtered taps, slope-scaled bias, fading out at the map's edge
    float sunVis(float ndl){
      if(uShadowOn<.01||ndl<=0.||any(lessThan(vS.xy, vec2(0.)))||any(greaterThan(vS.xy, vec2(1.)))) return 1.;
      float tn=sqrt(max(1.-ndl*ndl, 0.))/max(ndl, .12), b=(.35+uShadowTexel*(.8+1.2*min(tn, 5.)))*8.4e-5, t=.5/${SM}.;
      float v=textureLod(uShadow, vec3(vS.xy+vec2(-t, -t), vS.z-b), 0.)+textureLod(uShadow, vec3(vS.xy+vec2(t, -t), vS.z-b), 0.)
             +textureLod(uShadow, vec3(vS.xy+vec2(-t, t), vS.z-b), 0.)+textureLod(uShadow, vec3(vS.xy+vec2(t, t), vS.z-b), 0.);
      vec2 e=min(vS.xy, 1.-vS.xy); return mix(1., v*.25, uShadowOn*smoothstep(0., .1, min(e.x, e.y)));
    }` : `float sunVis(float ndl){ return 1.; }`;
  // Per vertex: aP = facade coordinates in 1/16 m (walls: metres along the face, height; roofs: along the eave, down the slope),
  // aF = face / building words (decoded below), aC = base colour (sRGB) + accent byte (walls: shutter/timber colours; roofs: snow).
  const vertexShader = `attribute vec2 aP; attribute vec4 aF, aC; uniform vec3 uOrigin; uniform mat4 uShadowM;
    varying vec3 vL; varying vec2 vP; varying vec4 vF, vC; varying vec2 vX; varying vec3 vS;
    void main(){ vL=position; vP=aP/16.; vS=(uShadowM*vec4(position, 1.)).xyz;
      vF=vec4(mod(aF.x,8192.)/16., mod(aF.y,4096.)/16., aF.z, aF.w); vX=vec2(floor(aF.x/8192.)*.25, floor(aF.y/4096.));
      vC=vec4(pow(aC.rgb,vec3(2.2)), aC.a*255.);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
  // kinds: 0 wall, 1 pitched roof, 2 chimney, 3 dormer front, 4 tower cap (dome/onion/spire), 5 flat roof, 6 plain, 7 church tower wall
  // A word: kind(3) style(4) floors(5) party shop arcade door      B word: seed(8) shutters quoins timber balcony church utility modern -
  // styles: 0 town, 1 pastel old town, 2 Mariahilf river row, 3 Munich Altstadt, 4 Nuremberg Altstadt, 5 Alpine farmhouse, 6 lowland village, 7 modern
  const fragmentShader = HAZE + LIGHT + NOISE + SHADOW_GLSL + `uniform vec3 uOrigin, uRegionSun; uniform float uWinter, uAlt, uFade;
    varying vec3 vL; varying vec2 vP; varying vec4 vF, vC; varying vec2 vX;
    float bt(float x, float s){ return mod(floor(x/exp2(s)), 2.); }
    float bn(float x, float s, float n){ return mod(floor(x/exp2(s)), exp2(n)); }
    float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
    // box-filtered pulse train: pulses [a+kP, a+kP+w] inside [lo,hi], averaged over the pixel footprint f (exact, so no shimmer)
    float Fp(float x, float a, float w, float P){ float c=floor(x/P); return c*w+clamp(x-c*P-a, 0., w); }
    float pulse(float x, float f, float a, float w, float P, float lo, float hi){
      float x0=clamp(x-.5*f, lo, hi)-lo, x1=clamp(x+.5*f, lo, hi)-lo; return (Fp(x1, a, w, P)-Fp(x0, a, w, P))/f; }
    float box(float x, float f, float a, float b){ return clamp((min(x+.5*f, b)-max(x-.5*f, a))/f, 0., 1.); }
    vec3 shutterCol(float i){ return i<.5?vec3(.055,.15,.07):i<1.5?vec3(.04,.10,.055):i<2.5?vec3(.15,.07,.035):vec3(.20,.045,.03); }
    vec3 timberCol(float i){ return i<.5?vec3(.05,.03,.02):i<1.5?vec3(.15,.035,.022):i<2.5?vec3(.035,.03,.028):vec3(.10,.055,.03); }
    void main(){
      vec3 n=normalize(cross(dFdx(vL), dFdy(vL)));
      vec3 wp=vL+uOrigin, up=normalize(uOrigin), toCam=cameraPosition-wp; float d=length(toCam);
      if(dot(n, toCam)<0.) n=-n;
      vec3 V=toCam/d, L=normalize(uRegionSun);
      float u=vP.x, h=vP.y, fu=max(fwidth(u), .003), fh=max(fwidth(h), .003);
      float A=floor(vF.z+.5), B=floor(vF.w+.5), kind=bn(A, 0., 3.), style=bn(A, 3., 4.), seed=bn(B, 0., 8.);
      float Lf=vF.x, E=vF.y, ov=vX.x, ex=floor(vX.y+.5), acc=floor(vC.a+.5);
      vec3 base=vC.rgb, col=base, add=vec3(0.); float vis=1., ao=1.;
      float sR=fract(seed*.6180339);
      if(kind<.5 || kind>6.5){
        // ---------------- walls ----------------
        float F=bn(A, 7., 5.), party=bt(A, 12.), shop=bt(A, 13.), arc=bt(A, 14.), door=bt(A, 15.);
        float shut=bt(B, 8.), quoin=bt(B, 9.), timber=bt(B, 10.), balc=bt(B, 11.), church=bt(B, 12.), util=bt(B, 13.), modern=bt(B, 14.);
        float gableF=bt(ex, 0.), pitched=bt(ex, 1.), tower=step(6.5, kind);
        base=max(mix(vec3(dot(base, vec3(.2126, .7152, .0722))), base, 1.18), 0.)*.8; col=base;
        if(F<.5) F=max(1., floor((E-.4)/3.15+.5));
        float g=style>.5&&style<4.5&&F>2.5?min(4., E*.36):style>4.5&&style<5.5?2.8:3.2;
        if(F<1.5) g=E;
        float top=E-.32-.1*min(F, 5.), fl=(top-g)/max(F-1., 1.);
        float far=max(fu, fh);
        float det=1.-smoothstep(1.1, 2.4, far);
        float trim=style<.5||style>5.5?.9:1.;
        vec3 trimC=mix(base, vec3(.86, .85, .82), style>.5&&style<3.5?.75:.45);
        vec3 glassC=mix(vec3(.018, .02, .026), vec3(.30, .36, .44), .08+.7*pow(1.-max(dot(n, V), 0.), 3.));
        float winF=0.;
        // stone or plaster plinth
        col=mix(col, base*vec3(.58, .58, .6), box(h, fh, -30., .45));
        if(style>3.5&&style<4.5&&(h<g||quoin>.5)&&h<top){ // Nuremberg: red sandstone (ground floor, or all of it) with ashlar joints
          vec3 ss=mix(vec3(.27, .085, .05), vec3(.34, .14, .085), fract(sR*7.));
          float jr=pulse(h, fh, 0., .05, .52, -30., 600.), j=jr+pulse(u+.55*mod(floor(h/.52), 2.), fu, 0., .05, 1.1, -600., 600.)*(1.-jr);
          col=ss*(1.-.35*j*det); quoin=0.;
        }
        if(timber>.5&&style>4.5&&style<5.5&&h>g){ // Alpine farmhouse: dark larch log walls above the white ground floor
          vec3 wood=timberCol(bn(acc, 2., 2.))*1.6+vec3(.05, .03, .015);
          col=wood*(1.-.35*det*pulse(h, fh, 0., .035, .21, g, 600.));
          trimC=vec3(.80, .78, .74);
        }
        if(util>.5){
          // garages, sheds, barns: no windows; boards on barns, a wide door on one face
          if(timber>.5) col=mix(col, timberCol(3.)*1.7*(1.-.3*det*pulse(u, fu, 0., .04, .3, -600., 600.)), step(1.2, h));
          float dw=min(2.6, Lf*.4);
          float dr=door*box(u, fu, Lf*.5-dw*.5, Lf*.5+dw*.5)*box(h, fh, 0., 2.4);
          col=mix(col, vec3(.10, .085, .07)*(1.-.25*pulse(h, fh, 0., .05, .4, 0., 2.4)), dr);
          if(modern>.5){ float rb=box(h, fh, top-1.6, top-.5)*box(u, fu, .6, Lf-.6); col=mix(col, glassC, rb*.85); winF=rb; }
        } else if(church>.5){
          // whitewashed church: tall round-arched windows between pilasters
          float P=4.6, m=1.6, nb=max(floor((Lf-2.*m)/P+.3), Lf>4.?1.:0.); P=(Lf-2.*m)/max(nb, 1.);
          float ww=min(1.5, P*.36), y0=3.2, y1=tower>.5?min(top-1., 12.):top-2.2, ys=y1-ww*.5;
          float cu=(fract((u-m)/P)-.5)*P, inb=box(u, fu, m, Lf-m);
          float da=h<ys?abs(cu)-ww*.5:length(vec2(cu, (h-ys)*1.25))-ww*.5; da=max(da, y0-h);
          float k=1.-smoothstep(-.5*far, .5*far, da);
          float avg=ww*(y1-y0-ww*.1)/(P*max(top-y0, 1.));
          float wcov=mix(k*inb, avg*inb*step(y0, h)*step(h, top), smoothstep(.3, .9, far/ww));
          if(party>.5) wcov=0.;
          float pil=pulse(u, fu, 0., .7, P, m-.35-P, Lf-m+P)*(1.-party);
          col=mix(base, base*vec3(.93, .9, .84), pil*.6*det);
          col=mix(col, vec3(.05, .045, .04), wcov); add+=vec3(.20, .12, .05)*wcov*.18; winF=wcov;
          if(tower>.5){
            // belfry openings and a clock face high on each side of the tower
            float bw=min(1.3, Lf*.28), byt=top-1.2, bys=byt-bw*.5, bu=u-Lf*.5;
            float db=h<bys?abs(bu)-bw*.5:length(vec2(bu, (h-bys)*1.25))-bw*.5; db=max(db, top-4.6-h);
            float bo=(1.-smoothstep(-.5*far, .5*far, db))*(1.-party);
            col=mix(col, vec3(.02, .02, .025), bo);
            float cr=min(1.25, Lf*.3), cd=length(vec2(bu, (h-(top-6.6))*1.25));
            float clock=(1.-smoothstep(cr-.5*far, cr+.5*far, cd))*(1.-party)*step(9., Lf*3.);
            col=mix(col, mix(vec3(.75, .72, .62), vec3(.06), 1.-smoothstep(cr*.72-.5*far, cr*.72+.5*far, cd)), clock*.9);
          }
        } else {
          // ordinary facade: floors, bays of windows with frames, sills, shutters; shopfronts, arcades and doors below
          float bay=modern>.5?2.9:style>4.5&&style<5.5?3.9+.8*sR:mix(3.0, 3.8, sR);
          float m=quoin>.5?1.1:.75, nb=max(floor((Lf-2.*m)/bay+.35), Lf>2.3?1.:0.);
          if(nb<1.5&&Lf<3.8) m=(Lf-min(Lf*.4, 1.2))*.5-.3;
          float P=(Lf-2.*m)/max(nb, 1.), ww=min(modern>.5?P*.62:style>4.5&&style<5.5?1.0:1.18, P*.45);
          float wh=clamp(fl*.43, .85, 1.5), sill=(fl-wh)*.4;
          float a0=(P-ww)*.5, lo=m, hi=Lf-m, g0=shop+arc>.5?0.:1.;
          if(min(fu, fh)>3.6){
            // far away every pattern has averaged out: just the mean of plaster, frames and glass
            float wf=(1.-party)*(ww/P)*mix(g0*.4+(1.-g0)*.5, wh/fl, step(g, h))*step(h, top);
            col=mix(mix(col, trimC, (1.-party)*.1*trim), glassC, wf); winF=wf;
          } else {
          float cg=pulse(u, fu, a0, ww, P, lo, hi), cf=pulse(u, fu, a0-.15, ww+.3, P, lo, hi);
          float sw=min(ww*.5, a0-.17), cs=sw<.15?0.:pulse(u, fu, a0-.15-sw, sw, P, lo, hi)+pulse(u, fu, a0+ww+.15, sw, P, lo, hi);
          float yg=pulse(h, fh, sill, wh, fl, g, g+(F-1.)*fl), yf=pulse(h, fh, sill-.22, wh+.36, fl, g, g+(F-1.)*fl);
          float yg0=g0*box(h, fh, 1.05, 1.05+min(wh, g-1.5)), yf0=g0*box(h, fh, .85, 1.2+min(wh, g-1.5));
          if(F<1.5){ yg=0.; yf=0.; yg0=g0*box(h, fh, max(.9, E*.3), max(.9, E*.3)+min(wh, E*.45)); yf0=yg0; }
          float gw=gableF*box(u, fu, Lf*.5-.55, Lf*.5+.55)*box(h, fh, E+.9, E+.9+wh*.8);   // a window up in the gable
          float win=cg*(yg+yg0)+gw, frame=max(cf*(yf+yf0)-cg*(yg+yg0), 0.);
          float sh=shut*cs*(yg+yg0);
          if(modern>.5){ frame*=.3; sh=0.; }
          if(party>.5){ win=0.; frame=0.; sh=0.; }
          // per-window variation: some lit warm from inside (it is Christmas), some with curtains
          float wi=floor((u-lo)/P), fi=floor((h-g)/fl), rw=hh(vec2(wi+seed*3.1, fi+seed*.37));
          float warm=step(.84, rw)*(1.-modern*.6);
          vec3 gc=glassC*(.7+.6*fract(rw*7.3))+vec3(.03, .028, .024)*step(.62, fract(rw*3.7));
          if(timber>.5&&(style>3.5&&style<4.5||style>5.5)&&h>g){
            // Franconian half-timbering: posts at the bay lines, rails at each floor, braces beside the windows
            vec3 tc=timberCol(bn(acc, 2., 2.));
            float cu=mod(u-lo, P), ch=mod(h-g, fl), pw=max(a0-.15, .1), bh=fl*.62;
            float post=pulse(u, fu, 0., .22, P, lo-.11-P, hi+P)+box(u, fu, 0., .22)+box(u, fu, Lf-.22, Lf);
            float rail=pulse(h, fh, 0., .2, fl, g-.1, g+F*fl)+pulse(h, fh, max(sill-.3, 0.), .12, fl, g, g+(F-1.)*fl)*(1.-cf)*.7;
            float bl=abs(cu*bh-ch*pw)/length(vec2(bh, pw)), br=abs((P-cu)*bh-ch*pw)/length(vec2(bh, pw));
            float brace=(1.-smoothstep(.07, .07+far, min(bl, br)))*step(ch, bh)*(1.-cf)*step(.45, hh(vec2(floor((u-lo)/P), seed+fi)));
            float gb=step(E, h)*(pulse(h, fh, 0., .2, 1.7, E, 600.)+pulse(u, fu, 0., .2, 1.4, -600., 600.));
            float tim=clamp(post+rail+brace*det+gb, 0., 1.)*(1.-party*.7);
            col=mix(col, tc, tim*mix(.4, .92, det));
            trimC=tc;
          }
          // string course over the ground floor, cornice under the eaves, quoins on the corners
          if(style>.5&&style<4.5&&F>1.5){ col=mix(col, trimC, box(h, fh, g-.1, g+.08)*.8); }
          col=mix(col, trimC, box(h, fh, top, E+.05)*trim);
          col*=1.-.35*box(h, fh, top-.14, top)*det;
          if(quoin>.5&&party<.5){
            float qw=mod(floor(h/.55), 2.)>.5?.5:.8;
            col=mix(col, trimC*.97, (box(u, fu, 0., qw)+box(u, fu, Lf-qw, Lf))*step(.45, h)*step(h, top)*det);
          }
          // Alpine balcony on the sunny side: a wooden railing with a shadow under its floor
          vec3 Ls=normalize(L-up*dot(L, up));
          if(balc>.5&&party<.5&&Lf>5.&&dot(n, Ls)>-.25&&F>1.5){
            float by=box(h, fh, g+.05, g+1.12)*box(u, fu, .3, Lf-.3);
            float sl=pulse(u, fu, 0., .075, .17, -600., 600.);
            vec3 bw=timberCol(bn(acc, 2., 2.))*1.5+.02;
            col*=1.-.45*box(h, fh, g-.55, g)*box(u, fu, .3, Lf-.3);
            col=mix(col, mix(bw, bw*.35, sl*det), by);
            win*=1.-by*.85; sh*=1.-by; frame*=1.-by;
          }
          col=mix(col, trimC, frame*trim);
          col=mix(col, shutterCol(bn(acc, 0., 2.))*(1.-.3*pulse(h, fh, 0., .05, .14, -600., 600.)*det), sh);
          col=mix(col, gc, win); add+=vec3(.55, .32, .12)*.32*warm*win; winF=win;
          col*=1.-.4*box(h, fh, sill-.32, sill-.22)*cf*det*(1.-party);       // shadow under each sill
          // ground floor: shopfronts (warm light inside), Lauben arches, a front door
          if(shop>.5&&h<g){
            float sw=P*.72, sa=(P-sw)*.5, sx=pulse(u, fu, sa, sw, P, lo, hi);
            float sy=box(h, fh, .42, g-.85), di=step(.72, hh(vec2(wi, seed)));
            float sfx=pulse(u, fu, sa-.12, sw+.24, P, lo, hi), sfy=box(h, fh, .3, g-.73);
            col=mix(col, vec3(.05, .055, .05), max(sfx*sfy-sx*sy, 0.));
            col=mix(col, mix(gc, vec3(.06, .045, .03), di), sx*sy);
            add+=vec3(.85, .55, .25)*.26*sx*sy*(1.-di*.7);
            col=mix(col, trimC*.8, box(h, fh, g-.55, g-.3)*box(u, fu, lo, hi)*.6);
          }
          if(arc>.5&&h<g){
            float aw=P*.7, cu=(fract((u-lo)/P)-.5)*P, ys=g-.75-aw*.5;
            float da=h<ys?abs(cu)-aw*.5:length(vec2(cu, (h-ys)*1.2))-aw*.5;
            float ao2=(1.-smoothstep(-.5*far, .5*far, da))*box(u, fu, lo, hi);
            col=mix(col, vec3(.035, .03, .028), ao2); add+=vec3(.5, .3, .12)*.08*ao2;
          }
          if(door>.5&&shop<.5&&arc<.5){
            float dd=box(u, fu, Lf*.5-.6, Lf*.5+.6)*box(h, fh, 0., 2.3);
            col=mix(col, trimC, box(u, fu, Lf*.5-.78, Lf*.5+.78)*box(h, fh, 0., 2.5)*det);
            col=mix(col, vec3(.09, .05, .03), dd);
          }
          }
        }
        // shadow of the eaves on sunlit walls, and darker street canyons near the ground
        float lh=max(dot(L, n), .03), drop=min(ov*max(dot(L, up), 0.)/lh+.15, 3.);
        vis=1.-pitched*smoothstep(E-drop-.25*max(far, .2), E-drop+.25*max(far, .2), h);
        col*=1.-.42*pitched*box(h, fh, E-.25-ov*.5, E+.02);
        col*=.92+.12*vnoise(vec3(u*.33, h*.45, seed))*mix(.4, 1., det);     // weathered plaster, a little grime low down
        col*=mix(.84, 1., smoothstep(-.5, 2.6, h));
        ao=style>.5&&style<4.5?mix(.62, 1., smoothstep(-1., 8., h)):mix(.72, 1., smoothstep(-.5, 4., h));
        float gk=1.-smoothstep(.12, .55, winF);
        col*=1.+.04*(sR-.5)*gk;
      } else if(kind<1.5 || kind>4.5&&kind<5.5){
        // ---------------- roofs ----------------
        float a=u, r=h, re=Lf, ve=E, snowK=acc/255.;
        float fa=fu, fr=fh, ny=dot(n, up);
        float det=1.-smoothstep(.15, .5, max(fa, fr));
        float row=pulse(r, fr, 0., .07, .34, -600., 600.);
        if(kind<1.5){
          float jt=pulse(a+.13*mod(floor(r/.34), 2.), fa, 0., .035, .26, -600., 600.);
          float tv=hh(vec2(floor(a/.26+.5*mod(floor(r/.34), 2.)), floor(r/.34)+seed));
          col=base*mix(.86, (1.-.42*row-.18*jt*(1.-row))*(.9+.2*tv), det);
        } else col=mix(vec3(.24, .23, .22), base, .3)*(.94+.1*vnoise(vec3(a*.2, r*.2, seed)));   // flat roofs: gravel
        if(ny<0.){ col=vec3(.16, .12, .09); snowK=0.; }              // the underside of the eaves
        // snow: deep on gentle slopes, sliding off steep ones, broken up at the edges, with a bright lip along the eaves
        float slope=kind>4.5?1.:smoothstep(.36, .6, ny);
        float cover=uWinter*snowK*slope;
        float sm; vec3 snow=vec3(.86, .89, .94)*(.96+.08*vnoise(vec3(a*.5, r*.5, seed)))*(1.-.07*row*det*step(kind, 1.5));
        if(kind<1.5){
          // a sheet of snow from the ridge down to a ragged lower edge (where it has slid or melted), the odd hole when thin,
          // and snow lingering in the tile rows below it
          float rag=(vnoise(vec3(a*.55, seed, 1.))-.5)*1.3+(vnoise(vec3(a*2.1, seed, 4.))-.5)*.45;
          float rm=re*(cover*1.15-.12)+rag, fe0=max(fr, .02);
          sm=(1.-smoothstep(rm-.5*fe0-.04, rm+.5*fe0+.04, r))*smoothstep(.15, .35, vnoise(vec3(a*.35, r*.35, seed*3.))+cover*.9)*step(.04, cover);
          col=mix(col, vec3(.84, .87, .92), uWinter*.45*(1.-sm)*mix(.2, row*1.6, det)*step(.2, snowK));
        } else {
          float dr=vnoise(vec3(a*.12, r*.12, seed));                              // flat roofs hold their snow: drifts, no bare patches
          sm=uWinter*step(.04, snowK)*smoothstep(.1, .3, snowK+dr*.4); snow*=.95+.07*dr;
          float pr=1.-smoothstep(.28-.5*fu, .28+.5*max(fu, fh), re);              // parapet coping, with a shadow line inside it
          sm*=1.-pr; col=mix(col, vec3(.30, .29, .28), pr); col*=1.-.3*box(re, max(fu, fh), .28, .42)*(1.-pr);
        }
        if(kind<1.5){
          // the roof's edge: a dark fascia line, a strip of bare tiles along the eaves where the snow has slid, a bright snow lip above it
          float de=min(re-r, ve-abs(a)), fe=max(fr, fa);
          float strip=(.18+.55*fract(sR*5.3))*uWinter*step(.5, snowK*4.);
          float lipK=box(de, fe, strip, strip+.3)*sm;
          sm*=smoothstep(strip-.5*fe, strip+.5*fe+.05, de);
          snow=mix(snow, vec3(.95, .96, .99), lipK*.6);
          col=mix(col, snow, sm);
          col*=1.-.7*(1.-smoothstep(.05, .16+fe, de));
        } else col=mix(col, snow, sm);
      } else if(kind<2.5){
        // ---------------- chimneys ----------------
        float ny=dot(n, up), cap=box(h, fh, E-.28, E+1.);
        col=mix(base, vec3(.09, .085, .08), cap*.85);
        if(ny>.8) col=mix(vec3(.05), vec3(.86, .89, .94), uWinter*.85);
        else col*=1.-.25*box(h, fh, E-.5, E-.28);
      } else if(kind<3.5){
        // ---------------- dormer fronts: one window ----------------
        float far=max(fu, fh), det=1.-smoothstep(.8, 2., far);
        float wv=box(u, fu, .3, Lf-.3)*box(h, fh, E+.25, E+1.2), fr=box(u, fu, .16, Lf-.16)*box(h, fh, E+.1, E+1.34);
        vec3 glassC=mix(vec3(.018, .02, .026), vec3(.30, .36, .44), .1+.6*pow(1.-max(dot(n, V), 0.), 3.));
        col=mix(base, vec3(.85, .84, .8), max(fr-wv, 0.)*det);
        col=mix(col, glassC, wv); add+=vec3(.55, .32, .12)*.3*wv*step(.7, fract(sR*13.+u*.01));
        col*=1.-.35*box(h, fh, E+1.3, E+3.);
      } else if(kind<4.5){
        // ---------------- domes, onion domes and spires: copper or slate, snow on the gentler parts ----------------
        float ny=dot(n, up);
        col=base*(.9+.15*vnoise(vec3(u*.6, h*.6, seed)));
        col=mix(col, vec3(.86, .89, .94), uWinter*smoothstep(.62, .85, ny)*.9);
        add+=vec3(.05, .06, .05)*pow(max(dot(reflect(-V, n), L), 0.), 12.);
      } else {
        col=base;                                                      // dormer cheeks and other plain bits
      }
      vec3 amb=winterLight(n, up, -n), sun=winterLight(n, up, L)-amb;
      vis*=sunVis(dot(n, L));
      col=col*(amb*ao+sun*vis)+add;
      col=applyHaze(col, d, uAlt);
      float alpha=uFade*(1.-smoothstep(28., 45., d));
      if(alpha<.01) discard;
      gl_FragColor=vec4(col, alpha);
  #include <tonemapping_fragment>
      gl_FragColor=linearToOutputTexel(gl_FragColor);
    }`;
  const bldgMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uOrigin: { value: new V3() }, uFade: { value: 0 }, uShadowM: { value: new THREE.Matrix4() }, uShadow: { value: null }, uShadowOn: { value: 0 }, uShadowTexel: { value: 1 } },
    side: THREE.DoubleSide, transparent: true, vertexShader, fragmentShader,
  });

  // ---- palettes (sRGB) by regional style ----
  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const P = a => a.map(hex);
  const WALL = [
    P(['#e9e2d2', '#efe9dc', '#e6d6b4', '#e3cfa0', '#d9d5cc', '#e8c9b4', '#cfd6c6', '#efe4c4', '#dcd0bb', '#f1efe8', '#e7dcc0']),   // town
    P(['#e8b84a', '#efcd6b', '#e89a86', '#da8b7c', '#a9c79c', '#9fc8b4', '#93b7d6', '#efe2c2', '#eca96a', '#f2d8a6', '#c9d9a8', '#e7b9a1', '#f1ead8']), // pastel old towns
    P(['#e9b23d', '#f0c858', '#e8846f', '#d4685c', '#9fc58e', '#7fbfa8', '#86aed4', '#f3e3b9', '#ec9a52', '#c04d40', '#b9a3c9', '#f2a6a0', '#80a9c8']), // Mariahilf row
    P(['#efe3c6', '#e4c27a', '#eed892', '#cdcac2', '#dcc7a3', '#e6bfa6', '#f1ede4', '#d9c58f', '#e8d4a8']),                       // Munich Altstadt
    P(['#ede6d6', '#e9e1cc', '#efe9dd', '#e5d5b8', '#dcd3c3', '#e9dcc4']),                                                         // Nuremberg plaster
    P(['#f2efe8', '#efebe2', '#ebe6da', '#f3efe4']),                                                                               // Alpine white
    P(['#f0ede5', '#ece4d0', '#eadba6', '#e2ded4', '#ecd9c2', '#f2efe7', '#e4e0cf']),                                              // lowland village
    P(['#d6d4ce', '#e8e6e0', '#c9c4b8', '#b9b8b4', '#e0d8c6', '#a9acad', '#cfc8bb']),                                              // modern
  ];
  const ROOF = P(['#9a4630', '#83402c', '#a9573a', '#5b3a2c', '#4d5257', '#6d6f71', '#5f8e7a', '#2f3033']);
  const ROOF_BY = [[0, 1, 4, 5, 3, 0], [0, 1, 1, 3, 4, 0], [0, 1, 3, 4, 0], [0, 1, 2, 0, 1], [0, 1, 2, 0, 2], [3, 4, 7, 1, 3, 5], [0, 1, 2, 0, 4], [5, 4, 5, 7]];
  const SHUT_P = [.15, .5, .45, .08, .2, .85, .35, 0];
  function pastel([r, g, b]) {           // a tagged facade colour as painted plaster: saturation <= .5, lightness .6-.86
    const c = new THREE.Color(r / 255, g / 255, b / 255), hsl = {}; c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(hsl.s, .5) * (hsl.l > .9 ? .3 : 1), Math.min(.86, Math.max(.6, hsl.l * .9)));
    return [c.r * 255 | 0, c.g * 255 | 0, c.b * 255 | 0];
  }
  const c565 = c => [(c >> 11) / 31 * 255, ((c >> 5) & 63) / 63 * 255, (c & 31) / 31 * 255];
  function nearestRoof(c) {
    const [r, g, b] = c565(c); let best = 0, bd = 1e9;
    const want = r > g * 1.5 && r > b * 1.5 ? [154, 70, 48] : [r, g, b];
    ROOF.forEach((p, k) => { const dd = (p[0] - want[0]) ** 2 + (p[1] - want[1]) ** 2 + (p[2] - want[2]) ** 2; if (dd < bd) { bd = dd; best = k; } });
    return ROOF[best];
  }

  // Footprints come in 0.5 m units with a roof type and ridge frame (from the minimum rotated rectangle).
  // Pitched roofs are cut into planar faces by clipping the (eave-offset) footprint against each roof plane's region,
  // so gables, hips and pyramids follow the real outline; walls pick up the roof line at each break.
  const RT = { FLAT: 0, GABLE: 1, HIP: 2, PYRAMID: 3, DOME: 4, ONION: 5, SKILLION: 6, CONE: 7 };
  const PROFILES = {
    [RT.DOME]: [[1, 0], [.97, .25], [.87, .5], [.7, .7], [.45, .87], [0, 1]],
    [RT.ONION]: [[1, 0], [1.18, .2], [1.12, .4], [.75, .62], [.3, .8], [.1, .9], [0, 1]],
    [RT.CONE]: [[1, 0], [0, 1]],
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
  function inPoly(p, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function offsetRing(ring, off, clampD) {   // move each edge of a CCW ring outward by off[j] (negative: inward), mitred corners
    const n = ring.length, nrm = [];
    for (let j = 0; j < n; j++) { const a = ring[j], b = ring[(j + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; nrm.push([(b[1] - a[1]) / l, -(b[0] - a[0]) / l]); }
    return ring.map((p, j) => {
      const jp = (j + n - 1) % n, n1 = nrm[jp], n2 = nrm[j], o1 = off[jp], o2 = off[j], det = n1[0] * n2[1] - n1[1] * n2[0];
      let dx, dy;
      if (Math.abs(det) < .25) { dx = (n1[0] * o1 + n2[0] * o2) / 2; dy = (n1[1] * o1 + n2[1] * o2) / 2; }
      else { dx = (o1 * n2[1] - o2 * n1[1]) / det; dy = (n1[0] * o2 - n2[0] * o1) / det; }
      const dl = Math.hypot(dx, dy);
      if (clampD && dl > clampD) { dx *= clampD / dl; dy *= clampD / dl; }
      return [p[0] + dx, p[1] + dy];
    });
  }
  const cross3 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function insetOK(ring, ins, minLen) {      // the inset ring keeps every edge's direction and does not cross itself
    const n = ring.length;
    for (let j = 0; j < n; j++) {
      const a = ring[j], b = ring[(j + 1) % n], c = ins[j], d = ins[(j + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1];
      if (ex * (d[0] - c[0]) + ey * (d[1] - c[1]) < minLen * Math.hypot(ex, ey)) return false;
    }
    for (let j = 0; j < n; j++) for (let k = j + 2; k < n; k++) {
      if (j === 0 && k === n - 1) continue;
      const p = ins[j], q = ins[(j + 1) % n], r = ins[k], t = ins[(k + 1) % n];
      if (cross3(r, t, p) * cross3(r, t, q) < 0 && cross3(p, q, r) * cross3(p, q, t) < 0) return false;
    }
    return true;
  }
  const ringArea = r => { let a = 0; for (let j = 0; j < r.length; j++) { const p = r[j], q = r[(j + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  // growable typed vertex / index buffers
  function makeBuf() {
    let cap = 1 << 18, icap = 1 << 19;
    const B = { n: 0, ni: 0, pos: new Float32Array(cap * 3), ap: new Int16Array(cap * 2), af: new Uint16Array(cap * 4), ac: new Uint8Array(cap * 4), idx: new Uint32Array(icap) };
    const grow = a => { const b = new a.constructor(a.length * 2); b.set(a); return b; };
    B.need = (nv, ni) => {
      while (B.n + nv > cap) { cap *= 2; B.pos = grow(B.pos); B.ap = grow(B.ap); B.af = grow(B.af); B.ac = grow(B.ac); }
      while (B.ni + ni > icap) { icap *= 2; B.idx = grow(B.idx); }
    };
    return B;
  }
  const Q = v => Math.max(-32767, Math.min(32767, Math.round(v * 16)));

  async function buildBuildings(buf, meta) {
    const u = new Uint16Array(buf), s16 = new Int16Array(buf), N = u.length, v3 = meta.v >= 3;
    const G = makeBuf(), origin = llv(meta.oy + 0.05, meta.ox + 0.05, meshKm(meta.oy + 0.05, meta.ox + 0.05)), skipSmall = phone();
    const C = new V3(), Up = new V3(), Ea = new V3(), No = new V3();
    let i = 0, slice = 0;
    // current vertex context: face words and colour, set before each batch of put()s
    let F0 = 0, F1 = 0, F2 = 0, F3 = 0, CR = 0, CG = 0, CB = 0, CA = 0;
    const put = (x, y, z, pu, ph) => {
      const k = G.n++, s = .001, zz = z * BHS * s;
      G.pos[k * 3] = C.x + Ea.x * x * s + No.x * y * s + Up.x * zz;
      G.pos[k * 3 + 1] = C.y + Ea.y * x * s + No.y * y * s + Up.y * zz;
      G.pos[k * 3 + 2] = C.z + Ea.z * x * s + No.z * y * s + Up.z * zz;
      G.ap[k * 2] = Q(pu); G.ap[k * 2 + 1] = Q(ph);
      G.af[k * 4] = F0; G.af[k * 4 + 1] = F1; G.af[k * 4 + 2] = F2; G.af[k * 4 + 3] = F3;
      G.ac[k * 4] = CR; G.ac[k * 4 + 1] = CG; G.ac[k * 4 + 2] = CB; G.ac[k * 4 + 3] = CA;
      return k;
    };
    const tri = (a, b, c) => { G.idx[G.ni++] = a; G.idx[G.ni++] = b; G.idx[G.ni++] = c; };
    const setC = (c, a) => { CR = c[0]; CG = c[1]; CB = c[2]; CA = a; };
    const words = (L16, ovc, E16, ex, A, Bw) => { F0 = Math.min(8191, Math.max(0, L16)) | (ovc << 13); F1 = Math.min(4095, Math.max(0, E16)) | (ex << 12); F2 = A; F3 = Bw; };
    while (i < N) {
      if (++slice % 1200 === 0) await new Promise(r => setTimeout(r, 0));
      const n = u[i], hM0 = u[i + 1] / 10, minH = u[i + 2] / 10, type = u[i + 3] & 7, flags = u[i + 3] >> 8;
      let rh = u[i + 4] / 10;
      const ang = u[i + 5] / 10 * D2R, ocx = s16[i + 6] / 2, ocy = s16[i + 7] / 2, Lp = u[i + 8] / 2, Wp = u[i + 9] / 2;
      const roofC = u[i + 10], wallC = u[i + 11], info = v3 ? u[i + 16] : 0;
      let x = (u[i + 12] << 16) | u[i + 13], y = (u[i + 14] << 16) | u[i + 15];
      i += v3 ? 17 : 16;
      const ring = [[x / 2, y / 2]];
      for (let j = 1; j < n; j++) { x += s16[i]; y += s16[i + 1]; i += 2; ring.push([x / 2, y / 2]); }
      const nw = (n + 15) >> 4, edgeBits = () => { const w = []; for (let k = 0; k < nw; k++) w.push(u[i++]); return j => (w[j >> 4] >> (j & 15)) & 1; };
      const none = () => 0;
      const isParty = v3 ? edgeBits() : none, isStreet = v3 && (info >> 13) & 1 ? edgeBits() : none, isArc = v3 && (info >> 14) & 1 ? edgeBits() : none;
      const church = flags & 1, part = flags & 2;
      let cx = 0, cy = 0, area = 0;
      for (let j = 0; j < n; j++) { const a = ring[j], b = ring[(j + 1) % n]; cx += a[0]; cy += a[1]; area += a[0] * b[1] - b[0] * a[1]; }
      cx /= n; cy /= n; area = Math.abs(area) / 2;
      if (skipSmall && !part && area < 90) continue;
      const lat = meta.oy + cy / meta.ky, lon = meta.ox + cx / meta.kx;
      // local frame in true metres around the centroid (east, north, up)
      const base = meshKm(lat, lon);
      llv(lat, lon, base, C); Up.copy(C).normalize(); C.sub(origin);
      Ea.set(Up.z, 0, -Up.x).normalize(); No.crossVectors(Up, Ea);
      const sx = 111195 * Math.cos(lat * D2R) / meta.kx, sy = 111195 / meta.ky;
      const rm = ring.map(p => [(p[0] - cx) * sx, (p[1] - cy) * sy]);
      // ---- what kind of building is this ----
      const cls = info & 7, style = (info >> 3) & 15, floorsD = (info >> 7) & 31, rhKnown = (info >> 12) & 1;
      let st = (Math.abs(Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453) % 1) * 2147483646 + 1 | 0;
      const rand = () => (st = st * 16807 % 2147483647) / 2147483647;
      const seed = Math.floor(rand() * 256);
      const util = cls === 3 || cls === 6, modern = style === 7 && !church, tower = church && area < 260 && hM0 > 22;
      const pitched = type === RT.GABLE || type === RT.HIP || type === RT.PYRAMID || type === RT.SKILLION;
      if (!pitched && type !== RT.DOME && type !== RT.ONION && type !== RT.CONE) rh = 0;
      let eave = Math.max(minH + 2, hM0 - rh);
      if (pitched && !rhKnown && !part) {                       // regional roof pitch: shallow Alpine roofs, steep Franconian ones
        const W2 = Wp * (sx + sy) / 2;
        if (style === 5) rh = Math.min(rh, .28 * W2);
        else if (style === 4) rh = Math.min(15, Math.max(rh, .6 * W2));
        else if (style === 3 || style === 1) rh = Math.min(14, Math.max(rh, .5 * W2));
      }
      const hM = eave + rh;
      const floors = floorsD || Math.max(1, Math.round((eave - .6) / 3.15));
      const timber = cls === 6 || (style === 4 && floors <= 5 && area < 900 && rand() < .5) || (style === 5 && !util && rand() < (area * sx * sy < 300 ? .55 : .3)) || (style === 6 && lat > 49.05 && rand() < .3);
      const balcony = !util && !church && (style === 5 && rand() < .72 || style === 6 && lat < 48.05 && rand() < .4);
      const shutters = !util && !modern && !church && rand() < SHUT_P[style];
      const quoins = !util && !church && ((style === 1 || style === 3) && (area > 300 || cls === 7) && rand() < .5 || style === 0 && cls === 7 && rand() < .4 || style === 4 && !timber && rand() < .35);   // style 4: all sandstone
      const shopOK = !util && !church && floors >= 2 && (style >= 1 && style <= 4 || style === 0 && (cls === 0 || cls === 2 || cls === 4));
      // colours
      const pal = WALL[church ? 5 : style];
      let wall = pal[Math.floor(rand() * pal.length)].slice();
      if (church) wall = rand() < .5 ? hex('#eeeae0') : hex('#efe6cf');
      if (wallC && !church) wall = pastel(c565(wallC));
      if (timber && style === 4) wall = hex('#ece6d8');
      const jit = .94 + .1 * rand(); wall = wall.map(v => Math.min(255, Math.round(v * jit)));
      const rset = ROOF_BY[style];
      let roofCol = roofC ? nearestRoof(roofC) : ROOF[rset[Math.floor(rand() * rset.length)]];
      if (church) roofCol = rand() < .7 ? ROOF[4] : ROOF[3];
      if (type === RT.DOME || type === RT.ONION || (type === RT.CONE && church)) roofCol = rand() < .6 ? ROOF[6] : ROOF[4];
      roofCol = roofCol.map(v => Math.round(v * (.9 + .2 * rand())));
      const snowK = rand() < .86 ? 215 + rand() * 40 | 0 : 90 + rand() * 100 | 0;
      const accent = Math.floor(rand() * 4) | Math.floor(rand() * 4) << 2;
      const ovm = !pitched ? 0 : church ? .3 : style === 5 ? 1.25 : util ? .3 : style >= 1 && style <= 4 ? .5 : .6;
      const ovc = Math.round(ovm / .25);
      const Bw = seed | (shutters ? 256 : 0) | (quoins ? 512 : 0) | (timber ? 1024 : 0) | (balcony ? 2048 : 0) | (church ? 4096 : 0) | (util ? 8192 : 0) | (modern || cls === 5 ? 16384 : 0);
      // ---- roof frame: v along the ridge, w across it, centred on the footprint's rectangle ----
      const c0 = [(ring[0][0] + ocx - cx) * sx, (ring[0][1] + ocy - cy) * sy];
      let ex = [Math.cos(ang) * sx, Math.sin(ang) * sy]; const el = Math.hypot(ex[0], ex[1]); ex = [ex[0] / el, ex[1] / el];
      const ey = [-ex[1], ex[0]];
      const Lm = Lp * Math.hypot(Math.cos(ang) * sx, Math.sin(ang) * sy), Wm = Wp * Math.hypot(Math.sin(ang) * sx, Math.cos(ang) * sy);
      let hw = Math.max(1, Wm / 2), hl = Math.max(hw, Lm / 2);
      if (type === RT.PYRAMID) hl = hw = Math.max(hw, (hl + hw) / 2);
      const toV = p => (p[0] - c0[0]) * ex[0] + (p[1] - c0[1]) * ex[1], toW = p => (p[0] - c0[0]) * ey[0] + (p[1] - c0[1]) * ey[1];
      const dd = hl - hw;
      const hp = (av, aw, b) => [av * ex[0] + aw * ey[0], av * ex[1] + aw * ey[1], b - av * (c0[0] * ex[0] + c0[1] * ex[1]) - aw * (c0[0] * ey[0] + c0[1] * ey[1])];
      const kk = Math.sqrt(1 + (rh / hw) ** 2);
      let regions;
      if (type === RT.GABLE) regions = [
        { cut: [hp(0, 1, 0)], z: p => eave + rh * (1 - toW(p) / hw), ar: p => [toV(p), Math.abs(toW(p)) * kk] },
        { cut: [hp(0, -1, 0)], z: p => eave + rh * (1 + toW(p) / hw), ar: p => [toV(p), Math.abs(toW(p)) * kk] }];
      else if (type === RT.HIP || type === RT.PYRAMID) regions = [
        { cut: [hp(0, 1, 0), hp(-1, 1, dd), hp(1, 1, dd)], z: p => eave + rh * (1 - toW(p) / hw), ar: p => [toV(p), Math.abs(toW(p)) * kk] },
        { cut: [hp(0, -1, 0), hp(-1, -1, dd), hp(1, -1, dd)], z: p => eave + rh * (1 + toW(p) / hw), ar: p => [toV(p), Math.abs(toW(p)) * kk] },
        { cut: [hp(1, 0, 0), hp(1, -1, -dd), hp(1, 1, -dd)], z: p => eave + rh * (hl - toV(p)) / hw, ar: p => [toW(p), (toV(p) - dd) * kk] },
        { cut: [hp(-1, 0, 0), hp(-1, -1, -dd), hp(-1, 1, -dd)], z: p => eave + rh * (hl + toV(p)) / hw, ar: p => [toW(p), (-toV(p) - dd) * kk] }];
      else if (type === RT.SKILLION) { const k2 = Math.sqrt(1 + (rh / (2 * hw)) ** 2); regions = [{ cut: [], z: p => eave + rh * (toW(p) + hw) / (2 * hw), ar: p => [toV(p), (hw - toW(p)) * k2] }]; }
      else regions = [{ cut: [], z: () => pitched ? eave : (rh ? eave : hM), ar: p => [toV(p), toW(p)], flat: 1 }];
      const roofZ = p => {
        let z = Infinity;
        for (let q = 0; q < regions.length; q++) {
          const r = regions[q], cut = r.cut; let ok = true;
          for (let k = 0; k < cut.length && ok; k++) ok = cut[k][0] * p[0] + cut[k][1] * p[1] + cut[k][2] >= -1e-6;
          if (ok) z = Math.min(z, r.z(p));
        }
        return z === Infinity ? eave : z;
      };
      const E16 = Math.round(eave * 16);
      // ---- walls: one strip per footprint edge (so windows centre on each face), broken where the roof line bends ----
      const lines = regions.flatMap(r => r.cut), bot = part && minH > 0 ? minH : -20;
      let doorEdge = -1, best = 0;
      if (!shopOK || util) for (let j = 0; j < n; j++) {
        const a = rm[j], b = rm[(j + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) * (isStreet(j) ? 3 : 1);
        if (!isParty(j) && l > best) { best = l; doorEdge = j; }
      }
      setC(wall, accent);
      const kindW = tower ? 7 : 0;
      for (let j = 0; j < n; j++) {
        const a = rm[j], b = rm[(j + 1) % n], ts = [0];
        const Le = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let k = 0; k < lines.length; k++) {
          const ln = lines[k], fa = ln[0] * a[0] + ln[1] * a[1] + ln[2], fb = ln[0] * b[0] + ln[1] * b[1] + ln[2];
          if ((fa > 0) !== (fb > 0) && Math.abs(fa - fb) > 1e-9) { const t = fa / (fa - fb); if (t > .01 && t < .99) ts.push(t); }
        }
        ts.push(1); if (ts.length > 2) ts.sort((p, q) => p - q);
        const pts = ts.map(t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]), zs = pts.map(roofZ);
        // drop breaks where the roof line runs straight through (hip ends)
        const keep = [0];
        for (let k = 1; k < pts.length - 1; k++) {
          const t0 = ts[keep[keep.length - 1]], t2 = ts[k + 1], z0 = zs[keep[keep.length - 1]], z2 = zs[k + 1];
          if (Math.abs(zs[k] - (z0 + (z2 - z0) * (ts[k] - t0) / (t2 - t0))) > .05) keep.push(k);
        }
        keep.push(pts.length - 1);
        let zmax = zs[0]; for (let k = 1; k < zs.length; k++) zmax = Math.max(zmax, zs[k]);
        const party = isParty(j), gable = zmax > eave + 2.7 && Le > 4.5 && !party;
        const A = kindW | style << 3 | Math.min(31, floors) << 7 | party << 12 | (shopOK && isStreet(j) ? 1 << 13 : 0) | (isArc(j) ? 1 << 14 : 0) | (j === doorEdge ? 1 << 15 : 0);
        words(Math.round(Le * 16), ovc, E16, (gable ? 1 : 0) | (pitched && !party && zmax < eave + .3 ? 2 : 0), A, Bw);
        G.need(keep.length * 2, keep.length * 6);
        let pb = -1, pt = -1;
        for (const k of keep) {
          const vb = put(pts[k][0], pts[k][1], bot, ts[k] * Le, bot), vt = put(pts[k][0], pts[k][1], zs[k], ts[k] * Le, zs[k]);
          if (pb >= 0) { tri(pb, vb, vt); tri(pb, vt, pt); }
          pb = vb; pt = vt;
        }
      }
      // ---- roof faces, cut from the footprint pushed out by the eaves (party walls get none) ----
      const ringO = ovm > 0 ? offsetRing(rm, rm.map((_, j) => isParty(j) ? 0 : ovm), 2.5 * ovm) : rm;
      // Big blocks coded flat get hipped wings round the edge (and a courtyard when there is room), as old-town blocks have
      let wing = null;
      const aM = area * sx * sy;
      if (type === RT.FLAT && !part && !modern && !util && !church && cls !== 4 && cls !== 5 && floors <= 8 && aM > 350 && aM < 25000 && (style >= 1 && style <= 4 || style === 0 && floors >= 3 && floors <= 6)) {
        const Dm = Math.min(13, Math.max(7, Wm * .42)), P1 = offsetRing(rm, rm.map(() => -Dm / 2));
        if (insetOK(rm, P1, .3)) {
          let P2 = null;
          if (Wm > 2.6 * Dm) { const q = offsetRing(rm, rm.map(() => -Dm)); if (insetOK(rm, q, .5) && ringArea(q) > 100) P2 = q; }
          wing = { Dm, P1, P2, rhR: Dm / 2 * (style === 4 ? 1.05 : .8) };
        }
      }
      if (wing) {
        const { Dm, P1, P2, rhR } = wing, ze = hM, zr = hM + rhR, hd = Dm / 2, kw = Math.sqrt(1 + (rhR / hd) ** 2), ovw = .45;
        const O = offsetRing(rm, rm.map((_, j) => isParty(j) ? 0 : ovw), 2.5 * ovw);
        const quad = (p0, p1, p2, p3, z0, z3, r0, r3, ed, re) => {    // p0-p1 low edge at z0, p3-p2 high edge at z3
          words(Math.round(re * 16), 0, 4095, 0, 1 | style << 3, Bw); G.need(4, 6);
          const al = p => (p[0] - ed[0]) * ed[2] + (p[1] - ed[1]) * ed[3], s0 = G.n;
          put(p0[0], p0[1], z0, al(p0), r0); put(p1[0], p1[1], z0, al(p1), r0); put(p2[0], p2[1], z3, al(p2), r3); put(p3[0], p3[1], z3, al(p3), r3);
          tri(s0, s0 + 1, s0 + 2); tri(s0, s0 + 2, s0 + 3);
        };
        setC(roofCol, snowK);
        for (let j = 0; j < n; j++) {
          const j2 = (j + 1) % n, a = rm[j], b = rm[j2], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ed = [a[0], a[1], (b[0] - a[0]) / l, (b[1] - a[1]) / l];
          const oj = isParty(j) ? 0 : ovw;
          quad(O[j], O[j2], P1[j2], P1[j], ze - rhR * oj / hd, zr, (hd + oj) * kw, 0, ed, (hd + oj) * kw);
          if (P2) quad(P2[j], P2[j2], P1[j2], P1[j], ze, zr, hd * kw, 0, ed, hd * kw);
        }
        if (P2) {      // courtyard walls, with windows
          setC(wall, accent);
          for (let j = 0; j < n; j++) {
            const a = P2[j], b = P2[(j + 1) % n], Le = Math.hypot(b[0] - a[0], b[1] - a[1]);
            words(Math.round(Le * 16), 0, Math.round(ze * 16), 2, Math.min(31, floors) << 7 | style << 3, Bw); G.need(4, 6);
            const s0 = G.n; put(a[0], a[1], -20, 0, -20); put(b[0], b[1], -20, Le, -20); put(b[0], b[1], ze, Le, ze); put(a[0], a[1], ze, 0, ze);
            tri(s0, s0 + 1, s0 + 2); tri(s0, s0 + 2, s0 + 3);
          }
        } else {
          const tris = THREE.ShapeUtils.triangulateShape(P1.map(p => new THREE.Vector2(p[0], p[1])), []);
          G.need(n, tris.length * 3);
          words(8, 0, 0, 0, 5 | style << 3, Bw); const s0 = G.n; for (const p of P1) put(p[0], p[1], zr, p[0], p[1]);
          for (const t of tris) tri(s0 + t[0], s0 + t[1], s0 + t[2]);
        }
      }
      const re16 = Math.round((hw + ovm) * kk * 16), ve16 = type === RT.GABLE || type === RT.SKILLION ? Math.round((hl + ovm) * 16) : 4095;
      setC(roofCol, snowK);
      const flatTop = !wing && regions.length === 1 && regions[0].flat && !pitched;
      let flatIn = null;
      if (flatTop && aM > 60) { const q = offsetRing(rm, rm.map(() => -.5)); if (insetOK(rm, q, .1)) flatIn = q; }
      if (flatIn) {
        // parapet strip: edge distance 0 at the rim, .5 m inside
        const z = regions[0].z();
        for (let j = 0; j < n; j++) {
          const j2 = (j + 1) % n, s0 = G.n; G.need(4, 6);
          words(0, 0, 0, 0, 5 | style << 3, Bw); put(rm[j][0], rm[j][1], z, rm[j][0], rm[j][1]); put(rm[j2][0], rm[j2][1], z, rm[j2][0], rm[j2][1]);
          words(8, 0, 0, 0, 5 | style << 3, Bw); put(flatIn[j2][0], flatIn[j2][1], z, flatIn[j2][0], flatIn[j2][1]); put(flatIn[j][0], flatIn[j][1], z, flatIn[j][0], flatIn[j][1]);
          tri(s0, s0 + 1, s0 + 2); tri(s0, s0 + 2, s0 + 3);
        }
        const tris = THREE.ShapeUtils.triangulateShape(flatIn.map(p => new THREE.Vector2(p[0], p[1])), []);
        words(8, 0, 0, 0, 5 | style << 3, Bw); G.need(n, tris.length * 3);
        const s0 = G.n; for (const p of flatIn) put(p[0], p[1], z, p[0], p[1]);
        for (const t of tris) tri(s0 + t[0], s0 + t[1], s0 + t[2]);
        // a stair or lift housing or two on big flat roofs
        if (aM > 700 && !part) for (let c = 0, cnt = aM > 3000 ? 2 : 1; c < cnt; c++) {
          const bw = 2.5 + 2 * rand(), bd = 2.5 + 1.5 * rand(), vv = (rand() - .5) * Math.max(0, hl - 4), ww = (rand() - .5) * Math.max(0, hw - 3);
          const pc = [c0[0] + ex[0] * vv + ey[0] * ww, c0[1] + ex[1] * vv + ey[1] * ww];
          const cs = [[-bw, -bd], [bw, -bd], [bw, bd], [-bw, bd]].map(([a, b]) => [pc[0] + (ex[0] * a + ey[0] * b) / 2, pc[1] + (ex[1] * a + ey[1] * b) / 2]);
          if (!cs.every(p => inPoly(p, flatIn))) continue;
          const z1 = z + 2.4 + rand();
          setC(wall.map(v => v * .9), 0); words(0, 0, Math.round(z1 * 16), 0, 2 | style << 3, Bw); G.need(8, 30);
          const s1 = G.n;
          for (const p of cs) put(p[0], p[1], z - .2, 0, z - .2);
          for (const p of cs) put(p[0], p[1], z1, 0, z1);
          for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; tri(s1 + k, s1 + k2, s1 + 4 + k2); tri(s1 + k, s1 + 4 + k2, s1 + 4 + k); }
          tri(s1 + 4, s1 + 5, s1 + 6); tri(s1 + 4, s1 + 6, s1 + 7);
        }
      }
      if (!wing && !flatIn) for (const r of regions) {
        let poly = ringO.slice();
        for (const [a, b, c] of r.cut) { poly = clipHalf(poly, a, b, c); if (poly.length < 3) break; }
        if (poly.length < 3) continue;
        const tris = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p[0], p[1])), []);
        words(r.flat ? 8 : re16, 0, r.flat ? 0 : ve16, 0, (r.flat ? 5 : 1) | style << 3, Bw);
        G.need(poly.length, tris.length * 3);
        const s0 = G.n;
        for (const p of poly) { const [aa, rr] = r.ar(p); put(p[0], p[1], r.z(p), aa, rr); }
        for (const t of tris) tri(s0 + t[0], s0 + t[1], s0 + t[2]);
      }
      // ---- domes, onions and spires sit on the eave as a turned profile ----
      const prof = PROFILES[type];
      if (prof && rh > 0) {
        const R0 = Math.sqrt(area * sx * sy / Math.PI), seg = 14, s0 = G.n;
        words(0, 0, 0, 0, 4 | style << 3, Bw);
        G.need(prof.length * seg, (prof.length - 1) * seg * 6);
        for (const [rr, zz] of prof) for (let k = 0; k < seg; k++) {
          const a = k / seg * Math.PI * 2; put(Math.cos(a) * R0 * rr, Math.sin(a) * R0 * rr, eave + zz * rh, a * R0, eave + zz * rh);
        }
        for (let q = 0; q < prof.length - 1; q++) for (let k = 0; k < seg; k++) {
          const a = s0 + q * seg + k, b = s0 + q * seg + (k + 1) % seg;
          tri(a, b, b + seg); tri(a, b + seg, a + seg);
        }
      }
      // ---- chimneys: a small rendered stack near the ridge of most pitched roofs ----
      if (pitched && !util && !church && !part && area > 35 && area < 1600 && rh > 1 && rand() < (style === 7 ? .3 : .78)) {
        const cnt = area > 260 && rand() < .5 ? 2 : 1;
        for (let c = 0; c < cnt; c++) {
          const vv = (rand() - .5) * Math.max(0, hl - 1.5) * 1.6, ww = (rand() < .5 ? -1 : 1) * hw * (.15 + .35 * rand());
          const cw = .55 + .3 * rand(), cd = .55 + .2 * rand(), pc = [c0[0] + ex[0] * vv + ey[0] * ww, c0[1] + ex[1] * vv + ey[1] * ww];
          if (!inPoly(pc, rm)) continue;
          const cs = [[-cw, -cd], [cw, -cd], [cw, cd], [-cw, cd]].map(([a, b]) => [pc[0] + (ex[0] * a + ey[0] * b) / 2, pc[1] + (ex[1] * a + ey[1] * b) / 2]);
          const zr = cs.map(roofZ), z0 = Math.min(...zr) - .3, z1 = Math.max(...zr) + (style === 5 ? .8 : 1.15);
          setC(rand() < .25 && style !== 5 ? [150, 78, 60] : wall, 0);
          words(0, 0, Math.round(z1 * 16), 0, 2 | style << 3, Bw);
          G.need(8, 30);
          const s0 = G.n;
          for (const p of cs) put(p[0], p[1], z0, 0, z0);
          for (const p of cs) put(p[0], p[1], z1, 0, z1);
          for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; tri(s0 + k, s0 + k2, s0 + 4 + k2); tri(s0 + k, s0 + 4 + k2, s0 + 4 + k); }
          tri(s0 + 4, s0 + 5, s0 + 6); tri(s0 + 4, s0 + 6, s0 + 7);
        }
      }
      // ---- dormers along the long slopes of big old-town roofs ----
      const dormerStyle = style >= 1 && style <= 4 || style === 0 && !skipSmall && floors >= 3 && area > 250 && rand() < .35;
      if (dormerStyle && (type === RT.GABLE || type === RT.HIP) && !util && !church && rh >= 3.6 && hl * 2 >= 8 && hw >= 4) {
        const mg = type === RT.HIP ? hw * .9 + .7 : 1.6, span = 2 * (hl - mg), sp = style === 4 ? 3.4 : 4.4;
        const k = Math.min(5, Math.floor(span / sp));
        for (const s of [1, -1]) for (let q = 0; q < k; q++) {
          if (rand() < .2) continue;
          const v = -span / 2 + (q + .5) * span / k, wf = hw - .9, zf = eave + rh * (.9 / hw), zde = zf + 1.45, zr = zde + .55;
          if (zr > eave + rh - .4) continue;
          const wAt = z => s * hw * (1 - (z - eave) / rh);
          const P2 = (vv, w) => [c0[0] + ex[0] * vv + ey[0] * w, c0[1] + ex[1] * vv + ey[1] * w];
          const probe = [P2(v - .8, s * (wf + .2)), P2(v + .8, s * (wf + .2)), P2(v, wAt(zr))];
          if (!probe.every(p => inPoly(p, rm) && Math.abs(roofZ(p) - (eave + rh * (1 - s * toW(p) / hw))) < .05)) continue;
          G.need(19, 27);
          // front: a pentagon with the window
          setC(wall, accent); words(Math.round(1.3 * 16), 0, Math.round(zf * 16), 0, 3 | style << 3, Bw);
          const fw = s * wf, f = [[v - .65, zf - .1], [v + .65, zf - .1], [v + .65, zde], [v, zr], [v - .65, zde]], s0 = G.n;
          for (const [vv, z] of f) { const p = P2(vv, fw); put(p[0], p[1], z, vv - v + .65, z); }
          tri(s0, s0 + 1, s0 + 2); tri(s0, s0 + 2, s0 + 3); tri(s0, s0 + 3, s0 + 4);
          // cheeks
          setC(roofCol.map(c => c * .8), 0); words(0, 0, 0, 0, 6 | style << 3, Bw);
          for (const sv of [-.65, .65]) {
            const a = P2(v + sv, fw), b = P2(v + sv, wAt(zde)), s1 = G.n;
            put(a[0], a[1], zf - .1, 0, 0); put(a[0], a[1], zde, 0, 0); put(b[0], b[1], zde, 0, 0); tri(s1, s1 + 1, s1 + 2);
          }
          // its own little gable roof
          setC(roofCol, snowK); words(Math.round(1.06 * 16), 0, 4095, 0, 1 | style << 3, Bw);
          for (const sv of [-.8, .8]) {
            const zl = zde - .1, zt = zr + .05;
            const q4 = [[v + sv, s * (wf + .2), zl], [v, s * (wf + .2), zt], [v, wAt(zt), zt], [v + sv, wAt(zl), zl]], s1 = G.n;
            for (const [vv, w, z] of q4) { const p = P2(vv, w); put(p[0], p[1], z, w * s, Math.abs(vv - v) * 1.33); }
            tri(s1, s1 + 1, s1 + 2); tri(s1, s1 + 2, s1 + 3);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry(), nv = G.n;
    g.setAttribute('position', new THREE.BufferAttribute(G.pos.slice(0, nv * 3), 3));
    g.setAttribute('aP', new THREE.BufferAttribute(G.ap.slice(0, nv * 2), 2));
    g.setAttribute('aF', new THREE.BufferAttribute(G.af.slice(0, nv * 4), 4));
    g.setAttribute('aC', new THREE.BufferAttribute(G.ac.slice(0, nv * 4), 4, true));
    g.setIndex(new THREE.BufferAttribute(G.idx.slice(0, G.ni), 1));
    const mat = bldgMat.clone();
    for (const key of Object.keys(uni)) mat.uniforms[key] = uni[key];
    mat.uniforms.uOrigin.value.copy(origin);
    const mesh = new THREE.Mesh(g, mat); mesh.position.copy(origin); mesh.frustumCulled = false;
    mesh.layers.enable(SHADOW_LAYER);
    return mesh;
  }

  // ---- sun shadows: the buildings' depth seen from the low winter sun, re-rendered only when the view moves on ----
  // The building shader reads it, and a draped receiver patch multiplies the shade onto the ground and the river.
  let srt = null, scam = null, sMesh = null, sHalf = 0, sOn = 0;
  const sCentre = new V3(), sM = new THREE.Matrix4(), BIAS = new THREE.Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
  const depthMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false });
  const RN = phone() ? 65 : 97, recvGeo = new THREE.BufferGeometry();
  recvGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RN * RN * 3), 3));
  { const ix = []; for (let j = 0; j < RN - 1; j++) for (let i = 0; i < RN - 1; i++) { const a = j * RN + i; ix.push(a, a + 1, a + RN, a + 1, a + RN + 1, a + RN); } recvGeo.setIndex(ix); }
  const recvMat = new THREE.ShaderMaterial({
    uniforms: { uShadowM: { value: new THREE.Matrix4() }, uShadow: { value: null }, uShadowOn: { value: 0 }, uShadowTexel: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    vertexShader: `uniform mat4 uShadowM; varying vec3 vS; void main(){ vS=(uShadowM*vec4(position, 1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position, 1.); }`,
    fragmentShader: SHADOW_GLSL + `void main(){ float k=1.-sunVis(.41); gl_FragColor=vec4(mix(vec3(1.), vec3(.70, .75, .87), k), 1.); }`,
  });
  const recv = new THREE.Mesh(recvGeo, recvMat); recv.frustumCulled = false; recv.visible = false; recv.renderOrder = 3;
  if (SHADOWS) scene.add(recv);
  const _p = new V3(), _q = new V3();
  function drape(T, half) {     // the receiver grid, in the local east/north plane round T, sat 2 m over the drawn terrain
    const up = T.clone().normalize(), east = new V3(up.z, 0, -up.x).normalize(), north = new V3().crossVectors(up, east);
    const P = recvGeo.attributes.position.array, la0 = Math.asin(up.y) / D2R, lo0 = Math.atan2(up.x, up.z) / D2R, o = llv(la0, lo0, meshKm(la0, lo0));
    for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
      _p.copy(T).addScaledVector(east, (i / (RN - 1) * 2 - 1) * half).addScaledVector(north, (j / (RN - 1) * 2 - 1) * half).normalize();
      const lat = Math.asin(_p.y) / D2R, lon = Math.atan2(_p.x, _p.z) / D2R;
      llv(lat, lon, meshKm(lat, lon) + .002, _q).sub(o); P.set([_q.x, _q.y, _q.z], (j * RN + i) * 3);
    }
    recvGeo.attributes.position.needsUpdate = true; recv.position.copy(o); recv.updateMatrixWorld();
  }
  function update(dt) {
    if (!SHADOWS) return;
    const mesh = ctx.state.packMesh, mine = mesh && mesh.material.uniforms && mesh.material.uniforms.uShadowM;
    const want = mine && mesh.visible && !ctx.city && cam.dist < 4.5 ? 1 : 0;
    sOn += (want - sOn) * Math.min(1, dt * 3);
    const on = mine && srt ? sOn * mesh.material.uniforms.uFade.value : 0;
    if (mine) mesh.material.uniforms.uShadowOn.value = on;
    recvMat.uniforms.uShadowOn.value = on;
    recv.visible = sOn > .01 && !!srt && !ctx.city;
    if (!want) return;
    const half = clamp(cam.dist * 1.35, .45, 3), T = cam.target;
    if (mesh === sMesh && T.distanceTo(sCentre) < half * .15 && Math.abs(half / sHalf - 1) < .3) return;
    if (!srt) {
      srt = new THREE.WebGLRenderTarget(SM, SM, { depthBuffer: true, stencilBuffer: false });
      srt.depthTexture = new THREE.DepthTexture(SM, SM, THREE.UnsignedIntType);
      srt.depthTexture.compareFunction = THREE.LessEqualCompare;
      srt.depthTexture.minFilter = srt.depthTexture.magFilter = THREE.LinearFilter;
      scam = new THREE.OrthographicCamera(-1, 1, 1, -1, .05, 12); scam.layers.set(SHADOW_LAYER);
    }
    sMesh = mesh; sCentre.copy(T); sHalf = half;
    scam.left = scam.bottom = -half; scam.right = scam.top = half; scam.updateProjectionMatrix();
    scam.position.copy(T).addScaledVector(uni.uRegionSun.value, 6); scam.up.copy(T).normalize(); scam.lookAt(T); scam.updateMatrixWorld();
    const prev = renderer.getRenderTarget(), ov = scene.overrideMaterial, fog = scene.fog;
    renderer.setRenderTarget(srt); renderer.clear(true, true, false);
    scene.overrideMaterial = depthMat; scene.fog = null; renderer.render(scene, scam);
    scene.overrideMaterial = ov; scene.fog = fog; renderer.setRenderTarget(prev);
    sM.copy(BIAS).multiply(scam.projectionMatrix).multiply(scam.matrixWorldInverse);
    const texel = half * 2000 / SM;
    for (const u of [mesh.material.uniforms, recvMat.uniforms]) { u.uShadow.value = srt.depthTexture; u.uShadowTexel.value = texel; }
    mesh.material.uniforms.uShadowM.value.copy(sM).multiply(mesh.matrixWorld);
    drape(T, half * .97);
    recvMat.uniforms.uShadowM.value.copy(sM).multiply(recv.matrixWorld);
  }
  function onCity(on) { if (on) recv.visible = false; }

  return { buildBuildings, update, onCity };
}
