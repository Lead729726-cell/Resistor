import {calculators, defaultInputs} from '../../calculators/src/index.ts';

export const catalogVersion = 'edu-coursepack-20261014-v1';
export const categories = ['기초 계산','기초 회로','MOS·바이어스','디지털·계층','아날로그·전원','데이터 변환','레이아웃·공정','검증·재현'] as const;
export type Category = typeof categories[number];
export type Launch =
  | {kind:'calculator'; id:string; inputs:Record<string,number|string>}
  | {kind:'circuit'; id:string}
  | {kind:'fixture'; id:string}
  | {kind:'example'; id:'inverter'|'layout'|'mosfet'}
  | {kind:'template'; id:string; parameters?:Record<string,number>; testbench?:{analysis?:'op'|'tran'|'ac'|'dc';duration_s?:number;step_s?:number}}
  | {kind:'digital'; id:'full_adder'|'adder4'|'adder16'}
  | {kind:'study'; tool:'integrated-tools'|'digital-workbench'; topic:string};
export interface Assignment {
  id:string; title:string; category:Category; level:1|2|3; minutes:number;
  goal:string; prerequisites:string[]; launch:Launch; conditions:string[];
  variable:string; steps:string[]; observations:string[]; questions:string[];
  deliverables:string[]; rubric:{criterion:string;points:number}[];
  instructor:{reasoning:string; pitfalls:string[]}; reference_ids:string[];
  scope:string; guide?:string;
}
export interface StudentReference {id:string;title:string;summary:string;equation?:string;units?:string;assumptions:string;pitfall:string;next_experiment:string;source_ids:string[]}
export const sources = [
  {id:'shared-math',title:'Resistor 공통 계산 모듈과 수식 fixture',url:'https://github.com/Lead729726-cell/Resistor/blob/codex/resistor-edu/packages/calculators/src/index.ts',local:'packages/calculators/src/index.ts',license:'MIT · 이 저장소의 계산 코드'},
  {id:'ngspice',title:'ngspice 공식 문서 · OP/DC/AC/Transient',url:'https://ngspice.sourceforge.io/docs.html',license:'외부 링크만 포함 · 문서의 원래 라이선스 적용'},
  {id:'sky130',title:'공개 SKY130 PDK · 모델·레이어·룰 문서',url:'https://skywater-pdk.readthedocs.io/en/main/',license:'외부 링크만 포함 · 각 PDK 파일 라이선스를 별도 확인'},
  {id:'klayout',title:'KLayout 공식 2.5D 표현',url:'https://www.klayout.de/doc/about/25d_view.html',license:'외부 링크만 포함'},
  {id:'xsection',title:'KLayout XSection 프로젝트',url:'https://klayoutmatthias.github.io/xsection/',license:'외부 링크만 포함 · 현재 Edu에 XSection 실행 연동을 주장하지 않음'},
  {id:'align',title:'ALIGN · 대칭·배치·경계 제약',url:'https://align-analoglayout.github.io/ALIGN-public/notes/const.html',license:'외부 링크만 포함 · 독립 ALIGN 엔진 실행 아님'},
  {id:'openroad',title:'OpenROAD · RTL에서 물리 구현까지',url:'https://github.com/The-OpenROAD-Project/OpenROAD/blob/master/README.md',license:'외부 링크만 포함 · OpenROAD는 이 과제의 기본 실행 엔진이 아님'},
  {id:'sar-architecture',title:'Analog Devices · SAR 구조와 charge redistribution',url:'https://www.analog.com/en/resources/technical-articles/successive-approximation-registers-sar-and-flash-adcs.html',license:'외부 링크만 포함'},
  {id:'repo-physical',title:'실제 실행된 공통 물리 도구 QA · 역사적 기록',url:'https://github.com/Lead729726-cell/Resistor/blob/codex/resistor-edu/docs/physical-tools.md',local:'docs/physical-tools.md',license:'MIT · 프로젝트·revision·도구 조건이 다른 현재 결과로 재사용 금지'},
  {id:'repo-inverter',title:'연결형 CMOS 실습과 실제 모델 범위',url:'https://github.com/Lead729726-cell/Resistor/blob/codex/resistor-edu/docs/edu-inverter-lab.md',local:'docs/edu-inverter-lab.md',license:'MIT · 실행 증거는 해당 revision에만 유효'},
  {id:'repo-soc',title:'소규모 아날로그 SoC 레퍼런스',url:'https://github.com/Lead729726-cell/Resistor/blob/codex/resistor-edu/docs/analog-soc.md',local:'docs/analog-soc.md',license:'MIT · 제조 signoff·잡음·mismatch 수율 인증 없음'},
  {id:'repo-sar',title:'SAR8 · 모델·외부 제어·면적 범위',url:'https://github.com/Lead729726-cell/Resistor/blob/codex/resistor-edu/docs/sar-adc.md',local:'docs/sar-adc.md',license:'MIT · 전체 controller mask/timing 미지원'},
  {id:'repo-sdm',title:'Sigma-delta8 · 계층·CIC·실행 범위',url:'https://github.com/Lead729726-cell/Resistor/blob/codex/resistor-edu/examples/sigma-delta8/README.md',local:'examples/sigma-delta8/README.md',license:'MIT · CODE 비트 수와 ENOB를 구분'},
  {id:'repo-cells',title:'기존 물리 셀·칩 레퍼런스 · 독립 검사 기록',url:'https://github.com/Lead729726-cell/Resistor/blob/codex/resistor-edu/examples/physical-library/README.md',local:'examples/physical-library/README.md',license:'MIT · 역사적 보고서이며 현재 PASS로 표시하지 않음'}
];

const rubric = (observation:string,reason:string):Assignment['rubric'] => [
  {criterion:'프로젝트·revision·모델·입력 조건을 재현 가능하게 기록',points:20},
  {criterion:observation,points:30},{criterion:reason,points:30},
  {criterion:'한계·오류·다음 실험을 근거와 함께 설명',points:20}
];
type Spec = Pick<Assignment,'id'|'title'|'category'|'goal'|'launch'|'conditions'|'variable'|'observations'|'questions'|'scope'> & Partial<Assignment>;
function lesson(s:Spec):Assignment {
  return {
    level:2,minutes:50,prerequisites:['전압·전류·단위','현재 프로젝트와 revision 확인'],
    steps:['새 과제 사본을 만들고 입력·모델·도구 준비 상태를 기록합니다.',
      '회로·포트 또는 기하 구조를 읽고 먼저 변화 방향을 예측합니다.',
      '변경 전 실제 계산/해석/관찰 증거를 저장합니다. 미지원 항목은 이유를 적습니다.',
      s.variable+' 이외의 조건을 유지하고 변경 후 증거와 비교합니다.',
      '관찰 → 규칙/모델 → 판단 근거 → 다음 실험 순서로 자신의 설명을 저장합니다.'],
    deliverables:['조건·revision 비교표','실제 실행 ID/로그 또는 실행 불가 사유','학생이 작성한 해석과 다음 실험'],
    rubric:rubric(s.observations[0],s.questions[0]),
    instructor:{reasoning:'예측과 실제 증거의 차이를 토론합니다. 수치·PASS는 계산 또는 해당 실제 엔진 결과에서만 확인합니다.',pitfalls:['체크리스트 완료는 엔진 검증이 아닙니다.','같은 소스라도 모델·도구·revision이 바뀌면 과거 결과입니다.']},
    reference_ids:['engine-evidence','revision-history'],...s
  };
}

