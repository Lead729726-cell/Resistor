import {useEffect,useRef,useState} from 'react';
import type {Scene} from '@mos/contracts';
import {sceneFrame,localRing,deltaUm,isPickable,type ViewerDisplay,type LocalFrame} from './geometry';
import {maskInRegion,selectionBox,selectionMode,layoutSelectionBounds,type SelectionMode} from './selection';
import {shortcutDecision} from '../../shortcuts/src/index';

/** Actual XY polygons, including holes. No GPU, Z reconstruction or editing. */
export function CanvasLayoutFallback({scene,display,onSelect,selectedIds=[],onSelection}:{scene:Scene;display:ViewerDisplay;onSelect:(id:string|null)=>void;selectedIds?:string[];onSelection?:(ids:string[],mode:SelectionMode)=>void}){
 const ref=useRef<HTMLCanvasElement>(null),paths=useRef<{id:string,path:Path2D}[]>([]);
 const [error,setError]=useState(''),[marquee,setMarquee]=useState<{start:[number,number];end:[number,number]}|null>(null);const gesture=useRef<{start:[number,number];mode:SelectionMode}|null>(null),mapping=useRef<{frame:LocalFrame;scale:number;centre:[number,number]}|null>(null);
 const [fitBounds,setFitBounds]=useState<[string,string,string,string]|null>(null);
 useEffect(()=>setFitBounds(null),[scene.project_id]);
 const limit=Math.min(50000,Math.max(1,display.renderLimit??50000)),shapes=scene.shapes.slice(0,limit);
 const fitSelection=()=>{const allowed=shapes.filter(s=>isPickable({...display.layers?.[s.layer_id],opacity:display.layers?.[s.layer_id]?.opacity??scene.layers.find(layer=>layer.id===s.layer_id)?.opacity??1}));const bounds=layoutSelectionBounds(allowed,selectedIds);if(bounds)setFitBounds(bounds.bbox);};
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx){setError('Canvas 2D도 사용할 수 없습니다.');return;}
  const draw=()=>{try{
   const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
   canvas.width=Math.max(1,Math.round(box.width*dpr));canvas.height=Math.max(1,Math.round(box.height*dpr));
   ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()||'#18212a';ctx.fillRect(0,0,canvas.width,canvas.height);
   const frame=sceneFrame(scene),b=fitBounds?fitBounds.map((value,i)=>deltaUm(value,frame.origin[i%2],frame.dbuUm)):frame.boundsUm;
   const centre:[number,number]=[(b[0]+b[2])/2,(b[1]+b[3])/2];
   const scale=Math.min((canvas.width-40)/Math.max(.001,b[2]-b[0]),(canvas.height-40)/Math.max(.001,b[3]-b[1]));
   const xy=([x,y]:[number,number]):[number,number]=>[canvas.width/2+(x-centre[0])*scale,canvas.height/2-(y-centre[1])*scale];
   mapping.current={frame,scale,centre};paths.current=[];
   for(const shape of shapes){
    const layer=scene.layers.find(l=>l.id===shape.layer_id),style=display.layers?.[shape.layer_id];
    if(style?.visible===false||(style?.opacity??layer?.opacity??1)<=0)continue;
    const path=new Path2D();for(const ring of [shape.polygon,...(shape.holes??[])]){const points=localRing(ring,frame).map(xy);path.moveTo(...points[0]);for(const p of points.slice(1))path.lineTo(...p);path.closePath();}
    ctx.globalAlpha=style?.opacity??layer?.opacity??.75;ctx.fillStyle=style?.color??layer?.color??'#7d97ae';ctx.fill(path,'evenodd');if(selectedIds.includes(shape.id)){ctx.strokeStyle='#b5f8ff';ctx.lineWidth=2*dpr;ctx.stroke(path);}
    if(style?.pickable!==false&&!style?.locked)paths.current.push({id:shape.id,path});
   }ctx.globalAlpha=1;setError('');
  }catch(c){setError(c instanceof Error?c.message:String(c));}};
  const resize=new ResizeObserver(draw);resize.observe(canvas);const theme=new MutationObserver(draw);theme.observe(document.documentElement,{attributes:true});draw();return()=>{resize.disconnect();theme.disconnect();};
 },[scene,display,limit,selectedIds,fitBounds]);
 return <div className="mos-viewer" data-testid="layout-cpu-fallback"><div className="mos-viewer-toolbar"><strong>GPU 미지원 · Canvas 2D 읽기 전용</strong><span>{shapes.length.toLocaleString()} / {(scene.total_shape_count??scene.shapes.length).toLocaleString()} 도형 · DBU {scene.dbu_um}µm</span><button disabled title="GPU 미지원 환경에서는 읽기 전용입니다.">XY 이동</button><button data-testid="layout-fit-selection" disabled={!selectedIds.length} onClick={fitSelection}>선택 맞춤</button><button onClick={()=>setFitBounds(null)}>맞춤</button><button onClick={()=>ref.current?.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='Resistor-layout-2d.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);})}>PNG</button></div>
  <div style={{position:'relative',flex:1,minHeight:250}}><canvas ref={ref} tabIndex={0} className="mos-viewer-canvas" style={{width:'100%',height:'100%',minHeight:250,touchAction:'none'}} aria-label="실제 GDS 정수 좌표의 CPU 2D 뷰" onPointerDown={e=>{if(e.button!==0||e.isPrimary===false)return;const r=e.currentTarget.getBoundingClientRect(),start:[number,number]=[e.clientX-r.left,e.clientY-r.top];gesture.current={start,mode:selectionMode(e)};setMarquee({start,end:start});e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!gesture.current)return;const r=e.currentTarget.getBoundingClientRect();setMarquee({start:gesture.current.start,end:[e.clientX-r.left,e.clientY-r.top]});}} onPointerCancel={()=>{gesture.current=null;setMarquee(null);}} onKeyDown={e=>{const c={apple:/Mac|iPhone|iPad/.test(navigator.platform),readOnly:true};const decision=shortcutDecision('layout',e,c)??shortcutDecision('global',e,c);if(decision?.blocked||e.key==='Delete'||c.apple&&e.key==='Backspace'){e.preventDefault();e.stopPropagation();return;}if(decision?.action.id==='fit_selection'||decision?.action.id==='fit'){e.preventDefault();e.stopPropagation();if(decision.action.id==='fit_selection')fitSelection();else setFitBounds(null);return;}if(e.key==='Escape'){gesture.current=null;setMarquee(null);onSelect(null);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();e.stopPropagation();onSelection?.(paths.current.map(p=>p.id),'replace');}}} onPointerUp={e=>{
   const g=gesture.current,c=ref.current,ctx=c?.getContext('2d'),m=mapping.current;gesture.current=null;setMarquee(null);if(!g||!c||!ctx||!m)return;const r=c.getBoundingClientRect(),end:[number,number]=[e.clientX-r.left,e.clientY-r.top];if(c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);
   if(Math.hypot(end[0]-g.start[0],end[1]-g.start[1])<4){const id=[...paths.current].reverse().find(p=>ctx.isPointInPath(p.path,end[0]*c.width/r.width,end[1]*c.height/r.height,'evenodd'))?.id;onSelection?onSelection(id?[id]:[],selectionMode(e,true)):onSelect(id??null);return;}
   const point=([x,y]:[number,number]):[string,string]=>[String(m.frame.origin[0]+BigInt(Math.round(((x*c.width/r.width-c.width/2)/m.scale+m.centre[0])/m.frame.dbuUm))),String(m.frame.origin[1]+BigInt(Math.round(((c.height/2-y*c.height/r.height)/m.scale+m.centre[1])/m.frame.dbuUm)))];const box=selectionBox(point(g.start),point(end)),allowed=new Set(paths.current.map(p=>p.id));const ids=shapes.filter(s=>allowed.has(s.id)&&maskInRegion(s,box,end[0]>=g.start[0])).map(s=>s.id);onSelection?onSelection(ids,g.mode):onSelect(ids[0]??null);
  }}/>{marquee&&<div className={'mos-selection-region '+(marquee.end[0]<marquee.start[0]?'crossing':'')} style={{left:Math.min(marquee.start[0],marquee.end[0]),top:Math.min(marquee.start[1],marquee.end[1]),width:Math.abs(marquee.end[0]-marquee.start[0]),height:Math.abs(marquee.end[1]-marquee.start[1])}}/>}</div>
  <p role="status">{error||'드래그 영역 선택 · Shift 추가 · Alt 제외 · 실제 XY polygon·hole 표시. GPU 드라이버를 지원하는 환경에서 3D와 편집을 사용하세요. 공정 Z·전류 벡터·검증 결과는 이 화면이 추정하지 않습니다.'}{(scene.truncated||shapes.length<scene.shapes.length)&&' 현재 응답/표시 범위만 표시합니다.'}</p>
 </div>;
}
