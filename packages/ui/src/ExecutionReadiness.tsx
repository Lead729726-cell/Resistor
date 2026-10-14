import type {Doctor,Project} from '@mos/contracts';
import './workbench-usability.css';

export type ExecutionKind='simulation'|'drc'|'lvs'|'pex';
const tasks:[ExecutionKind,string,string][]=[['simulation','전압·전류 해석','유효한 회로와 입력 조건으로 실제 파형을 계산합니다.'],['drc','DRC · 설계 규칙','실제 레이아웃을 PDK 규칙과 비교합니다.'],['lvs','LVS · 연결 비교','레이아웃과 회로도의 실제 소자·연결을 비교합니다.'],['pex','PEX · 기생 추출','레이아웃에서 R/C를 추출합니다.']];
export default function ExecutionReadiness({project,doctor,reasons,onSchematic,onLayout,onSettings,onDoctor,onRun,busy}:{project:Project|null;doctor:Doctor|null;reasons:Record<ExecutionKind,string|undefined>;onSchematic:()=>void;onLayout:()=>void;onSettings:()=>void;onDoctor:()=>void;onRun:(kind:ExecutionKind)=>void;busy:boolean}){
 return <section className="execution-readiness" data-testid="execution-readiness">
  <p className="modal-note">준비 상태는 실행 결과와 다릅니다. 실행 후 실제 완료·실패·미판정과 해당 설계 번호를 확인하세요.</p>
  <div className="readiness-context"><strong>{project?.name||'프로젝트 없음'}</strong><code>{project?`${project.cell} · r${project.revision}`:'프로젝트를 먼저 여세요'}</code><span>{doctor?.runner||'엔진 상태 미확인'}</span></div>
  <div className="readiness-links"><button className="button small" disabled={!project} onClick={onSchematic}>회로·연결 확인</button><button className="button small" disabled={!project} onClick={onLayout}>레이아웃 확인</button><button className="button small" disabled={!project} onClick={onSettings}>입력·해석 조건</button><button className="button small" onClick={onDoctor}>엔진·도구 준비</button></div>
  <div className="readiness-tasks">{tasks.map(([kind,label,description])=><article key={kind} data-testid={`readiness-${kind}`}><div><strong>{label}</strong><span className="status neutral">{reasons[kind]?'준비 필요':'실행 요청 가능'}</span></div><p>{description}</p>{reasons[kind]?<p className="readiness-reason">{reasons[kind]}</p>:<p>핀·바이어스·PDK·레이아웃 입력의 유효성은 실제 실행에서 확인합니다.</p>}<button className="button small" disabled={busy||!!reasons[kind]} onClick={()=>onRun(kind)}>{label} 실행</button></article>)}</div>
 </section>;
}
