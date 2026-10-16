import {leagueQuestion,leagueKinds} from './league-problems.ts';
import {calculators} from '../../calculators/src/index.ts';
import {studentReferences,catalogVersion} from './assignment-catalog.ts';

export const studyVersion='resistor-edu-study-v1';
export const studyReferences=studentReferences;
export type StudyQuestion={id:string;schema_version:1;version:string;kind:'numeric'|'choice'|'explanation';title:string;topic:string;level:number;prompt:string;conditions:string[];unit?:string;choices?:string[];expected?:number;correct_index?:number;formula?:string;solution:string;hints:string[];rubric:{id:string;criterion:string;points:number}[];source_ids:string[];origin:'shared-calculator'|'curated'|'ai';calculator_id?:string;reference_id?:string;inputs?:Record<string,number|string>;provenance?:Record<string,unknown>};
type Draft=Omit<StudyQuestion,'id'>;
const rubric=[{id:'principle',criterion:'핵심 원리와 관찰 사실을 설명',points:40},{id:'scope',criterion:'적용 조건·한계·알 수 없는 항목을 구분',points:35},{id:'experiment',criterion:'판단 근거와 다음 확인 실험을 제시',points:25}];
export function initialStudyQuestions():Draft[]{
 const numeric=calculators.flatMap(c=>c.examples.map((example,i)=>{
  const result=c.calculate({...example.inputs});if(typeof result.primaryValue!=='number'||!Number.isFinite(result.primaryValue))return null;
  return {schema_version:1,version:studyVersion+':'+catalogVersion,kind:'numeric',title:c.title+' · '+(i+1),topic:c.category,level:1,prompt:result.primaryLabel+' 값을 구하세요. 아래 단위와 적용 조건을 사용하세요.',conditions:[example.title,c.referenceEquation,...c.inputs.filter(p=>p.id in example.inputs).map(p=>`${p.label}: ${example.inputs[p.id]} ${p.unit||''}`)],unit:result.primaryUnit||'',expected:result.primaryValue,formula:c.formula,solution:result.explanation,hints:[c.formula],rubric:[],source_ids:['shared-math'],origin:'shared-calculator',calculator_id:c.id,inputs:{...example.inputs}} as Draft;
 })).filter((q):q is Draft=>q!==null);
 const explanation=studentReferences.map(r=>({schema_version:1,version:studyVersion+':'+catalogVersion,kind:'explanation',title:r.title,topic:'개념·설계 판단',level:2,prompt:`${r.title}의 원리, 적용 조건과 한계를 설명하고 이를 확인할 다음 실험을 제안하세요.`,conditions:[r.assumptions],formula:r.equation,solution:[r.summary,r.equation,r.units,r.assumptions,r.pitfall,'다음 실험: '+r.next_experiment].filter(Boolean).join('\n'),hints:[r.pitfall],rubric:structuredClone(rubric),source_ids:r.source_ids,reference_id:r.id,origin:'curated'} as Draft));
 const choices=[
  ['drc','DRC와 LVS','폭·간격 규칙의 DRC가 통과한 경우 어떤 결론이 타당합니까?',['회로 연결까지 일치한다','교육 효과가 입증됐다','검사한 룰·범위의 DRC 결과이며 LVS는 독립 실행이다'],2,'DRC와 LVS는 서로 다른 검사를 수행합니다. 검사한 revision·룰·실행 범위를 함께 확인합니다.'],
  ['gds','GDS와 높이 정보','GDS만으로 실제 층의 재료·두께·공정 이력을 확정할 수 있습니까?',['공정 적층·layer mapping 등 추가 데이터가 필요하다','모든 층이 항상 같은 높이이다','색상이 재료를 증명한다'],0,'GDS의 XY 도형과 실제 공정 Z 구조를 구분합니다. 가상 적층은 가정과 배율을 명시합니다.'],
  ['pr','표준 셀과 P&R','P&R에 대한 설명 중 타당한 것은 무엇입니까?',['배선만 수행한다','배치와 배선을 포함하며 타이밍 등 최적화가 포함될 수 있다','모든 NAND 회로를 새로 발명한다'],1,'표준 셀 라이브러리와 배치·배선 흐름의 역할은 다릅니다.'],
  ['stale','설계 revision','부하를 바꾼 뒤 이전 파형은 어떻게 취급해야 합니까?',['새 설계의 PASS로 유지','이전 조건의 증거로 보존하고 새 조건은 다시 해석','이전 파형을 새 파형으로 이름만 바꾸기'],1,'이전 결과는 원래 revision의 기록입니다. 현재 조건 검증에는 새 실행이 필요합니다.'],
  ['centroid','아날로그 매칭','common-centroid 배치에 대한 올바른 판단은 무엇입니까?',['항상 최적이며 추출이 불필요','모든 랜덤 불일치가 0이 된다','기울기·대칭·배선·환경 등의 조건과 기생 영향을 함께 평가한다'],2,'common-centroid·더미는 목적과 조건이 있는 기법입니다. 기하 대칭만으로 전기적 매칭을 확정하지 않습니다.'],
  ['timing','동적 지연','파형의 시간 표본이 지연 한도를 판정하기에 너무 거칠다면?',['보간값이 작으면 무조건 통과','판정 불가로 두고 더 작은 최대 시간 간격에서 수렴을 확인','샘플 개수만 임의로 늘려 통과'],1,'표본 사이에 있는 한도나 짧은 글리치는 점 추정만으로 확정할 수 없습니다. 실제 엔진의 시간 간격을 줄여야 합니다.']
 ] as const;
 const applied=[2,3].flatMap(level=>leagueKinds.map((kind,index)=>{const {id,...q}=leagueQuestion({kind,variants:[index,2,3]},index,level as 2|3);return {...q,title:q.title+' · '+(level===2?'응용':'심화')+' 실습',origin:'shared-calculator'} as Draft;}));
 return [...numeric,...applied,...explanation,...choices.map(([key,title,prompt,options,correct,solution])=>({schema_version:1,version:studyVersion,kind:'choice',title,topic:'검증·설계 판단',level:1,prompt,conditions:['제시한 범위에서 가장 타당한 설명 한 개를 선택합니다.'],choices:[...options],correct_index:correct,solution,hints:['실행한 검사와 아직 알 수 없는 범위를 구분하세요.'],rubric:[],source_ids:['resistor-edu-curated-v1'],origin:'curated',reference_id:key} as Draft))];
}

export {parseStudyNumber,gradeObjective} from './study-grading.ts';
