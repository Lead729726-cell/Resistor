import {useEffect,useState} from 'react';
import type {SchematicCell,SchematicCommand,Testbench,TimingRecipe} from '@mos/contracts';
import SourceStimulusEditor from './SourceStimulusEditor';
import './dynamic-signals.css';
interface Props {document:SchematicCell;testbench?:Testbench;revision:number;disabled:boolean;onCommand:(c:SchematicCommand)=>Promise<boolean>;onRun?:()=>void;runBusy?:boolean;runReason?:string;root:boolean}
export default function DynamicSignalSetup({document,testbench,revision,disabled,onCommand,onRun,runBusy,runReason,root}:Props){
 const sources=document.devices.filter(d=>d.kind==='voltage'||d.kind==='current'),nets=[...new Set(document.devices.flatMap(d=>Object.values(d.pins)).filter(n=>n&&n!=='0'))];
 const [source,setSource]=useState(''),selected=sources.find(d=>d.id===source)||sources.find(d=>d.stimulus)||sources.find(d=>d.pins['+']==='A')||sources[0];
 const defaultRecipe=():TimingRecipe=>document.timing_check??{schema_version:1,input:nets.includes('A')?'A':nets[0]??'IN',output:document.logic_practice?.outputs[0]??nets.find(n=>n!==nets[0])??'OUT',polarity:'inverting',low_V:0,high_V:1.8,start_s:0,end_s:testbench?.duration_s??40e-9,settle_s:1e-9,max_delay_s:1e-9,max_rise_s:1e-9,max_fall_s:1e-9,minimum_cycles:2};
 const timeText=(v:number)=>String(Number(v.toPrecision(15)));
 const initial=()=>{const r=defaultRecipe();return {input:r.input,output:r.output,polarity:r.polarity,low:String(r.low_V),high:String(r.high_V),start:timeText(r.start_s*1e9),end:timeText(r.end_s*1e9),settle:timeText(r.settle_s*1e9),delay:timeText(r.max_delay_s*1e12),rise:timeText(r.max_rise_s*1e12),fall:timeText(r.max_fall_s*1e12),cycles:String(r.minimum_cycles),duration:timeText((testbench?.duration_s??40e-9)*1e9),step:timeText((testbench?.step_s??5e-12)*1e12)};};
 const [draft,setDraft]=useState(initial),[dirty,setDirty]=useState({time:false,timing:false}),[base,setBase]=useState(revision),[error,setError]=useState('');
 useEffect(()=>{if(!dirty.time&&!dirty.timing){setDraft(initial());setBase(revision);}},[revision,document.timing_check,testbench,dirty]);
 const change=(k:keyof typeof draft,value:string)=>{setDirty(d=>({...d,[k==='duration'||k==='step'?'time':'timing']:true}));setDraft(d=>({...d,[k]:value}));setError('');};
 const n=(v:string)=>{if(!v.trim()||!Number.isFinite(Number(v)))throw Error('유한한 수치를 입력하세요.');return Number(v);};
 async function apply(kind:'timing'|'time') {try{if(base!==revision)throw Error('현재 값을 다시 불러온 뒤 적용하세요.');
  const ok=kind==='time'?await onCommand({type:'update_testbench',settings:{analysis:'tran',duration_s:n(draft.duration)*1e-9,step_s:n(draft.step)*1e-12}}):await onCommand({type:'set_timing_check',recipe:{schema_version:1,input:draft.input,output:draft.output,polarity:draft.polarity,low_V:n(draft.low),high_V:n(draft.high),start_s:n(draft.start)*1e-9,end_s:n(draft.end)*1e-9,settle_s:n(draft.settle)*1e-9,max_delay_s:n(draft.delay)*1e-12,max_rise_s:n(draft.rise)*1e-12,max_fall_s:n(draft.fall)*1e-12,minimum_cycles:n(draft.cycles)}});
  if(ok){setDirty(d=>({...d,[kind]:false}));setError('');}
 }catch(e){setError(e instanceof Error?e.message:String(e));}}
 return <details className="dynamic-signal-setup"><summary>동적 신호·지연 검증 · PULSE / PWL</summary>
  {root&&document.logic_practice&&<div className="dynamic-preset"><strong>100 MHz 단일 입력 실험</strong><span>A: 0→VDD, 지연 2 ns, 상승·하강 100 ps, High 평탄부 4.9 ns. B는 AND/ MUX에서 1, 반가산기에서 0; MUX SEL=1. 해석 40 ns / 최대 5 ps.</span><button disabled={disabled} onClick={()=>void onCommand({type:'configure_logic_transient'})}>클록 실험 설정</button></div>}
  <label>편집할 실제 소스<select aria-label="동적 입력 소스" disabled={disabled} value={selected?.id??''} onChange={e=>setSource(e.target.value)}>{sources.map(d=><option key={d.id} value={d.id}>{d.name} · {d.pins['+']} → {d.pins['-']}</option>)}</select></label>
  {selected?<SourceStimulusEditor key={selected.id} device={selected} revision={revision} disabled={disabled} onCommand={onCommand}/>:<p>전압원 또는 전류원을 먼저 배치하세요. 전원·입력 소스를 자동으로 추정하지 않습니다.</p>}
  {root&&<><div className="dynamic-fields"><label>해석 길이 (ns)<input aria-label="동적 해석 길이 ns" value={draft.duration} disabled={disabled} onChange={e=>change('duration',e.target.value)}/></label><label>최대 시간 간격 (ps)<input aria-label="동적 최대 시간 간격 ps" value={draft.step} disabled={disabled} onChange={e=>change('step',e.target.value)}/></label><button disabled={disabled||base!==revision} onClick={()=>void apply('time')}>Transient 조건 저장</button></div>
  <details><summary>정착 후 논리 관계와 주기별 지연 한도</summary><div className="dynamic-fields">
   {(['input','output'] as const).map(k=><label key={k}>{k==='input'?'입력 넷':'출력 넷'}<select aria-label={`타이밍 ${k==='input'?'입력':'출력'} 넷`} value={draft[k]} disabled={disabled} onChange={e=>change(k,e.target.value)}>{[...new Set([draft[k],...nets])].map(net=><option key={net}>{net}</option>)}</select></label>)}
   <label>기대 관계<select aria-label="타이밍 기대 관계" value={draft.polarity} disabled={disabled} onChange={e=>change('polarity',e.target.value as typeof draft.polarity)}><option value="inverting">반전</option><option value="same">동상</option></select></label>
   {([['low','Low (V)'],['high','High (V)'],['start','관찰 시작 (ns)'],['end','관찰 끝 (ns)'],['settle','입력 전이 후 정착 (ns)'],['delay','지연 상한 (ps)'],['rise','상승 시간 상한 (ps)'],['fall','하강 시간 상한 (ps)'],['cycles','최소 양방향 주기']] as const).map(([k,label])=><label key={k}>{label}<input aria-label={`타이밍 ${label}`} value={draft[k]} disabled={disabled} onChange={e=>change(k,e.target.value)}/></label>)}
   <button disabled={disabled||base!==revision} onClick={()=>void apply('timing')}>검증 기준 저장</button><button disabled={disabled} onClick={()=>{setDraft(initial());setDirty({time:false,timing:false});setBase(revision);setError('');}}>현재 조건 불러오기</button>
  </div><p>단일 입력 경로의 반전/동상 조건입니다. 다른 제어 입력은 그 경로가 활성화되도록 고정하세요. 전체 진리표·STA·제조 검증과 구분됩니다. 기준과 원본 파형이 같은 run에 저장됩니다.</p></details>
  <button className="button primary small" disabled={disabled||runBusy||!!runReason||dirty.time||dirty.timing} title={runReason} onClick={onRun}>{runBusy?'실행 중…':'실제 Transient 실행'}</button><p>편집한 값은 소스 적용·조건 저장·검증 기준 저장 후 실행에 반영됩니다.</p>{runReason&&<p>{runReason}</p>}</>}
  {(dirty.time||dirty.timing)&&base!==revision&&<p role="alert">설계가 바뀌었습니다. 현재 조건을 다시 불러오세요.</p>}{error&&<p role="alert">{error}</p>}
 </details>;
}