const calcNotes:Record<string,[string,string,string,string]>={
 'resistor-color-code':['색띠와 허용오차','갈색·검정·빨강·금색의 명목값과 ±5% 범위를 읽습니다.','금색을 유효 숫자 색띠로 쓸 수 없는 이유는?','허용오차는 실측값이나 온도 계수가 아닙니다.'],
 'resistor-series':['E-series와 목표 오차','4.6kΩ 목표에서 E24와 E96 선택을 비교합니다.','가까운 명목값과 실제 공차가 같은 뜻인가요?','표준값 선택은 부품 재고·정격 보증이 아닙니다.'],
 'parallel-resistor':['병렬 저항과 branch 전류','1kΩ 두 개를 병렬로 놓고 하나를 2kΩ로 바꿉니다.','Req가 가장 작은 branch 저항보다 큰가요, 작은가요?','이상적 독립 저항. 배선·온도·공차는 포함하지 않습니다.'],
 'series-resistor':['직렬 저항과 전압 분담','1kΩ+2.2kΩ 총합과 한 저항 변경을 비교합니다.','직렬 전류가 같을 때 어느 저항의 전압강하가 큰가요?','이상적 직렬 연결이며 중간 노드 부하는 없습니다.'],
 'voltage-divider':['분압비와 전류 비용','Vin=1.8V, R1=R2=10kΩ에서 R2=5kΩ로 비교합니다.','분압비를 유지하면서 전체 저항을 10배 키우면 전류는?','무부하 저항 분배기만 계산합니다.'],
 'led-resistor':['LED 전류 제한과 정격','Vs=5V, Vf=2V, 목표 10mA에서 20mA로 비교합니다.','LED Vf 온도 변화와 저항 정격 여유를 어떻게 확인할까요?','고정 Vf 근사이며 LED 모델·열 해석은 아닙니다.'],
 'power-dissipation':['저항 손실과 전압 제곱','1kΩ에 5V와 10V를 인가한 소비 전력을 비교합니다.','전압을 두 배로 하면 전력은 몇 배인가요?','정상 상태 이상 저항. 온도 상승은 열 모델이 있어야 합니다.'],
 'ohms-law':['옴의 법칙과 단위','I=10mA, R=1kΩ에서 mA/A 변환을 확인합니다.','10과 0.01 중 어떤 입력이 SI A 단위에 맞나요?','선형 저항의 V=IR이며 MOS의 전체 I-V 법칙이 아닙니다.'],
 'rc-time-constant':['RC settling과 대역폭','10kΩ·1µF의 τ와 fc를 C=2µF 조건과 비교합니다.','63.2% 도달과 1% settling은 같은 시간인가요?','이상적 단일 pole RC, step 최종값 일정.'],
 'rl-time-constant':['RL 전류 응답','10mH·100Ω에서 R=200Ω로 τ를 비교합니다.','인덕터 전류가 즉시 바뀔 수 있나요?','이상적 L, 직렬 R. 포화·기생 C는 제외합니다.'],
 'rlc-resonance':['RLC 공진과 Q','10µH·100nF·10Ω에서 R만 20Ω로 변경합니다.','이상적 f0와 Q가 각각 어떻게 변하나요?','직렬 RLC의 공진식이며 능동 필터/병렬 Q 공식과 구분합니다.'],
 'capacitor-calculator':['커패시터 전하와 에너지','1µF·5V에서 V=10V의 Q와 E를 비교합니다.','전하와 에너지가 각각 몇 배가 되는지 설명하세요.','고정 선형 용량. 정격·누설·ESR은 별도입니다.'],
 'adc-resolution':['ADC 코드 수와 정의','12bit·3.3V에서 N을 변경하고 코드 수를 확인합니다.','endpoint step과 bin width를 왜 구분해야 하나요?','현재 공통 계산기는 endpoint 정의 Vref/(2^N−1). SAR bin은 Vref/2^N. ENOB 측정 아님.'],
 'dac-resolution':['DAC endpoint와 step','10bit·5V의 step을 8bit 조건과 비교합니다.','최대 코드가 2^N인지 2^N−1인지 설명하세요.','현재 endpoint full-scale 정의. 실제 DAC transfer 정의를 먼저 확인합니다.'],
 'op-amp-gain':['이상적 폐루프 이득','Rf=10kΩ, Rg=1kΩ의 두 구성 이득을 비교합니다.','반전 부호와 계산기의 반전 이득 크기 표시는 어떻게 다른가요?','이상적 음의 피드백 근사. 실제 GBW·slew·rail은 계산하지 않습니다.'],
 'db-conversion':['전압비·전력비 dB','전압비 2와 0.5를 dB로 비교합니다.','20log와 10log를 언제 쓰나요?','등가 power ratio=amplitude²는 동일 임피던스 조건입니다.'],
 'frequency-period':['주파수·주기·각주파수','1kHz와 1MHz의 s·ms·µs를 비교합니다.','f와 ω의 단위 및 2π 관계를 설명하세요.','일정 주기의 이상 신호. jitter 측정은 별도입니다.'],
 'unit-converter':['SI prefix 오류 찾기','4.7kΩ→Ω와 1nF→pF를 직접 변환합니다.','milli와 micro 혼동은 결과를 몇 배 바꾸나요?','지원된 같은 물리량의 단위 변환만 사용합니다.']
};
const overrides:Record<string,Record<string,number|string>>={'voltage-divider':{vin:1.8,r1:10000,r2:10000}};
const calculationAssignments = calculators.map(c=>{
 const [title,goal,question,scope]=calcNotes[c.id];
 return lesson({id:'calc-'+c.id,title,category:'기초 계산',level:1,minutes:20,goal,
   launch:{kind:'calculator',id:c.id,inputs:{...defaultInputs(c),...c.examples[0].inputs,...overrides[c.id]}},
   conditions:[c.formula,'입력 label의 SI 단위·정의와 invalid input을 먼저 확인합니다.'],
   variable:'계산 입력 한 개',observations:['공식·단위·주 결과·보조 결과','정상 입력과 0/음수/빈 값 처리'],
   questions:[question,'계산기의 적용 조건 밖에서 추가로 필요한 데이터는 무엇인가요?'],scope,
   reference_ids:['units-si','ideal-circuit','adc-code-definitions'].filter(id=>id!=='adc-code-definitions'||c.id.includes('resolution')),
   instructor:{reasoning:'공통 계산 모듈의 동일 입력 결과로 기준값을 확인합니다. 교수자 ZIP에 실행 가능한 알려진 값이 포함됩니다.',pitfalls:[scope,'반올림된 화면 값과 내부 수치의 자릿수를 구분합니다.']}
 });
});

