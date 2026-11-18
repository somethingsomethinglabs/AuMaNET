// Shared navigation through the production shell. No state mutation or native command.
export async function openTool(page,label){
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Tools',exact:true}).click();
  await page.locator('[data-screen-scroll="Tools"] .destination-row').filter({has:page.getByText(label,{exact:true})}).click();
}
export async function openConnection(page){await page.getByRole('button',{name:/^Connection: /}).click();}
export async function openSavedConnection(page){await openConnection(page);await page.getByRole('button',{name:'Saved connection',exact:true}).click();}
export async function leaveSecondary(page){await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Messages',exact:true}).click();}
