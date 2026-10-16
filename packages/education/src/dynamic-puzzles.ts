import type {Puzzle,Placement,PuzzleAssessment} from './circuit-puzzles.ts';

export type Connections=Record<string,Record<string,string>>;
const rcPins=[{pin:'+',expected:'OUT',options:['OUT','IN']},{pin:'-',expected:'GND',options:['GND']}];
export const dynamicPuzzles:Puzzle[]=[
 {id:'rc-charge',title:'09 · 커패시터 충·방전',level:2,kind:'rc',goal:'R과 C를 꽂고 IN → R → OUT → C → GND로 연결하세요. C를 바꿔 충·방전 전압과 전류를 비교하세요.',vin:1.8,target:1e-6,unit:'s',initial:{},
  slots:[{id:'R1',label:'입력 저항',nodes:['IN','OUT'],accepts:'resistor',pins:[{pin:'+',expected:'IN',options:['IN']},{pin:'-',expected:'OUT',options:['OUT']}]},{id:'C1',label:'저장 커패시터',nodes:['OUT','GND'],accepts:'capacitor',pins:rcPins}],
  parts:[{id:'r1k',kind:'resistor',label:'1 kΩ',ohms:1000,watts:.25},{id:'r10k',kind:'resistor',label:'10 kΩ',ohms:10000,watts:.25},{id:'c1n',kind:'capacitor',label:'1 nF',farads:1e-9},{id:'c2n',kind:'capacitor',label:'2 nF',farads:2e-9},{id:'c5n',kind:'capacitor',label:'5 nF',farads:5e-9}],
  conditions:['실제 ngspice 과도해석 · 이상 R/C · 입력 0↔1.8 V PULSE · 27 °C','입력 지연 1 µs, 상승/하강 0.1 µs, high 20 µs, 주기 40 µs · 해석 40 µs / 최대 간격 20 ns','τ = RC는 입력 에지 시간과 구분한 이상 RC 예측값입니다. 파형은 실행한 엔진 데이터만 표시합니다. 레이아웃·기생·DRC/LVS/PEX는 미실행입니다.'],
  hints:['저항은 IN과 OUT, 커패시터는 OUT과 GND 사이에 놓고 각 핀을 연결하세요.','I(C)의 + 기준은 C의 +핀 → −핀입니다. 방전하면 부호가 뒤집힐 수 있습니다.','같은 R에서 C를 1 nF → 5 nF로 바꾸고 다시 실행해 보세요. τ=RC가 다섯 배가 되는지 파형을 비교하세요.']},
 {id:'nmos-switch',title:'10 · 트랜지스터로 전하 빼기',level:3,kind:'nmos',goal:'풀업 저항·부하 C·NMOS를 꽂고 핀을 연결하세요. 게이트 IN/GND와 부하 C를 바꿔 OUT과 드레인 전류를 관찰하세요.',vin:1.8,target:0,unit:'V',initial:{},
  slots:[{id:'R1',label:'풀업 저항',nodes:['VCC','OUT'],accepts:'resistor',pins:[{pin:'+',expected:'VCC',options:['VCC']},{pin:'-',expected:'OUT',options:['OUT']}]},{id:'C1',label:'출력 부하',nodes:['OUT','GND'],accepts:'capacitor',pins:rcPins},{id:'M1',label:'NMOS 스위치',nodes:['OUT','IN','GND','GND'],accepts:'nmos',pins:[{pin:'D',expected:'OUT',options:['OUT']},{pin:'G',expected:'IN',options:['IN','GND']},{pin:'S',expected:'GND',options:['GND']},{pin:'B',expected:'GND',options:['GND']}]}],
  parts:[{id:'r10k',kind:'resistor',label:'10 kΩ',ohms:10000,watts:.25},{id:'r20k',kind:'resistor',label:'20 kΩ',ohms:20000,watts:.25},{id:'c10f',kind:'capacitor',label:'10 fF',farads:10e-15},{id:'c100f',kind:'capacitor',label:'100 fF',farads:100e-15},{id:'c1p',kind:'capacitor',label:'1 pF',farads:1e-12},{id:'mn-small',kind:'nmos',label:'NMOS · W 0.65 µm',w_um:.65,l_um:.15},{id:'mn-wide',kind:'nmos',label:'NMOS · W 1.3 µm',w_um:1.3,l_um:.15}],
  conditions:['실제 ngspice · 공개 SKY130A nfet_01v8 TT 모델 · L=0.15 µm, nf=m=1 · 이상 풀업 R/부하 C','전원 1.8 V · 27 °C · 입력 지연 10 ns, rise/fall 1 ns, high 80 ns, 주기 160 ns · 해석 200 ns / 최대 간격 0.1 ns','G=GND도 실행 가능한 대조 실험입니다. 연결이 목표와 다른 것과 엔진 오류를 구분합니다. MOS 전류는 실제 드레인 단자 전류이며 모든 단자 전류가 같다고 가정하지 않습니다.','공개 모델 연결이 없으면 unavailable로 표시합니다. 임의 MOS 모델이나 파형으로 대체하지 않습니다. 제조·노이즈·불일치·PEX 검증은 포함하지 않습니다.'],
  hints:['R: VCC→OUT, C: OUT→GND, NMOS: D=OUT, G=IN, S=B=GND로 연결하세요.','IN이 높을 때 NMOS가 전하를 빼내는지 OUT과 M1 드레인 전류를 같은 시간 커서로 읽으세요.','먼저 G를 GND로 바꿔 대조 실험하세요. 다음으로 G=IN을 복구하고 C만 바꿔 상승·하강을 비교하세요.']}
];

export function assessDynamic(p:Puzzle,placement:Placement,connections:Connections={}):PuzzleAssessment{
 const missing=p.slots.flatMap(s=>!placement[s.id]?[s.id]:s.pins!.filter(pin=>!connections[s.id]?.[pin.pin]).map(pin=>s.id+'.'+pin.pin));
 const formula=p.kind==='rc'?'τ = R × C [Ω·F = s]; I(C) = C × dV(C)/dt':'MOS: SKY130A nfet_01v8 TT; I(C) = C × dV(C)/dt';
 const observations=missing.length?['부품·핀 연결 누락: '+missing.join(', ')]:['연결 입력이 완성되었습니다. 실제 해석을 실행해야 전압·전류를 알 수 있습니다.'];
 const different=p.slots.flatMap(s=>s.pins!.filter(pin=>connections[s.id]?.[pin.pin]&&connections[s.id][pin.pin]!==pin.expected).map(pin=>`${s.id}.${pin.pin}=${connections[s.id][pin.pin]} (기본 실험 ${pin.expected})`));
 if(different.length)observations.push('대조 연결: '+different.join(', '));
 return {status:missing.length?'incomplete':'ready-to-run',scope:'connection-check',engine_verification:false,formula,observations,missing,value:null,unit:p.unit,current_A:null,output_V:null,powers:[],target_met:false,power_met:false,topology_complete:!missing.length};
}
export function validateConnections(p:Puzzle,connections:Connections){
 for(const [slot,pins] of Object.entries(connections)){
  const socket=p.slots.find(s=>s.id===slot);if(!socket?.pins||!pins||Array.isArray(pins))throw Error('지원하지 않는 연결 자리입니다.');
  for(const [pin,net] of Object.entries(pins)){const rule=socket.pins.find(p=>p.pin===pin);if(!rule||!rule.options.includes(net))throw Error('이 핀에서 지원하는 노드를 선택하세요.');}
 }
}
