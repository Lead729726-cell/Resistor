// Best-effort UI preferences only. Never use these helpers for credentials,
// learner answers, project files, encrypted drafts, or engine evidence.
type PreferenceStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type StorageSource=()=>PreferenceStorage;
const browserStorage:StorageSource=()=>globalThis.localStorage;
export function readPreference(key:string,source:StorageSource=browserStorage):string|null{
 try{return source().getItem(key);}catch{return null;}
}
export function writePreference(key:string,value:string,source:StorageSource=browserStorage):boolean{
 try{source().setItem(key,value);return true;}catch{return false;}
}
export function removePreference(key:string,source:StorageSource=browserStorage):boolean{
 try{source().removeItem(key);return true;}catch{return false;}
}
export function readRecentProjects(value:string|null):{id:string;name:string}[]{
 try{
  const parsed:unknown=JSON.parse(value||'null');
  return Array.isArray(parsed)?parsed.filter((item):item is {id:string;name:string}=>!!item&&typeof item.id==='string'&&!!item.id&&typeof item.name==='string').slice(0,8):[];
 }catch{return [];}
}
