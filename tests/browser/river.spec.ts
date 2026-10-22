import { test, expect } from '@playwright/test';
test('GPU 渲染、调试面板、粒子重建与窗口变化', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?camera=off');
  await expect.poll(() => page.evaluate(() => (window as any).__river?.frames ?? 0), { timeout: 45000 }).toBeGreaterThan(10);
  await expect(page.locator('#metrics')).toContainText('65,536');
  // Read actual framebuffer pixels; a running animation counter alone cannot prove rendering.
  const lit = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const gl = canvas.getContext('webgl2')!;
    const pixels = new Uint8Array(64 * 64 * 4);
    return new Promise<number>(resolve => requestAnimationFrame(() => {
      gl.readPixels(800, 400, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let bright = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > 25) bright++;
      resolve(bright);
    }));
  });
  expect(lit).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/river-1080p.png' });
  await page.keyboard.press('d');
  await expect(page.getByRole('combobox', { name: '粒子数量' })).toBeVisible();
  await page.getByRole('checkbox', { name: '演示人体排斥' }).check();
  const demoStart = await page.evaluate(() => (window as any).__river.frames);
  await expect.poll(() => page.evaluate(() => (window as any).__river.frames), { timeout: 15000 }).toBeGreaterThan(demoStart + 90);
  await page.keyboard.press('d');
  await page.screenshot({ path: 'test-results/river-upper-body.png' });
  await page.keyboard.press('d');
  await page.getByRole('combobox', { name: '粒子数量' }).selectOption({ label: '16,384' });
  await expect.poll(() => page.evaluate(() => (window as any).__river.particleCount)).toBe(16384);
  await page.locator('#river').click({ position: { x: 15, y: 600 } });
  await page.keyboard.press('h'); await expect(page.locator('#intro')).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => page.locator('#river').evaluate((c: HTMLCanvasElement) => c.width)).toBe(1280);
  expect(errors).toEqual([]);
});
test('摄像头拒绝后保留可运行的演示并提供重试', async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; });
  await page.goto('/');
  await page.getByRole('button', { name: '开启摄像头' }).click();
  await expect(page.locator('#status')).toContainText('摄像头不可用', { timeout: 15000 });
  await expect(page.locator('#camera')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).__river?.frames ?? 0)).toBeGreaterThan(10);
});
test('真实 MediaPipe Worker 用模拟摄像头完成推理且能关闭恢复', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => {
    const text = await page.locator('#status').textContent();
    if (text?.includes('摄像头不可用')) throw new Error(text);
    return text?.includes('河流已感知你的身影');
  }, { timeout: 45000 }).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__river.poseReady)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__river.lastPoseTime)).toBeGreaterThan(0);
  const first = await page.evaluate(() => (window as any).__river.lastMaskTime);
  await expect.poll(() => page.evaluate(() => (window as any).__river.lastMaskTime), { timeout: 15000 }).toBeGreaterThan(first);
  await page.getByRole('button', { name: '关闭摄像头' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__river.camera)).toBe(false);
});
