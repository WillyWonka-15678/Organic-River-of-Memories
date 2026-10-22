import {describe,it,expect} from 'vitest';
import {ColorSystem,wakeColorEnvelope,palettes} from '../src/render/ColorSystem';
import {BodyWake} from '../src/interaction/BodyWake';
import {config} from '../src/config';

describe('visual palette transitions',()=>{
  it('starts in Teal & Violet and retains Original on explicit selection',()=>{
    const c=new ColorSystem();c.update({...config},1/60,new BodyWake());
    expect(config.palette).toBe('tealViolet');expect(c.uniforms.uPaletteMix.value).toBe(1);
    c.update({...config,palette:'original'},0,new BodyWake(),true);
    expect(c.uniforms.uPaletteMix.value).toBe(0);expect(c.bloom).toBe(.28);
    expect(palettes.tealViolet.primary).toBe('#65D5C8');expect(palettes.tealViolet.secondary).toBe('#9878CD');
  });
  it('smoothly switches pigments without touching river or wake dynamics',()=>{
    const c=new ColorSystem(),w=new BodyWake(),settings={...config,palette:'original'};c.update(settings,0,w);
    const before=JSON.stringify(w.wakes);settings.palette='tealViolet';c.update(settings,1/60,w);
    expect(c.uniforms.uPaletteMix.value).toBeGreaterThan(0);expect(c.uniforms.uPaletteMix.value).toBeLessThan(.03);
    for(let i=0;i<360;i++)c.update(settings,1/60,w);
    expect(c.uniforms.uPaletteMix.value).toBeGreaterThan(.99);
    expect(JSON.stringify(w.wakes)).toBe(before);expect(settings.speed).toBe(config.speed);
    settings.palette='original';for(let i=0;i<600;i++)c.update(settings,1/60,w);
    expect(c.uniforms.uPaletteMix.value).toBeLessThan(.001);
  });
  it('integrates colour speed without phase jumps and matches across frame rates',()=>{
    const run=(fps:number)=>{const c=new ColorSystem(),w=new BodyWake();for(let i=0;i<fps*3;i++)c.update({...config,colorSpeed:.5},1/fps,w);return c;};
    const a=run(30),b=run(120);expect(a.uniforms.uColorPhase.value).toBeCloseTo(b.uniforms.uColorPhase.value,6);
    const phase=a.uniforms.uColorPhase.value;a.update({...config,colorSpeed:2},0,new BodyWake());expect(a.uniforms.uColorPhase.value).toBe(phase);
  });
  it('couples violet and sparse gold to formation, maturity and dissipation',()=>{
    expect(wakeColorEnvelope(0,10)).toEqual({activity:0,gold:0});
    expect(wakeColorEnvelope(3.5,10).activity).toBe(1);expect(wakeColorEnvelope(3.5,10).gold).toBe(1);
    expect(wakeColorEnvelope(9.9,10).activity).toBeLessThan(.01);expect(wakeColorEnvelope(9.9,10).gold).toBe(0);
    expect(wakeColorEnvelope(10,10)).toEqual({activity:0,gold:0});
  });
});
