// Owned loopback transport has no pooled sockets. In particular, restarting
// a worker must not reuse a closed socket through Node's global fetch pool.
import http from 'node:http';
export function localEngineFetch(address,{method='GET',headers={},body,signal}={}){
  const url=new URL(address);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||!['/rpc','/health'].includes(url.pathname))throw Error('Local engine transport requires a literal loopback endpoint.');
  return new Promise((resolve,reject)=>{
    const request=http.request(url,{method,headers:{...headers,...(body===undefined?{}:{'Content-Length':Buffer.byteLength(body)})},agent:false,signal},response=>{
      const chunks=[];let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>128*1024*1024){request.destroy(Error('Local engine response exceeds 128 MiB.'));return;}chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>resolve(new Response([204,304].includes(response.statusCode)?null:Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));
    });
    request.once('error',reject);request.end(body);
  });
}
