import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadResourceGate} from '../packages/ui/src/read-resource';
const deferred=<T,>()=>{let resolve!:(v:T)=>void;const task=new Promise<T>(r=>{resolve=r;});return {task,resolve};};
test('effect cleanup and restart share one read without applying the old response',async()=>{
 const gate=new ReadResourceGate<number>(),d=deferred<number>();let calls=0;const read=()=>{calls++;return d.task;};
 const first=gate.run('bank',read);gate.invalidate();const restarted=gate.run('bank',read);d.resolve(76);
 assert.deepEqual(await first,{current:false});assert.deepEqual(await restarted,{current:true,ok:true,value:76});assert.equal(calls,1);
});
test('a late response for another project or QA filter cannot replace the selected page',async()=>{
 const gate=new ReadResourceGate<string>(),old=deferred<string>(),current=deferred<string>();
 const a=gate.run('project-a',()=>old.task),b=gate.run('project-b',()=>current.task);current.resolve('B');assert.deepEqual(await b,{current:true,ok:true,value:'B'});old.resolve('A');assert.deepEqual(await a,{current:false});
});
test('a failed read can be explicitly retried without retaining a failed task or starting a write',async()=>{
 const gate=new ReadResourceGate<number>();let calls=0;const first=await gate.run('bank',async()=>{calls++;throw Error('offline');});assert(first.current&&!first.ok);
 assert.deepEqual(await gate.run('bank',async()=>{calls++;return 76;}),{current:true,ok:true,value:76});assert.equal(calls,2);
});
