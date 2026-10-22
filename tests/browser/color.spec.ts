import {test,expect} from '@playwright/test';
test('three palettes share identical particle state, composition and wake age',async({page})=>{
  test.skip(process.env.RIVER_TEST_PRODUCTION==='1','固定状态比较只在开发 QA 开放');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?qa=1&camera=off&input=mouse');
  await expect.poll(()=>page.evaluate(()=>(window as any).__river?.frames??0),{timeout:30000}).toBeGreaterThan(60);
  await page.keyboard.press('h');
  // Identical camera state (off); generate one shared motion history, then freeze it.
  for(let i=0;i<45;i++){await page.mouse.move(370+i*14,540);await page.waitForTimeout(80);}
  await page.waitForTimeout(1000);
  await page.evaluate(()=>(window as any).__riverQA.pauseStudy());
  const state=await page.evaluate(()=>(window as any).__riverQA.particleStudyState());
  expect(state.every(Number.isFinite)).toBe(true);
  const snapshots:Buffer[]=[];
  for(const name of ['original','tealViolet','iridescent']){
    await page.evaluate(p=>(window as any).__riverQA.paletteStudy(p),name);
    expect(await page.evaluate(()=>(window as any).__riverQA.particleStudyState())).toEqual(state);
    snapshots.push(await page.screenshot({path:`docs/visual-review/palette-${name}.png`}));
  }
  expect(snapshots[0].equals(snapshots[1])).toBe(false);expect(snapshots[1].equals(snapshots[2])).toBe(false);
  await page.evaluate(()=>(window as any).__riverQA.paletteStudy('original'));
  expect((await page.screenshot()).equals(snapshots[0])).toBe(true);
  expect(errors).toEqual([]);
});
test('runtime palette selection fades and bloom can be disabled',async({page})=>{
  test.skip(process.env.RIVER_TEST_PRODUCTION==='1','开发 QA 检查');
  await page.goto('/?qa=1&camera=off');
  await expect.poll(()=>page.evaluate(()=>(window as any).__river?.frames??0)).toBeGreaterThan(10);
  expect(await page.evaluate(()=>(window as any).__riverQA.colorState().preset)).toBe('tealViolet');
  await page.keyboard.press('d');
  await page.getByText('视觉配色',{exact:true}).click();
  const select=page.getByRole('combobox',{name:'配色预设'});
  await select.selectOption({label:'B · Teal & Violet'});
  await expect.poll(()=>page.evaluate(()=>(window as any).__riverQA.colorState().mix),{timeout:15000}).toBeGreaterThan(.95);
  await select.selectOption({label:'C · Iridescent'});
  expect(await page.evaluate(()=>(window as any).__riverQA.colorState().preset)).toBe('iridescent');
  const bloom=page.getByRole('textbox',{name:'Bloom 柔光'});
  await bloom.fill('0');await bloom.press('Enter');
  await expect.poll(()=>page.evaluate(()=>(window as any).__riverQA.colorState().bloom),{timeout:15000}).toBeLessThan(.02);
});
