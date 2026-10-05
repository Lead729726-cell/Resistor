import test from 'node:test';
import assert from 'node:assert/strict';
import type { CurrentFlow, Scene } from '../../contracts/src/index';
import { branchCurrent,currentDirection,currentPath,flowStatus,formatCurrent,projectedCurrent,sampleIndex } from '../src/current';
import type { LocalFrame } from '../src/geometry';

const origin=9007199254740993000n;
const frame:LocalFrame={origin:[origin,0n],dbuUm:.001,boundsUm:[0,0,1,1]};
const branch:CurrentFlow['branches'][number]={id:'M1',name:'drain',device_id:'real-device',from_net:'D',to_net:'S',values_A:[2e-6,-3e-6,0],path_dbu:[[String(origin),'0'],[String(origin+300n),'400']],mapping:'device_terminals',source_vector:'i(@m1[id])'};
const flow:CurrentFlow={schema_version:1,source:'ngspice',analysis:'tran',x:[0,1e-9,2e-9],x_unit:'s',branches:[branch],convention:'conventional',revision:5,project_id:'test'};

test('actual signed samples reverse conventional direction; zero and missing values do not become arrows',()=>{
  assert.equal(branchCurrent(branch,0),2e-6);assert.equal(branchCurrent(branch,1),-3e-6);assert.equal(branchCurrent(branch,4),null);
  assert.equal(currentDirection(2e-6),'forward');assert.equal(currentDirection(-3e-6),'reverse');assert.equal(currentDirection(0),'zero');assert.equal(currentDirection(-0),'zero');assert.equal(currentDirection(null),'missing');
  assert.deepEqual(currentPath(branch,2e-6,frame),[[0,0],[.3,.4]]);
  assert.deepEqual(currentPath(branch,-3e-6,frame),[[.3,.4],[0,0]]);
  assert.equal(currentPath(branch,0,frame),null);assert.equal(currentPath(branch,null,frame),null);
});
test('unmapped and absent paths retain numeric current without inventing spatial correlation',()=>{
  assert.equal(currentPath({...branch,mapping:'unmapped'},2e-6,frame),null);
  assert.equal(currentPath({...branch,path_dbu:undefined},2e-6,frame),null);
  assert.equal(projectedCurrent({...branch,mapping:'unmapped'},2e-6,frame),null);
});
test('sample bounds and SI units preserve sign and real small magnitudes',()=>{
  assert.equal(sampleIndex(flow,-1),0);assert.equal(sampleIndex(flow,999),2);assert.equal(sampleIndex(flow,1.8),1);
  assert.equal(formatCurrent(2e-6),'2 µA');assert.equal(formatCurrent(-3e-3),'-3 mA');assert.equal(formatCurrent(0),'0 A');assert.equal(formatCurrent(1e-18),'1.000e-18 A');assert.equal(formatCurrent(null),'자료 없음');
});
test('stale or another project cannot activate layout arrows; projection is explicit path-derived current',()=>{
  const scene={project_id:'test',revision:5} as Scene;
  assert.equal(flowStatus(flow,scene).active,true);assert.equal(flowStatus(flow,{...scene,revision:6}).active,false);assert.equal(flowStatus(flow,{...scene,project_id:'different'}).active,false);assert.equal(flowStatus(flow,null).active,false);
  const vector=projectedCurrent(branch,-3e-6,frame)!;assert.ok(Math.abs(vector.x_A-(-1.8e-6))<1e-20);assert.ok(Math.abs(vector.y_A-(-2.4e-6))<1e-20);
});


test('complex AC phasor analysis cannot imply a scalar spatial current direction',()=>{
 const scene={project_id:'test',revision:5} as Scene;
 assert.equal(flowStatus({...flow,analysis:'AC'},scene).active,false);
 assert.equal(flowStatus({...flow,analysis:' ac '},scene).active,false);
 assert.equal(flowStatus({...flow,analysis:'dc'},scene).active,true);
});

test('changed model or PDK dependencies suppress spatial flow at the same project and revision',()=>{
 const scene={project_id:'test',revision:5} as Scene;
 const stale=flowStatus({...flow,freshness:'stale'},scene);
 assert.equal(stale.active,false);assert.match(stale.reason,/STALE/);
 assert.equal(flowStatus({...flow,freshness:'current'},scene).active,true);
 assert.equal(branchCurrent(branch,1),-3e-6);
});
