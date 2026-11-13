import {readFile} from 'node:fs/promises';
import {assertOnlineAccess} from '../platform/licensing/online-access-policy.mjs';

async function currentEdition(){
 if(process.env.RESISTOR_EDITION!==undefined)return process.env.RESISTOR_EDITION;
 try{const value=JSON.parse(await readFile(new URL('../product-edition.json',import.meta.url),'utf8'));if(value.schema_version!==1)throw Error('Unsupported product context');return value.edition;}catch(error){if(error.code==='ENOENT')return 'indust';throw error;}
}

// Only trusted process options can supply this callback. RPC JSON is never
// interpreted as an acknowledgment; direct Edu service calls fail closed.
export async function assertExternalAiAccess({edition,assertOnlineAccess:readAcknowledgment}={}){
 edition??=await currentEdition();
 if(!['edu','indust'].includes(edition))throw Object.assign(Error('Unknown AI product edition'),{code:'INVALID_PARAMETER'});
 if(edition==='indust')return;
 const acknowledgment=typeof readAcknowledgment==='function'?await readAcknowledgment():null;
 assertOnlineAccess(acknowledgment,edition);
}