export const circuitAssignments = [
 lesson({id:'circuit-divider',title:'1.8V 전압 분배기 · OP와 전류',category:'기초 회로',level:1,goal:'0.9V·90µA 예측을 실제 OP와 비교합니다.',launch:{kind:'circuit',id:'divider'},conditions:['Vin=1.8V, R1=10kΩ, R2=10kΩ','R2 변경 후 5kΩ. 무부하·이상 저항.'],variable:'R2: 10kΩ → 5kΩ',observations:['Vout·I(R1)·전압원 branch 전류 부호','수치 OP에 기능 합격 기준이 없으면 미판정'],questions:['0.9V→0.6V와 90µA→120µA가 왜 함께 변하나요?','전압원 전류의 음수는 무엇을 뜻하나요?'],scope:'ngspice 실제 OP. 회로도만 생성하며 제조 레이아웃 없음.',guide:'blank-divider',reference_ids:['kcl-kvl','current-sign']}),
 lesson({id:'circuit-loaded-divider',title:'분배기에 부하를 연결하면',category:'기초 회로',level:1,goal:'10kΩ 부하로 분압비가 달라지는 이유를 설명합니다.',launch:{kind:'circuit',id:'loaded-divider'},conditions:['1.8V, R1=R2=10kΩ, RL=10kΩ','R2||RL=5kΩ, 초기 Vout=0.6V'],variable:'RL: 10kΩ → 100kΩ',observations:['R2와 RL 전류 분배','무부하 공식과 실제 부하 포함 OP 비교'],questions:['계측기 입력 저항도 부하인가요?','분압기의 출력 저항을 줄이는 비용은?'],scope:'선형 저항 OP, 입력 저항만 모델링.',reference_ids:['kcl-kvl','divider-loading']}),
 lesson({id:'circuit-parallel',title:'병렬 branch의 KCL',category:'기초 회로',level:1,goal:'1.8V의 1kΩ/2kΩ branch 전류 합을 확인합니다.',launch:{kind:'circuit',id:'parallel'},conditions:['1.8V, RA=1kΩ, RB=2kΩ','예측 IA=1.8mA, IB=0.9mA'],variable:'RB: 2kΩ → 4kΩ',observations:['총 공급 전류와 branch 전류 합','각 branch가 같은 전압을 갖는 연결'],questions:['branch를 제거하면 나머지 전류가 바뀌나요?','전류 방향의 기준을 기록했나요?'],scope:'이상 전압원과 독립 저항. 실제 OP.',reference_ids:['kcl-kvl','current-sign']}),
 lesson({id:'circuit-series',title:'직렬 경로의 KVL',category:'기초 회로',level:1,goal:'두 전압강하의 합과 단일 전류를 확인합니다.',launch:{kind:'circuit',id:'series'},conditions:['1.8V, RA=1kΩ, RB=2kΩ','예측 I=0.6mA, ΔVA=0.6V, ΔVB=1.2V'],variable:'RA: 1kΩ → 2kΩ',observations:['공통 전류와 전압강하','전원 전압과 폐회로 전압 합'],questions:['저항 순서를 바꾸면 중간 노드는 어떻게 변하나요?','총 저항이 같아도 각 노드 전위가 같은가요?'],scope:'접지 기준 선형 OP.',reference_ids:['kcl-kvl','voltage-reference']}),
 lesson({id:'circuit-rc-charge',title:'RC step · τ와 63.2%',category:'기초 회로',goal:'정상 값과 실제 charging waveform을 연결합니다.',launch:{kind:'template',id:'rc_lowpass',parameters:{resistance_Ohm:10000,capacitance_F:1e-9},testbench:{analysis:'tran',duration_s:100e-6,step_s:50e-9}},conditions:['Vin 0→1.8V step, R=10kΩ, C=1nF','τ=10µs. 유한 rise와 초기조건을 로그에 기록.'],variable:'C: 1nF → 2nF',observations:['step 시작부터 63.2%까지 시간','최대 time step과 보간 측정 오차'],questions:['63.2% 시간은 step 시작 기준인가요?','기생 용량을 임의로 더해도 될까요?'],scope:'이상 단일 RC transient. 부하 C만 실제 회로 입력으로 변경.',reference_ids:['rc-settling','sampling-step']}),
 lesson({id:'circuit-rc-discharge',title:'RC 방전 · 초기조건을 명시하기',category:'기초 회로',goal:'초기 충전된 C의 방전 응답을 실제 해석합니다.',launch:{kind:'fixture',id:'rc-discharge'},conditions:['R=10kΩ, C=1nF, C 초기 1.8V','standalone fixture는 .ic와 UIC를 명시. 앱에서는 standalone UIC deck 실행을 자동 제공하지 않습니다.'],variable:'R: 10kΩ → 20kΩ',observations:['τ 후 36.8% 전압','초기조건·OP 사용 여부의 차이'],questions:['초기조건 없이 OP부터 시작하면 왜 방전이 보이지 않을 수 있나요?','방전 에너지는 어디로 가나요?'],scope:'초기조건 deck은 ZIP의 ngspice fixture. 별도 ngspice deck 다운로드·실행. 앱 transient 연동을 주장하지 않습니다.',reference_ids:['rc-settling','initial-conditions']}),
 lesson({id:'circuit-rc-ac',title:'RC AC · −3dB와 위상',category:'기초 회로',goal:'fc=1/(2πRC)와 실제 AC 이득·위상을 비교합니다.',launch:{kind:'template',id:'rc_lowpass',parameters:{resistance_Ohm:10000,capacitance_F:1e-9}},conditions:['이상 R=10kΩ, C=1nF','AC 소신호의 입력 기준과 Hz 축 확인'],variable:'C: 1nF → 2nF',observations:['−3.01dB와 약 −45°의 fc','DC 바이어스와 AC amplitude의 역할'],questions:['AC 파형을 시간의 사인 waveform이라고 부를 수 있나요?','입력 amplitude를 바꾸면 선형 전달비가 바뀌나요?'],scope:'기존 rc_lowpass template와 실제 AC. 물리 RC 없음.',reference_ids:['ac-small-signal','db-impedance']}),
 lesson({id:'circuit-thevenin',title:'테브난 출력 저항과 부하',category:'기초 회로',goal:'분배기를 Vth와 Rth로 표현하고 부하 OP를 비교합니다.',launch:{kind:'circuit',id:'thevenin'},conditions:['1.8V, R1=R2=10kΩ, RL=5kΩ','Vth=0.9V, Rth=5kΩ, Vload=0.45V'],variable:'RL: 5kΩ → 20kΩ',observations:['무부하 Vth·부하 출력','전원을 0V로 둘 때 Rth=R1||R2'],questions:['독립 전압원을 0V로 한다는 뜻은?','비선형 MOS 회로에 이 전역 모델을 그대로 적용할 수 있나요?'],scope:'선형 저항망의 정확한 등가. 비선형 소자는 범위 밖.',reference_ids:['divider-loading','ideal-circuit']})
];

