import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PuzzleSimulation, {type PuzzleTrace, type PuzzleTrial} from '../packages/ui/src/PuzzleSimulation';
import {preparePuzzlePlot,puzzleCursorValue,puzzlePlotLimit,puzzleTimeLabel} from '../packages/ui/src/puzzle-waveform';

const trace=(name:string,x:number[],y:number[],unit='V'):PuzzleTrace=>({name,x,y,unit});
const trial=(waves:PuzzleTrace[],patch:Partial<PuzzleTrial>={}):PuzzleTrial=>({id:'run',board_revision:2,status:'completed',waveforms:waves,...patch});
const render=(trials:PuzzleTrial[])=>renderToStaticMarkup(<PuzzleSimulation trials={trials} revision={2} busy={false} ready onRun={()=>{}} onRefresh={()=>{}}/>);

test('nonzero transient starts use the actual time interval without crashing',()=>{
 const html=render([trial([trace('offset',[15e-6,20e-6],[0,1])])]);
 assert.match(html,/17\.5/);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
test('different trace intervals show unavailable cursor values instead of extrapolating',()=>{
 const html=render([trial([trace('voltage',[0,10e-6],[0,1]),trace('current',[0,1e-6],[0,.001],'A')])]);
 assert.match(html,/범위 밖/);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
test('malformed engine vectors report a data error while preserving valid traces',()=>{
 for(const invalid of [trace('bad',[],[]),trace('bad',[0,1],[0]),trace('bad',[0,0],[0,1]),trace('bad',[0,1],[0,NaN])]){
  const html=render([trial([trace('valid',[0,1e-6],[0,1]),invalid])]);
  assert.match(html,/role="alert"/);
  assert.match(html,/bad/);
  assert.match(html,/valid/);
  assert.doesNotMatch(html,/NaN|Infinity/);
 }
});
test('completed jobs without vectors never display a sample waveform',()=>{
 const html=render([trial([])]);
 assert.match(html,/파형 데이터 없음/);
 assert.doesNotMatch(html,/aria-label="실제 노드 전압 파형/);
});
test('single-point traces remain finite and previous runs stay revision-labelled',()=>{
 const html=render([trial([trace('v',[0,2e-6],[0,1])],{id:'old',board_revision:1}),trial([trace('v',[0],[.5])])]);
 assert.doesNotMatch(html,/NaN|Infinity/);
 assert.match(html,/보드 r1/);
});
test('overlay and voltage/current charts share an axis covering both original intervals',()=>{
 const plot=preparePuzzlePlot([trace('v',[2e-6,4e-6],[0,1]),trace('i',[3e-6,5e-6],[0,.001],'A')],[trace('v',[1e-6,8e-6],[1,0])]);
 assert.equal(plot.start,1e-6);assert.equal(plot.end,8e-6);assert.equal(plot.charts.length,2);
 for(const chart of plot.charts)for(const item of [...chart.traces,...chart.prior]){
  const xs=[...item.path.matchAll(/[ML]([\d.]+),/g)].map(m=>Number(m[1]));
  assert(xs.every(x=>x>=110&&x<=680));
 }
});
test('large display reduction preserves narrow extrema and leaves full-resolution measurements untouched',()=>{
 const x=Array.from({length:100000},(_,i)=>i*1e-9),y=x.map(()=>0);y[23456]=7;y[65432]=-3;
 const source=trace('v',x,y),plot=preparePuzzlePlot([source],[]),prepared=plot.charts[0].traces[0];
 assert((prepared.path.match(/[ML]/g)||[]).length<=puzzlePlotLimit);
 assert.equal(source.x.length,100000);assert.equal(source.y[23456],7);
 assert.equal(puzzleCursorValue(source,x[23456]),7);assert.equal(puzzleCursorValue(source,x[65432]),-3);
 assert(Math.abs(puzzleCursorValue(source,(x[23455]+x[23456])/2)!-3.5)<1e-10);
 const renderedY=[...prepared.path.matchAll(/[ML][\d.]+,([\d.]+)/g)].map(m=>Number(m[1]));
 assert(Math.min(...renderedY)<50);assert(Math.max(...renderedY)>160);
});
test('wrong axis units remain unavailable and engineering time labels preserve scale',()=>{
 const w={...trace('frequency',[0,1],[0,1]),x_unit:'Hz'};
 const plot=preparePuzzlePlot([w],[]);assert.equal(plot.charts.length,0);assert.match(plot.errors[0],/단위 s/);
 assert.equal(puzzleTimeLabel(2),'2 s');assert.equal(puzzleTimeLabel(.002),'2 ms');
 assert.equal(puzzleTimeLabel(2e-6),'2 µs');assert.equal(puzzleTimeLabel(2e-9),'2 ns');
});
