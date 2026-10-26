import type {Device} from '@mos/contracts';
export interface DeviceDraft {
 deviceId:string;revision:number;parameters:Device['parameters'];pins:Device['pins'];
 baseParameters:Device['parameters'];basePins:Device['pins'];
}
export function createDeviceDraft(device:Device,revision:number):DeviceDraft{
 return {deviceId:device.id,revision,parameters:{...device.parameters},pins:{...device.pins},baseParameters:{...device.parameters},basePins:{...device.pins}};
}
const copy=(draft:DeviceDraft):DeviceDraft=>({...draft,parameters:{...draft.parameters},pins:{...draft.pins},baseParameters:{...draft.baseParameters},basePins:{...draft.basePins}});
export class DeviceDraftStore {
 private entries=new Map<string,DeviceDraft>();
 private key(scope:string,id:string){return JSON.stringify([scope,id]);}
 get(scope:string,id:string){const draft=this.entries.get(this.key(scope,id));return draft?copy(draft):undefined;}
 set(scope:string,draft:DeviceDraft){this.entries.set(this.key(scope,draft.deviceId),copy(draft));}
 delete(scope:string,id:string){this.entries.delete(this.key(scope,id));}
}
export function deviceDraftDirty(draft:DeviceDraft){
 return Object.keys(draft.parameters).some(key=>draft.parameters[key]!==draft.baseParameters[key])||Object.keys(draft.pins).some(key=>draft.pins[key]!==draft.basePins[key]);
}
/** Preserve unrelated newer server fields; never silently overwrite a conflicting local edit. */
export function planDeviceDraft(draft:DeviceDraft,device:Device){
 if(draft.deviceId!==device.id)throw Error('다른 소자의 속성 입력입니다.');
 const parameters={...device.parameters},pins={...device.pins};
 const changes:{kind:'parameter'|'pin';key:string;original:number|string|undefined;current:number|string|undefined;entered:number|string;conflict:boolean}[]=[];
 for(const kind of ['parameter','pin'] as const){
  const entered=kind==='parameter'?draft.parameters:draft.pins,base=kind==='parameter'?draft.baseParameters:draft.basePins,current=kind==='parameter'?device.parameters:device.pins;
  for(const key of Object.keys(entered)){if(entered[key]===base[key])continue;
   const conflict=current[key]!==base[key]&&current[key]!==entered[key];
   changes.push({kind,key,original:base[key],current:current[key],entered:entered[key],conflict});
   if(kind==='parameter')parameters[key]=entered[key];else pins[key]=String(entered[key]);
  }
 }
 return {parameters,pins,changes,conflicts:changes.filter(change=>change.conflict),parametersChanged:Object.keys(parameters).some(key=>parameters[key]!==device.parameters[key]),pinChanges:changes.filter(change=>change.kind==='pin'&&change.current!==change.entered).map(change=>({pin:change.key,net:String(change.entered)}))};
}