// Distinct tasks use existing native templates; no educational circuit engine.
const mosAssignments:Assignment[] = [
 lesson({id:'mos-iv',title:'NMOS I–V · W/L과 동작 영역',category:'MOS·바이어스',goal:'게이트·드레인 바이어스와 실제 I–V를 읽습니다.',launch:{kind:'example',id:'mosfet'},conditions:['SKY130 1.8V NMOS, W/L은 생성된 소자에서 확인','TT/27°C. 바이어스와 sweep 범위는 해석 설정에 명시.'],variable:'지원 PCell W 한 개',observations:['DC I–V·모델·W/L·D/G/S/B','포화 경계는 모델 결과로 판단'],questions:['W를 늘릴 때 전류가 항상 정확히 비례하나요?','B와 S가 다르면 어떤 추가 모델이 필요한가요?'],scope:'설치된 public MOS 모델. PCell 지원 범위를 확인한 뒤 형상 재생성·LVS 별도.',reference_ids:['mos-model','body-bias']}),
 lesson({id:'mos-common-source',title:'공통 소스 · OP headroom',category:'MOS·바이어스',goal:'증폭하기 전에 드레인 DC 동작점을 확인합니다.',launch:{kind:'template',id:'common_source'},conditions:['R_D=10kΩ, gate bias=0.7V, W=0.65µm/L=0.15µm','VDD=1.8V, TT/27°C'],variable:'gate_bias_V: 0.7 → 0.6V',observations:['Vout DC와 drain current','rail에 접근할 때 소신호 이득의 적용 범위'],questions:['출력 DC가 낮으면 어떤 방향의 swing 여유가 줄어드나요?','gm·ro 없이 이득 수치를 확정할 수 있나요?'],scope:'실제 MOS OP/AC. 초기 layout 없음.',reference_ids:['mos-model','headroom','ac-small-signal']}),
 lesson({id:'mos-bias-divider',title:'게이트 분압·커플링 C',category:'MOS·바이어스',goal:'바이어스와 AC coupling의 역할을 구분합니다.',launch:{kind:'template',id:'common_source_bias'},conditions:['Rtop=100kΩ, Rbottom=60kΩ, coupling=1pF','R_D=10kΩ, 1.8V·TT/27°C'],variable:'bias_bottom_Ohm: 60kΩ → 50kΩ',observations:['게이트 DC와 입력 AC 전달','바이어스 저항과 입력 loading'],questions:['커플링 C가 DC에 open으로 보이는 이유는?','gate bias 공식과 실제 OP가 다르면 무엇을 확인하나요?'],scope:'public MOS+이상 저항/C. 물리 기생 미추출.',reference_ids:['divider-loading','initial-conditions','headroom']}),
 lesson({id:'mos-current-mirror',title:'전류 미러 · compliance',category:'MOS·바이어스',goal:'reference와 출력 전류를 실제 DC 조건으로 비교합니다.',launch:{kind:'template',id:'current_mirror'},conditions:['Iref=100µA, W=0.65µm/L=0.15µm','Vout sweep 범위·TT/27°C를 기록'],variable:'reference_current_A: 100µA → 50µA',observations:['Iref/Iout와 출력 전압','같은 W/L이라도 VDS와 주변 환경은 다를 수 있음'],questions:['Iout≈Iref가 성립하는 출력 조건은?','모양이 대칭이면 mismatch 수율도 알 수 있나요?'],scope:'실제 MOS DC/OP. 매칭 수율은 mismatch 모델·MC 필요.',reference_ids:['mirror-compliance','matching-environment']}),
 lesson({id:'mos-differential-pair',title:'차동 쌍 · differential와 common mode',category:'MOS·바이어스',goal:'전류 steering과 입력 범위를 구분합니다.',launch:{kind:'template',id:'differential_pair'},conditions:['VCM=0.9V, Vdiff=10mV, tail bias=0.7V','TT/27°C · 실제 tail current는 OP에서 읽기'],variable:'differential_V: 10mV → 20mV',observations:['OUTP/OUTN·branch current','tail current와 입력 common mode'],questions:['두 입력을 같이 이동하는 변화와 차동 변화가 같은가요?','대칭 소자에서 실제 offset은 어떻게 측정하나요?'],scope:'모델 기반 deterministic OP/DC. offset·noise·MC 미실행.',reference_ids:['differential-commonmode','matching-environment']}),
 lesson({id:'mos-cascode',title:'캐스코드 · 출력 저항과 headroom',category:'MOS·바이어스',level:3,goal:'캐스코드의 이점과 전압 여유 비용을 같이 봅니다.',launch:{kind:'template',id:'soc_cascode_mirror'},conditions:['Iref=10µA, VDD=1.8V, TT/27°C','실제 바이어스 공급과 출력 sweep을 기록'],variable:'reference_current_A: 10µA → 5µA',observations:['출력 DC sweep의 Iout 변화','직렬 MOS의 각 내부 노드 전압'],questions:['compliance가 나빠져도 ro 이점이 유지되나요?','바이어스 노드를 이상 전압원으로 두었다면 어떤 한계인가요?'],scope:'기존 public SoC block. 실제 sweep 수행 전 성능 수치 없음.',reference_ids:['headroom','mirror-compliance']}),
 lesson({id:'mos-inverter-load',title:'연결형 CMOS · 부하와 지연',category:'MOS·바이어스',goal:'회로·마스크·표시 적층을 읽고 부하 전후를 비교합니다.',launch:{kind:'example',id:'inverter'},conditions:['공개 표준 셀 inverter, VDD=1.8V·TT/27°C','연결형 실습의 CLOAD 5→50fF와 실제 waveform 조건 사용'],variable:'이상 CLOAD: 5 → 50fF',observations:['입출력 50% 지연·10–90% transition','회로/마스크 연결은 metadata 후보와 확정을 구분'],questions:['형상이 같아도 부하만으로 지연이 바뀌는 이유는?','표시 Z가 실제 공정 높이라는 근거가 있나요?'],scope:'첫 화면의 연결형 CMOS 실습 권장. 실제 ngspice와 독립 DRC/LVS/PEX.',reference_ids:['inverter-timing','cross-probe','stack-assumptions'],guide:'design-cell-inv'})
];

const digitalRows: [string,string,Launch,string,string,string,string][] = [
 ['digital-nand','NAND2 · 직렬 NMOS 경로',{kind:'template',id:'cell_nand2'},'A/B의 4개 조합·VDD=1.8V·TT/27°C','input_slew_ns','11 조합의 pull-down과 다른 조합의 pull-up','NAND에서 한 입력만 바꾸는 timing arc를 어떻게 고르나요?'],
 ['digital-nor','NOR2 · 병렬 NMOS 경로',{kind:'template',id:'cell_nor2'},'A/B 4개 조합과 explicit input slew','input_slew_ns','00 조합의 직렬 PMOS와 출력 transition','NAND와 NOR의 진리표가 같지 않은 이유를 transistor 경로로 설명하세요.'],
 ['digital-xor','XOR2 · 연결을 따라 parity 읽기',{kind:'template',id:'cell_xor2'},'A/B 4개 조합·기존 public CMOS reference','input_slew_ns','A≠B일 때 HIGH·내부 net','겉 진리표가 같으면 내부 기생·지연도 같은가요?'],
 ['digital-mux2','MUX2 · 선택과 전달 경로',{kind:'template',id:'cell_mux2'},'데이터·select 진리표, finite slew','input_slew_ns','선택된 데이터에서 Y까지 실제 연결','select 변경 중 glitch가 없다는 결론에 필요한 실험은?'],
 ['digital-mux4','MUX4 · 선택 안정 시간',{kind:'template',id:'mux4'},'slot_ns=5, rise_ns=0.1, 64개 지정 조건','slot_ns: 5 → 20ns','선택·출력 rail·안정 구간·공급 전류','실행 완료와 기능 기준 FAIL이 같이 존재할 수 있나요?'],
 ['digital-full-adder','전가산기 · SUM/COUT',{kind:'digital',id:'full_adder'},'A/B/CIN 8개 조합·기존 NAND 계층','입력 slew 또는 output load 하나','SUM parity와 carry · 9개 NAND 연결','세 입력이 모두 HIGH일 때 SUM과 COUT은 왜 둘 다 HIGH인가요?'],
 ['digital-adder4','4bit ripple carry · 지연 경로',{kind:'digital',id:'adder4'},'512개 조합·주기와 부하를 실제 testbench에서 읽기','주기 또는 output load 하나','최하위 carry가 최상위 출력에 도달하는 경로','논리 조합 통과와 최대 동작 주파수 검증은 같은가요?'],
 ['digital-pnr','표준 셀·P&R·timing 경계',{kind:'study',tool:'digital-workbench',topic:'pnr-boundary'},'검증된 셀 예제·LEF/Liberty/회로/마스크의 역할 비교','읽기 과제: 셀/배치/배선 단계','배치+배선+timing 최적화와 셀 라이브러리의 역할','Resistor의 제한된 reference routing을 산업용 P&R로 부를 수 있나요?']
];
const digitalAssignments=digitalRows.map(([id,title,launch,condition,variable,observe,question])=>lesson({id,title,category:'디지털·계층',goal:'기존 셀의 연결과 다음 관측을 설명합니다: '+observe+'.',launch,conditions:[condition,'새 사본·실제 run ID·revision을 기록하며 원본 셀은 보존합니다.'],variable,observations:[observe,'논리·timing·물리 검증을 각각 기록'],questions:[question,'새 셀 자동 설계 대신 기존 계층을 읽고 재사용하는 이점은?'],scope:launch.kind==='study'?'문서/기존 도구 탐색 과제. OpenROAD 자동 실행·Liberty/STA closure 제공 아님.':'실제 기존 CMOS 계층. 새 제조 표준 셀 라이브러리 인증 아님. 초기 physical_core=false.',reference_ids:['logic-path','hierarchy-ports','pnr-library']}));

