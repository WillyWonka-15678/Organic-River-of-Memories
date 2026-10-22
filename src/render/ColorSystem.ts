import * as THREE from 'three';
import type { RiverConfig } from '../config';
import type { BodyWake } from '../interaction/BodyWake';

export const palettes={
  original:{primary:'#43b6aa',secondary:'#43b6aa',pink:'#e5b979',gold:'#e5b979',ice:'#d4fff7',iridescent:0},
  tealViolet:{primary:'#65D5C8',secondary:'#9878CD',pink:'#CBAFC7',gold:'#E5BB81',ice:'#C2ECF0',iridescent:0},
  iridescent:{primary:'#79C9C2',secondary:'#969CC9',pink:'#D2B5C7',gold:'#DCC49E',ice:'#D3E5E9',iridescent:1},
};
export type PaletteName=keyof typeof palettes;
const smooth=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function wakeColorEnvelope(age:number,life:number){
  const f=age/Math.max(.01,life);
  return {activity:smooth(age/1.1)*(1-smooth((f-.45)/.55)),gold:smooth((f-.15)/.15)*(1-smooth((f-.48)/.32))};
}
export class ColorSystem {
  readonly uniforms={
    uPaletteMix:{value:0},uPrimary:{value:new THREE.Color()},uSecondary:{value:new THREE.Color()},
    uPink:{value:new THREE.Color()},uGold:{value:new THREE.Color()},uIce:{value:new THREE.Color()},
    uAuxRatio:{value:.2},uSaturation:{value:1},uColorPhase:{value:0},uInteractionColor:{value:.65},uIridescent:{value:0},
    uColorWakes:{value:Array.from({length:6},()=>new THREE.Vector4())},uColorMaturity:{value:Array(6).fill(0) as number[]},
  };
  private first=true;
  private targets=Array.from({length:5},()=>new THREE.Color());
  private elapsed=0;
  private currentBloom=.28;
  get bloom(){return this.currentBloom;}
  update(c:RiverConfig,dt:number,wake:BodyWake,snap=false){
    const preset=palettes[c.palette as PaletteName]??palettes.original;
    const blend=this.first||snap?1:1-Math.exp(-dt/1.2);this.first=false;
    const names=['uPrimary','uSecondary','uPink','uGold','uIce'] as const;
    const values=[preset.primary,preset.secondary,preset.pink,preset.gold,preset.ice];
    names.forEach((key,i)=>this.uniforms[key].value.lerp(this.targets[i].set(values[i]),blend));
    const targetMix=c.palette==='original'?0:1;
    this.uniforms.uPaletteMix.value+=(targetMix-this.uniforms.uPaletteMix.value)*blend;
    this.uniforms.uIridescent.value+=(preset.iridescent-this.uniforms.uIridescent.value)*blend;
    this.uniforms.uAuxRatio.value+=(c.secondaryRatio-this.uniforms.uAuxRatio.value)*blend;
    this.uniforms.uSaturation.value+=(c.saturation-this.uniforms.uSaturation.value)*blend;
    this.uniforms.uInteractionColor.value+=(c.interactionColor-this.uniforms.uInteractionColor.value)*blend;
    // Integrate the colour clock: changing its speed never jumps the phase.
    this.elapsed+=dt*c.colorSpeed;this.uniforms.uColorPhase.value=this.elapsed;
    this.currentBloom+=(c.bloom*(1-this.uniforms.uPaletteMix.value*.15)-this.currentBloom)*blend;
    for(let i=0;i<6;i++){
      const w=wake.wakes[i];if(!w){this.uniforms.uColorWakes.value[i].set(0,0,0,0);this.uniforms.uColorMaturity.value[i]=0;continue;}
      const e=wakeColorEnvelope(w.age,w.life);
      this.uniforms.uColorWakes.value[i].set(w.x,w.y,Math.min(.2,w.radius*(1+w.expansion*w.age)),e.activity*Math.min(1,w.strength/.1));
      this.uniforms.uColorMaturity.value[i]=e.gold;
    }
  }
}
export const paletteGLSL=/*glsl*/`
uniform float uPaletteMix,uAuxRatio,uSaturation,uColorPhase,uInteractionColor,uIridescent;
uniform vec3 uPrimary,uSecondary,uPink,uGold,uIce;
uniform vec4 uColorWakes[6];uniform float uColorMaturity[6];
vec2 wakeTint(vec2 p,float aspect){
  float activity=0.,gold=0.;
  for(int i=0;i<6;i++){
    vec4 w=uColorWakes[i];if(w.z<=0.)continue;
    vec2 r=(p-w.xy)*vec2(aspect,1.)/w.z;
    float a=exp(-dot(r,r)*1.5)*w.w;
    activity+=a;gold+=a*uColorMaturity[i];
  }
  return vec2(1.-exp(-activity),1.-exp(-gold));
}
vec3 riverPalette(vec3 original,vec2 p,float aspect,float eligibility,float warm,float white,float detail){
  if(uPaletteMix<.00001){
    float gray=dot(original,vec3(.2126,.7152,.0722));
    return max(vec3(0.),mix(vec3(gray),original,uSaturation));
  }
  vec2 wake=wakeTint(p,aspect)*uInteractionColor;
  float travel=.5+.5*sin(p.x*6.5-p.y*1.6-uColorPhase*.16);
  float violet=clamp(uAuxRatio*3.2*eligibility*smoothstep(.12,.93,travel)+wake.x*.78,0.,.78);
  // A broad cyan/violet linear blend becomes pale blue. Keep violet local,
  // but let its core approach the actual pigment rather than adding global saturation.
  violet=mix(.96*smoothstep(.10,.50,violet),violet,uIridescent);
  vec3 secondary=mix(uSecondary,uPink,uIridescent*(.18+.22*sin(p.x*4.2+p.y*2.5-uColorPhase*.09)));
  vec3 c=mix(uPrimary,secondary,violet);
  // Gold remains sparse, especially near mature wake cores.
  float gold=clamp(warm+wake.y*detail*.45,0.,1.);
  c=mix(c,uGold,gold);
  float pigment=violet*(1.-uIridescent)*(1.-gold);
  c=mix(c,uIce,clamp(white,0.,.7)*(1.-pigment*.85));
  // Lower violet radiance before HDR accumulation: bright crossings otherwise
  // compress its RGB channels toward white in the existing display curve.
  c*=1.-pigment*.28;
  // New pigments do not raise the established layer's luminance budget.
  vec3 lum=vec3(.2126,.7152,.0722);
  c*=min(1.,dot(original,lum)/max(.0001,dot(c,lum)));
  c=mix(original,c,uPaletteMix);
  float gray=dot(c,lum);c=max(vec3(0.),mix(vec3(gray),c,uSaturation));
  return c;
}`;
