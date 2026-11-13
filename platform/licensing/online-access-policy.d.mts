export type OnlineAccessEdition='edu'|'indust';
export type OnlineAcknowledgment={schema_version:1;edition:OnlineAccessEdition;policy_version:string;age_14_or_over:true;acknowledged_at:string};
export const ONLINE_ACCESS_POLICY_VERSION:'2026-11-13';
export const ONLINE_ACCESS_MINIMUM_AGE:14;
export const ONLINE_ACCESS_ERROR_CODE:'ONLINE_AGE_CONFIRMATION_REQUIRED';
export function onlineAccessRequired(edition:OnlineAccessEdition):boolean;
export function createOnlineAcknowledgment(input:{edition:OnlineAccessEdition;policy_version:string;age_14_or_over:true},now?:number):OnlineAcknowledgment;
export function validOnlineAcknowledgment(value:unknown,edition:OnlineAccessEdition,now?:number):value is OnlineAcknowledgment;
export function assertOnlineAccess(value:unknown,edition:OnlineAccessEdition,now?:number):void;
