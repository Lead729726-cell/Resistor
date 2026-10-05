import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sectionVolume, type ProcessInspection, type ProcessVolume, type Vec3 } from '../../process/src/index';

interface Props {volume:ProcessVolume;report:ProcessInspection;visible:number[];axis:'none'|'x'|'y'|'z';position:number;heat:boolean;selected:number|null;onSelect:(index:number)=>void;coatingRiskCells?:number[]}
const dispose=(group:THREE.Group)=>{group.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){object.geometry.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>m.dispose());}});group.clear();};
export default function ProcessMeshViewer({volume,report,visible,axis,position,heat,selected,onSelect,coatingRiskCells}:Props) {
  const host=useRef<HTMLDivElement>(null),stage=useRef<{renderer:THREE.WebGLRenderer;world:THREE.Scene;group:THREE.Group;camera:THREE.OrthographicCamera;controls:OrbitControls;origin:Vec3;fit:(top?:boolean)=>void}|null>(null),select=useRef(onSelect);
  select.current=onSelect;
  const [ready,setReady]=useState(0),[error,setError]=useState('');
  useEffect(()=>{
    const element=host.current;if(!element)return;setError('');
    let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});}catch(error){setError(`공정 3D GPU 초기화: ${String(error)}`);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.localClippingEnabled=true;renderer.domElement.dataset.testid='process-canvas';renderer.domElement.setAttribute('aria-label','XYZ 공정 체적과 사면체 단면');element.appendChild(renderer.domElement);
    const world=new THREE.Scene(),group=new THREE.Group();world.add(group,new THREE.AmbientLight('#ffffff',1.8));const light=new THREE.DirectionalLight('#ffffff',2);light.position.set(4,-5,8);world.add(light);
    const [lo,hi]=volume.scope.domain_um,origin=lo.map((v,i)=>(v+hi[i])/2) as Vec3,extent=Math.max(...hi.map((v,i)=>v-lo[i]));
    const camera=new THREE.OrthographicCamera(-extent,extent,extent,-extent,extent/10000,extent*100),controls=new OrbitControls(camera,renderer.domElement);camera.up.set(0,0,1);controls.enableDamping=true;
    const fit=(top=false)=>{camera.position.set(extent*1.6,top?0:-extent*2,extent*(top?4:1.7));if(top)camera.position.x=extent*.00001;controls.target.set(0,0,0);camera.lookAt(controls.target);controls.update();};fit();
    const background=()=>{const color=getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()||'#0d1724';renderer.setClearColor(color);renderer.domElement.dataset.appearanceBackground=color;};background();
    const appearance=new MutationObserver(background);appearance.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-skin']});
    const resize=()=>{const width=Math.max(1,element.clientWidth),height=Math.max(1,element.clientHeight),aspect=width/height;camera.left=-extent*.7*aspect;camera.right=extent*.7*aspect;camera.top=extent*.7;camera.bottom=-extent*.7;camera.updateProjectionMatrix();renderer.setSize(width,height);};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();stage.current={renderer,world,group,camera,controls,origin,fit};setReady(v=>v+1);
    let animation=0;const draw=()=>{animation=requestAnimationFrame(draw);controls.update();renderer.render(world,camera);};draw();
    let down=[0,0];const pointerDown=(event:PointerEvent)=>{down=[event.clientX,event.clientY];};
    const pick=(event:PointerEvent)=>{if(Math.hypot(event.clientX-down[0],event.clientY-down[1])>5)return;const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      for(const hit of ray.intersectObjects(group.children,false)){if(!(hit.object instanceof THREE.Mesh)||hit.faceIndex==null)continue;const materials=Array.isArray(hit.object.material)?hit.object.material:[hit.object.material];if(materials.some(m=>m.clippingPlanes?.some((plane:THREE.Plane)=>plane.distanceToPoint(hit.point)<-1e-10)))continue;const cell=hit.object.userData.cells[hit.faceIndex];if(cell!==undefined){select.current(cell);break;}}
    };
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pick);
    return()=>{cancelAnimationFrame(animation);observer.disconnect();appearance.disconnect();controls.dispose();dispose(group);renderer.dispose();renderer.domElement.remove();stage.current=null;};
  },[volume]);
  useEffect(()=>{
    const current=stage.current;if(!current)return;dispose(current.group);
    const selectedMaterial=new Set(visible),materialMap=new Map(volume.materials.map(m=>[m.id,m]));
    const risky=new Set(report.issues.filter(issue=>issue.kind!=='unknown').map(issue=>issue.cell)),unknown=new Set(report.issues.filter(issue=>issue.kind==='unknown').map(issue=>issue.cell));
    for(const cell of coatingRiskCells||[])unknown.add(cell);
    report.voids.filter(v=>v.closed).forEach(v=>v.cells.forEach(cell=>risky.add(cell)));
    const axisIndex=axis==='x'?0:axis==='y'?1:2,planes=axis==='none'?[]:[new THREE.Plane(new THREE.Vector3(axisIndex===0?-1:0,axisIndex===1?-1:0,axisIndex===2?-1:0),position-current.origin[axisIndex])];
    const build=(entries:{cell:number;points:Vec3[]}[],caps=false)=>{
      const positions:number[]=[],colors:number[]=[],cellIds:number[]=[];
      for(const entry of entries){const material=materialMap.get(volume.cells[entry.cell].material_id)!;if(!selectedMaterial.has(material.id))continue;
        const color=new THREE.Color(entry.cell===selected?'#2386f5':heat?(risky.has(entry.cell)?'#d5434f':unknown.has(entry.cell)?'#bc8d20':'#439f89'):material.color);
        for(let i=1;i<entry.points.length-1;i++){for(const p of [entry.points[0],entry.points[i],entry.points[i+1]]){positions.push(...p.map((v,axis)=>v-current.origin[axis]));colors.push(color.r,color.g,color.b);}cellIds.push(entry.cell);}
      }
      if(!positions.length)return 0;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
      const material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.8,metalness:0,clippingPlanes:caps?[]:planes,polygonOffset:true,polygonOffsetFactor:caps?-2:0,polygonOffsetUnits:caps?-2:0});
      const mesh=new THREE.Mesh(geometry,material);mesh.userData.cells=cellIds;current.group.add(mesh);return positions.length/9;
    };
    const count=build(report.faces.map(face=>({cell:face.cell,points:face.nodes.map(i=>volume.points_um[i])}))),sections=axis==='none'?[]:sectionVolume(volume,axisIndex,position),caps=build(sections,true);
    if(selected!==null){const cell=volume.cells[selected],tet=cell.vertices.map(i=>new THREE.Vector3(...volume.points_um[i].map((v,axis)=>v-current.origin[axis]) as Vec3)),edges:number[]=[];for(const [a,b] of [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]])edges.push(...tet[a].toArray(),...tet[b].toArray());const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(edges,3));current.group.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#2386f5',depthTest:false})));}
    current.renderer.domElement.dataset.surfaceTriangles=String(count);current.renderer.domElement.dataset.sectionCells=String(sections.length);current.renderer.domElement.dataset.sectionTriangles=String(caps);current.renderer.domElement.dataset.selectedCell=selected===null?'':volume.cells[selected].id;
  },[volume,report,visible,axis,position,heat,selected,coatingRiskCells,ready]);
  const image=()=>{const current=stage.current;if(!current)return;current.renderer.render(current.world,current.camera);const a=document.createElement('a');a.href=current.renderer.domElement.toDataURL('image/png');a.download='register-process-3d.png';a.click();};
  return <div className="process-mesh"><div className="process-view-actions"><button onClick={()=>stage.current?.fit()}>입체 맞춤</button><button onClick={()=>stage.current?.fit(true)}>위에서 보기</button><button onClick={image} data-testid="process-png">PNG 저장</button><span>XYZ µm · 실제 입력 mesh · Z 배율 1</span></div><div ref={host} className="process-canvas-host"/>{error&&<p className="process-error">{error}</p>}</div>;
}