const analogRows:[string,string,string,string,string,string,string][]=[
 ['analog-ota','5MOS OTA · DC와 AC','chip_ota','input_width_um=10, load_F=1pF','load_F: 1 → 2pF','DC bias·이득·대역폭·출력 pole','open-loop 이득과 unity feedback phase margin은 같은 측정인가요?'],
 ['analog-miller','Miller OTA · 보상과 Rz','soc_miller_ota','Cc=5pF, Rz=5kΩ','compensation_F: 5 → 10pF','실제 AC의 gain/phase·pole 이동','보상 C를 키우면 항상 더 좋은가요?'],
 ['analog-pga','PGA · 폐루프 gain와 swing','soc_pga','Cc=5pF, Rz=5kΩ·1.8V','compensation_F 한 개','입력/출력·rail·폐루프 settling','저항비 목표 gain과 actual gain 차이를 설명하세요.'],
 ['analog-filter','2차 필터 · pole와 bandwidth','soc_filter2','Rfilter=40kΩ, Cfilter=20pF','filter_F: 20 → 40pF','실제 AC gain/phase와 transient settling','이상 pole 공식만으로 OTA 필터 응답을 보장할 수 있나요?'],
 ['analog-tia','TIA · 전류를 전압으로','soc_tia','Rfb=100kΩ, Cfb=1pF, Cc=5pF','feedback_F: 1 → 2pF','Vout/Iin 전달비·안정성·입력 노드','sensor C를 생략하면 실제 대역폭을 주장할 수 있나요?'],
 ['analog-comparator','비교기 · 작은 입력과 지연','chip_comparator','Vdiff=0.1V, Cload=50fF','differential_V: 0.1 → 0.05V','입력 차동 부호·출력 rail·actual delay','이 한 번의 deterministic 해석에서 offset yield를 알 수 있나요?'],
 ['analog-ldo','LDO · 부하 step과 dropout','chip_ldo','출력 C=1nF, Iload=20→200µA','output_F: 1 → 2nF','입출력 전압·undershoot·recovery·공급 전류','열·패키지·ESR 없는 결과의 적용 한계는?'],
 ['analog-dcdc','2:1 SC DC-DC · ripple','chip_sc_dcdc','Cflying=Cout=1nF, RL=50kΩ','load_Ohm: 50k → 25kΩ','정상 구간 출력·ripple·switch 경로','이상 2:1 비와 부하가 걸린 actual output은 왜 다른가요?']
];
const analogAssignments=analogRows.map(([id,title,template,condition,variable,observe,question])=>lesson({id,title,category:'아날로그·전원',level:3,minutes:75,goal:'입력·모델 조건을 기록하고 다음 항목을 해석합니다: '+observe+'.',launch:{kind:'template',id:template},conditions:[condition,'공개 SKY130 모델·TT/27°C. 외부 bias/reference/driver는 testbench 가정.'],variable,observations:[observe,'바이어스·finite stimulus·회로 parameter'],questions:[question,'실제 기생·noise·mismatch 평가에 추가로 필요한 모델과 검사는?'],scope:'기존 실제 MOS template를 회로 사본으로 생성. full PVT/noise/MC/EMIR/ESD/manufacturing 미검증.',reference_ids:['ac-small-signal','headroom',id.includes('ldo')?'ldo-limits':id.includes('dcdc')?'sc-dcdc':'matching-environment']}));

const converterRows:[string,string,string,string,string,string][]=[
 ['adc-sdm-integrator','ΣΔ 적분기 · 되먹임의 상태','sdm8_integrator','기존 고정 블록·clock/reset 조건 읽기','지원된 외부 입력 조건 하나','적분기 상태는 왜 초기화가 필요한가요?'],
 ['adc-sdm-density','ΣΔ modulator · bit 밀도','sdm8_modulator','입력=0.9V, sine amplitude=0','input_V: 0.9 → 0.8V','bit density가 곧 8bit ENOB를 뜻하나요?'],
 ['adc-sdm-cic','CIC2×256 · decimation','sdm8_filter','기존 digital filter·CODE/VALID·OSR 조건','관찰 frame 범위','적분기·comb·downsample의 순서를 설명하세요.'],
 ['adc-sdm-spectrum','ΣΔ FFT · coherent 조건','sigma_delta8','sine frequency=61.03515625Hz·실제 설정 확인','sine_amplitude_V: 0 → 0.1V','settling frame을 FFT에 섞으면 어떤 오류가 생기나요?'],
 ['adc-sar-switch','SAR · 샘플 스위치','sar8_switch','기존 fixed MOS switch·sample/control 조건','지원된 sample 입력 조건 하나','스위치 ON 저항과 charge injection을 어떻게 분리 측정하나요?'],
 ['adc-sar-cdac','SAR · binary CDAC와 dummy','sar8_cdac','256×400fF unit·128:64:…:1+dummy·외부 VREF','읽기: trial bit 하나의 전압 기여','LSB bin 폭과 endpoint step이 다른 이유는?'],
 ['adc-sar-core','SAR · 8회 bit trial','sar8_analog','VIN=0.6V, VREF=1.2V, acquisition=bit period=2µs','input_V: 0.6 → 0.3V','실제 comparator decision과 이상 code 공식의 차이는?']
];
const converterAssignments=converterRows.map(([id,title,template,condition,variable,question])=>lesson({id,title,category:'데이터 변환',level:3,minutes:90,goal:'필요한 하위 블록과 실제 관측 신호를 연결합니다.',launch:{kind:'template',id:template},conditions:[condition,'블록별 입력/외부 driver·reference·모델과 지원 해석을 먼저 확인합니다.'],variable,observations:[id.includes('sar')?'SAMPLE·TOP·COMP·trial 또는 CODE/VALID':'analog state·BITSTREAM·CIC·CODE/VALID','digital replay와 transistor timing·물리 controller를 구분'],questions:[question,'이번 결과에서 ENOB/INL/DNL/noise 중 실제로 측정한 항목은?'],scope:'제한된 기존 MOS/RTL block. 고정 standalone 블록은 parameter 없는 경우 읽기/기존 testbench 관찰. 전체 SoC·8bit ENOB·controller mask/timing 인증 없음.',reference_ids:['adc-code-definitions',id.includes('sar')?'sar-charge':'sdm-osr','fft-coherent','sampling-alias']}));

