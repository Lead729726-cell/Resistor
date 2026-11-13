export const ONLINE_ACCESS_POLICY_VERSION='2026-11-13';
export const ONLINE_ACCESS_MINIMUM_AGE=14;
export const ONLINE_ACCESS_ERROR_CODE='ONLINE_AGE_CONFIRMATION_REQUIRED';
const editions=new Set(['edu','indust']);
const message='Resistor Edu 온라인 기능은 만 14세 이상 확인 후 사용할 수 있습니다. 생년월일이나 신분증은 수집하지 않습니다.';
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function onlineAccessRequired(edition){if(!editions.has(edition))throw Error('Unknown online-access edition.');return edition==='edu';}
export function createOnlineAcknowledgment(input,now=Date.now()){
 if(!exactKeys(input,['edition','policy_version','age_14_or_over'])||!editions.has(input.edition)||input.policy_version!==ONLINE_ACCESS_POLICY_VERSION||input.age_14_or_over!==true||!Number.isFinite(now))throw Object.assign(Error(message),{code:ONLINE_ACCESS_ERROR_CODE});
 return {schema_version:1,edition:input.edition,policy_version:ONLINE_ACCESS_POLICY_VERSION,age_14_or_over:true,acknowledged_at:new Date(now).toISOString()};
}
export function validOnlineAcknowledgment(value,edition,now=Date.now()){
 if(!exactKeys(value,['schema_version','edition','policy_version','age_14_or_over','acknowledged_at'])||!editions.has(edition)||value.schema_version!==1||value.edition!==edition||value.policy_version!==ONLINE_ACCESS_POLICY_VERSION||value.age_14_or_over!==true||typeof value.acknowledged_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.acknowledged_at))return false;
 const date=Date.parse(value.acknowledged_at);return Number.isFinite(now)&&Number.isFinite(date)&&date<=now+300000&&new Date(date).toISOString()===value.acknowledged_at;
}
export function assertOnlineAccess(value,edition,now=Date.now()){
 if(onlineAccessRequired(edition)&&!validOnlineAcknowledgment(value,edition,now))throw Object.assign(Error(message),{code:ONLINE_ACCESS_ERROR_CODE});
}
