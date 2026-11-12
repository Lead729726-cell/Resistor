import assert from 'node:assert/strict';

/** Observe the real post-activation Edu UI. No licensing operation is mocked or bypassed here. */
export async function inspectEduDesktopSession(page){
 await page.getByRole('button',{name:'Resistor Edu',exact:true}).waitFor({timeout:30000});
 const state=await page.evaluate(()=>window.mos.rpc('license.status',{}));
 assert.equal(state.ok,true);assert.equal(state.result.authorized,true);assert.equal(state.result.edition,'edu');
 assert.equal(await page.title(),'Resistor Edu');

 // Edu 0.33 exposes management through settings, not the Industry floating button.
 await page.getByRole('button',{name:'설정',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'앱 설정',exact:true});
 await settings.getByRole('button',{name:/^시리얼·기기/}).click();
 const management=page.getByRole('dialog',{name:'Resistor Edu 시리얼 인증',exact:true});
 await management.waitFor({state:'visible',timeout:10000});
 await management.getByRole('button',{name:'작업으로 돌아가기',exact:true}).click();
 await settings.waitFor({state:'visible',timeout:10000});
 await settings.getByRole('button',{name:'앱 설정 닫기',exact:true}).click();
 await settings.waitFor({state:'hidden',timeout:10000});
 return {activation_checked:true,edition_title:'Resistor Edu',window_loaded:true,management_ui_checked:true};
}
