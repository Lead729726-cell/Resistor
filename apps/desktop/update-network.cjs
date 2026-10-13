const {Readable}=require('node:stream');
// Electron's net.fetch cancels manual redirects instead of returning a 302
// Response. Expose ClientRequest redirects to the platform-neutral verifier.
function makeUpdateFetch(net){return (url,options={})=>new Promise((resolve,reject)=>{
  let settled=false,request,response;
  const cleanup=()=>options.signal?.removeEventListener('abort',abort);
  const fail=error=>{if(!settled){settled=true;cleanup();reject(error);}};
  const abort=()=>{const error=options.signal.reason??new DOMException('Aborted','AbortError');fail(error);request?.abort();};
  if(options.signal?.aborted){abort();return;}
  try{
    request=net.request({url,method:'GET',redirect:'manual',credentials:'omit',useSessionCookies:false,cache:'no-store',bypassCustomProtocolHandlers:true});
    for(const [name,value] of new Headers(options.headers??{}))request.setHeader(name,value);
    request.on('error',fail);
    request.on('redirect',(status,_method,location,headers)=>{
      if(settled)return;
      if(options.redirect!=='manual'){fail(Error('버전 정보가 다른 주소로 이동했습니다.'));request.abort();return;}
      const resultHeaders=new Headers();for(const [name,values] of Object.entries(headers??{}))for(const value of [].concat(values))resultHeaders.append(name,value);resultHeaders.set('location',location);
      settled=true;cleanup();resolve(new Response(null,{status,headers:resultHeaders}));request.abort();
    });
    request.on('response',incoming=>{
      if(settled)return;
      try{response=incoming;const headers=new Headers();for(const [name,values] of Object.entries(incoming.headers))for(const value of [].concat(values))headers.append(name,value);
        const body=[204,205,304].includes(incoming.statusCode)?null:Readable.toWeb(incoming);const result=new Response(body,{status:incoming.statusCode,headers});settled=true;resolve(result);
        incoming.once('end',cleanup);incoming.once('error',cleanup);incoming.once('aborted',()=>{cleanup();incoming.destroy?.(new DOMException('Aborted','AbortError'));});if(!body)incoming.resume();
      }catch(error){fail(error);request.abort();}
    });
    options.signal?.addEventListener('abort',abort,{once:true});request.end();
  }catch(error){fail(error);request?.abort();}
});}
module.exports={makeUpdateFetch};
