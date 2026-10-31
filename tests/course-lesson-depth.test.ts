import test from 'node:test';
import assert from 'node:assert/strict';
import {initialLessonDepth,lessonDepthReducer} from '../packages/ui/src/lesson-depth';

test('questions advance one at a time and previous returns through the actual setup parent',()=>{
 let nav=initialLessonDepth();
 nav=lessonDepthReducer(nav,{type:'enter',page:'conditions'});
 nav=lessonDepthReducer(nav,{type:'enter',page:'concepts'});
 nav=lessonDepthReducer(nav,{type:'advance',count:3});
 assert.equal(nav.page,'concepts');assert.equal(nav.index,1);
 nav=lessonDepthReducer(nav,{type:'previous'});
 assert.equal(nav.page,'concepts');assert.equal(nav.index,0);
 nav=lessonDepthReducer(nav,{type:'previous'});
 assert.equal(nav.page,'conditions');assert.equal(nav.index,0);
 nav=lessonDepthReducer(nav,{type:'previous'});
 assert.deepEqual(nav,initialLessonDepth());
});

test('new stage or completed detail sequence returns to the main lesson rather than a stale child page',()=>{
 let nav=lessonDepthReducer(initialLessonDepth(),{type:'enter',page:'concepts'});
 for(let i=0;i<3;i++)nav=lessonDepthReducer(nav,{type:'advance',count:3});
 assert.deepEqual(nav,initialLessonDepth());
 nav=lessonDepthReducer(nav,{type:'enter',page:'trials'});
 nav=lessonDepthReducer(nav,{type:'select',index:4,count:5});
 assert.deepEqual(lessonDepthReducer(nav,{type:'stage'}),initialLessonDepth());
});

test('reopening a fresh context cannot accumulate stale modal history from a closed branch',()=>{
 let nav=lessonDepthReducer(initialLessonDepth(),{type:'enter',page:'conditions'});
 nav=lessonDepthReducer(nav,{type:'enter',page:'concepts'});
 for(let i=0;i<20;i++)nav=lessonDepthReducer(nav,{type:'enter',page:'context',fresh:true});
 assert.deepEqual(nav,{page:'context',index:0,trail:[{page:'stage',index:0}]});
 assert.deepEqual(lessonDepthReducer(nav,{type:'previous'}),initialLessonDepth());
});

test('a nested evidence page returns to the selected parent item and transitions do not mutate the previous state',()=>{
 let nav=lessonDepthReducer(initialLessonDepth(),{type:'enter',page:'trials'});
 nav=lessonDepthReducer(nav,{type:'select',index:2,count:4});
 const snapshot=structuredClone(nav);
 const child=lessonDepthReducer(nav,{type:'enter',page:'verification'});
 assert.deepEqual(nav,snapshot);
 assert.deepEqual(lessonDepthReducer(child,{type:'previous'}),snapshot);
 assert.strictEqual(lessonDepthReducer(child,{type:'enter',page:'verification'}),child);
});

test('empty, stale, and malformed item cursors never navigate outside the available range',()=>{
 const base=lessonDepthReducer(initialLessonDepth(),{type:'enter',page:'mapping'});
 for(const [index,count,expected]of [[-2,3,0],[100,3,2],[1.5,3,0],[NaN,3,0],[Infinity,3,0],[1,0,0],[1,-2,0],[1,Infinity,0],[1,2.5,0]]){
  assert.equal(lessonDepthReducer(base,{type:'select',index,count}).index,expected);
 }
 assert.deepEqual(lessonDepthReducer(base,{type:'advance',count:0}),initialLessonDepth());
 const old=lessonDepthReducer(base,{type:'select',index:8,count:10});
 assert.deepEqual(lessonDepthReducer(old,{type:'advance',count:2}),initialLessonDepth());
 assert.deepEqual(lessonDepthReducer(initialLessonDepth(),{type:'previous'}),initialLessonDepth());
});
