/** Native <dialog> supplies background inertness and focus containment. This
 * action adds consistent close controls, focus return and system-back semantics
 * without replacing each feature's cancellation/uncertainty guards. */
export function observeSheets(root:HTMLElement){
  const openers=new WeakMap<HTMLDialogElement,HTMLElement>();
  const prepared=new WeakSet<HTMLDialogElement>();
  function prepare(dialog:HTMLDialogElement){
    if(prepared.has(dialog))return;prepared.add(dialog);
    if(dialog.classList.contains('image-viewer'))return;
    dialog.classList.add('auma-sheet');
    const title=dialog.querySelector<HTMLElement>('h2,h3');
    dialog.addEventListener('beforetoggle',event=>{if((event as ToggleEvent).newState==='open'&&document.activeElement instanceof HTMLElement&&!dialog.contains(document.activeElement))openers.set(dialog,document.activeElement);});
    if(!dialog.hasAttribute('aria-label')&&!dialog.hasAttribute('aria-labelledby')&&title){title.id ||= 'sheet-'+crypto.randomUUID();dialog.setAttribute('aria-labelledby',title.id);}
    const existing=dialog.querySelector<HTMLButtonElement>('button[aria-label^="Close "]');
    if(existing)existing.classList.add('sheet-close');
    else{const close=document.createElement('button');close.type='button';close.className='sheet-close';close.setAttribute('aria-label','Close '+(title?.textContent?.trim()??'sheet'));close.textContent='×';close.addEventListener('click',()=>dialog.requestClose());dialog.prepend(close);}
    dialog.addEventListener('close',()=>{const opener=openers.get(dialog);if(opener?.isConnected&&!opener.closest('[hidden]'))opener.focus({preventScroll:true});});
  }
  let recent:HTMLElement|undefined;
  const remember=(event:Event)=>{const element=(event.target as Element)?.closest<HTMLElement>('button,a,input,select,textarea,summary');if(element&&(event.type!=='focusin'||!element.closest('dialog')))recent=element;};
  root.addEventListener('pointerdown',remember,true);root.addEventListener('focusin',remember,true);root.addEventListener('keydown',remember,true);
  const observer=new MutationObserver(changes=>{for(const change of changes){if(change.type==='childList')for(const node of change.addedNodes)if(node instanceof Element){if(node instanceof HTMLDialogElement)prepare(node);node.querySelectorAll('dialog').forEach(node=>prepare(node as HTMLDialogElement));}if(change.type==='attributes'&&change.target instanceof HTMLDialogElement&&change.target.open){const dialog=change.target;prepare(dialog);if(recent&&!dialog.contains(recent))openers.set(dialog,recent);}}});
  root.querySelectorAll('dialog').forEach(dialog=>prepare(dialog));observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
  return()=>{observer.disconnect();root.removeEventListener('pointerdown',remember,true);root.removeEventListener('focusin',remember,true);root.removeEventListener('keydown',remember,true);};
}
