import {test,expect} from '@playwright/test';
test('startup immediately populates the screen with drifting memories',async({page})=>{
 test.skip(process.env.RIVER_TEST_PRODUCTION==='1','Dev state inspection');
 await page.goto('/?camera=off&stage=4&qa=1');
 await expect.poll(()=>page.evaluate(()=>(window as any).__riverQA?.memoryState().length??0)).toBe(5);
 const initial=await page.evaluate(()=>(window as any).__riverQA.memoryState());
 expect(initial.every((m:any)=>m.x>0&&m.x<1&&m.formation===1&&m.state==='FLOWING')).toBe(true);
 expect(Math.max(...initial.map((m:any)=>m.x))-Math.min(...initial.map((m:any)=>m.x))).toBeGreaterThan(.5);
 await page.screenshot({path:'test-results/memory-startup.png'});
 await expect.poll(()=>page.evaluate(id=>(window as any).__riverQA.memoryState().find((m:any)=>m.id===id)?.x,initial[0].id)).toBeGreaterThan(initial[0].x+.01);
});
for(const side of [0,1])test(`right-side viewer reaching left enlarges with occluded opposite shoulder, arm ${side}`,async({page})=>{
 test.skip(process.env.RIVER_TEST_PRODUCTION==='1','Dev synthetic pose only');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/?camera=off&stage=4&qa=1');
 await expect.poll(()=>page.evaluate(()=>(window as any).__river?.frames??0)).toBeGreaterThan(10);
 await page.evaluate(side=>{const w=window as any;w.__riverQA.clearMemories();w.__riverQA.placeMemory(.49,.55);w.poseTimer=setInterval(()=>{
   const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:1}));
   for(const [i,x] of [[11+side,.82],[13+side,.66],[15+side,.49]])p[i]={x,y:.45,visibility:.9,presence:1};
   w.__riverQA.injectPose(p);
 },65);},side);
 await expect.poll(()=>page.evaluate(()=>(window as any).__riverQA.memoryState().some((m:any)=>m.state==='CAPTURED'&&m.emphasis===1)),{timeout:25000}).toBe(true);
 await page.screenshot({path:`test-results/memory-reach-left-${side}.png`});
 expect(errors).toEqual([]);
});
test('memory capture, summon, intentional wave and tracking loss render',async({page})=>{
 test.skip(process.env.RIVER_TEST_PRODUCTION==='1','Dev synthetic pose only');test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/?camera=off&stage=4&qa=1');
 await expect.poll(()=>page.evaluate(()=>(window as any).__river?.frames??0)).toBeGreaterThan(10);
 await page.evaluate(()=>{const w=window as any;w.__riverQA.clearMemories();w.__riverQA.placeMemory(.71,.54);w.handX=.72;w.handY=.46;w.poseTimer=setInterval(()=>{const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:1}));for(const [i,x,y] of [[11,.4,.5],[12,.52,.5],[13,.63,.48],[15,w.handX,w.handY]])p[i]={x,y,visibility:1,presence:1};w.__riverQA.injectPose(p);},65);});
 const state=()=>page.evaluate(()=>(window as any).__riverQA.memoryState());
 await expect.poll(async()=>(await state()).some((m:any)=>m.state==='CAPTURED'),{timeout:25000}).toBe(true);
 await page.screenshot({path:'test-results/memory-captured.png'});
 await expect.poll(async()=>(await state()).some((m:any)=>m.state==='CAPTURED'&&m.emphasis===1),{timeout:15000}).toBe(true);
 await page.screenshot({path:'test-results/memory-captured-large-glow.png'});
 await page.evaluate(()=>{const w=window as any;let n=0;w.waveTimer=setInterval(()=>{w.handX=.72+.17*Math.sin(Math.PI*n/24);if(++n>24){clearInterval(w.waveTimer);w.handX=.72;}},65);});
 await expect.poll(async()=>(await state()).some((m:any)=>m.state==='RELEASING'),{timeout:15000,intervals:[100]}).toBe(true);
 await expect.poll(async()=>(await state()).some((m:any)=>m.state==='RELEASING'&&m.release>.4),{timeout:10000,intervals:[100]}).toBe(true);
 await page.screenshot({path:'test-results/memory-release.png'});
 await expect.poll(async()=>(await state()).some((m:any)=>m.state==='RELEASING'),{timeout:20000}).toBe(false);
 await page.evaluate(()=>{const w=window as any;w.handY=.88;});await page.waitForTimeout(3500);
 await page.evaluate(()=>{const w=window as any;w.__riverQA.clearMemories();w.handY=.46;});
 await expect.poll(async()=>(await state()).some((m:any)=>m.state==='CAPTURED'&&m.formation<1),{timeout:15000,intervals:[100]}).toBe(true);
 await page.screenshot({path:'test-results/memory-summon.png'});
 await page.evaluate(()=>{const w=window as any;clearInterval(w.poseTimer);w.__riverQA.clearPose();});
 await expect.poll(async()=>(await state()).some((m:any)=>m.state==='CAPTURED'),{timeout:20000}).toBe(false);
 expect(errors).toEqual([]);
});
test('mask slows intact text and absence restores flow',async({page})=>{
 test.skip(process.env.RIVER_TEST_PRODUCTION==='1','Dev mask only');
 await page.goto('/?camera=off&stage=4&qa=1');await expect.poll(()=>page.evaluate(()=>(window as any).__river?.frames??0)).toBeGreaterThan(10);
 await page.evaluate(()=>{const q=(window as any).__riverQA;q.clearMemories();q.placeMemory(.5,.5);q.injectSilhouette(0);});
 await expect.poll(()=>page.evaluate(()=>(window as any).__riverQA.memoryState().some((m:any)=>m.state==='BODY_SLOWED'&&m.speed<.15)),{timeout:20000}).toBe(true);
 await page.screenshot({path:'test-results/memory-body-slowed.png'});
 await page.evaluate(()=>(window as any).__riverQA.clearMask());
 await expect.poll(()=>page.evaluate(()=>(window as any).__riverQA.memoryState().some((m:any)=>m.state==='FLOWING'&&m.speed>.9)),{timeout:20000}).toBe(true);
});
