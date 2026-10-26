import type {SceneShape} from '@mos/contracts';
export type SelectionMode='replace'|'add'|'subtract'|'toggle';
export const selectionMode=(event:{shiftKey?:boolean;altKey?:boolean},click=false):SelectionMode=>event.altKey?'subtract':event.shiftKey?(click?'toggle':'add'):'replace';
export function mergeSelection(old:string[],hits:string[],mode:SelectionMode):string[]{
 const result=new Set(mode==='replace'?[]:old);
 for(const id of hits)if(mode==='subtract'||mode==='toggle'&&result.has(id))result.delete(id);else result.add(id);
 return [...result];
}
/** Loaded selection bbox stays integer DBU until the camera's local-frame conversion. */
export function layoutSelectionBounds(shapes:SceneShape[],ids:string[]){
 const wanted=new Set(ids),found:string[]=[];let box:[bigint,bigint,bigint,bigint]|null=null;
 for(const shape of shapes){if(!wanted.has(shape.id)||!shape.polygon.length)continue;found.push(shape.id);
  for(const [x,y]of shape.polygon){const a=BigInt(x),b=BigInt(y);if(!box)box=[a,b,a,b];else{if(a<box[0])box[0]=a;if(b<box[1])box[1]=b;if(a>box[2])box[2]=a;if(b>box[3])box[3]=b;}}
 }
 return box?{ids:found,bbox:box.map(String) as [string,string,string,string]}:null;
}
type P=[bigint,bigint];type B=[bigint,bigint,bigint,bigint];
const orientation=(a:P,b:P,c:P)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const between=(a:bigint,b:bigint,c:bigint)=>c>=(a<b?a:b)&&c<=(a>b?a:b);
const on=(a:P,b:P,c:P)=>orientation(a,b,c)===0n&&between(a[0],b[0],c[0])&&between(a[1],b[1],c[1]);
function intersects(a:P,b:P,c:P,d:P){const o1=orientation(a,b,c),o2=orientation(a,b,d),o3=orientation(c,d,a),o4=orientation(c,d,b);return ((o1>0n&&o2<0n||o1<0n&&o2>0n)&&(o3>0n&&o4<0n||o3<0n&&o4>0n))||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
function inside(p:P,ring:P[]){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if(on(a,b,p))return true;if((a[1]>p[1])!==(b[1]>p[1])){const cross=orientation(a,b,p);if((cross>0n)===(b[1]>a[1]))yes=!yes;}}return yes;}
export function selectionBox(a:[string,string],b:[string,string]):B{const x=BigInt(a[0]),y=BigInt(a[1]),u=BigInt(b[0]),v=BigInt(b[1]);return [x<u?x:u,y<v?y:v,x>u?x:u,y>v?y:v];}
/** Inclusive mask boundary policy. BigInt preserves absolute DBU and holes. */
export function maskInRegion(shape:SceneShape,box:B,contained:boolean):boolean{
 const rings=[shape.polygon,...(shape.holes??[])].map(r=>r.map(([x,y])=>[BigInt(x),BigInt(y)] as P));const hull=rings[0];if(!hull.length)return false;
 const inBox=([x,y]:P)=>x>=box[0]&&x<=box[2]&&y>=box[1]&&y<=box[3];
 if(contained)return hull.every(inBox);
 const corners:P[]=[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]];
 if(hull.some(inBox)||corners.some(p=>inside(p,hull)&&!rings.slice(1).some(h=>inside(p,h))))return true;
 return rings.some(r=>r.some((a,i)=>corners.some((c,j)=>intersects(a,r[(i+1)%r.length],c,corners[(j+1)%4]))));
}
