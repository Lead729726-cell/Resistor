import type {Doctor} from '@mos/contracts';

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
  const selected=examples.find(item=>item.id===example);
  return <form onSubmit={event=>{event.preventDefault();if(name.trim()&&!busy)onCreate();}} className="new-project-form">
    <p className="modal-note">현재 설계는 그대로 두고 새 프로젝트를 만듭니다. 처음이라면 빈 회로도에서 시작하세요.</p>
    <label className="modal-field">프로젝트 이름<input data-testid="project-name" autoFocus required maxLength={200} value={name} onChange={event=>onName(event.target.value)} disabled={busy}/></label>
    <label className="modal-field">시작할 설계<select data-testid="project-example-select" value={example} disabled={busy} onChange={event=>onExample(event.target.value)}>{examples.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="example-options" aria-label="시작 설계 선택">{examples.map(item=><button type="button" key={item.id} disabled={busy} aria-pressed={example===item.id} data-testid={`project-template-${item.id}`} className={example===item.id?'selected':''} onClick={()=>onExample(item.id)}><div><strong>{item.name}{item.id==='schematic'&&<span className="tag">처음 시작</span>}</strong><span>{item.description}</span></div><span className="radio-indicator" aria-hidden="true"/></button>)}</div>
    <p className="project-requirement" role="status">{selected?.requirement}{!doctor?.pdk.available&&!['schematic','fixture'].includes(example)&&' · 현재 PDK가 준비되지 않았습니다. 실제 모델·검증은 PDK 연결 후 실행하세요.'}</p>
    <button type="submit" className="button primary full" data-testid="project-create" disabled={!name.trim()||busy}>{busy?'생성 중…':'프로젝트 생성 / Create'}</button>
  </form>;
}
