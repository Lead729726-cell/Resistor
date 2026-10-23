import {createHash,createPublicKey,verify} from 'node:crypto';
export const ISSUER='resistor-official-v1';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function licenseError(code,message){return Object.assign(new Error(message),{code});}
export function readLease(token,{publicKeys,edition,deviceHash,now=Date.now()}){
 if(typeof token!=='string'||token.length>12000)throw licenseError('LICENSE_INVALID','인증 파일 형식이 올바르지 않습니다.');
 const parts=token.split('.');if(parts.length!==2||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))throw licenseError('LICENSE_INVALID','인증 서명 형식이 올바르지 않습니다.');
 let value;try{value=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));}catch{throw licenseError('LICENSE_INVALID','인증 내용을 읽을 수 없습니다.');}
 const key=publicKeys?.[value.kid];let verified=false;try{const publicKey=createPublicKey(key);verified=publicKey.asymmetricKeyType==='ed25519'&&verify(null,Buffer.from(parts[0]),publicKey,Buffer.from(parts[1],'base64url'));}catch{}
 if(!verified||value.schema_version!==1||value.iss!==ISSUER||value.type!=='device-lease'||!['edu','indust'].includes(value.edition)||!/^[-a-zA-Z0-9]{10,80}$/.test(value.license_id??'')||!/^[-a-zA-Z0-9]{10,80}$/.test(value.activation_id??'')||!Number.isSafeInteger(value.issued_at)||!Number.isSafeInteger(value.expires_at)||value.expires_at<=value.issued_at||value.expires_at-value.issued_at>7*86400000)throw licenseError('LICENSE_INVALID','인증 서명 또는 필수 정보가 올바르지 않습니다.');
 if(value.edition!==edition)throw licenseError('LICENSE_EDITION','이 시리얼은 다른 버전용입니다. Edu와 Industry 코드를 확인하세요.');
 if(value.device_hash!==deviceHash)throw licenseError('LICENSE_DEVICE','다른 기기의 인증 파일입니다. 이 기기에서 시리얼을 등록하세요.');
 if(value.issued_at>now+300000)throw licenseError('LICENSE_CLOCK','기기 시간을 확인한 후 다시 인증하세요.');
 if(value.expires_at<=now)throw licenseError('LICENSE_EXPIRED','오프라인 인증 기간이 끝났습니다. 인터넷에 연결해 다시 확인하세요.');
 return value;
}
