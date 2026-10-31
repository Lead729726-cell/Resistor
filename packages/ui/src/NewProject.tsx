import type {Doctor} from '@mos/contracts';
import {useEffect,useRef,useState} from 'react';
import './guided-workbench.css';

const examples = [
  {id:'schematic',name:'빈 회로도',description:'저항·전원부터 직접 배치하고 연결 · Docker 없이 시작',requirement:'추가 PDK 없이 시작 가능'},
  {id:'layout',name:'빈 SKY130 레이아웃',description:'사각형·다각형·배선으로 마스크 직접 그리기',requirement:'공개 SKY130 레이어 사용 · 물리 검증은 별도'},
  {id:'inverter',name:'CMOS inverter',description:'입력과 출력이 반전되는 회로 · 회로도와 레이아웃',requirement:'SKY130 모델 · ngspice 해석'},
  {id:'mosfet',name:'MOSFET characterization',description:'단일 소자의 W/L과 전류·전압 특성',requirement:'SKY130 모델 · ngspice 해석'},
  {id:'current_mirror',name:'Current mirror',description:'두 MOS와 contact / well tap 레이아웃',requirement:'SKY130 모델 · ngspice 해석'},
  {id:'differential_pair',name:'Differential pair',description:'차동 입력 core · bias / load testbench',requirement:'SKY130 모델 · ngspice 해석'},
  {id:'wire',name:'Wire extraction',description:'긴 배선의 기생성분 추출',requirement:'Magic 추출 도구 추가 준비'},
  {id:'fixture',name:'Geometry fixture',description:'교육용 기하 · 실제 PDK 검증 결과 아님',requirement:'도형 확인용 · 회로 해석과 구분'},
] as const;

export default function NewProject({name,example,doctor,busy,onName,onExample,onCreate}:{name:string;example:string;doctor:Doctor|null;busy:boolean;onName:(value:string)=>void;onExample:(value:string)=>void;onCreate:()=>void}){
  const [step,setStep]=useState(0),[choicePage,setChoicePage]=useState(Math.max(0,Math.floor(examples.findIndex(item=>item.id===example)/4)));
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[step]);
  const selected=examples.find(item=>item.id===example);
  const canAdvance=!!selected&&(step!==1||!!name.trim());
  return <form onSubmit={event=>{event.preventDefault();if(busy||!canAdvance)return;if(step<2)setStep(value=>value+1);else if(name.trim())onCreate();}} className="new-project-form guided-pages" data-testid="new-project-flow" data-step={step}>
    <div className="guided-progress"><span>새 프로젝트</span><span>{step+1} / 3</span></div>
    <h3 ref={heading} tabIndex={-1}>{['어디서 시작할까요?','프로젝트 이름을 정하세요','새 설계를 만들까요?'][step]}</h3>
    <p className="guided-description">{['처음이라면 빈 회로도에서 시작하세요. 한 번에 하나의 시작점을 고릅니다.','이름은 이전·다음 단계를 오가도 그대로 유지됩니다.','선택한 시작점과 이름을 확인한 뒤 생성하세요.'][step]}</p>
    <div className="guided-page">
      {step===0&&<><div className="task-choices" role="group" aria-label="시작 설계 선택">{examples.slice(choicePage*4,choicePage*4+4).map(item=><button type="button" key={item.id} disabled={busy} aria-pressed={example===item.id} data-testid={`project-template-${item.id}`} className={example===item.id?'selected':''} style={example===item.id?{borderColor:'var(--accent)'}:undefined} onClick={()=>onExample(item.id)}><strong>{item.name}</strong><span>{item.description}</span>{example===item.id&&<i aria-hidden="true">✓</i>}</button>)}</div><div className="guided-panel-choices" style={{marginTop:16,alignItems:'center',justifyContent:'center'}} aria-label="다른 시작점 보기"><button type="button" className="button small" disabled={busy||choicePage===0} onClick={()=>setChoicePage(value=>value-1)}>앞선 시작점</button><span>{choicePage+1} / {Math.ceil(examples.length/4)}</span><button type="button" className="button small" disabled={busy||(choicePage+1)*4>=examples.length} onClick={()=>setChoicePage(value=>value+1)}>다른 시작점</button></div></>}
      {step===1&&<><label className="modal-field">프로젝트 이름<input data-testid="project-name" required maxLength={200} value={name} onChange={event=>onName(event.target.value)} disabled={busy}/></label><p className="modal-note">시작점 · {selected?.name}</p></>}
      {step===2&&<><div className="guided-summary"><div><small>프로젝트</small><strong style={{overflowWrap:'anywhere'}}>{name.trim()}</strong></div><div><small>시작점</small><strong>{selected?.name}</strong></div></div><p className="project-requirement" role="status">{selected?.requirement}{!doctor?.pdk.available&&!['schematic','fixture'].includes(example)&&' · 현재 PDK가 준비되지 않았습니다. 실제 모델·검증은 PDK 연결 후 실행하세요.'}</p><p className="modal-note">현재 설계는 보존됩니다. 생성 후 새 프로젝트에서 편집을 시작합니다.</p><button type="submit" className="button primary full" data-testid="project-create" disabled={!selected||!name.trim()||busy}>{busy?'생성 중…':'프로젝트 생성 / Create'}</button></>}
    </div>
    <div className="guided-navigation"><button type="button" className="button" data-testid="guided-back" disabled={step===0||busy} onClick={()=>setStep(value=>value-1)}>← 이전</button><span>입력은 단계 이동 중 유지됩니다</span>{step<2&&<button type="submit" className="button primary" data-testid="guided-next" disabled={busy||!canAdvance}>다음 →</button>}</div>
  </form>;
}
