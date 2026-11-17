async(page)=>{
  const results=[];const check=(name,value)=>{if(!value)throw new Error(name);results.push({name,passed:true});};
  await page.goto('http://127.0.0.1:4180');
  await page.getByRole('button',{name:'Maps',exact:true}).click();
  await page.getByRole('button',{name:'Prepare GeoTIFF',exact:true}).click();
  await page.getByRole('heading',{name:'Map source and terms'}).waitFor();
  check('original map date stays unknown until supplied',await page.getByRole('textbox',{name:'Original map date',exact:true}).inputValue()==='Unknown');
  check('filename-based publisher suggestion is explicitly unverified',(await page.getByText(/Suggested Getlost details below come from the filename/).count())===1);
  check('information does not add a consent checkbox',await page.getByRole('checkbox').count()===0);
  check('prepare is a normal enabled action',await page.getByRole('button',{name:'Prepare map',exact:true}).isEnabled());
  check('prepared-pack choice waits while source mutation is owned',await page.getByRole('button',{name:'Import offline map',exact:true}).isDisabled());
  check('published licence is linked',await page.getByRole('link',{name:'Read licence',exact:true}).getAttribute('href')==='https://creativecommons.org/licenses/by-nc-nd/4.0/');
  for(const width of[320,360,412,1024]){
    await page.setViewportSize({width,height:900});
    const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,inputs:Array.from(document.querySelectorAll('.source-details input,.source-details textarea')).map(element=>{const rect=element.getBoundingClientRect();return{left:rect.left,right:rect.right};})}));
    check(`source form fits ${width}px`,bounds.scroll<=bounds.width&&bounds.inputs.every(rect=>rect.left>=0&&rect.right<=bounds.width));
    if(width===320||width===412)await page.screenshot({path:`C:/Users/rowan/Documents/projects/AuMaNET/dev/artifacts/maps/preparation-ui-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByText('Preparation cancelled. Previously installed maps are unchanged.',{exact:true}).waitFor();
  check('cancel releases ordinary map import',await page.getByRole('button',{name:'Import offline map',exact:true}).isEnabled());
  check('cancel clears source form',await page.getByRole('heading',{name:'Map source and terms'}).count()===0);
  await page.getByRole('button',{name:'Import offline map',exact:true}).click();
  await page.getByText('Import cancelled. Previously installed maps are unchanged.',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.mapUiFixture);
  check('separate normal native file actions remain functional',calls.chosen===1&&calls.cancelled>=1&&calls.imports===1);
  return{scope:'Isolated browser mock-native form only; no real device/file preparation acceptance',checks:results};
}
