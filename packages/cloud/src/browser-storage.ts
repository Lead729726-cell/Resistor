type ReadStore=()=>Pick<Storage,'getItem'>;
// Read the cloud destination and session atomically. If any read is denied,
// never pair a saved credential with a guessed/default destination.
export function readCloudBootstrap(keys:{url:string;token:string;room:string},local:ReadStore,session:ReadStore){
 try{return {available:true,url:local().getItem(keys.url),token:session().getItem(keys.token),room:session().getItem(keys.room)};}
 catch{return {available:false,url:null,token:null,room:null};}
}
