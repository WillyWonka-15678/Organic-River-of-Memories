import {test,expect} from '@playwright/test';
for(const mode of ['only','composite'])test(`Body Wake mouse ${mode}: stop, drift and dissolve`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`/?camera=off&input=mouse&wake=${mode}`);
  await expect.poll(()=>page.evaluate(()=>(window as any).__river?.frames??0)).toBeGreaterThan(10);
  await page.keyboard.press('h');
  for(let i=0;i<=55;i++){await page.mouse.move(360+i*13,530+Math.sin(i*.09)*25);await page.waitForTimeout(90);}
  await expect.poll(()=>page.evaluate(()=>(window as any).__river.wakeCount)).toBeGreaterThan(0);
  await page.screenshot({path:`docs/visual-review/wake-${mode}.png`});
  await page.waitForTimeout(700);
  const state=await page.evaluate(()=>(window as any).__river);
  expect(state.wakeCount).toBeLessThanOrEqual(4);expect(state.wakeMoving).toBe(false);
  await page.waitForTimeout(1300);
  const next=await page.evaluate(()=>(window as any).__river);
  expect(next.wakeSpawned).toBe(state.wakeSpawned);
  expect(next.wakes[0].x).toBeGreaterThan(state.wakes[0].x);
  await page.screenshot({path:`docs/visual-review/wake-${mode}-drift.png`});
  await expect.poll(()=>page.evaluate(()=>(window as any).__river.wakeCount),{timeout:16000}).toBe(0);
  expect(errors).toEqual([]);
});
test('Body Wake pose: arm-only silence, torso motion, tracking loss',async({page})=>{
  test.skip(process.env.RIVER_TEST_PRODUCTION==='1','合成姿态只在开发模式开放');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?qa=1&camera=off&wake=composite');
  await page.evaluate(()=>{
    const win=window as any;win.__wakePose={mode:'arms',phase:0,x:.23};
    win.__wakeTimer=setInterval(()=>{
      const state=win.__wakePose;state.phase+=.12;
      if(state.mode==='lost'){win.__riverQA.clearPose();return;}
      if(state.mode==='walk')state.x+=.005;
      const x=state.x,p=Array.from({length:33},()=>({x,y:.45,visibility:0}));
      p[0]={x,y:.24,visibility:.98};p[7]={x:x-.025,y:.24,visibility:.98};p[8]={x:x+.025,y:.24,visibility:.98};
      p[13]={x:x-.11,y:.47,visibility:.98};p[14]={x:x+.11,y:.47,visibility:.98};
      p[25]={x:x-.05,y:.78,visibility:.98};p[26]={x:x+.05,y:.78,visibility:.98};
      p[27]={x:x-.06,y:.94,visibility:.98};p[28]={x:x+.06,y:.94,visibility:.98};
      p[11]={x:x-.055,y:.35,visibility:.98};p[12]={x:x+.055,y:.35,visibility:.98};
      p[23]={x:x-.045,y:.64,visibility:.98};p[24]={x:x+.045,y:.64,visibility:.98};
      p[15]={x:x-.16,y:.4+Math.sin(state.phase)*.15,visibility:.98};
      p[16]={x:x+.16,y:.4-Math.sin(state.phase)*.15,visibility:.98};
      win.__riverQA.injectPose(p);
    },65);
  });
  await page.waitForTimeout(2300);
  expect(await page.evaluate(()=>(window as any).__river.wakeSpawned)).toBe(0);
  await page.evaluate(()=>(window as any).__wakePose.mode='walk');
  await page.waitForTimeout(4800);
  expect(await page.evaluate(()=>(window as any).__river.wakeCount)).toBeGreaterThan(0);
  await page.keyboard.press('h');await page.screenshot({path:'docs/visual-review/wake-pose.png'});
  await page.evaluate(()=>(window as any).__wakePose.mode='arms');
  await page.waitForTimeout(600);
  const before=await page.evaluate(()=>(window as any).__river.wakeSpawned);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>(window as any).__river.wakeSpawned)).toBe(before);
  await page.evaluate(()=>(window as any).__wakePose.mode='lost');
  await page.waitForTimeout(600);
  await page.evaluate(()=>{(window as any).__wakePose.x=.8;(window as any).__wakePose.mode='arms';});
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>(window as any).__river.wakeSpawned)).toBe(before);
  await page.evaluate(()=>clearInterval((window as any).__wakeTimer));
  expect(errors).toEqual([]);
});
for(const pair of [[11,12],[23,24]])test(`Body Wake partial torso ${pair[0]===11?'shoulders':'hips'}`,async({page})=>{
  test.skip(process.env.RIVER_TEST_PRODUCTION==='1','合成姿态只在开发模式开放');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?qa=1&camera=off&wake=composite');
  const inject=async(x:number,ids:number[])=>page.evaluate(({x,ids})=>{
    const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));
    ids.forEach((id,k)=>p[id]={x:x+(k-.5)*.1,y:id<20?.4:.65,visibility:.98});
    (window as any).__riverQA.injectPose(p);
  },{x,ids});
  for(let i=0;i<36;i++){await inject(.25+i*.004,pair);await page.waitForTimeout(80);}
  expect(await page.evaluate(()=>(window as any).__river.wakeSpawned)).toBeGreaterThan(0);
  // Switch the visible anatomical pair at rest: its offset is not body velocity.
  const other=pair[0]===11?[23,24]:[11,12];
  const count=await page.evaluate(()=>(window as any).__river.wakeSpawned);
  for(let i=0;i<15;i++){await inject(.39,other);await page.waitForTimeout(80);}
  expect(await page.evaluate(()=>(window as any).__river.wakeSpawned)).toBe(count);
  expect(await page.evaluate(()=>(window as any).__river.wakeMoving)).toBe(false);
  expect(errors).toEqual([]);
});