const layoutRows:[string,string,string,string,string][]=[
 ['layout-dbu','정수 DBU·grid·단위','DBU와 µm의 변환·0.001µm/DBU는 설명용 가정','사각형 폭 DBU 하나','grid 반올림으로 폭이 바뀌면 어떤 문제가 생기나요?'],
 ['layout-primitives','사각형·다각형·path','작업 layer/purpose·net metadata·grid','지원 배선 폭 하나','화면 pixel과 저장된 mask 좌표가 같은 단위인가요?'],
 ['layout-transform','복사·회전·미러·Undo','원본 도형 좌표·rotation/mirror·revision','90° 회전 하나','기하 면적 보존과 device 방향 보존은 같은가요?'],
 ['layout-symmetry','대칭 배치·간격의 근거','교육용 rect 쌍의 좌표와 경계','한 rect의 x 위치','기하 대칭만으로 전기적 matching을 확정할 수 있나요?'],
 ['layout-centroid','ABBA·common centroid','교육용 동일 면적 unit 좌표·gradient는 가정','A/B unit 순서','같은 centroid이면 모든 gradient·주변 효과를 제거하나요?'],
 ['layout-dummy','dummy와 경계 환경','교육용 unit 주변 이웃·dummy는 가정','dummy 위치 하나','dummy의 electrical 연결과 layer rule은 왜 따로 확인해야 하나요?'],
 ['layout-interconnect','배선 길이와 RC 증거','실제 path length와 추출 전후를 구분','배선 길이 하나','형상 길이만으로 actual delay를 수치화할 수 있나요?'],
 ['layout-chip-area','chip envelope·aspect ratio','작업 bbox·정해진 면적 한도·µm²','max width 또는 height 하나','bbox 면적과 모든 도형 면적 합은 같은가요?'],
 ['layout-stack','layer mapping과 2.5D 단면','layer/datatype·표시 Z·z scale·공정 자료 출처','표시 z scale 하나','GDS에 재료와 실제 film thickness가 들어 있나요?'],
 ['layout-topography','hole·step·coverage의 가설','교육용 heightmap/recipe 가정·voxel resolution','가정된 step 높이 하나','격자보다 얇은 film을 resolved defect라고 판정할 수 있나요?']
];
const layoutAssignments=layoutRows.map(([id,title,condition,variable,question])=>lesson({id,title,category:'레이아웃·공정',goal:'형상으로 확인할 사실과 모델이 필요한 판단을 구분합니다.',launch:{kind:'example',id:id.includes('stack')?'inverter':'layout'},conditions:[condition,'교육용 기하·표시 적층과 실제 foundry 공정 자료를 명시적으로 구분합니다.'],variable,observations:[condition,'직접 확인한 좌표·layer·revision·변경 전후'],questions:[question,'전기·공정 결론을 내리기 위해 추가로 필요한 데이터는?'],scope:id==='layout-topography'?'가정 기반 process 표현/해상도 관찰. calibrated TCAD·실제 coverage 예측 아님.':'기하·표시 관찰 과제. matching·성능 수치는 실제 추출/모델 없이 생성하지 않습니다.',reference_ids:['dbu-grid','geometry-matching',id.includes('stack')?'stack-assumptions':id.includes('topography')?'topography-resolution':'matching-environment'],guide:'layout-drawing'}));

const verificationRows:[string,string,string,string,string][]=[
 ['verify-drc','DRC · 폭/간격 오류 읽기','실제 public inverter mask·pinned rule deck','별도 사본의 작은 metal rect','completed인데 violation이 있으면 성공인가요?'],
 ['verify-lvs','LVS · net/소자/핀 일치','원본 inverter와 annotated schematic·Netgen/Magic','별도 사본의 gate net 연결','DRC=0이면 LVS도 자동으로 같나요?'],
 ['verify-pex','PEX · RC와 post 해석','pre 조건·같은 layout·실제 extracted RC','post_layout 여부만','추출한 RC 개수만으로 timing signoff를 할 수 있나요?'],
 ['verify-pvt','PVT · 같은 회로, 다른 모델','TT/27°C·SS/125°C·FF/−40°C·명시 VDD','corner/온도 묶음은 명시된 비교 조건','각 코너 변화의 효과를 독립 원인으로 단정할 수 있나요?'],
 ['verify-revision','revision·모델 변경과 과거 결과','run ID·revision·model/deck/engine signature','부하 또는 revision 하나','설계 이름만 바뀌어도 정책상 freshness가 바뀔 수 있나요?'],
 ['verify-unavailable','미설치·검사 불합격·엔진 오류','doctor 상태·job status·실제 로그','문제 상태 하나를 읽고 분류','unavailable·failed·completed/fail·not_run을 구별하세요.']
];
const verificationAssignments=verificationRows.map(([id,title,condition,variable,question])=>lesson({id,title,category:'검증·재현',goal:'판정의 원인·범위·재현 조건을 근거와 함께 기록합니다.',launch:{kind:'example',id:'inverter'},conditions:[condition,'오류 재현은 새 사본에만 수행하고 원본·실패 보고서를 보존합니다.'],variable,observations:[question,'simulation/DRC/LVS/PEX 각각의 실제 실행·결과·freshness'],questions:[question,'문제 해결 뒤 어떤 실행을 다시 해야 하나요?'],scope:'실제 설치된 도구와 공개 deck의 제한된 검사. foundry signoff 아님. 도구가 없으면 unavailable, 실행 안 했으면 not_run.',reference_ids:['engine-evidence','drc-lvs-pex','revision-history','pvt-mismatch'],guide:'physical-verification'}));

export const assignments:Assignment[] = [...calculationAssignments,...circuitAssignments,...mosAssignments,...digitalAssignments,...analogAssignments,...converterAssignments,...layoutAssignments,...verificationAssignments];
export const getAssignment=(id:string)=>assignments.find(a=>a.id===id);

