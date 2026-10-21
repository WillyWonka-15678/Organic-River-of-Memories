// Explicit debug fixture, never substituted for camera segmentation.
export function demoSilhouette(width: number, height: number, phase: number) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const shift = Math.sin(phase * .24) * .05;
  ctx.scale(width, height); ctx.translate(shift, 0); ctx.fillStyle = '#fff';
  ctx.beginPath();
  const outline = [[.44,.24],[.47,.20],[.52,.21],[.55,.25],[.55,.31],[.53,.35],[.58,.39],[.63,.43],[.67,.34],[.70,.24],[.73,.22],[.75,.25],[.74,.32],[.71,.45],[.66,.54],[.61,.52],[.59,.74],[.61,.97],[.40,.97],[.42,.73],[.40,.52],[.35,.61],[.31,.58],[.33,.54],[.38,.42],[.44,.37],[.45,.34],[.43,.29]];
  outline.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill();
  const pixels = ctx.getImageData(0,0,width,height).data, mask = new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)mask[(height-1-y)*width+x]=pixels[(y*width+x)*4+3]>127?255:0;
  return mask;
}
