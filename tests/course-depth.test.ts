import test from 'node:test';
import assert from 'node:assert/strict';
import {courseMissions,missionDraft} from '../packages/education/src/course-workbook';
import {courseDepthPages,courseFieldValidation,courseDepthIndex} from '../packages/education/src/course-depth';
test('each supported input gets one depth and calculation requires a separate page',()=>{
 for(const m of courseMissions){const pages=courseDepthPages(m);assert.equal(new Set(pages.map(p=>p.id)).size,pages.length);assert.equal(pages[0].kind,'intro');assert.equal(pages.at(-1)!.kind,'finish');assert.deepEqual(pages.filter(p=>p.kind==='input').map(p=>p.inputId),m.inputs.map(i=>i.id));if(m.calculator){assert.ok(pages.findIndex(p=>p.kind==='baseline')>pages.findIndex(p=>p.kind==='input'));assert.ok(pages.findIndex(p=>p.kind==='compare')>pages.findIndex(p=>p.kind==='baseline'));}else assert.equal(pages.some(p=>['baseline','recalculate','compare'].includes(p.kind)),false);}
});
test('field checks reuse model ranges while unrelated draft errors remain preserved',()=>{
 const m=courseMissions[0],d=missionDraft(m);d.inputs.r1='0';d.inputs.r2='20000';const original=JSON.stringify(d);
 assert.equal(courseFieldValidation(m,d,'r2').valid,true);assert.equal(courseFieldValidation(m,d,'r1').valid,false);assert.equal(courseFieldValidation(m,d,'unknown').valid,false);assert.equal(JSON.stringify(d),original);
 const rc=courseMissions[3],draft=missionDraft(rc);draft.inputs.capacitance='1e-9';assert.equal(courseFieldValidation(rc,draft,'capacitance').valid,true);draft.inputs.capacitance='-1';assert.equal(courseFieldValidation(rc,draft,'capacitance').valid,false);
});
test('depths are bounded and unsupported engines lead to scope instead of fabricated calculations',()=>{
 const m=courseMissions[6];assert.equal(courseDepthIndex(m,'missing'),0);assert.equal(courseDepthPages(m)[courseDepthIndex(m,'scope')].kind,'scope');assert.deepEqual(courseDepthPages(courseMissions[7]).map(p=>p.kind),['intro','explain','finish']);
});
test('valid coupled RC values are not rejected by default-value isolation',()=>{
 const m=courseMissions.find(m=>m.id==='rc-c')!,d=missionDraft(m);d.inputs.resistance='1e12';d.inputs.capacitance='1e-20';
 assert.equal(courseFieldValidation(m,d,'capacitance').valid,true);
});
