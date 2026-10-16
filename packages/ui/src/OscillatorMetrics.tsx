import {type Run} from '@mos/contracts';

const number=(v:unknown,unit:string)=>{
  if(typeof v!=='number'||!Number.isFinite(v))return '미측정';
  const exponent=v===0||unit==='%'?0:Math.max(-15,Math.min(9,3*Math.floor(Math.log10(Math.abs(v))/3)));
  const prefix:Record<number,string>={[-15]:'f',[-12]:'p',[-9]:'n',[-6]:'µ',[-3]:'m',0:'',3:'k',6:'M',9:'G'};
  return `${(v/10**exponent).toPrecision(6)} ${prefix[exponent]}${unit}`;
};
export default function OscillatorMetrics({run}:{run:Run}){
  const kind=run.reference_verification?.kind||'';
  if(!kind.startsWith('osc_'))return null;
  const m=run.measurements||{};
  const values:[string,unknown,string][]=[['출력 주파수',m.output_frequency_Hz,'Hz'],['듀티',typeof m.duty_cycle==='number'?m.duty_cycle*100:undefined,'%'],['평균 공급 전력',m.average_supply_power_W,'W']];
  if(kind==='osc_ring5')values.push(['평균 단계 지연 · T/10',m.average_stage_delay_s,'s']);
  if(kind==='osc_rc_sensor')values.push(['CAP 하단 전환 전압',m.cap_switch_low_V,'V'],['CAP 상단 전환 전압',m.cap_switch_high_V,'V']);
  if(kind==='osc_beat')values.push(['독립 발진기 주파수 차 |fREF−fSENSE|',m.difference_frequency_Hz,'Hz']);
  return <div data-testid="oscillator-metrics">
    <dl className="oscillator-metrics">{values.map(([label,value,unit])=><div key={label}><dt>{label}</dt><dd>{number(value,unit)}</dd></div>)}</dl>
    <p>출력은 실제 MOS 과도 해석의 표본입니다. 정밀 클록 규격·위상 잡음·확률적 지터·공정 수율은 미검증입니다.{kind==='osc_beat'?' RC로 평균한 XOR의 비트 주파수를 두 독립 발진기의 주파수 차와 대조합니다.':kind==='osc_burst'?' 출력 주파수는 첫 EN 구간에서 측정합니다. 정지 구간과 두 번째 기동은 아래 기준에서 별도로 확인합니다.':''}</p>
  </div>;
}