const ref=(id:string,title:string,summary:string,equation:string|undefined,units:string|undefined,assumptions:string,pitfall:string,next_experiment:string,source_ids:string[]=['ngspice']):StudentReference=>({id,title,summary,equation,units,assumptions,pitfall,next_experiment,source_ids});
export const studentReferences:StudentReference[]=[
 ref('units-si','SI 단위와 prefix','입력의 물리량과 prefix를 먼저 읽습니다.','x_SI = x × prefix_scale','m=10⁻³, µ=10⁻⁶, n=10⁻⁹, p=10⁻¹², f=10⁻¹⁵','같은 물리량 사이의 변환','SPICE의 m과 meg를 혼동하지 않습니다.','1nF와 1000pF 입력이 같은 결과인지 비교하세요.',['shared-math','ngspice']),
 ref('ideal-circuit','이상 모델의 적용 범위','정확한 식도 적용 모델을 벗어나면 예측을 보장하지 않습니다.','V=IR; Q=CV','V, A, Ω, C, F','선형·고정 R/C; 열·비선형 제외','이상 부품 계산을 실제 PDK 성능으로 쓰지 않습니다.','모델 없이 알 수 없는 현상을 목록으로 적으세요.',['shared-math']),
 ref('kcl-kvl','KCL·KVL과 노드','전류의 기준 방향과 폐회로 전압 부호를 정합니다.','Σ I_node=0; Σ ΔV_loop=0','A, V','같은 노드와 폐회로·일관된 부호','단순 선 교차는 연결된 노드가 아닙니다.','branch 전류 합과 공급 전류를 비교하세요.'),
 ref('current-sign','전류원·전압원 branch 부호','음수 전류도 실제 기준 방향에 대한 유효한 결과입니다.',undefined,'A','SPICE 전압원 전류 기준: +단자 안으로 흐름','공급 전류를 절댓값으로 바꿔 방향 정보를 지우지 않습니다.','원본 signed 전류와 전원 공급 전력을 함께 적으세요.'),
 ref('voltage-reference','노드 전압과 전압강하','노드 전위와 소자 양단 차이는 구분합니다.','ΔV_ab=V(a)−V(b)','V','기준 ground와 순서 명시','V(a)를 곧바로 소자 drop이라고 부르지 않습니다.','ground 위치를 읽고 저항 양단 차이를 계산하세요.'),
 ref('divider-loading','부하가 있는 분배기','아래쪽 branch에 부하가 병렬로 들어갑니다.','Rb=R2||RL; Vout=Vin·Rb/(R1+Rb)','V, Ω','이상 전압원·선형 저항','무부하 식으로 유한 입력 저항을 생략하지 않습니다.','RL=10kΩ와 100kΩ의 실제 OP를 비교하세요.',['shared-math','ngspice']),
 ref('rc-settling','RC charging·settling','한 τ와 충분한 settling 시간을 구분합니다.','τ=RC; V(t)=Vf+(Vi−Vf)e^(−t/τ)','s, Ω, F, V','단일 pole·일정 최종값·step 기준 시간','5τ는 약 0.674% 잔차이며 정확히 0%가 아닙니다.','τ·3τ·5τ의 실제 잔차를 비교하세요.',['shared-math','ngspice']),
 ref('rl-response','RL 전류와 저장 에너지','직렬 RL 전류가 연속적으로 변합니다.','τ=L/R; E=½LI²','s, H, Ω, J','선형 L, 포화·기생 제외','실제 coil의 DC 저항·포화·자기 손실은 추가 모델입니다.','R을 두 배로 바꾼 τ를 계산하세요.',['shared-math']),
 ref('rlc-q','직렬 RLC 공진과 Q','손실과 공진 주파수의 역할을 나눕니다.','f0=1/(2π√LC); Q=√(L/C)/R','Hz, H, F, Ω','직렬 RLC·이상 L/C','병렬 RLC의 Q 식을 그대로 섞지 않습니다.','R만 바꾸고 f0와 Q의 변화를 설명하세요.',['shared-math']),
 ref('initial-conditions','OP·초기조건·UIC','같은 R/C라도 시작 상태가 다르면 waveform이 달라집니다.',undefined,'V, A, s','deck의 .ic/UIC·OP 설정과 실제 초기값 확인','sample waveform으로 미실행 초기조건을 대체하지 않습니다.','방전 fixture와 pulse falling edge를 비교하세요.'),
 ref('ac-small-signal','AC 소신호 해석','DC 동작점 주위의 선형 전달을 주파수별로 해석합니다.','H(jω)=Vout/Vin','Hz, V/V, °','유효 OP·AC source amplitude','AC plot은 시간 transient waveform이 아닙니다.','DC rail에 가까운 MOS의 OP부터 확인하세요.'),
 ref('db-impedance','dB·전압비·전력비','전압비와 전력비를 같은 식으로 취급하지 않습니다.','20log10|Av|; 10log10(Pout/Pin)','dB','Av²의 power 대응에는 같은 임피던스 조건','음수 dB는 음수 전압이 아니라 비가 1 미만이라는 뜻입니다.','0.5배와 2배 전압 gain을 계산하세요.',['shared-math']),
 ref('mos-model','MOS W/L과 모델','square-law 직관과 실제 public 모델을 구분합니다.',undefined,'µm, V, A','소자 종류·model ID·corner·온도·W/L·nf/m','W/L만으로 공정·short-channel 전류를 확정하지 않습니다.','실제 DC sweep에서 model/version을 보존하세요.',['sky130','ngspice']),
 ref('body-bias','D/G/S/B와 body','MOS의 네 단자와 body 연결을 읽습니다.',undefined,'V','공개 모델·전압 정격·body 조건','GDS 표시 polygon으로 body 접속을 추측하지 않습니다.','schematic B와 LVS extracted body 연결을 비교하세요.',['sky130']),
 ref('headroom','headroom·swing·rail','DC bias와 가용 출력 범위를 먼저 확인합니다.',undefined,'V','실제 공급·각 MOS 동작점','높은 AC gain이 큰 rail-to-rail swing을 보장하지 않습니다.','게이트 바이어스를 하나 바꾸고 OP를 비교하세요.',['ngspice','sky130']),
 ref('mirror-compliance','전류 미러 compliance','출력 전압이 전류 전달에 미치는 영향을 봅니다.','관측 ratio=Iout/Iref','A/A, V','실제 MOS DC·동일 조건 비교','동일 W/L만으로 ratio=1을 보장하지 않습니다.','두 reference current의 출력 sweep을 비교하세요.',['sky130','ngspice']),
 ref('differential-commonmode','차동·공통 모드','같이 움직이는 입력과 서로 벌어지는 입력을 구분합니다.','Vdiff=Vp−Vn; Vcm=(Vp+Vn)/2','V','입력 범위·bias·외부 구동 명시','동일한 geometric placement가 CMRR 수치를 제공하지 않습니다.','Vdiff 고정 후 Vcm 변화 실험을 계획하세요.'),
 ref('inverter-timing','인버터 timing 기준','정확한 입력/출력 crossing과 부하를 기록합니다.','tpHL=tY,50%,fall−tA,50%,rise','s, ns; Cload: F/fF','matching input event·finite rise·실제 samples','50% 지연과 10–90% transition은 다른 수치입니다.','5fF와 50fF의 actual waveform을 비교하세요.',['repo-inverter']),
 ref('logic-path','논리 진리표와 물리 경로','기존 셀의 연결과 입력에 따른 conducting path를 읽습니다.',undefined,'V, s','각 입력 조합과 안정 구간·threshold 명시','진리표 검사 통과는 모든 timing arc/Liberty characterization이 아닙니다.','NAND와 NOR의 최악 경로 후보를 표시하세요.',['repo-cells']),
 ref('hierarchy-ports','계층과 포트 mapping','하위 셀의 정의와 상위 instance 연결을 나눕니다.',undefined,'net names, integer DBU','포트 순서·namespace·대상 revision','schematic 연결과 블록 사이 실제 mask 배선은 별도입니다.','복사 preview에서 추가 도형과 port mapping을 확인하세요.',['repo-cells']),
 ref('pnr-library','표준 셀 라이브러리와 P&R','셀 특성과 전체 칩 배치·배선·timing 최적화의 역할을 구분합니다.',undefined,'LEF/Liberty/netlist/GDS','표준 셀·공정 룰·constraints·timing 데이터 필요','P&R을 배선만 하는 과정으로 설명하지 않습니다.','Liberty와 GDS가 각각 담는 데이터를 대조하세요.',['openroad']),
 ref('ldo-limits','LDO load transient 한계','출력 C·ESR·부하·dropout 조건을 명시합니다.',undefined,'V, A, F, s','실제 loop·external reference/bias·testbench','한 step 통과가 full PVT·안정성·열 인증은 아닙니다.','부하와 C 중 하나만 바꿔 actual undershoot를 보세요.',['repo-cells']),
 ref('sc-dcdc','SC DC-DC 변환비','이상 charge transfer와 switch·부하 손실을 구분합니다.',undefined,'V, A, F, Hz','클록·switch·C·load 모델 명시','2:1 ideal ratio를 actual regulation 보증으로 쓰지 않습니다.','steady interval ripple과 공급 전류를 보세요.',['repo-cells']),
 ref('adc-code-definitions','ADC bin과 endpoint','코드 수, 이상 bin 폭, endpoint 정의를 구분합니다.','codes=2^N; bin=Vref/2^N; endpoint=Vfs/(2^N−1)','V/code','SAR reference는 bin 정의. 기존 hub는 endpoint 정의.','8bit CODE는 측정한 ENOB8이 아닙니다.','1.2V·8bit의 4.6875mV bin과 endpoint를 따로 적으세요.',['shared-math','sar-architecture']),
 ref('sar-charge','SAR charge redistribution','샘플 전하와 trial 전압을 추적합니다.','VTOP=VCM−VIN+VREF·trial/256','V','이상 equal units·8bit·명시 driver/reference. actual MOS는 별도.','이상식이 comparator noise/offset·switch injection을 없애지 않습니다.','실제 COMP decision 로그와 trial을 나란히 보세요.',['repo-sar','sar-architecture']),
 ref('sdm-osr','ΣΔ bitstream과 OSR','modulator와 decimator의 역할을 구분합니다.',undefined,'Hz, samples, code','현재 reference의 modulator clock·CIC2×256·settling 명시','OSR만으로 ENOB·noise-shaping 성능을 확정하지 않습니다.','같은 입력에서 BITSTREAM과 CODE/VALID를 연결하세요.',['repo-sdm']),
 ref('fft-coherent','FFT 관측 조건','입력 주파수·sample 수·window·settling을 함께 기록합니다.','fin=k·fs/N','Hz, samples','정수 k·기록된 actual valid frames','DC offset·settling frame·leakage를 성능으로 오해하지 않습니다.','입력 주파수와 window를 기록하고 spectrum을 확인하세요.',['repo-sdm']),
 ref('sampling-alias','sampling과 alias','샘플 속도·입력 대역과 anti-alias 필요성을 구분합니다.',undefined,'Hz','bandlimit와 실제 sample/valid rate 확인','출력 코드 폭이 alias 방지를 보장하지 않습니다.','filter 전후 signal path를 표시하세요.',['repo-sdm','repo-sar']),
 ref('dbu-grid','DBU와 µm','도형은 정수 좌표, 물리 길이는 DBU 배율로 표현합니다.','length_um=length_DBU×dbu_um','DBU, µm','현재 layout DBU 사용','교육용 예시 DBU=0.001µm를 모든 GDS에 강제하지 않습니다.','export/reimport 좌표와 DBU를 비교하세요.',['klayout']),
 ref('geometry-matching','대칭·centroid와 matching','좌표 특성과 전기적 mismatch를 별도 증거로 취급합니다.','centroid=(ΣAi xi/ΣAi, ΣAi yi/ΣAi)','µm, µm²','같은 unit 면적·기하 확인. gradient 선형 가정은 명시.','같은 centroid는 orientation·이웃·배선·고차 gradient 일치를 보장하지 않습니다.','ABBA와 ABAB의 좌표·이웃 차이를 적으세요.',['align']),
 ref('matching-environment','주변 환경·방향·dummy','같은 W/L 외에 orientation·이웃·배선·온도 조건이 있습니다.',undefined,'geometry, model ID','공정 자료·추출·mismatch 모델 필요','common centroid와 dummy가 항상 최선이라고 가르치지 않습니다.','기하로 아는 사실과 모델 없이는 모르는 것을 구분하세요.',['align','sky130']),
 ref('stack-assumptions','GDS·표시 Z·실제 적층','XY 마스크와 공정 적층·재료 정보를 구분합니다.',undefined,'layer/datatype, µm, z scale','사용한 layer mapping·공정 출처·가상/실제 표기','단순 돌출 2.5D를 공정 simulation이라고 부르지 않습니다.','표시 z scale 변경으로 전기 결과가 바뀌지 않음을 확인하세요.',['klayout','xsection']),
 ref('topography-resolution','step·hole·coverage와 해상도','가정 기반 heightmap의 해상도와 미해결 얇은 film을 밝힙니다.',undefined,'µm, voxel size','입력 recipe·측정 데이터·재료/공정 모델의 유무','그림만으로 calibrated TCAD·결함·foundry 공정 성능을 확정하지 않습니다.','격자보다 얇은 막을 unresolved로 분류하세요.',['xsection','sky130']),
 ref('cross-probe','회로↔mask 연결의 확실성','원본 device/net metadata가 있을 때만 대응을 확정합니다.',undefined,'device ID, net, layer','원본 annotation·현재 revision·추출 증거','이름이 비슷한 polygon만으로 MOS 대응을 확정하지 않습니다.','unknown/candidate/confirmed를 구분해 설명하세요.',['repo-inverter']),
 ref('drc-lvs-pex','DRC·LVS·PEX 독립성','룰 검사, 연결 비교, RC 추출은 각각 다른 질문입니다.',undefined,'violation count, device/net, Ω/F','실제 deck·모델·도구·입력 revision','한 job 성공으로 전체 검증 PASS를 표시하지 않습니다.','각 단계의 run ID와 실패 원인을 기록하세요.',['repo-physical','sky130']),
 ref('engine-evidence','실행·판정·미지원 상태','설치 진단과 설계 실행 결과를 분리합니다.',undefined,'execution_status, analysis_result','not_run/unavailable/queued/running/completed/failed/canceled','completed/fail은 실제 검사 불합격이며 엔진 crash와 다릅니다.','물리 검사 없는 계산 과제를 not_run으로 남기세요.',['repo-physical']),
 ref('revision-history','현재 결과와 역사적 결과','run의 revision과 입력 signature를 현재 상태와 대조합니다.',undefined,'project_id, revision, engine/model/deck hash','현재 dependency와 실제 provenance','같은 project 이름을 현재 검증 증거로 쓰지 않습니다.','입력 한 개 수정 뒤 과거 결과 label을 확인하세요.',['repo-inverter','repo-physical']),
 ref('pvt-mismatch','corner·MC·mismatch 구분','deterministic corner와 확률적 mismatch 수율은 다릅니다.',undefined,'°C, V, model corner, seed','각 corner와 MC 제공 모델의 실제 범위','TT/SS/FF 세 점이 통계 수율이나 모든 온도 범위를 보장하지 않습니다.','실행한 조건과 미실행 noise/MC 항목을 나누세요.',['sky130','repo-soc']),
 ref('sampling-step','time step과 수치 수렴','실제 sample 간격·보간·solver 조건을 기록합니다.',undefined,'s, V, A','동일 회로·입력·모델에서 step 비교','최대 time step보다 짧은 pulse를 항상 정확히 측정할 수 있다고 가정하지 않습니다.','step을 절반으로 줄여 transition 수치의 안정성을 비교하세요.',['ngspice']),
 ref('learner-explanation','학생 설명과 교수자 평가','자신의 관찰·근거·다음 실험을 직접 작성합니다.',undefined,undefined,'원본 학생 입력과 교수자 가이드 분리','자동 해설·QA fixture를 학생 제출·학습 효과 증명으로 저장하지 않습니다.','사전/사후 설명을 보존하고 교수자에게 검토를 요청하세요.',['repo-inverter'])
];

