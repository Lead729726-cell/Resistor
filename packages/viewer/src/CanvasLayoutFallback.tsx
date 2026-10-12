import {useEffect,useRef,useState} from 'react';
import type {Scene} from '@mos/contracts';
import {sceneFrame,localRing,type ViewerDisplay} from './geometry';

/** Actual XY polygons, including holes. No GPU, Z reconstruction or editing. */
export function CanvasLayoutFallback({scene,display,onSelect}:{scene:Scene;display:ViewerDisplay;onSelect:(id:string|null)=>void}){
 const ref=useRef<HTMLCanvasElement>(null),paths=useRef<{id:string,path:Path2D}[]>([]);
 const [error,setError]=useState('');
 const limit=Math.min(50000,Math.max(1,display.renderLimit??50000)),shapes=scene.shapes.slice(0,limit);
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx){setError('Canvas 2D도 사용할 수 없습니다.');return;}
  const draw=()=>{try{
   const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
   canvas.width=Math.max(1,Math.round(box.width*dpr));canvas.height=Math.max(1,Math.round(box.height*dpr));
   ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()||'#18212a';ctx.fillRect(0,0,canvas.width,canvas.height);
   const frame=sceneFrame(scene),b=frame.boundsUm;
   const scale=Math.min((canvas.width-40)/Math.max(.001,b[2]-b[0]),(canvas.height-40)/Math.max(.001,b[3]-b[1]));
   const xy=([x,y]:[number,number]):[number,number]=>[canvas.width/2+x*scale,canvas.height/2-y*scale];
   paths.current=[];
   for(const shape of shapes){
    const layer=scene.layers.find(l=>l.id===shape.layer_id),style=display.layers?.[shape.layer_id];
    if(style?.visible===false||(style?.opacity??layer?.opacity??1)<=0)continue;
    const path=new Path2D();for(const ring of [shape.polygon,...(shape.holes??[])]){const points=localRing(ring,frame).map(xy);path.moveTo(...points[0]);for(const p of points.slice(1))path.lineTo(...p);path.closePath();}
    ctx.globalAlpha=style?.opacity??layer?.opacity??.75;ctx.fillStyle=style?.color??layer?.color??'#7d97ae';ctx.fill(path,'evenodd');
    if(style?.pickable!==false&&!style?.locked)paths.current.push({id:shape.id,path});
   }ctx.globalAlpha=1;setError('');
  }catch(c){setError(c instanceof Error?c.message:String(c));}};
  const resize=new ResizeObserver(draw);resize.observe(canvas);const theme=new MutationObserver(draw);theme.observe(document.documentElement,{attributes:true});draw();return()=>{resize.disconnect();theme.disconnect();};
 },[scene,display,limit]);
 return <div className="mos-viewer" data-testid="layout-cpu-fallback"><div className="mos-viewer-toolbar"><strong>GPU 미지원 · Canvas 2D 읽기 전용</strong><span>{shapes.length.toLocaleString()} / {(scene.total_shape_count??scene.shapes.length).toLocaleString()} 도형 · DBU {scene.dbu_um}µm</span><button disabled title="GPU 미지원 환경에서는 읽기 전용입니다.">XY 이동</button><button onClick={()=>ref.current?.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='Resistor-layout-2d.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);})}>PNG</button></div>
  <canvas ref={ref} className="mos-viewer-canvas" style={{width:'100%',height:'100%',minHeight:250,flex:1}} aria-label="실제 GDS 정수 좌표의 CPU 2D 뷰" onClick={e=>{const c=ref.current,ctx=c?.getContext('2d');if(!c||!ctx)return;const r=c.getBoundingClientRect(),x=(e.clientX-r.left)*c.width/r.width,y=(e.clientY-r.top)*c.height/r.height;onSelect([...paths.current].reverse().find(p=>ctx.isPointInPath(p.path,x,y,'evenodd'))?.id??null);}}/>
  <p role="status">{error||'실제 XY polygon·hole 표시. GPU 드라이버를 지원하는 환경에서 3D와 편집을 사용하세요. 공정 Z·전류 벡터·검증 결과는 이 화면이 추정하지 않습니다.'}{(scene.truncated||shapes.length<scene.shapes.length)&&' 현재 응답/표시 범위만 표시합니다.'}</p>
 </div>;
}
