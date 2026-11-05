/* Geometry is decoded from unchanged, pinned upstream STL bytes. */
(() => {
const source=window.AUMANET_UPSTREAM,$=id=>document.getElementById(id),canvas=$('view');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});}catch(e){$('detail').textContent='WebGL unavailable. Download the original STLs below for CAD inspection.';return;}
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.localClippingEnabled=true;renderer.outputEncoding=THREE.sRGBEncoding;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,3000);camera.up.set(0,0,1);
const controls=new THREE.OrbitControls(camera,canvas);controls.minDistance=40;controls.maxDistance=1000;
scene.add(new THREE.HemisphereLight(0xf0f7ff,0x35443c,1.2));
for(const [pos,intensity] of [[[160,-220,350],1],[[-150,100,180],.7]]){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(...pos);scene.add(light);}
const bounds=[0,1,2].map(a=>[Math.min(...source.parts.map(p=>p.bounds[a][0])),Math.max(...source.parts.map(p=>p.bounds[a][1]))]),centre=bounds.map(b=>(b[0]+b[1])/2);
const meshes=[],clip=new THREE.Plane(new THREE.Vector3(0,1,0),0),select=$('part');
for(const part of source.parts){
 const raw=atob(part.data),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 const view=new DataView(bytes.buffer),count=view.getUint32(80,true),positions=new Float32Array(count*9);
 for(let i=0;i<count;i++)for(let j=0;j<9;j++)positions[i*9+j]=view.getFloat32(84+i*50+12+j*4,true);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
 const colour=part.hardware?(part.id.startsWith('pi')?0x427d9c:0xc99952):part.id.startsWith('TPU')?0x394f45:part.zone===0?0x71846b:part.zone===2?0xc5c49b:0x91a489;
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:colour,roughness:.72,metalness:.08,side:THREE.DoubleSide}));mesh.userData=part;mesh.position.set(...centre.map(v=>-v));scene.add(mesh);meshes.push(mesh);
 const option=document.createElement('option');option.value=part.id;option.textContent=part.label;select.append(option);
}
select.value='base-1';
$('dimensions').textContent='Upstream assembled mesh bounds: '+bounds.map(b=>(b[1]-b[0]).toFixed(2)).join(' × ')+' mm (X × Y × Z). Original STL coordinates and scale preserved.';
function render(){renderer.render(scene,camera);}
function resize(){const r=canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render();}
function detail(){const part=source.parts.find(p=>p.id===select.value);$('detail').replaceChildren();
 const title=document.createElement('strong');title.textContent=part.label;
 const note=document.createElement('p');note.textContent=part.hardware?'Upstream hardware reference. This is the source build hardware, not a model of the selected Heltec stack.':'Original upstream enclosure component. No geometry edits, resizing or invented mounting details.';
 const size=document.createElement('p');size.textContent=part.bounds.map(b=>(b[1]-b[0]).toFixed(2)).join(' × ')+' mm · '+part.triangles.toLocaleString()+' triangles';
 const link=document.createElement('a');link.href=`https://github.com/${source.repository}/blob/${source.commit}/${part.path.split('/').map(encodeURIComponent).join('/')}`;link.textContent='View exact upstream file';link.target='_blank';link.rel='noopener';$('detail').append(title,note,size,link);
 for(const mesh of meshes)mesh.material.emissive.setHex(mesh.userData.id===part.id?0x17291b:0x000000);render();}
let lastGap=0;
function update(){const gap=Number($('explode').value);$('amount').textContent=gap+' mm';
 if(gap!==lastGap){const height=bounds[2][1]-bounds[2][0];camera.position.sub(controls.target).multiplyScalar((height+2*gap)/(height+2*lastGap)).add(controls.target);lastGap=gap;controls.update();}
 for(const mesh of meshes){const p=mesh.userData;mesh.visible=(p.hardware?$('inside').checked:$('shell').checked)&&(!$('solo').checked||select.value===p.id);mesh.position.z=-centre[2]+(p.zone-1)*gap;mesh.material.clippingPlanes=$('cut').checked&&!p.hardware?[clip]:[];mesh.material.wireframe=$('wire').checked;}render();}
function preset(type){controls.target.set(0,0,0);camera.position.set(...(type==='top'?[0,-.01,390]:type==='front'?[0,-390,0]:[235,-310,200]));camera.position.multiplyScalar(1+2*Number($('explode').value)/(bounds[2][1]-bounds[2][0]));camera.lookAt(controls.target);controls.update();render();}
for(const id of ['explode','shell','inside','cut','wire','solo'])$(id).addEventListener('input',update);
select.addEventListener('change',()=>{detail();update();});$('iso').onclick=()=>preset('iso');$('front').onclick=()=>preset('front');$('top').onclick=()=>preset('top');
$('reset').onclick=()=>{$('explode').value=0;for(const id of ['shell','inside'])$(id).checked=true;for(const id of ['cut','wire','solo'])$(id).checked=false;update();preset('iso');};controls.addEventListener('change',render);
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
canvas.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(meshes.filter(m=>m.visible)).find(h=>!$('cut').checked||h.object.userData.hardware||clip.distanceToPoint(h.point)>=0);if(hit){select.value=hit.object.userData.id;detail();update();}});
canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key))return;e.preventDefault();const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(new THREE.Vector3(offset.x,offset.z,-offset.y));if(e.key==='ArrowLeft')s.theta-=.12;if(e.key==='ArrowRight')s.theta+=.12;if(e.key==='ArrowUp')s.phi-=.12;if(e.key==='ArrowDown')s.phi+=.12;if(e.key==='+'||e.key==='=')s.radius=Math.max(40,s.radius/1.1);if(e.key==='-')s.radius=Math.min(1000,s.radius*1.1);s.makeSafe();const v=new THREE.Vector3().setFromSpherical(s);camera.position.set(v.x,-v.z,v.y).add(controls.target);controls.update();render();});
window.addEventListener('resize',resize);resize();preset('iso');update();detail();
})();
