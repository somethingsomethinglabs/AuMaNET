async (page) => {
  const check = (c,m) => { if(!c) throw new Error(m); };
  await page.reload();
  await page.getByRole('button',{name:'Open settings'}).click();
  await page.getByRole('button',{name:/^Appearance/}).click();
  await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('Dark');
  check(await page.locator('.app-shell').evaluate(e=>e.classList.contains('dark')), 'Dark mode failed');
  await page.getByRole('combobox',{name:'Theme',exact:true}).selectOption('Light');
  await page.getByRole('combobox',{name:'Units',exact:true}).selectOption('Imperial');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:/^Internet sharing/}).click();
  await page.getByRole('switch',{name:/Share my internet/}).check();
  await page.getByRole('combobox',{name:'Demo daily data limit'}).selectOption('1 GB');
  await page.reload();
  await page.getByRole('button',{name:'Open settings'}).click();
  await page.getByRole('button',{name:/^Internet sharing/}).click();
  check(await page.getByRole('switch',{name:/Share my internet/}).isChecked(), 'Sharing persistence failed');
  check(await page.getByRole('combobox',{name:'Demo daily data limit'}).inputValue()==='1 GB','Data limit persistence failed');
  await page.getByRole('switch',{name:/Share my internet/}).uncheck();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:/^Maps & storage/}).click();
  await page.getByRole('button',{name:'Remove demo region',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  check(await page.getByRole('heading',{name:'No offline region'}).isVisible(),'Missing map state failed');
  await page.getByRole('button',{name:'Manage maps',exact:true}).click();
  await page.getByRole('button',{name:'Restore demo region',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:/^Appearance/}).click();
  await page.getByRole('combobox',{name:'Units',exact:true}).selectOption('Metric');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  for (const width of [320,412,1024]) {
    await page.setViewportSize({width,height:740});
    for (const title of ['Nodes','Group & members','Voice & audio','Internet sharing','Maps & storage','Location & privacy','Notifications','Appearance','Diagnostics & about']) {
      await page.getByRole('button',{name:new RegExp('^'+title)}).click();
      check(await page.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth),'Settings overflow: '+title+' at '+width);
      check(await page.locator('header').evaluate(e=>e.getBoundingClientRect().top>=0),'Header clipped: '+title);
      await page.getByRole('button',{name:'Back',exact:true}).click();
    }
  }
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.setViewportSize({width:412,height:915});
  for(const title of ['Map','Messages','Voice','Network']) {
    await page.getByRole('navigation').getByRole('button',{name:title,exact:true}).click();
    await page.screenshot({path:'dev/tests/'+title.toLowerCase()+'-verified.png'});
    check(await page.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth),'Main overflow: '+title);
    check(await page.locator('header').evaluate(e=>e.getBoundingClientRect().top>=0),'Header clipped: '+title);
  }
  console.log('PASS: dark mode, unit settings, sharing/data-limit persistence, missing map recovery, every settings page at 3 widths, main screens and header clipping.');
}

