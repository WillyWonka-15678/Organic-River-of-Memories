import { describe, it, expect } from 'vitest';
import { signedDistance, easingAlpha } from '../src/interaction/field';
describe('人体有符号距离场', () => {
  it('轮廓内为负，轮廓外为正，内部有向外的梯度', () => {
    const w = 11, h = 11, mask = new Uint8Array(w * h);
    for (let y = 3; y <= 7; y++) for (let x = 3; x <= 7; x++) mask[y * w + x] = 255;
    const field = signedDistance(mask, w, h);
    expect(field[5 * w + 5]).toBeLessThan(0);
    expect(field[5 * w + 8]).toBeGreaterThan(0);
    expect(field[5 * w + 7]).toBeGreaterThan(field[5 * w + 6]);
    expect(field[5 * w + 3]).toBeCloseTo(field[5 * w + 7]);
  });
  it('无人和满屏轮廓不会产生 NaN 或无限值', () => {
    for (const value of [0, 255]) {
      const field = signedDistance(new Uint8Array(16).fill(value), 4, 4);
      expect([...field].every(Number.isFinite)).toBe(true);
      expect(field[0]).toBe(value === 0 ? 2 : -2);
    }
  });
  it('恢复时间对帧率独立，离开后平滑回到无人状态', () => {
    const simulate = (fps: number) => {
      let d = -.1;
      for (let i = 0; i < fps; i++) d += (2 - d) * easingAlpha(1 / fps, .65);
      return d;
    };
    expect(simulate(30)).toBeCloseTo(simulate(120), 6);
    expect(simulate(60)).toBeGreaterThan(1.5);
    expect(simulate(60)).toBeLessThan(2);
  });
});
