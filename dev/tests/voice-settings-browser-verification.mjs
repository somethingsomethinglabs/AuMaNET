import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const run=(0,eval)('('+await readFile('dev/tests/voice-settings-verification.js','utf8')+')');
const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:390,height:844}});console.log(JSON.stringify(await run(page)));}finally{await browser.close();}
