// Shared flow coordinates will also drive memory typography and silk filaments.
export const flowFunctions = /* glsl */ `
float hash(float n){return fract(sin(n*127.1)*43758.5453);}
float groupFor(float s){return s<.32?0.:s<.58?1.:s<.79?2.:3.;}
float normalSeed(vec4 s){return clamp(sqrt(-2.*log(max(.001,s.y)))*cos(s.a*6.283),-2.7,2.7);}
float spine(float x,float g,float t){
  float y=.5;
  if(g<.5) y=.49+.19*sin(x*5.8-.7+t*.037)+.046*sin(x*11.2+t*.063);
  else if(g<1.5) y=.44+.22*sin(x*4.4+2.7-t*.028)+.035*sin(x*9.5-1.+t*.04);
  else if(g<2.5) y=.59+.16*sin(x*6.5+1.8+t*.024)+.05*sin(x*10.8+t*.052);
  else y=.30+.16*sin(x*5.1-1.6+t*.031);
  return y;
}
float streamY(float x,vec4 seed,float t,float breathing){
  float g=groupFor(seed.b),q=normalSeed(seed);
  float swell=.5+.5*sin(x*8.2+g*2.7-t*.055);
  float width=(.010+.043*swell*swell)*(g>2.5?.55:1.);
  float fold=q+.23*sin(q*5.+x*7.4-g*2.+t*.11);
  return spine(x,g,t)+fold*width*breathing+.008*sin(x*19.+q*4.+t*.12);
}
vec2 ambient(vec2 p,float t){
  return vec2(sin(p.y*8.3+p.x*3.-t*.13)+.35*cos(p.y*19.+t*.07),cos(p.x*7.1-p.y*3.+t*.11)+.35*sin(p.x*17.-t*.09));
}`;

export const simulation = /* glsl */ `
uniform float uTime,uDt,uSpeed,uNoise,uAspect,uBreathing,uInit,uStage,uPresence,uRepulsion,uRadius;
uniform sampler2D uSeeds,uField;
uniform vec2 uFieldSize;
uniform vec4 uWrists[2];
uniform float uHandForce;
${flowFunctions}
void main(){
  vec2 uv=gl_FragCoord.xy/resolution.xy;
  vec4 s=texture2D(uSeeds,uv),state=texture2D(texturePosition,uv);
  bool dust=s.b>.96;
  float x=state.x;
  float target=streamY(x,s,uTime,uBreathing);
  vec2 p=state.xy;
  if(uInit>.5)p=vec2(s.x,dust?s.y:streamY(s.x,s,uTime,uBreathing));
  vec2 desired=vec2(uSpeed*(.72+.42*s.a),0.);
  float eps=.003;
  float slope=(streamY(x+eps,s,uTime,uBreathing)-streamY(x-eps,s,uTime,uBreathing))/(2.*eps*uAspect);
  desired.y=slope*desired.x;
  desired+=ambient(p,uTime)*uNoise*(dust?.025:.007);
  if(dust){desired=vec2(uSpeed*.25,sin(p.x*8.+s.a*9.+uTime*.14)*.005)+ambient(p,uTime)*.003;}
  else desired.y+=clamp((target-p.y)*.85,-.11,.11);
  // Small local eddies are off-centre and slowly migrate with the river.
  vec2 centre=vec2(.63+.08*sin(uTime*.031),.47+.08*cos(uTime*.043));
  vec2 r=(p-centre)*vec2(uAspect,1.);
  float vortex=exp(-dot(r,r)/.038)*(dust?.12:.025)*uNoise;
  desired+=vec2(-r.y,r.x)*vortex*7.;
  if(uStage>=2.&&uPresence>.001){
    vec2 stepUV=1./uFieldSize;
    float d=texture2D(uField,clamp(p,0.,1.)).r;
    vec2 grad=vec2(
      texture2D(uField,p+vec2(stepUV.x,0.)).r-texture2D(uField,p-vec2(stepUV.x,0.)).r,
      texture2D(uField,p+vec2(0.,stepUV.y)).r-texture2D(uField,p-vec2(0.,stepUV.y)).r);
    grad/=vec2(stepUV.x*uAspect,stepUV.y);
    vec2 n=grad/max(.0001,length(grad));
    float near=exp(-max(d,0.)/uRadius)*uPresence;
    vec2 tangent=vec2(-n.y,n.x);
    tangent*=dot(tangent,desired)<0.?-1.:1.;
    vec2 along=tangent*max(length(desired),uSpeed*.7)+n*(.018+max(-d,0.)*.35);
    desired=mix(desired,along,clamp(near*uRepulsion*.85,0.,.94));
    vec2 motion=texture2D(uField,clamp(p,0.,1.)).gb;
    float moving=length(motion);
    desired+=(motion*.28+tangent*moving*.36)*near;
    // A subset circulates near the true contour while a stationary viewer remains.
    float halo=exp(-abs(d-.026)/.027)*uPresence;
    desired+=(-n*(d-.026)*.8+tangent*.018)*halo*step(.55,s.a);
  }
  // Local hand attractors share the exact tracked screen coordinates with the stars.
  for(int hand=0;hand<2;hand++){
    vec4 wrist=uWrists[hand];vec2 r=(p-wrist.xy)*vec2(uAspect,1.);
    float influence=exp(-dot(r,r)/.014)*wrist.z*uHandForce;
    float direction=hand==0?1.:-1.;
    desired+=(-r*.35+vec2(-r.y,r.x)*direction*(.5+wrist.w))*influence;
  }
  vec2 v=mix(state.zw,desired,1.-exp(-uDt*2.2));
  p+=v*uDt/vec2(uAspect,1.);
  float life=24.+s.a*30.;
  bool reborn=floor((uTime+s.x*life)/life)!=floor((uTime-uDt+s.x*life)/life);
  if(uInit>.5){p=vec2(s.x, dust?s.y:streamY(s.x,s,uTime,uBreathing));v=desired;}
  else if(p.x>1.08||p.x<-.08||p.y>1.12||p.y<-.12||reborn){
    p.x=dust?s.x:-.04-hash(s.a*33.)*.06;
    p.y=dust?s.y:streamY(p.x,s,uTime,uBreathing);v=desired;
  }
  gl_FragColor=vec4(p,v);
}`;

