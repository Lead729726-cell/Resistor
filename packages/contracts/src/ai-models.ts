// Reservation ceilings per million tokens; no cache discount or assumed refund.
export const structuredModels={
 'gpt-6-luna':{model:'gpt-6-luna',label:'GPT-6 Luna',input:0.20,output:0.75,checked:'2026-10-27'},
 'gpt-6.1-sol':{model:'gpt-6.1-sol',label:'GPT-6.1 Sol',input:2,output:10,checked:'2026-10-27'}
} as const;
export type StructuredModelId=keyof typeof structuredModels;
export function structuredModel(id:string){
 if(!Object.hasOwn(structuredModels,id))throw Error('지원하지 않는 구조화 AI 모델입니다.');
 return structuredModels[id as StructuredModelId];
}
