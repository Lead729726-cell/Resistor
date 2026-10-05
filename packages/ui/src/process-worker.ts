import { inspectVolume, type ProcessCriteria, type ProcessVolume } from '../../process/src/index';
self.onmessage=(event:MessageEvent<{volume:ProcessVolume;criteria:ProcessCriteria}>)=>{
  try {self.postMessage({ok:true,report:inspectVolume(event.data.volume,event.data.criteria)});}
  catch(error){self.postMessage({ok:false,message:error instanceof Error?error.message:String(error)});}
};
