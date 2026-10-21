import { describe,expect,it } from 'vitest';
import { signedDistance } from '../src/interaction/field';
import { PresenceField } from '../src/interaction/PresenceField';
import type { BodyInput } from '../src/interaction/BodyInput';
describe('真实轮廓交互场',()=>{
  it('距离变换按屏幕画幅计算横向尺度',()=>{
    const mask=new Uint8Array(25);mask[12]=255;
    const field=signedDistance(mask,5,5,2);
    expect(field[13]).toBeCloseTo(.4);expect(field[17]).toBeCloseTo(.2);
  });
  it('人体进入渐强，离开后旧轮廓与存在感缓慢释放',()=>{
    const field=new PresenceField(4,4);
    const body={coverage:.25,target:new Float32Array(16).fill(-.1),mask:new Uint8Array(16).fill(255),motion:new Float32Array(32),lastMaskTime:performance.now()} as BodyInput;
    field.update(body,true,1/60,1.8);expect(field.presence).toBeGreaterThan(0);expect(field.presence).toBeLessThan(.05);
    for(let i=0;i<120;i++)field.update(body,true,1/60,1.8);
    expect(field.data[0]).toBeLessThan(0);expect(field.presence).toBeGreaterThan(.8);
    field.update(body,false,1/60,1.8);expect(field.data[0]).toBeLessThan(0);expect(field.presence).toBeGreaterThan(.8);
    for(let i=0;i<360;i++)field.update(body,false,1/60,1.8);
    expect(field.presence).toBeLessThan(.05);expect(field.data[0]).toBeGreaterThan(0);field.texture.dispose();
  });
  it('无人时场保持有限值，不产生伪人体或残留运动',()=>{
    const field=new PresenceField(4,4);
    const body={coverage:0,target:new Float32Array(16).fill(2),mask:new Uint8Array(16),motion:new Float32Array(32),lastMaskTime:0} as BodyInput;
    for(let i=0;i<60;i++)field.update(body,false,1/60,1.8);
    expect(field.presence).toBe(0);expect(field.data[0]).toBe(2);expect([...field.data].every(Number.isFinite)).toBe(true);field.texture.dispose();
  });
});
