import test from 'node:test';import assert from 'node:assert/strict';
import {drawingPoint,drawingCommand,appendDrawingPoint,lengthToDbu,dbuToLength} from '../src/drawing';
test('absolute grid snap is exact beyond Number precision and with off-grid origin',()=>{
  const origin=9007199254741003n;
  assert.deepEqual(drawingPoint(.012,-.008,{origin:[origin,-origin],dbuUm:.001,boundsUm:[-1,-1,1,1]},5),['9007199254741015','-9007199254741010']);
});
test('sub-DBU pointer precision survives even-grid snapping without double rounding',()=>{
  const f={origin:[0n,0n] as [bigint,bigint],dbuUm:.001,boundsUm:[-1,-1,1,1] as [number,number,number,number]};
  assert.deepEqual(drawingPoint(.0016,-.0016,f,4),['0','0']);
  assert.deepEqual(drawingPoint(.0021,-.0021,f,4),['4','-4']);
});
test('rectangle normalizes opposite corners without floating point conversion',()=>{
  const c=drawingCommand('box','68/20',[['9007199254741010','50'],['9007199254741000','-10']],5,'200','OUT');
  assert.deepEqual(c,{type:'add_box',layer_id:'68/20',box:['9007199254741000','-10','9007199254741010','50'],net:'OUT'});
  assert.throws(()=>drawingCommand('box','68/20',[['0','0'],['0','10']],5,'200',''),/0/);
});
test('polygon accepts concavity and rejects crossings, duplicate and zero-area boundaries',()=>{
  assert.equal(drawingCommand('polygon','68/20',[['0','0'],['30','0'],['10','10'],['0','30']],5,'200','').type,'add_polygon');
  assert.throws(()=>drawingCommand('polygon','68/20',[['0','0'],['30','30'],['0','30'],['30','0']],5,'200',''),/교차/);
  assert.throws(()=>drawingCommand('polygon','68/20',[['0','0'],['10','0'],['20','0']],5,'200',''),/면적/);
});
test('routing adds deterministic orthogonal corners and validates both edges on grid',()=>{
  const pts=appendDrawingPoint([['0','0']],['50','30'],'route','y-first');assert.deepEqual(pts,[['0','0'],['0','30'],['50','30']]);
  assert.equal(drawingCommand('route','68/20',pts,5,'200','').type,'add_route');
  assert.throws(()=>drawingCommand('route','68/20',pts,5,'205',''),/10 DBU/);
  assert.throws(()=>drawingCommand('route','66/20',pts,5,'200',''),/conductor/);
  assert.throws(()=>drawingCommand('route','68/20',[['0','0'],['10','10']],5,'200',''),/수평/);
});
test('coordinate range and off-grid input fail before submission',()=>{
  assert.throws(()=>drawingCommand('box','68/20',[['0','0'],['11','10']],5,'200',''),/grid/);
  assert.throws(()=>drawingCommand('box','68/20',[['0','0'],['9223372036854775808','10']],1,'200',''),/64 bit/);
  assert.throws(()=>drawingCommand('route','68/20',[['9223372036854775800','0'],['9223372036854775805','0']],1,'20',''),/가장자리/);
});
test('micrometre fields keep exact DBU and reject fractional or off-grid lengths',()=>{
  assert.equal(lengthToDbu('0.35','um',.001,5),'350');
  assert.equal(lengthToDbu('-1.25e1','um',.001,5),'-12500');
  assert.equal(lengthToDbu('200','dbu',.005,5),'200');
  assert.equal(dbuToLength('9007199254741005',.001),'9007199254741.005');
  assert.equal(dbuToLength('-350',.0025),'-0.875');
  assert.throws(()=>lengthToDbu('0.0005','um',.001),/DBU/);
  assert.throws(()=>lengthToDbu('0.003','um',.001,5),/격자/);
  for(const value of ['Infinity','NaN','','1e999'])assert.throws(()=>lengthToDbu(value,'um',.001));
});
