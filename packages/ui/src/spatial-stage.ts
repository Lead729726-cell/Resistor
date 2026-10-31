import * as THREE from 'three';

export type SpatialStage={update:(view:{angle:number;separated:boolean})=>void;dispose:()=>void};

/** A demand-rendered UI illustration. Dimensions are decorative, never engineering units. */
export function createSpatialStage(host:HTMLElement,onContextLost:()=>void):SpatialStage {
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setClearColor(0,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden','true');
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,2.6,-2.6,.1,100);
  camera.position.set(7,8,10);camera.lookAt(0,.4,0);
  const root=new THREE.Group();scene.add(root);
  scene.add(new THREE.HemisphereLight(0xffffff,0x4c6070,2.6));
  const light=new THREE.DirectionalLight(0xffffff,3.5);light.position.set(3,9,5);scene.add(light);
  const materials:THREE.MeshStandardMaterial[]=[],geometries:THREE.BufferGeometry[]=[];
  const material=(color:string,metalness=.1)=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness:.4});materials.push(m);return m;};
  const base=material('#34434b'), sheet=material('#647880'), copper=material('#d2ac71',.65),chip=material('#242d35'),accent=material('#9bbcff',.2);
  const box=(parent:THREE.Object3D,size:number[],position:number[],m:THREE.Material)=>{
    const g=new THREE.BoxGeometry(size[0],size[1],size[2]);geometries.push(g);
    const mesh=new THREE.Mesh(g,m);mesh.position.set(position[0],position[1],position[2]);parent.add(mesh);return mesh;
  };
  const layers=[new THREE.Group(),new THREE.Group(),new THREE.Group()];layers.forEach(l=>root.add(l));
  box(layers[0],[4.8,.22,3],[0,0,0],base);
  box(layers[1],[4.55,.08,2.8],[0,0,0],sheet);
  box(layers[2],[4.4,.1,2.65],[0,0,0],base);
  const top=layers[2];
  box(top,[1.2,.3,1.1],[-.3,.22,-.1],chip);
  box(top,[.75,.015,.65],[-.3,.38,-.1],accent);
  for(let i=0;i<5;i++)for(const side of [-1,1])box(top,[.22,.075,.09],[-.3+side*.73,.13,-.52+i*.21],copper);
  for(const x of [-1.65,1.65])for(const z of [-.92,.92])box(top,[.22,.025,.24],[x,.08,z],copper);
  for(const z of [-.9,.9]){
    box(top,[1.5,.025,.055],[.95,.09,z],copper);
    box(top,[.055,.025,.7],[.22,.09,z*.65],copper);
  }
  // Symbolic resistor body and bands; deliberately no value, net name or waveform.
  box(top,[1,.23,.36],[.9,.24,-.8],copper);
  for(const x of [.6,.83,1.17])box(top,[.055,.24,.37],[x,.245,-.8],chip);
  box(top,[.3,.42,.5],[-1.35,.3,.55],accent);
  let angle=0,separated=false,disposed=false,frame=0;
  const paint=()=>{if(!disposed&&host.clientWidth&&host.clientHeight)renderer.render(scene,camera);};
  const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});};
  const resize=()=>{
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    const half=Math.max(2.1,3.6*h/w);camera.left=-half*w/h;camera.right=half*w/h;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(w,h);schedule();
  };
  const update=()=>{root.rotation.y=angle;layers.forEach((l,i)=>l.position.y=i*(separated?.55:.17));const c=getComputedStyle(host).getPropertyValue('--accent').trim();if(c)accent.color.set(c);schedule();};
  const lost=(e:Event)=>{e.preventDefault();onContextLost();};
  renderer.domElement.addEventListener('webglcontextlost',lost);
  host.appendChild(renderer.domElement);
  const observer=new ResizeObserver(resize);observer.observe(host);resize();update();
  return {update(view){angle=view.angle;separated=view.separated;update();},dispose(){if(disposed)return;disposed=true;observer.disconnect();cancelAnimationFrame(frame);renderer.domElement.removeEventListener('webglcontextlost',lost);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}
