import * as THREE from 'three';
import { flowFunctions } from './organicShaders';

const vertex = /* glsl */ `
uniform float uTime,uAspect,uBreathing,uPresence;
uniform sampler2D uField;
varying float vQ,vGroup,vX,vLayer;
${flowFunctions}
void main(){
  float x=position.x,q=position.y,g=floor(position.z),layer=fract(position.z)*4.;
  float swell=.5+.5*sin(x*8.2+g*2.7-uTime*.055);
  float width=(.022+.055*swell*swell)*(g>2.5?.65:1.)*uBreathing;
  float fold=.012*sin(q*7.5+x*8.-uTime*.07+g*1.7+layer);
  float y=spine(x,g,uTime)+q*width+fold+.012*layer*sin(x*7.+g+uTime*.02);
  vec2 p=vec2(x,y);
  vec2 e=vec2(.015,0.);
  float d=texture2D(uField,clamp(p,0.,1.)).r;
  vec2 n=vec2((texture2D(uField,p+e).r-texture2D(uField,p-e).r)/uAspect,texture2D(uField,p+e.yx).r-texture2D(uField,p-e.yx).r);
  n/=max(length(n),.05);
  // Thin membranes feel the boundary rather than being projected onto it.
  // Projection of an entire sheet produces sharp folds at the mask's medial axis.
  float feeling=exp(-abs(d)/.055)*uPresence;
  p+=(n*.018+texture2D(uField,clamp(p,0.,1.)).gb*.025)*feeling/vec2(uAspect,1.);
  vQ=q;vGroup=g;vX=x;vLayer=layer;
  gl_Position=vec4(p*2.-1.,0.,1.);
}`;
const fragment = /* glsl */ `
uniform float uTime,uSilk;
uniform vec3 uColor,uAccent;
varying float vQ,vGroup,vX,vLayer;
void main(){
  float edge=pow(max(0.,1.-vQ*vQ),1.4);
  float threads=pow(.5+.5*sin(vQ*75.+sin(vX*10.+vGroup)*4.+uTime*.09),18.);
  float crease=pow(.5+.5*cos(vQ*10.+vX*8.-uTime*.07+vGroup*1.7+vLayer),12.);
  float patches=.55+.45*sin(vX*13.-uTime*.18+vQ*6.+vGroup);
  float alpha=(.004+threads*.025+crease*.065)*edge*patches*uSilk;
  float warm=(vGroup>2.5?1.:0.)*.86;
  warm=max(warm,step(.5,vLayer)*step(vGroup,.5)*smoothstep(.25,.85,vX)*.45);
  vec3 c=mix(uColor,uAccent,warm);
  c=mix(c,vec3(.65,.89,.85),crease*.20);
  gl_FragColor=vec4(c,alpha);
}`;
export class SilkLayers {
  mesh: THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  constructor(field: THREE.DataTexture) {
    const vertices: number[] = [], indices: number[] = [];
    const nx=220,ny=40;
    for(let g=0;g<4;g++)for(let layer=0;layer<2;layer++){
      const base=vertices.length/3;
      for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)vertices.push(-.08+i/nx*1.16,j/ny*2.-1.,g+layer*.25);
      for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
        const a=base+j*(nx+1)+i,b=a+nx+1;indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);
    const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,
      uniforms:{uTime:{value:0},uAspect:{value:1},uBreathing:{value:1},uPresence:{value:0},uField:{value:field},uSilk:{value:.65},uColor:{value:new THREE.Color()},uAccent:{value:new THREE.Color()}},
      transparent:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
    this.mesh=new THREE.Mesh(geometry,material);this.mesh.frustumCulled=false;this.mesh.renderOrder=-1;
  }
  update(time:number,aspect:number,breathing:number,presence:number,silk:number,color:string,accent:string){
    const u=this.mesh.material.uniforms;u.uTime.value=time;u.uAspect.value=aspect;u.uBreathing.value=breathing;u.uPresence.value=presence;u.uSilk.value=silk;
    u.uColor.value.set(color);u.uAccent.value.set(accent);
  }
  dispose(){this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
