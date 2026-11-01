// Failed UI QA may contain an entered serial or a server token. Keep a small
// diagnostic allowlist; never serialize RPC responses or form input values.
export function redactDesktopQaText(value,secrets=[]){
 let text=typeof value==='string'?value:'';
 for(const secret of secrets)if(typeof secret==='string'&&secret)text=text.split(secret).join('[REDACTED]');
 return text.replace(/RS1-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}/gi,'[REDACTED SERIAL]')
  .replace(/\bBearer\s+\S+/gi,'Bearer [REDACTED]')
  .replace(/[A-Za-z0-9_-]{32,}(?:\.[A-Za-z0-9_-]{16,})*/g,'[REDACTED TOKEN]').slice(0,1000);
}
export function desktopQaDiagnostics({licenseResponse,storage,alerts=[],error}={},secrets=[]){
 const result=licenseResponse?.ok===true?licenseResponse.result:null;
 const state=result?.state??licenseResponse?.error?.code,message=result?.message??licenseResponse?.error?.message;
 const backends=['basic_text','gnome_libsecret','kwallet','kwallet5','kwallet6','unknown','win32','darwin'];
 return {
  license:{rpc_ok:licenseResponse?.ok===true,edition:['edu','indust'].includes(result?.edition)?result.edition:null,authorized:result?.authorized===true,state:redactDesktopQaText(state,secrets),message:redactDesktopQaText(message,secrets),server_configured:result?.server_configured===true},
  storage:{selected_backend:backends.includes(storage?.selected_backend)?storage.selected_backend:'unknown',encryption_available:storage?.encryption_available===true},
  alerts:Array.isArray(alerts)?alerts.slice(0,4).map(value=>redactDesktopQaText(value,secrets)):[],
  error:redactDesktopQaText(error,secrets)
 };
}
