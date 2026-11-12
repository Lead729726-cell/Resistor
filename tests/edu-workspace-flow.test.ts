import test from 'node:test';
import assert from 'node:assert/strict';
import {eduLaunchActivities,eduWorkspaceChoice,eduWorkspaceFlow,eduWorkspaceTarget,initialEduWorkspaceFlow,type EduLaunchGroup,type EduSettingsTool} from '../packages/ui/src/edu-workspace-flow';

test('Edu activity selection only produces a destination after the final explicit page',()=>{
 const design={mode:'design' as const,step:6,lessonId:'2e053569-8076-40dc-8016-7056dbbc2c61'};
 let state=initialEduWorkspaceFlow();assert.equal(eduWorkspaceTarget(state,design),null);
 state=eduWorkspaceFlow(state,{type:'open-launcher'});assert.equal(eduWorkspaceTarget(state,design),null);
 state=eduWorkspaceFlow(state,{type:'choose-group',group:'design'});assert.equal(eduWorkspaceTarget(state,design),null);
 state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'resume-design'});
 const target=eduWorkspaceTarget(state,design);assert.deepEqual(target,design);assert.notEqual(target,design);
 state=eduWorkspaceFlow(state,{type:'back'});assert.equal(eduWorkspaceTarget(state,design),null);
 state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'new-design'});assert.deepEqual(eduWorkspaceTarget(state,design),{mode:'design',step:1});
 assert.equal(design.step,6);assert.ok(design.lessonId);
});
test('back, close and group switching retain separate choices without changing learner routes',()=>{
 let state=eduWorkspaceFlow(initialEduWorkspaceFlow(),{type:'open-launcher'});
 state=eduWorkspaceFlow(state,{type:'choose-group',group:'study'});
 state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'puzzles'});
 state=eduWorkspaceFlow(eduWorkspaceFlow(state,{type:'back'}),{type:'back'});
 state=eduWorkspaceFlow(state,{type:'choose-group',group:'records'});
 state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'league'});
 state=eduWorkspaceFlow(state,{type:'close'});assert.equal(state.page,'closed');
 state=eduWorkspaceFlow(state,{type:'open-launcher'});state=eduWorkspaceFlow(state,{type:'choose-group',group:'study'});
 assert.equal(eduWorkspaceChoice(state).id,'puzzles');assert.equal(state.selections.records,'league');
 state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'launch-goal');
 state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'closed');
});
test('each available activity maps to a supported Edu route and rejects off-screen selections',()=>{
 for(const group of Object.keys(eduLaunchActivities) as EduLaunchGroup[]){
  for(const option of eduLaunchActivities[group]){
   let state=eduWorkspaceFlow(initialEduWorkspaceFlow(),{type:'open-launcher'});
   assert.equal(eduWorkspaceFlow(state,{type:'choose-activity',activity:option.id}),state);
   state=eduWorkspaceFlow(state,{type:'choose-group',group});
   const invalid=group==='study'?'league':'workbook';
   assert.equal(eduWorkspaceFlow(state,{type:'choose-activity',activity:invalid}),state);
   state=eduWorkspaceFlow(state,{type:'choose-activity',activity:option.id});
   const target=eduWorkspaceTarget(state,{mode:'design',step:3});assert.ok(target);assert.notEqual(target.mode,'home');
  }
 }
});
test('appearance, update, legal and local license tools occupy one page and return to settings on back',()=>{
 for(const tool of ['appearance','updates','legal','license'] as EduSettingsTool[]){
  let state=eduWorkspaceFlow(initialEduWorkspaceFlow(),{type:'open-settings'});
  state=eduWorkspaceFlow(state,{type:'open-tool',tool});assert.equal(state.page,tool);
  state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'settings');
  state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'closed');
  state=eduWorkspaceFlow(state,{type:'open-tool',tool});state=eduWorkspaceFlow(state,{type:'close'});assert.equal(state.page,'closed');
 }
});
test('optional preview and external navigation close only the menu, retaining selected activity',()=>{
 let state=eduWorkspaceFlow(initialEduWorkspaceFlow(),{type:'open-launcher'});
 state=eduWorkspaceFlow(state,{type:'choose-group',group:'study'});
 state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'questions'});
 const selections=state.selections;
 state=eduWorkspaceFlow(state,{type:'open-preview'});assert.equal(state.page,'preview');
 state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'closed');assert.equal(state.selections,selections);
 state=eduWorkspaceFlow(state,{type:'open-launcher'});state=eduWorkspaceFlow(state,{type:'close'});
 assert.equal(state.selections.study,'questions');
});
