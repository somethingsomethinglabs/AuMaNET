const preview=document.querySelector('.preview');
const deviceSpace=document.querySelector('.device-space');
const frame=document.querySelector('#app-preview');
const rotate=document.querySelector('#rotate');
let landscape=new URLSearchParams(location.search).get('orientation')==='landscape';

function fit(){
  const width=landscape?844:390,height=landscape?390:844;
  const style=getComputedStyle(preview);
  const availableWidth=preview.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  const availableHeight=preview.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
  const scale=Math.max(0,Math.min(1,availableWidth/(width+16),availableHeight/(height+16)));
  deviceSpace.style.setProperty('--device-width',`${width+16}px`);
  deviceSpace.style.setProperty('--device-height',`${height+16}px`);
  deviceSpace.style.setProperty('--fitted-width',`${(width+16)*scale}px`);
  deviceSpace.style.setProperty('--fitted-height',`${(height+16)*scale}px`);
  deviceSpace.style.setProperty('--scale',scale);
  rotate.setAttribute('aria-label',`Rotate preview to ${landscape?'portrait':'landscape'}`);
  rotate.title=`Rotate to ${landscape?'portrait':'landscape'}`;
}

rotate.addEventListener('click',()=>{
  landscape=!landscape;
  const url=new URL(location.href);
  if(landscape)url.searchParams.set('orientation','landscape');
  else url.searchParams.delete('orientation');
  history.replaceState(null,'',url);
  fit();
});

// Resize the same live frame: rotating never reloads the app or its draft.
new ResizeObserver(fit).observe(preview);
fit();
frame.addEventListener('load',()=>{
  const syncRoute=()=>{
    const url=new URL(location.href);
    url.hash=frame.contentWindow.location.hash;
    history.replaceState(null,'',url);
  };
  frame.contentWindow.addEventListener('hashchange',syncRoute);
  syncRoute();
});
window.addEventListener('hashchange',()=>{
  if(frame.contentWindow.location.hash!==location.hash)frame.contentWindow.location.hash=location.hash;
});
const appUrl=new URL('index.html',location.href);
appUrl.search=location.search;
appUrl.searchParams.delete('orientation');
appUrl.hash=location.hash;
frame.src=appUrl.href;
