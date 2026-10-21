export const simulation = /* glsl */ `
uniform float uTime, uDt, uSpeed, uNoise, uWaveAmplitude, uWaveLength, uWaveSpeed, uAspect;
uniform sampler2D uField, uSeeds;
void main(){
  vec2 uv=gl_FragCoord.xy/resolution.xy;
  vec4 state=texture2D(texturePosition,uv);
  float lane=texture2D(uSeeds,uv).y;
  // x always advances. Only x wraps; y cannot jump to the opposite screen edge.
  float rawX=state.x+uSpeed*uDt/uAspect;
  float x=fract(rawX);
  float phase=6.2831853*(x/max(.6,uWaveLength)-uTime*uWaveSpeed)+lane*.55;
  float edge=smoothstep(0.,.08,lane)*(1.-smoothstep(.92,1.,lane));
  float wave=(sin(phase)+.16*sin(phase*1.65+lane*.35))*uWaveAmplitude;
  wave+=sin(x*8.+lane*4.-uTime*.18)*uNoise*.004;
  float base=lane+wave*edge;
  float offset=texture2D(uField,vec2(x,clamp(base,0.,1.))).g;
  float targetY=clamp(base+offset,.012,.988);
  // Rejoin the original lane downstream; vertical force cannot accumulate.
  float y=mix(state.y,targetY,1.-exp(-uDt*8.));
  if(rawX>=1.) y=targetY;
  gl_FragColor=vec4(x,y,1.,(y-state.y)/max(uDt,.001));
}`;
export const particleVertex = /* glsl */ `
uniform sampler2D uPositions;
uniform float uSize, uPixelRatio;
attribute vec2 reference;
varying float vSeed, vSpeed;
void main(){
  vec4 p=texture2D(uPositions,reference);
  vSeed=fract(sin(dot(reference,vec2(12.9898,78.233)))*43758.5453);
  vSpeed=length(p.zw);
  gl_Position=vec4(p.xy*2.-1.,0.,1.);
  gl_PointSize=uSize*uPixelRatio*(.6+vSeed*.8);
}`;
export const particleFragment = /* glsl */ `
uniform vec3 uColor,uAccent;
varying float vSeed,vSpeed;
void main(){
  float r=length(gl_PointCoord-.5)*2.;
  if(r>1.) discard;
  float glow=exp(-r*r*4.)*(1.-smoothstep(.65,1.,r));
  vec3 color=mix(uColor,uAccent,smoothstep(.72,1.,vSeed));
  gl_FragColor=vec4(color,glow*(.18+vSeed*.28));
}`;
export const fullscreenVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export const fadeFragment = `uniform sampler2D uPrevious;uniform float uDecay;varying vec2 vUv;void main(){vec3 c=texture2D(uPrevious,vUv).rgb*uDecay;gl_FragColor=vec4(max(c-vec3(.0003),vec3(0.)),1.);}`;
export const displayFragment = `uniform sampler2D uPrevious;varying vec2 vUv;void main(){vec3 c=texture2D(uPrevious,vUv).rgb;float vignette=1.-.32*length((vUv-.5)*vec2(1.,.8));vec3 bg=vec3(.010,.025,.037);gl_FragColor=vec4((bg+1.-exp(-c*1.3))*vignette,1.);}`;
