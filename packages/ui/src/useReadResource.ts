import {useCallback,useEffect,useRef,useState} from 'react';
import {ReadResourceGate} from './read-resource';

// This hook is only for reads. Writes, engine execution and provider calls must never use it.
export function useReadResource<T>(read:()=>Promise<T>,key:string,enabled=true){
 const reader=useRef(read);reader.current=read;
 const gate=useRef(new ReadResourceGate<T>());
 const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[checkedAt,setCheckedAt]=useState<string|null>(null);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');const result=await gate.current.run(key,reader.current);
  if(!result.current)return null;
  setLoading(false);if(result.ok){setData(result.value);setCheckedAt(new Date().toISOString());return result.value;}
  setError(result.error instanceof Error?result.error.message:String(result.error));return null;
 },[key]);
 useEffect(()=>{if(enabled)void reload();return()=>gate.current.invalidate();},[reload,enabled]);
 return {data,loading,error,checkedAt,reload};
}
