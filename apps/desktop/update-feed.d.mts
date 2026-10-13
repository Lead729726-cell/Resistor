export interface UpdateAsset {name:string;url:string;bytes:number;sha256:string;platform:string;revision:number}
export interface AvailableUpdate {version:string;tag:string;preview:boolean;publishedAt:string|null;releaseUrl:string;notes:string;asset:UpdateAsset}
export const REPOSITORY:string;
export const RELEASES_URL:string;
export const DOWNLOAD_SITE:string;
export const MAX_ASSET_BYTES:number;
export function versionParts(value:string):number[];
export function compareVersions(a:string,b:string):number;
export function platformKey(platform:string,arch:string):string|null;
export function validateAsset(asset:unknown,tag:string,platform:string):UpdateAsset;
export function selectRelease(releases:unknown,options:{currentVersion:string;platform:string;channel?:string}):AvailableUpdate|null;