export const learningPaths = [
 {id:'first-lab',title:'첫 실습 · 4회',assignment_ids:['calc-unit-converter','calc-voltage-divider','circuit-divider','circuit-loaded-divider']},
 {id:'circuits',title:'회로 이론 · 8회',assignment_ids:['circuit-series','circuit-parallel','circuit-thevenin','circuit-rc-charge','circuit-rc-discharge','circuit-rc-ac','calc-rl-time-constant','calc-rlc-resonance']},
 {id:'mos-foundations',title:'MOS와 바이어스 · 6회',assignment_ids:['mos-iv','mos-common-source','mos-bias-divider','mos-current-mirror','mos-differential-pair','mos-inverter-load']},
 {id:'digital-reading',title:'디지털 셀과 계층 · 8회',assignment_ids:digitalAssignments.map(a=>a.id)},
 {id:'analog-front-end',title:'아날로그 AFE · 6회',assignment_ids:['mos-differential-pair','mos-cascode','analog-ota','analog-miller','analog-pga','analog-tia']},
 {id:'power-clocks',title:'전원·신호 응답 · 4회',assignment_ids:['calc-power-dissipation','analog-ldo','analog-dcdc','calc-frequency-period']},
 {id:'data-converters',title:'데이터 변환 · 9회',assignment_ids:['calc-adc-resolution','calc-dac-resolution',...converterAssignments.map(a=>a.id)]},
 {id:'physical-thinking',title:'레이아웃 판단 · 10회',assignment_ids:layoutAssignments.map(a=>a.id)},
 {id:'verification',title:'실제 검증과 재현 · 6회',assignment_ids:verificationAssignments.map(a=>a.id)},
 {id:'semester',title:'한 학기 · 15회',assignment_ids:['calc-unit-converter','circuit-divider','circuit-loaded-divider','circuit-rc-charge','mos-iv','mos-common-source','mos-current-mirror','mos-inverter-load','digital-nand','digital-full-adder','layout-primitives','layout-centroid','verify-drc','verify-lvs','verify-pex']}
];
