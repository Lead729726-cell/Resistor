import {licenseError} from './token.mjs';

export const publicLicenseRuntimeFiles=Object.freeze(['token.mjs','access-policy.mjs','public-config.json']);

// Course fulfillment and the separate professional product share the license engine.
// A caller may not expand an Inflearn course grant by changing the edition field.
export const courseAccessPolicy=Object.freeze({
 schema_version:1,product_id:'resistor.edu.course',provider:'inflearn',edition:'edu',
 included_editions:Object.freeze(['edu']),industry_included:false,device_limit:2,
 download_url:'https://resistor.kr/download/edu/',
 notice:'인프런 강의에는 Resistor Edu 사용권만 포함됩니다. 개인 기기 2대까지 등록할 수 있으며, Resistor Industry는 별도 구매 제품입니다.'
});
export function orderAccess({provider,edition,device_limit}){
 if(!['inflearn','direct'].includes(provider))throw licenseError('ORDER_PROVIDER','지원하는 주문 출처는 inflearn 또는 direct입니다.');
 if(provider==='inflearn'){
  if(edition!=='edu')throw licenseError('ORDER_EDITION','인프런 강의 주문은 Resistor Edu 전용입니다. Industry 사용권은 별도 구매·증빙으로 발급하세요.');
  if(device_limit!==2)throw licenseError('ORDER_POLICY','강의 Edu 사용권은 개인 기기 2대로 고정됩니다.');
  return {product_id:courseAccessPolicy.product_id,purchase_scope:'course',included_editions:['edu'],industry_included:false,device_limit:2};
 }
 if(edition!=='indust')throw licenseError('ORDER_EDITION','direct는 별도 Resistor Industry 구매용입니다. 인프런 강의는 inflearn·edu로 발급하세요.');
 if(!Number.isInteger(device_limit)||device_limit<1||device_limit>2)throw licenseError('ORDER_POLICY','별도 Industry 기기 수는 1~2대여야 합니다.');
 return {product_id:'resistor.indust.official',purchase_scope:'separate-product',included_editions:['indust'],industry_included:true,device_limit};
}
