// USB WebView test driver for the real installed app; no transport fixtures.
import {execFileSync} from 'node:child_process';
const args = Object.fromEntries(process.argv.slice(2).reduce((out, v, i, all) =>
  v.startsWith('--') ? [...out, [v.slice(2), all[i + 1]]] : out, []));
if (!args.adb || !args.serial || !['resume', 'stop', 'status'].includes(args.action))
  throw new Error('Use --adb PATH --serial USB_SERIAL --action resume|stop|status');
const adb = (...values) => execFileSync(args.adb, ['-s', args.serial, ...values],
  {encoding: 'utf8', timeout: 30000}).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let port, ws;
try {
  adb('shell', 'am', 'start', '-n', 'au.aumanet.app/.MainActivity');
  let target;
  for (let attempt = 0; attempt < 15; attempt++) {
    const pid = adb('shell', 'pidof', 'au.aumanet.app').split(' ')[0];
    if (pid) {
      if (port) adb('forward', '--remove', `tcp:${port}`);
      port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`);
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json())
          .find(tab => tab.url.startsWith('https://localhost'));
      } catch {}
      if (target) break;
    }
    await delay(500);
  }
  if (!target) throw new Error('Installed app WebView debugging unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once: true});
    ws.addEventListener('error', reject, {once: true});
  });
  let id = 0;
  const evaluate = expression => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => reject(new Error('App action timed out')), 15000);
    const listener = event => {
      const value = JSON.parse(event.data);
      if (value.id !== requestId) return;
      clearTimeout(timer); ws.removeEventListener('message', listener);
      if (value.error || value.result?.exceptionDetails) reject(new Error('App evaluation failed'));
      else resolve(value.result.result.value);
    };
    ws.addEventListener('message', listener);
    ws.send(JSON.stringify({id: requestId, method: 'Runtime.evaluate',
      params: {expression, returnByValue: true, awaitPromise: true}}));
  });
  await evaluate(`(()=>{const n=[...document.querySelectorAll('nav button')].find(b=>b.textContent.trim()==='Network');if(n)n.click();})()`);
  await delay(250);
  if (args.action !== 'status') {
    const label = args.action === 'resume' ? 'Resume connection' : 'Stop connection';
    const clicked = await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(b)b.click();return !!b;})()`);
    if (!clicked) {
      const text = await evaluate('document.body.innerText');
      const alreadyStopped = args.action === 'stop' && text.includes('Resume connection');
      if (!alreadyStopped) throw new Error('Expected app action missing: ' + label);
    }
    await delay(250);
  }
  const trusted=await evaluate(`(async()=>{const s=await window.Capacitor.Plugins.AuMaNETTrustedConnection.snapshot();return{schema:s.schema,source:s.source,state:s.state,attachmentAvailable:s.attachmentAvailable,configuration:s.configuration,runId:s.runId,errorCode:s.errorCode};})()`);
  console.log(JSON.stringify({action: args.action, text: await evaluate('document.body.innerText'),trusted}));
} finally {
  ws?.close();
  if (port) adb('forward', '--remove', `tcp:${port}`);
}
