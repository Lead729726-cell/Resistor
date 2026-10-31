import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {rpc,setRpcOverride,type Project,type Scene} from '@mos/contracts';
import {LayoutViewer} from '@mos/viewer';
import CoursePractice from '../../src/CoursePractice';
import CircuitPuzzleLab from '../../src/CircuitPuzzleLab';
import InverterLesson from '../../src/InverterLesson';
import AppearanceControl from '../../src/AppearanceControl';
import SelfStudy from '../../src/SelfStudy';
import '../../src/styles.css';
import './recording.css';
declare const __REHEARSAL_TOKEN__:string;
setRpcOverride(async(method,params)=>{const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Resistor-Rehearsal':__REHEARSAL_TOKEN__},body:JSON.stringify({method,params})});const body=await response.json();if(!response.ok||!body.ok)throw Object.assign(Error(body.error?.message||'촬영 서버 연결 실패'),{code:body.error?.code});return body.result;});
function Recording(){
 const [tab,setTab]=useState<'workbook'|'puzzle'|'linked'|'study'>('workbook'),[studyOpened,setStudyOpened]=useState(false),[project,setProject]=useState<Project|null>(null),[scene,setScene]=useState<Scene|null>(null),[device,setDevice]=useState<string|null>(null),[shape,setShape]=useState<string|null>(null),[mode,setMode]=useState<'2d'|'3d'>('2d');
 const openStudy=()=>{setStudyOpened(true);setTab('study');};
 const accept=async(p:Project)=>{setProject(p);setScene(await rpc<Scene>('view.get_scene',{project_id:p.id,max_shapes:2000}));};
 return <><header className="recording-banner"><strong>Resistor Edu · 소스 촬영 실습</strong><span>정식 설치·시리얼 인증 시연 아님 · 별도 촬영 기록 · 외부 AI 호출 차단</span><AppearanceControl/></header><nav className="recording-tabs" aria-label="촬영 실습 화면"><button aria-pressed={tab==='workbook'} onClick={()=>setTab('workbook')}>첫 회로 워크북</button><button aria-pressed={tab==='puzzle'} onClick={()=>setTab('puzzle')}>회로 연결·실제 파형</button><button aria-pressed={tab==='linked'} onClick={()=>setTab('linked')}>CMOS 연결 실습</button><button aria-pressed={tab==='study'} onClick={openStudy}>퀴즈·자율학습</button><a href="/kit/" target="_blank" rel="noreferrer">강사용 촬영 데스크 ↗</a></nav>
 <div hidden={tab!=='workbook'}><CoursePractice active={tab==='workbook'} onAppPractice={()=>setTab('puzzle')}/></div>
 <div hidden={tab!=='puzzle'} className="recording-puzzle"><CircuitPuzzleLab onBank={openStudy} storeId="resistor-edu-recording" initialPurpose="qa"/></div>
 <div hidden={tab!=='study'}>{studyOpened&&<SelfStudy initialPanel="questions" initialPurpose="qa" active={tab==='study'}/>}</div>
 <div hidden={tab!=='linked'} className="recording-linked"><InverterLesson active={tab==='linked'} project={project} selectedDeviceId={device} selectedShapeId={shape} onProject={accept} onView={view=>{if(view==='layout3d'||view==='section')setMode('3d');else setMode('2d');}} onInspect={(id,shapeId)=>{setDevice(id);setShape(shapeId??null);}} onCourses={()=>setTab('workbook')}/>
 {project&&<section className="recording-linked-view"><h2>현재 실습의 소자·핀과 레이아웃</h2><p>실제 프로젝트 r{project.revision} · layer extrusion · Z 배율 1 · 제조 공정 시뮬레이션 아님</p><div className="recording-devices">{project.schematic.devices.map(d=><button key={d.id} aria-pressed={device===d.id} onClick={()=>setDevice(d.id)}><b>{d.name}</b> · {d.model||d.kind}<br/>{Object.entries(d.pins).map(([pin,net])=>pin+'='+net).join(' · ')}</button>)}</div><button onClick={()=>setMode(mode==='2d'?'3d':'2d')}>{mode==='2d'?'3D로 보기':'2D로 보기'}</button><div className="recording-viewer"><LayoutViewer scene={scene} mode={mode} selection={shape} onSelect={setShape} onCommand={async()=>{throw Error('촬영 뷰어는 읽기 전용입니다.');}} readOnly sourceLabel="실제 Edu 실습 프로젝트 · 돌출 표현"/></div><details><summary>공정 레이어 매핑·표시 적층 정보</summary><pre>{JSON.stringify(scene?.layers,null,2)}</pre></details></section>}</div></>;
}
createRoot(document.getElementById('root')!).render(<Recording/>);
