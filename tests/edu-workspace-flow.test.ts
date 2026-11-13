import test from 'node:test';
import assert from 'node:assert/strict';
import {eduLaunchGroups,eduLaunchActivities,eduLearningTools,eduWorkspaceChoice,eduWorkspaceFlow,eduWorkspaceTarget,eduWorkspaceToolTarget,initialEduWorkspaceFlow,type EduLaunchGroup,type EduSettingsTool} from '../packages/ui/src/edu-workspace-flow';

test('the home has exactly two learning modes; records, league and preview remain secondary tools',()=>{
 assert.deepEqual(eduLaunchGroups.map(group=>group.id),['study','design']);
 assert.deepEqual(eduLearningTools.map(tool=>tool.id),['projects','league','preview']);
 assert.deepEqual(eduLaunchActivities.study.map(option=>option.id),['workbook','questions','puzzles']);
});
test('home entry opens activity selection directly; design routes keep all seven steps and lesson identity',()=>{
 for(let step=1;step<=7;step++){
  const design={mode:'design' as const,step,lessonId:'2e053569-8076-40dc-8016-7056dbbc2c61'};
  let state=initialEduWorkspaceFlow();assert.equal(eduWorkspaceTarget(state,design),null);
  state=eduWorkspaceFlow(state,{type:'open-group',group:'design'});assert.equal(state.page,'launch-activity');
  const target=eduWorkspaceTarget(state,design);assert.deepEqual(target,design);assert.notEqual(target,design);
  state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'new-design'});
  assert.equal(state.page,'launch-activity');assert.deepEqual(eduWorkspaceTarget(state,design),{mode:'design',step:1});
  assert.equal(design.step,step);assert.ok(design.lessonId);
  state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'launch-goal');assert.equal(eduWorkspaceTarget(state,design),null);
  state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'closed');
 }
});
test('selection, back and close retain each mode choice without an extra confirmation page',()=>{
 let state=eduWorkspaceFlow(initialEduWorkspaceFlow(),{type:'open-group',group:'study'});
 state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'puzzles'});assert.equal(state.page,'launch-activity');
 state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'launch-goal');
 state=eduWorkspaceFlow(state,{type:'choose-group',group:'design'});
 state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'new-design'});
 state=eduWorkspaceFlow(state,{type:'close'});assert.equal(state.page,'closed');
 state=eduWorkspaceFlow(state,{type:'open-group',group:'study'});
 assert.equal(eduWorkspaceChoice(state).id,'puzzles');assert.equal(state.selections.design,'new-design');
});
test('every activity maps to a supported route while off-screen and wrong-group selections are rejected',()=>{
 for(const group of Object.keys(eduLaunchActivities) as EduLaunchGroup[]){
  for(const option of eduLaunchActivities[group]){
   let state=eduWorkspaceFlow(initialEduWorkspaceFlow(),{type:'open-launcher'});
   assert.equal(eduWorkspaceFlow(state,{type:'choose-activity',activity:option.id}),state);
   state=eduWorkspaceFlow(state,{type:'choose-group',group});
   assert.equal(eduWorkspaceFlow(state,{type:'choose-activity',activity:group==='study'?'new-design':'workbook'}),state);
   state=eduWorkspaceFlow(state,{type:'choose-activity',activity:option.id});
   const target=eduWorkspaceTarget(state,{mode:'design',step:3});assert.ok(target);assert.notEqual(target.mode,'home');
   state=eduWorkspaceFlow(state,{type:'close'});assert.equal(eduWorkspaceTarget(state,{mode:'design',step:3}),null);
  }
 }
});
test('secondary tools expose only routes, and Back returns through their actual parent page',()=>{
 let state=initialEduWorkspaceFlow();assert.equal(eduWorkspaceToolTarget(state,'league'),null);
 assert.equal(eduWorkspaceFlow(state,{type:'open-preview'}),state);
 state=eduWorkspaceFlow(state,{type:'open-tools'});
 assert.deepEqual(eduWorkspaceToolTarget(state,'projects'),{mode:'projects'});
 assert.deepEqual(eduWorkspaceToolTarget(state,'league'),{mode:'quiz',panel:'league'});
 assert.equal(eduWorkspaceToolTarget(state,'preview'),null);
 state=eduWorkspaceFlow(state,{type:'open-preview'});assert.equal(state.page,'preview');
 assert.equal(eduWorkspaceToolTarget(state,'league'),null);
 state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'tools');
 state=eduWorkspaceFlow(state,{type:'open-launcher'});
 state=eduWorkspaceFlow(state,{type:'choose-group',group:'study'});
 state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'questions'});
 state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'launch-goal');
 state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'tools');
 state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'closed');
 assert.equal(state.selections.study,'questions');
});
test('appearance, update, legal and local license tools return to settings without changing learning choices',()=>{
 for(const tool of ['appearance','updates','legal','license'] as EduSettingsTool[]){
  let state=eduWorkspaceFlow(initialEduWorkspaceFlow(),{type:'open-group',group:'design'});
  state=eduWorkspaceFlow(state,{type:'choose-activity',activity:'new-design'});const selections=state.selections;
  state=eduWorkspaceFlow(state,{type:'open-settings'});
  state=eduWorkspaceFlow(state,{type:'open-tool',tool});assert.equal(state.page,tool);
  state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'settings');
  state=eduWorkspaceFlow(state,{type:'back'});assert.equal(state.page,'closed');assert.equal(state.selections,selections);
 }
});
