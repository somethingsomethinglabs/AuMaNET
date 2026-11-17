/** playwright-cli run-code file for the isolated ?positions fixture. Not physical GPS evidence. */
async(page)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(await page.getByText('Must not appear',{exact:true}).count())throw new Error('Unauthorized member leaked into map UI');
  const tooltips=await page.getByRole('tooltip').allTextContents();if(!tooltips.includes('You')||!tooltips.includes('Fixture peer')||tooltips.length!==2)throw new Error('Expected exactly the two authorized position markers');
  await page.getByRole('button',{name:/Fixture peer Last known/}).click();
  const details=await page.locator('.member-detail').innerText();if(!details.includes('-37.815000, 144.964000')||!details.includes('15 m'))throw new Error('Roster selected the wrong member details');
  if(!await page.getByRole('button',{name:/Fixture peer Last known/}).innerText().then(s=>s.includes('Stale')))throw new Error('Old peer fix lacks stale label');
  const widths=[];
  for(const width of[320,360,412,1024]){await page.setViewportSize({width,height:900});const size=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));if(size.content>size.viewport+1)throw new Error(`Map UI overflow at ${width}`);for(const name of['Zoom in','Zoom out','Recenter on my position','Fit group positions'])if(!await page.getByRole('button',{name,exact:true}).isVisible())throw new Error(`${name} hidden at ${width}`);widths.push(width);}
  const follow=page.getByRole('button',{name:'Follow my position',exact:true});await follow.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Follow my position"]')?.getAttribute('aria-pressed')==='true');
  await page.getByRole('region',{name:'Geographic offline map',exact:true}).scrollIntoViewIfNeeded();const box=await page.getByRole('region',{name:'Geographic offline map',exact:true}).boundingBox();await page.mouse.move(box.x+100,box.y+180);await page.mouse.down();await page.mouse.move(box.x+150,box.y+200,{steps:6});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[aria-label="Follow my position"]')?.getAttribute('aria-pressed')==='false');
  if(errors.length)throw new Error(errors.join(';'));
  return{status:'pass',scope:'Isolated public-coordinate/member fixture; not real phone or group-authentication evidence',cases:['authorized markers only','stale peer label','roster selects correct coordinates and accuracy','responsive controls without overflow','follow toggles and map drag cancels follow'],widths,pageErrors:errors};
}
