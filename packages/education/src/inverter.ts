import type {Project,Run,Scene,Testbench} from '../../contracts/src/index.ts';
import {propagationDelay,timingMeasurements,validateWaveform} from '../../analysis/src/waveform.ts';

export const inverterLesson={
 id:'cmos-inverter-connected-v1',title:'CMOS 인버터 · 연결하고 실험하기',
 goal:'입력·출력·전원 연결과 실제 레이아웃을 관찰하고 부하 변화의 이유를 설명합니다.',
 prerequisites:['전압·전류·접지와 커패시터의 기초','NMOS / PMOS의 D·G·S·B 단자','회로도와 마스크 레이아웃의 차이'],
 conditions:'공개 SKY130 nfet_01v8 / pfet_01v8_hvt, TT·27°C·1.8V. VIN 0↔1.8V, 지연 1ns·전이 100ps·주기 10ns, 30ns transient. 출력 ideal CLOAD 5fF→50fF.',
 observations:['두 gate의 A 연결과 공통 drain Y, VPWR / VGND / body 연결','원본 GDS의 pin 주석과 도형·소자 ID 연결 여부','교육용 표시 적층·layer mapping·절단 위치','A / Y 파형, 50% 지연과 10–90% 전이 시간'],
 questions:['부하가 바뀌어도 회로의 논리 연결과 마스크가 그대로인 이유는 무엇인가요?','Y의 변화와 실제 run의 지연 수치가 예측과 일치하나요?','이 실험으로 배선 기생·매칭·제조 적합성을 판단할 수 있나요? 부족한 데이터는 무엇인가요?'],
 concepts:[{id:'load',question:'출력 부하를 늘릴 때 예상하는 변화는?',options:['논리 반전은 유지되며 전이 시간이 달라질 수 있다','마스크 배선이 자동으로 길어진다','항상 모든 검증을 통과한다']},{id:'mapping',question:'GDS의 A 라벨과 회로의 A가 같으면?',options:['주석 후보를 찾을 수 있지만 전기적 동등성은 별도 확인한다','그 자체로 LVS 통과이다','모든 MOS의 ID를 알 수 있다']},{id:'z',question:'레이어를 Z로 돌출한 그림은?',options:['입력 적층에 따른 표시이며 공정 시뮬레이션과 구분한다','GDS만으로 얻은 실제 단면이다','실측 두께·피복을 증명한다']}],
 references:[{title:'OpenROAD physical design flow',url:'https://github.com/The-OpenROAD-Project/OpenROAD/blob/master/README.md'},{title:'ALIGN layout constraints',url:'https://align-analoglayout.github.io/ALIGN-public/notes/const.html'},{title:'KLayout 2.5D extrusion',url:'https://www.klayout.de/doc/about/25d_view.html'},{title:'KLayout XSection process description',url:'https://klayoutmatthias.github.io/xsection/'}],
 limits:'고정 공개 inv_1 + tap 레이아웃을 읽는 제한된 예제입니다. CLOAD는 testbench의 이상 소자이며 추출한 배선 기생이 아닙니다. 사전 제작 예제가 현재 설계의 DRC/LVS/PEX 통과를 뜻하지 않습니다.'
};
export interface LearningContext {schema_version:1;edition:'edu';product_id:'resistor.edu';project_id:string;data_revision:number;engine:{id:string|null;code_sha256:string|null;tool_versions:Record<string,string|null>};process:{id:string;version:string|null;model_scope:string}}
export interface LearningMetrics {rise_s:number|null;fall_s:number|null;tphl_s:number|null;tplh_s:number|null;output_min_V:number;output_max_V:number;samples:number;source:'actual_ngspice_samples';method:string}
export interface LearningTrial {slot:'before'|'after';project_id:string;revision:number;conditions:Testbench;geometry_sha256:string;geometry_hash_method?:string;circuit_sha256?:string|null;input_signature?:string|null;freshness?:Run['freshness'];run_id:string|null;execution_status:Run['execution_status']|'unavailable';analysis_result:Run['analysis_result'];tool:string;message?:string;metrics:LearningMetrics|null;context:LearningContext}
export interface LearningRecord {schema_version:1;edition:'edu';id:string;version:number;course_id:string;purpose?:'practice'|'qa';project_id:string;source_project_id:string|null;created_at:string;updated_at:string;context:LearningContext;trials:LearningTrial[];student:{explanation:string;pre_answers:Record<string,string>;post_answers:Record<string,string>;started_at:string;submitted_at:string|null;saved_at?:string|null;written_for_revision?:number|null;reviewed_run_ids?:string[]};progress:{observed_views:string[]};evaluation:{status:'not_evaluated';education_effect_proven:false;auto_grade:null;explanation_accuracy:'teacher_review_pending'};learning_completion_is_engine_verification:false}
export function loadFromFemtoFarads(value:number){if(!Number.isFinite(value)||value<1||value>1000)throw Error('부하는 1–1000 fF 범위의 유한한 값이어야 합니다.');return value*1e-15;}
export function metricsFromRun(run:Run,conditions:Testbench):LearningMetrics|null{
 if(run.execution_status!=='completed'||run.native_execution===false||run.workflow==='imported-results')return null;
 const input=run.waveforms?.find(w=>w.name==='A'&&w.unit==='V'),output=run.waveforms?.find(w=>w.name==='Y'&&w.unit==='V');
 if(!input||!output||(input.x_unit??run.measurements?.x_unit)!=='s'||(output.x_unit??run.measurements?.x_unit)!=='s')return null;
 validateWaveform(input);validateWaveform(output);const a=Math.max(input.x[0],output.x[0]),b=Math.min(input.x.at(-1)!,output.x.at(-1)!);if(a>=b)return null;
 const supply=conditions.supply_V;if(!supply||!Number.isFinite(supply))return null;const timing=timingMeasurements(output,a,b,0,supply);
 return {rise_s:timing.rise,fall_s:timing.fall,tphl_s:propagationDelay(input,output,a,b,supply/2,supply/2,'rising','falling')?.delay??null,tplh_s:propagationDelay(input,output,a,b,supply/2,supply/2,'falling','rising')?.delay??null,output_min_V:Math.min(...output.y),output_max_V:Math.max(...output.y),samples:output.x.length,source:'actual_ngspice_samples',method:'동일 run의 실제 비균일 X 표본에서 선형 보간. 첫 완전 전이의 10–90%, 입력/출력의 VDD/2 교차.'};
}
export function linkedObservation(project:Project,scene:Scene,deviceId:string|null,shapeId:string|null){
 const device=project.schematic.devices.find(d=>d.id===deviceId),shape=scene.shapes.find(s=>s.id===shapeId);
 if(scene.project_id!==project.id||scene.revision!==project.revision)return {status:'unknown',reason:'프로젝트 / revision이 다른 장면입니다.',device:null,candidates:[]};
 const pins=new Set(Object.values(device?.pins||{}));
 const annotated=device?scene.shapes.filter(s=>s.device_id===device.id||s.net&&pins.has(s.net)).slice(0,50).map(s=>({id:s.id,layer_id:s.layer_id,net:s.net??null,device_id:s.device_id??null,status:s.device_id===device.id?'device_annotation':'net_annotation_candidate',box:null as [string,string,string,string]|null})):[];
 const pinCandidates=device?(scene.pins||[]).filter(p=>p.net&&pins.has(p.net)||p.name&&pins.has(p.name)).filter(p=>!annotated.some(s=>s.id===p.id)).map(p=>({id:p.id,layer_id:p.layer_id,net:p.net||p.name,device_id:null,status:'pin_annotation_candidate',box:p.box})):[];
 const candidates=[...annotated,...pinCandidates].slice(0,50),pin=(scene.pins||[]).find(p=>p.id===shapeId);
 const status=!device?'unknown':shape?.device_id===device.id?'device_annotation':shape?.net&&pins.has(shape.net)?'net_annotation_candidate':pin&&(pins.has(pin.net||pin.name))?'pin_annotation_candidate':'unknown';
 return {status,reason:status==='device_annotation'?'원본 device_id 주석 일치 · 전기적 LVS 확인은 별도':['net_annotation_candidate','pin_annotation_candidate'].includes(status)?'원본 net / pin 주석 후보 · 이 도형이 해당 MOS라는 판정은 아님':'해당 소자와 도형의 직접 연결을 확인할 데이터가 없습니다.',device:device?{id:device.id,name:device.name,pins:device.pins,model:device.model}:null,candidates};
}
export function compareTrials(record:LearningRecord,currentRevision:number){
 const measured=(t:LearningTrial)=>t.execution_status==='completed'&&!!t.run_id&&!!t.metrics;
 const before=[...record.trials].reverse().find(t=>t.slot==='before'&&measured(t)),after=[...record.trials].reverse().find(t=>t.slot==='after'&&measured(t));
 if(!before||!after)return {available:false,reason:'같은 프로젝트의 변경 전후 실제 완료 실행 수치가 필요합니다.',current_relevance:'unavailable',delta:null,before,after};
 const otherKeys=['analysis','corner','temperature_C','supply_V','duration_s','step_s','vds_V','vbs_V'] as const;
 if(!before.input_signature||before.input_signature!==after.input_signature)return {available:false,reason:'실제 run의 모델·도구·룰·엔진 입력 지문이 다르거나 없으므로 비교를 보류합니다.',current_relevance:'unavailable',delta:null,before,after};
 if(before.project_id!==record.project_id||after.project_id!==record.project_id||before.run_id===after.run_id||before.geometry_sha256!==after.geometry_sha256||before.geometry_hash_method!=='klayout-semantic-v1'||after.geometry_hash_method!=='klayout-semantic-v1'||!before.context.engine.code_sha256||!before.context.process.version||before.context.engine.id!==after.context.engine.id||before.context.process.id!==after.context.process.id||before.context.engine.tool_versions.ngspice!==after.context.engine.tool_versions.ngspice||!before.circuit_sha256||before.circuit_sha256!==after.circuit_sha256||before.context.engine.code_sha256!==after.context.engine.code_sha256||before.context.process.version!==after.context.process.version||otherKeys.some(k=>before.conditions[k]!==after.conditions[k]))return {available:false,reason:'프로젝트·형상 또는 부하 외 조건이 다르거나 식별 정보가 부족해 한 변수 비교를 보류합니다.',current_relevance:'unavailable',delta:null,before,after};
 if(before.conditions.load_F===after.conditions.load_F)return {available:false,reason:'출력 부하가 아직 바뀌지 않았습니다.',current_relevance:'unavailable',delta:null,before,after};
 const keys=['rise_s','fall_s','tphl_s','tplh_s'] as const,delta={} as Record<typeof keys[number],number|null>;
 for(const key of keys){const a=before.metrics![key],b=after.metrics![key];delta[key]=a===null||b===null?null:b-a;}
 return {available:true,reason:'같은 형상·모델·입력에서 ideal CLOAD만 변경한 실제 ngspice 결과입니다.',current_relevance:after.revision===currentRevision&&after.freshness==='current'?'current':'historical',delta,before,after};
}
