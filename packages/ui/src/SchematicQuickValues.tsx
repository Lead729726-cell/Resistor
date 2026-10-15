import {useEffect,useState} from 'react';
import type {Device} from '@mos/contracts';
import {engineeringValue} from './schematic-drawing';
type Props={device:Device;revision:number;disabled:boolean;placement?:boolean;onDraft?:(parameters:Device['parameters'],valid:boolean)=>void;onApply?:(parameters:Device['parameters'])=>Promise<boolean>};
const fields=(d:Device)=>d.kind==='nmos'||d.kind==='pmos'?[['w_um','W (µm)','um'],['l_um','L (µm)','um']]:d.kind==='resistor'&&!d.model?[['value','저항 (Ω)','ohm']]:d.kind==='capacitor'&&!d.model?[['value','용량 (F)','F']]:d.kind==='voltage'?[['dc',d.stimulus?'DC 바이어스 (V)':'전압 (V)','V']]:d.kind==='current'?[['dc',d.stimulus?'DC 바이어스 (A)':'전류 (A)','A']]:[];
export default function SchematicQuickValues({device,revision,disabled,placement=false,onDraft,onApply}:Props){
 const spec=fields(device),initial=()=>Object.fromEntries(spec.map(([key])=>[key,String(device.parameters[key])]));
 const [draft,setDraft]=useState(initial),[dirty,setDirty]=useState(false),[savedRevision,setSavedRevision]=useState(revision),[error,setError]=useState('');
 function parse(values:Record<string,string>){const parameters={...device.parameters};for(const[key,,unit]of spec){const n=engineeringValue(values[key],unit as Parameters<typeof engineeringValue>[1]);if(['value','w_um','l_um'].includes(key)&&n<=0)throw Error('저항·용량·W/L은 0보다 커야 합니다.');parameters[key]=n;}return parameters;}
 useEffect(()=>{if(!dirty&&!placement){setDraft(initial());setSavedRevision(revision);setError('');}},[revision,device.parameters,dirty]);
 useEffect(()=>{if(placement)onDraft?.(device.parameters,true);},[device.id]);
 if(!spec.length)return null;
 function change(key:string,value:string){const next={...draft,[key]:value};setDraft(next);setDirty(true);try{const params=parse(next);setError('');if(placement)onDraft?.(params,true);}catch(e){setError(e instanceof Error?e.message:String(e));if(placement)onDraft?.(device.parameters,false);}}
 async function apply(){try{const params=parse(draft);if(savedRevision!==revision)throw Error('설계가 바뀌었습니다. 현재 값 불러오기로 확인한 뒤 적용하세요.');if(await onApply?.(params))setDirty(false);}catch(e){setError(e instanceof Error?e.message:String(e));}}
 return <div className="schematic-quick-values" data-testid="schematic-quick-values"><strong>{placement?'배치할 값':device.name}</strong>{spec.map(([key,label])=><label key={key}>{label}<input aria-label={`${placement?'배치 값':device.name} ${label}`} value={draft[key]??''} disabled={disabled} onChange={e=>change(key,e.target.value)} placeholder={key==='value'?'10k / 4.7nF':key==='dc'?'1.8V / 100uA':'0.65um / 650nm'}/></label>)}{!placement&&<><button disabled={disabled||!dirty||!!error||savedRevision!==revision} onClick={()=>void apply()}>값 적용</button>{dirty&&<button disabled={disabled} onClick={()=>{setDraft(initial());setSavedRevision(revision);setDirty(false);setError('');}}>현재 값 불러오기</button>}</>}<small>{placement?'입력한 값으로 다음 소자를 배치합니다.':'단위·모델·허용 범위는 실제 저장 시 다시 검사합니다.'}</small>{error&&<span role="alert">{error}</span>}{dirty&&!placement&&savedRevision!==revision&&<span role="status">다른 변경이 있어 적용 전 현재 값을 확인하세요.</span>}</div>;
}
