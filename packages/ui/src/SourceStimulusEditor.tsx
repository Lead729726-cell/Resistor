import {useEffect,useState} from 'react';
import type {Device,SchematicCommand,SourceStimulus} from '@mos/contracts';
type Props={device:Device;revision:number;disabled:boolean;onCommand:(c:SchematicCommand)=>Promise<boolean>};
export default function SourceStimulusEditor({device,revision,disabled,onCommand}:Props){
 const initial=()=>{const s=device.stimulus;return {kind:s?.kind??'dc',dc:String(device.parameters.dc??0),low:String(s?.kind==='pulse'?s.low:0),high:String(s?.kind==='pulse'?s.high:device.kind==='voltage'?1.8:.001),delay:String(s?.kind==='pulse'?s.delay_s*1e9:2),rise:String(s?.kind==='pulse'?s.rise_s*1e12:100),fall:String(s?.kind==='pulse'?s.fall_s*1e12:100),width:String(s?.kind==='pulse'?s.width_s*1e9:4.9),period:String(s?.kind==='pulse'?s.period_s*1e9:10),points:s?.kind==='pwl'?s.points.map(([t,v])=>`${t*1e9} ${v}`).join('\n'):`0 0\n2 0\n2.1 ${device.kind==='voltage'?1.8:.001}\n7 ${device.kind==='voltage'?1.8:.001}\n7.1 0\n40 0`};};
 const [draft,setDraft]=useState(initial),[dirty,setDirty]=useState(false),[base,setBase]=useState(revision),[error,setError]=useState('');
 useEffect(()=>{if(!dirty){setDraft(initial());setBase(revision);}},[device.id,device.stimulus,device.parameters.dc,revision,dirty]);
 const num=(v:string)=>{if(!v.trim()||!Number.isFinite(Number(v)))throw Error('단위가 표시된 유한한 숫자를 입력하세요.');return Number(v);};
 const change=(key:keyof typeof draft,value:string)=>{setDraft(d=>({...d,[key]:value}));setDirty(true);setError('');};
 const unit=device.kind==='voltage'?'V':'A';
 async function apply(){try{
  if(base!==revision)throw Error('설계가 바뀌었습니다. 현재 값을 다시 불러오세요.');
  let stimulus:SourceStimulus|null=null;
  if(draft.kind==='pulse')stimulus={kind:'pulse',low:num(draft.low),high:num(draft.high),delay_s:num(draft.delay)*1e-9,rise_s:num(draft.rise)*1e-12,fall_s:num(draft.fall)*1e-12,width_s:num(draft.width)*1e-9,period_s:num(draft.period)*1e-9};
  if(draft.kind==='pwl')stimulus={kind:'pwl',points:draft.points.trim().split(/\r?\n/).map(row=>{const v=row.trim().split(/[\s,]+/);if(v.length!==2)throw Error('PWL은 한 줄에 시간(ns), 값 두 개를 입력하세요.');return [num(v[0])*1e-9,num(v[1])];})};
  if(await onCommand({type:'set_source',id:device.id,dc:num(draft.dc),stimulus})){setDirty(false);setError('');}
 }catch(e){setError(e instanceof Error?e.message:String(e));}}
 return <section className="source-stimulus" aria-label={`${device.name} 동적 입력`}><strong>{device.name} · 실제 소스 설정</strong><div className="dynamic-fields">
  <label>파형<select aria-label={`${device.name} 소스 파형`} disabled={disabled} value={draft.kind} onChange={e=>change('kind',e.target.value as typeof draft.kind)}><option value="dc">DC</option><option value="pulse">PULSE</option><option value="pwl">PWL · 비반복</option></select></label>
  <label>DC 바이어스 ({unit})<input aria-label={`${device.name} DC 바이어스`} value={draft.dc} disabled={disabled} onChange={e=>change('dc',e.target.value)}/></label>
  {draft.kind==='pulse'&&([['low',`초기 레벨 (${unit})`],['high',`펄스 레벨 (${unit})`],['delay','시작 지연 (ns)'],['rise','상승 구간 (ps)'],['fall','하강 구간 (ps)'],['width','High 평탄부 (ns)'],['period','주기 (ns)']] as const).map(([k,label])=><label key={k}>{label}<input aria-label={`${device.name} ${label}`} value={draft[k]} disabled={disabled} onChange={e=>change(k,e.target.value)}/></label>)}
  {draft.kind==='pwl'&&<label>시간(ns) 값({unit}) · 한 줄에 한 점<textarea aria-label={`${device.name} PWL 점`} value={draft.points} disabled={disabled} onChange={e=>change('points',e.target.value)}/></label>}
  <button disabled={disabled||!dirty||base!==revision} onClick={()=>void apply()}>소스 적용</button><button disabled={disabled} onClick={()=>{setDraft(initial());setBase(revision);setDirty(false);setError('');}}>현재 값 불러오기</button>
 </div><p>DC는 OP 바이어스, PULSE/PWL은 transient 입력입니다. PWL은 0 ns부터 시작하며 마지막 값을 유지합니다. 시간 간격은 가장 짧은 전이의 1/5 이하로 설정하세요.</p>{dirty&&base!==revision&&<p role="alert">다른 변경이 있어 현재 값 확인이 필요합니다.</p>}{error&&<p role="alert">{error}</p>}</section>;
}
