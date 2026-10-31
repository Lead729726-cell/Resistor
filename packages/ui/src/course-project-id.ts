type IdCrypto=Pick<Crypto,'getRandomValues'>&Partial<Pick<Crypto,'randomUUID'>>;
// Project identifiers only; never use this helper for passwords or access tokens.
// The getRandomValues path supports browsers which lack randomUUID on file URLs.
export function newCourseProjectId(source:IdCrypto=globalThis.crypto):string{
 if(typeof source?.randomUUID==='function')return source.randomUUID();
 if(typeof source?.getRandomValues!=='function')throw Error('안전한 프로젝트 ID를 만들 수 없습니다. 최신 브라우저나 HTTPS 워크북을 사용하세요.');
 const bytes=source.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const h=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
