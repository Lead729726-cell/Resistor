import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const built=await build({stdin:{contents:"export {PuzzleDetailPage} from './packages/ui/src/CircuitPuzzleLab.tsx'; export {default as PuzzleSimulation} from './packages/ui/src/PuzzleSimulation.tsx';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',target:'node24',loader:{'.css':'empty'},external:['react','react/*'],logLevel:'silent'});
const subject={exports:{}};
runInNewContext(built.outputFiles[0].text,{module:subject,exports:subject.exports,require:createRequire(import.meta.url),TextEncoder,TextDecoder});
const {PuzzleDetailPage,PuzzleSimulation}=subject.exports;
const pages=['pins','results','explanation','coach'];

test('each puzzle detail opens alone and back hides all four without removing draft children',()=>{
 const children=new Map(pages.map(page=>[page,React.createElement('input',{defaultValue:`saved-${page}`,name:page})]));
 for(const current of [null,...pages,null,'coach','results']){
  const elements=pages.map(page=>PuzzleDetailPage({page,current,children:children.get(page)}));
  assert.equal(elements.filter(element=>!element.props.hidden).length,current?1:0);
  for(let i=0;i<pages.length;i++){
   assert.equal(elements[i].props.children,children.get(pages[i]),'retained child identity');
   assert.equal(elements[i].props['data-puzzle-page'],pages[i]);
  }
  const html=renderToStaticMarkup(React.createElement(React.Fragment,null,...elements));
  for(const page of pages)assert.ok(html.includes(`value="saved-${page}"`),'hidden draft remains mounted');
  assert.equal((html.match(/hidden=""/g)||[]).length,current?3:4);
 }
});

test('opening actual simulation detail never calls run or refresh and retains not_run scope',()=>{
 let calls=0;
 const child=React.createElement(PuzzleSimulation,{trials:[],revision:3,busy:false,ready:true,onRun:()=>calls++,onRefresh:()=>calls++});
 for(const current of ['results',null,'pins','results']){
  const html=renderToStaticMarkup(React.createElement(PuzzleDetailPage,{page:'results',current},child));
  assert.match(html,/ngspice 실제 실행/);assert.match(html,/미실행 · 연결을 완성한 후 실행하세요/);
  assert.match(html,/DRC \/ LVS \/ PEX: 각각 미실행/);assert.doesNotMatch(html,/실제 노드 전압 파형/);
 }
 assert.equal(calls,0);
});

test('moving result pages preserves unavailable and historical engine evidence instead of relabelling it',()=>{
 const trials=[{id:'old-unavailable',board_revision:2,status:'unavailable',message:'ngspice executable missing',waveforms:[]}],snapshot=structuredClone(trials);
 for(const current of ['results','coach',null,'results']){
  const child=React.createElement(PuzzleSimulation,{trials,revision:3,busy:false,ready:false,onRun:()=>{throw Error('unexpected execution');},onRefresh:()=>{throw Error('unexpected refresh');}});
  const html=renderToStaticMarkup(React.createElement(PuzzleDetailPage,{page:'results',current},child));
  assert.match(html,/사용 불가/);assert.match(html,/ngspice executable missing/);
  assert.match(html,/이전 배치 기록 · 현재 배치는 다시 실행 필요/);assert.match(html,/보드 r2/);
  assert.doesNotMatch(html,/실제 노드 전압 파형|PASS/);
 }
 assert.deepEqual(trials,snapshot);
});
