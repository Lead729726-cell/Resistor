// Read-only tasks may be shared across effect cleanup/restart. Never use this for writes.
export class ReadResourceGate<T>{
 private sequence=0;
 private pending:{key:string;task:Promise<T>}|null=null;
 invalidate(){this.sequence++;}
 async run(key:string,read:()=>Promise<T>):Promise<{current:false}|{current:true;ok:true;value:T}|{current:true;ok:false;error:unknown}>{
  const own=++this.sequence;
  const task=this.pending?.key===key?this.pending.task:Promise.resolve().then(read);this.pending={key,task};
  try{const value=await task;return own===this.sequence?{current:true,ok:true,value}:{current:false};}
  catch(error){return own===this.sequence?{current:true,ok:false,error}:{current:false};}
  finally{if(this.pending?.task===task)this.pending=null;}
 }
}
