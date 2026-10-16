import {type DesignCatalog} from '@mos/contracts';

export default function OscillatorLibrary({catalog,onSelect,disabled}:{catalog:DesignCatalog;onSelect:(id:string)=>void;disabled:boolean}) {
  const projects=catalog.templates.filter(t=>t.id.startsWith('osc_'));
  if(!projects.length)return null;
  return <section className="it-fields" data-testid="oscillator-library" aria-labelledby="oscillator-heading">
    <h4 id="oscillator-heading">발진기와 센서 · 직접 바꿔보는 4개 프로젝트</h4>
    <p className="it-muted">회로를 선택한 뒤 아래에서 R/C와 프로젝트 이름을 정합니다. 생성 후 Simulation → TRAN을 실행하면 주파수·듀티·공급 전력과 실제 노드 파형을 읽을 수 있습니다.</p>
    <div className="it-grid two">{projects.map(t=><button className="button" key={t.id} disabled={disabled} data-testid={'choose-'+t.id} onClick={()=>onSelect(t.id)}>{t.name}</button>)}</div>
    <p className="it-muted">SKY130 MOS와 이상적 외부 R/C를 쓰는 회로도 참조입니다. 초기 조건으로 기동하며 버스트의 EN은 외부 입력입니다. 물리 레이아웃·잡음·지터·센서 보정은 별도 검증이 필요합니다.</p>
  </section>;
}
