import {interpolate,plotSamples,validateWaveform} from '../../analysis/src/waveform';

export type PuzzleTrace={name:string;unit:string;x:number[];y:number[];x_unit?:string;reference?:string};
export type PlotTrace={wave:PuzzleTrace;path:string;colorIndex:number;point?:[number,number]};
export type PuzzleChart={traces:PlotTrace[];prior:PlotTrace[];ticks:{value:number;y:number}[]};
export const puzzlePlotLimit=1200;

// Display preparation only. Original samples remain intact for cursor interpolation.
export function preparePuzzlePlot(waves:PuzzleTrace[],before:PuzzleTrace[]){
 const errors:string[]=[];
 const valid=(items:PuzzleTrace[],label:string)=>items.filter(w=>{
  try{
   if(!Array.isArray(w.x)||!Array.isArray(w.y))throw Error('X/Y 표본 배열이 필요합니다.');
   validateWaveform(w);
   if(w.x_unit&&w.x_unit!=='s')throw Error('시간 축 단위 s가 필요합니다.');
   if(!['V','A'].includes(w.unit))throw Error('지원 표시 단위는 V 또는 A입니다.');
   if(w.unit==='A'&&w.y.some(v=>!Number.isFinite(v*1000)))throw Error('전류 표시 범위를 초과했습니다.');
   return true;
  }catch(e){errors.push(`${label} ${w.name}: ${e instanceof Error?e.message:String(e)}`);return false;}
 });
 const current=valid(waves,'선택 실행'),prior=valid(before.filter(w=>current.some(c=>c.name===w.name&&c.unit===w.unit)),'이전 실행');
 let start=Infinity,end=-Infinity;
 for(const w of [...current,...prior]){start=Math.min(start,w.x[0]);end=Math.max(end,w.x.at(-1)!);}
 if(!current.length)return {start:0,end:0,charts:[] as (PuzzleChart&{unit:string})[],errors};
 if(!Number.isFinite(end-start))return {start:0,end:0,charts:[] as (PuzzleChart&{unit:string})[],errors:[...errors,'시간 축의 수치 표현 범위를 초과했습니다.']};
 const x=(v:number)=>end===start?395:110+(v-start)/(end-start)*570;
 const charts=['V','A'].flatMap(unit=>{
  const traces=current.filter(w=>w.unit===unit),previous=prior.filter(w=>w.unit===unit);
  if(!traces.length)return [];
  let rawLo=0,rawHi=0;
  for(const w of [...traces,...previous])for(const v of w.y){rawLo=Math.min(rawLo,v);rawHi=Math.max(rawHi,v);}
  const scale=Math.max(Math.abs(rawLo),Math.abs(rawHi))||1;
  const pad=(rawHi/scale-rawLo/scale||1)*.08,lo=rawLo/scale-pad,hi=rawHi/scale+pad;
  const y=(v:number)=>190-(v/scale-lo)/(hi-lo)*160;
  const prepare=(wave:PuzzleTrace):PlotTrace=>{
   const samples=plotSamples(wave,puzzlePlotLimit);
   return {wave,colorIndex:traces.findIndex(w=>w.name===wave.name),
    path:samples.map(([a,b],i)=>(i?'L':'M')+x(a).toFixed(2)+','+y(b).toFixed(2)).join(' '),
    ...(samples.length===1?{point:[x(samples[0][0]),y(samples[0][1])] as [number,number]}:{})};
  };
  const ticks=[rawLo,(rawLo/2+rawHi/2),rawHi].filter((v,i,a)=>a.indexOf(v)===i).map(value=>({value,y:y(value)}));
  return [{unit,traces:traces.map(prepare),prior:previous.map(prepare),ticks}];
 });
 return {start,end,charts,errors};
}

export function puzzleCursorValue(wave:PuzzleTrace,t:number):number|null{
 return t<wave.x[0]||t>wave.x.at(-1)!?null:interpolate(wave,t);
}
export function puzzleTimeLabel(seconds:number){
 const magnitude=Math.abs(seconds);
 const [factor,unit]=magnitude>=1?[1,'s']:magnitude>=1e-3?[1e3,'ms']:magnitude>=1e-6?[1e6,'µs']:[1e9,'ns'];
 return `${Number((seconds*Number(factor)).toPrecision(5))} ${unit}`;
}
