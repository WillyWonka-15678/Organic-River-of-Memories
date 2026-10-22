// One source for CPU wake advection and the existing GPU river/silk/memory paths.
const curves=[
  [.49,.19,5.8,-.7,.037,.046,11.2,0,.063],
  [.44,.22,4.4,2.7,-.028,.035,9.5,-1,.04],
  [.59,.16,6.5,1.8,.024,.05,10.8,0,.052],
  [.30,.16,5.1,-1.6,.031,0,0,0,0],
];
export function riverSpine(x:number,g:number,t:number){
  const [o,a,k,p,s,b,j,q,v]=curves[g];
  return o+a*Math.sin(x*k+p+t*s)+b*Math.sin(x*j+q+t*v);
}
export const spineGLSL=`float spine(float x,float g,float t){\n${curves.map((values,g)=>{
  const [o,a,k,p,s,b,j,q,v]=values.map(n=>n.toFixed(6));
  return `${g<3?`if(g<${(g+.5).toFixed(1)}) `:''}return ${o}+${a}*sin(x*${k}+(${p})+t*(${s}))+${b}*sin(x*${j}+(${q})+t*(${v}));`;
}).join('\n')}\n}`;
