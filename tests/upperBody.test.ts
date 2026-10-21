import { describe, it, expect } from 'vitest';
import { estimateUpperBodies, upperBodyOffset, type UpperBody } from '../src/interaction/upperBody';
const body: UpperBody = { x: .5, headY: .72, chestY: .48, headRx: .06, headRy: .08, chestRx: .13, chestRy: .15 };
describe('平顺头胸避让', () => {
  it('头胸上侧向上、下侧向下，远离人体和无人时偏移为零', () => {
    expect(upperBodyOffset(.5, .7, [body], 16 / 9, .08, 1)).toBeGreaterThan(0);
    expect(upperBodyOffset(.5, .4, [body], 16 / 9, .08, 1)).toBeLessThan(0);
    expect(upperBodyOffset(.1, .5, [body], 16 / 9, .08, 1)).toBe(0);
    expect(upperBodyOffset(.5, .5, [], 16 / 9, .08, 1)).toBe(0);
    expect(upperBodyOffset(.5, .7, [body], 16 / 9, .08, 0)).toBe(0);
  });
  it('最大强度时流动层顺序保持不变，偏移不越出屏幕', () => {
    let previous = -Infinity;
    for (let y = .01; y < 1; y += .005) {
      const shifted = y + upperBodyOffset(.5, y, [body], 16 / 9, .08, 1.5);
      expect(shifted).toBeGreaterThanOrEqual(previous);
      expect(shifted).toBeGreaterThan(0); expect(shifted).toBeLessThan(1);
      previous = shifted;
    }
  });
  it('分割轮廓估计出头胸区域，并过滤孤立噪点', () => {
    const width = 100, height = 100, mask = new Uint8Array(width * height);
    for (let y = 5; y < 55; y++) for (let x = 37; x < 63; x++) mask[y * width + x] = 255;
    for (let y = 55; y < 80; y++) for (let x = 43; x < 57; x++) mask[y * width + x] = 255;
    mask[0] = 255;
    const bodies = estimateUpperBodies(mask, width, height);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].x).toBeCloseTo(.5, 1);
    expect(bodies[0].headY).toBeGreaterThan(bodies[0].chestY);
    expect(estimateUpperBodies(new Uint8Array(100), 10, 10)).toEqual([]);
  });
});
