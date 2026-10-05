import { compareResolution, simulateRecipe } from '../../process/src/index';
self.onmessage=async(event:MessageEvent<{recipe:unknown;compare:boolean}>)=>{
  try {
    const progress=(step:number,total:number,name:string)=>self.postMessage({kind:'progress',step,total,name});
    const run=await (event.data.compare?compareResolution(event.data.recipe,progress):simulateRecipe(event.data.recipe,progress));
    self.postMessage({kind:'result',ok:true,run});
  }catch(error){self.postMessage({kind:'result',ok:false,message:error instanceof Error?error.message:String(error)});}
};
