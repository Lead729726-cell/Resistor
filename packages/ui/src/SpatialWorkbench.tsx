import {useEffect, useId, useRef, useState} from 'react';
import {useAppearance} from './appearance';
import {readPreference, writePreference} from './ui-preferences';
import type {SpatialStage} from './spatial-stage';
import './spatial-workbench.css';

// Presentation only: this component never receives a project, netlist or engine result.
export default function SpatialWorkbench({active=true}:{active?:boolean}) {
  const appearance=useAppearance(), id=useId(), host=useRef<HTMLDivElement>(null);
  const stage=useRef<SpatialStage|null>(null);
  const [enabled,setEnabled]=useState(()=>readPreference('resistor.edu.spatial-ui.v1')!=='flat');
  const [renderer,setRenderer]=useState<'static'|'loading'|'webgl'>('static');
  const [separated,setSeparated]=useState(false), [angle,setAngle]=useState(0);
  useEffect(()=>{
    const sync=()=>setEnabled(readPreference('resistor.edu.spatial-ui.v1')!=='flat');
    const storage=(event:StorageEvent)=>{if(event.key==='resistor.edu.spatial-ui.v1'||event.key===null)sync();};
    window.addEventListener('resistor-edu-spatial-change',sync);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('resistor-edu-spatial-change',sync);window.removeEventListener('storage',storage);};
  },[]);
  useEffect(()=>{
    if(!active||!enabled||!host.current)return;
    const element=host.current;
    let disposed=false,started=false;
    const start=async()=>{
      if(started||disposed)return;started=true;setRenderer('loading');
      try {
        const {createSpatialStage}=await import('./spatial-stage');
        if(disposed)return;
        stage.current=createSpatialStage(element,()=>{stage.current?.dispose();stage.current=null;setRenderer('static');});
        setRenderer('webgl');
      } catch {if(!disposed)setRenderer('static');}
    };
    // Hidden routes and off-screen panels do not allocate a WebGL context.
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void start();});
    observer.observe(element);
    return()=>{disposed=true;observer.disconnect();stage.current?.dispose();stage.current=null;};
  },[active,enabled]);
  useEffect(()=>{if(renderer==='webgl')stage.current?.update({angle,separated});},[angle,separated,renderer,appearance]);
  const live=enabled&&active&&renderer==='webgl';
  return <figure className="spatial-workbench" data-renderer={live?'webgl':'static'} aria-labelledby={id}>
    <div className="spatial-heading"><span id={id}>SPATIAL WORKBENCH</span><button type="button" aria-pressed={enabled} onClick={()=>{const next=!enabled;setEnabled(next);if(writePreference('resistor.edu.spatial-ui.v1',next?'3d':'flat'))window.dispatchEvent(new Event('resistor-edu-spatial-change'));}}>{enabled?'입체 UI 켜짐':'평면 UI'}{enabled&&renderer==='loading'?' · 준비 중':''}</button></div>
    <div className="spatial-stage" ref={host} role="img" aria-label="회로 보드와 부품을 표현한 학습 UI 개념도. 실제 설계·공정 데이터가 아닙니다.">
      {!live&&<svg className="spatial-fallback" viewBox="0 0 400 220" aria-hidden="true"><g stroke="currentColor" strokeLinejoin="round" fill="var(--panel)"><path d="m70 122 160-80 105 61-160 83z"/><path d="m70 122 105 64v15L70 137z"/><path d="m175 186 160-83v15l-160 83z"/><path d="m85 100 146-72 89 50-146 74z" fill="var(--accent-soft)"/><path d="m100 75 130-64 75 42-130 66z" fill="var(--panel-raised)"/><path d="m135 80 56-27 55 30-56 28z" fill="var(--accent-soft)"/><path d="m136 80 54 31v12l-54-31zm54 31 56-28v12l-56 28z"/><path d="m112 121 33 18 31-16m43-11 45 26 42-22" fill="none" stroke="var(--accent)" strokeWidth="3"/><path d="m203 45 28-14 38 21-28 14z" fill="var(--accent)"/></g></svg>}
      <span className="spatial-axis" aria-hidden="true">X / Y / Z</span>
    </div>
    <div className="spatial-controls" aria-label="입체 UI 보기 조작"><button type="button" aria-label="입체 UI 왼쪽 회전" disabled={!live} onClick={()=>setAngle(a=>a-.35)}>↶</button><button type="button" aria-pressed={separated} disabled={!live} onClick={()=>setSeparated(v=>!v)}>레이어 분리</button><button type="button" aria-label="입체 UI 오른쪽 회전" disabled={!live} onClick={()=>setAngle(a=>a+.35)}>↷</button><button type="button" disabled={!live} onClick={()=>{setAngle(0);setSeparated(false);}}>초기화</button></div>
    <figcaption>학습 UI 모형 · 실제 설계·공정 해석 아님{enabled&&renderer==='static'?' · 정적 보기':''}</figcaption>
  </figure>;
}