export const particleVertex = /* glsl */ `
uniform sampler2D uPositions,uSeeds,uField;
uniform float uSize,uPixelRatio,uTime,uStage,uPresence;
attribute vec2 reference;
varying float vSeed,vAlpha,vWarm,vWhite,vShape;
void main(){
  vec4 p=texture2D(uPositions,reference),s=texture2D(uSeeds,reference);
  vSeed=s.a;
  float life=24.+s.a*30.;
  float age=fract((uTime+s.x*life)/life);
  float fade=smoothstep(0.,.055,age)*(1.-smoothstep(.88,1.,age));
  float depth=.35+.65*s.y;
  float breathe=.76+.24*sin(uTime*.19+s.x*12.+s.b*9.);
  vAlpha=fade*breathe*depth*(s.b>.96?.065:.32);
  vWarm=smoothstep(.92,.985,fract(s.a*7.13+s.b*.41));
  vWhite=step(.996,s.y)*.65;
  vShape=step(.999,s.b);
  vAlpha=mix(vAlpha,fade*breathe*.55,vShape);
  vWarm=max(vWarm,vShape*step(.35,s.a));
  float distanceToBody=texture2D(uField,clamp(p.xy,0.,1.)).r;
  float halo=exp(-abs(distanceToBody-.025)/.025)*uPresence*step(2.5,uStage);
  vAlpha+=halo*.13*(.4+s.a*.6);
  vWarm=max(vWarm,halo*.5*step(.65,s.a));
  gl_Position=vec4(p.xy*2.-1.,0.,1.);
  gl_PointSize=uSize*uPixelRatio*(s.b>.96?(.7+s.a*1.2):(.64+s.a*.95));
  gl_PointSize+=vShape*uPixelRatio*(1.5+s.a*2.);
}`;
export const particleFragment = /* glsl */ `
uniform vec3 uColor,uAccent;
varying float vSeed,vAlpha,vWarm,vWhite,vShape;
void main(){
  vec2 p=(gl_PointCoord-.5)*2.;float r=length(p);
  if(r>1.)discard;
  float core=exp(-r*r*5.2)*(1.-smoothstep(.6,1.,r));
  float shard=exp(-(abs(p.x)*1.8+abs(p.y)*.8)*4.);
  core=mix(core,shard,vShape);
  vec3 c=mix(uColor,uAccent,vWarm);c=mix(c,vec3(.83,1.,.97),vWhite);
  gl_FragColor=vec4(c,core*vAlpha);
}`;
export const fullscreenVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export const fadeFragment = `uniform sampler2D uPrevious;uniform float uDecay;varying vec2 vUv;void main(){vec3 c=texture2D(uPrevious,vUv).rgb*uDecay;gl_FragColor=vec4(max(c-vec3(.00007),vec3(0.)),1.);}`;
export const highlightFragment = `uniform sampler2D uPrevious;varying vec2 vUv;void main(){vec3 c=texture2D(uPrevious,vUv).rgb;gl_FragColor=vec4(max(c-vec3(.18),vec3(0.)),1.);}`;
export const blurFragment = `uniform sampler2D uPrevious;uniform vec2 uDirection;varying vec2 vUv;void main(){vec3 c=texture2D(uPrevious,vUv).rgb*.28;for(int i=1;i<=3;i++){float w=i==1?.22:i==2?.10:.04;c+=(texture2D(uPrevious,vUv+uDirection*float(i)).rgb+texture2D(uPrevious,vUv-uDirection*float(i)).rgb)*w;}gl_FragColor=vec4(c,1.);}`;
export const displayFragment = `uniform sampler2D uPrevious,uGlow;uniform float uExposure,uBloom;varying vec2 vUv;void main(){vec3 c=texture2D(uPrevious,vUv).rgb+texture2D(uGlow,vUv).rgb*uBloom;float vignette=1.-.43*length((vUv-.5)*vec2(1.,.85));vec3 bg=vec3(.0004,.001,.002);gl_FragColor=vec4((bg+1.-exp(-c*uExposure))*vignette,1.);
#include <colorspace_fragment>
}`;
