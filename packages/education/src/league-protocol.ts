export const leagueSchema=1;
export function canonical(value:unknown):string{
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 throw Error('서명할 수 없는 입력입니다.');
}
export type LeagueEnvelope={schema_version:1;device_id:string;method:string;params:Record<string,unknown>;issued_at:number;nonce:string};
export const leagueEmojis=['⚡','🧠','🚀','🔬','🎯','🦉','🐱','🌱','✨','🔧','📐','🔥','🌟','🧩','🦊','🐧','🎉','💡','🛠️','🍀','🌈','🤖','📚','🐢'];
