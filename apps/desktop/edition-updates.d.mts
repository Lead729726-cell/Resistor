import type {AvailableUpdate,UpdateAsset} from './update-feed.mjs';
export interface EditionUpdate extends AvailableUpdate {edition:'edu'|'indust';product_id:string;asset:UpdateAsset&{edition:'edu'|'indust';product_id:string;target:string};receipt:{name:string;url:string;bytes:number;sha256:string};source_revision?:string}
export function updateIdentity(edition:string):{edition:string;product_id:string;slug:string;name:string;package_name:string;bundle_id:string};
export function editionTarget(platform:string):string;
export function editionPlatform(platform:string,arch:string):string|null;
export function selectEditionRelease(releases:unknown,options:{currentVersion:string;platform:string;edition:string;channel?:string}):EditionUpdate|null;
export function validateEditionAsset(asset:unknown,tag:string,platform:string,edition:string):EditionUpdate['asset'];
export function assertEditionUpdate(update:unknown,edition:string,platform:string):EditionUpdate['asset'];
export function validateEditionReceipt(data:unknown,update:EditionUpdate):{source_revision:string;build_tools_revision:string};
