import type {Device,Junction,Wire} from '@mos/contracts';
import {pinOffsets} from './schematic-drawing';
export type SchematicSelection={kind:'device'|'wire'|'junction';id:string};
export type Point=[number,number];
type Box=[number,number,number,number];
export const selectionKey=(item:SchematicSelection)=>item.kind+':'+item.id;
export function schematicRegion(a:Point,b:Point,devices:Device[],wires:Wire[],junctions:Junction[]):SchematicSelection[]{
 const box:Box=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],contained=b[0]>=a[0];
 const inBox=([x,y]:Point)=>box[0]<=x&&x<=box[2]&&box[1]<=y&&y<=box[3];
 const hits:SchematicSelection[]=[];
 for(const d of devices){const height=d.kind==='block'?Math.max(60,Object.keys(d.pins).length*24)/2:55;const pins=Object.values(pinOffsets(d));
  const corners:Point[]=[[-55,-height],[55,-height],[55,height],[-55,height]];const r=(d.rotation??0)*Math.PI/180;
  const points=corners.map(([x,y])=>{if(d.mirror)x=-x;return [d.x+x*Math.cos(r)-y*Math.sin(r),d.y+x*Math.sin(r)+y*Math.cos(r)] as Point;}).concat(pins.map(([x,y])=>[d.x+x,d.y+y] as Point));
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),bounds:Box=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  if(contained?points.every(inBox):bounds[0]<=box[2]&&bounds[2]>=box[0]&&bounds[1]<=box[3]&&bounds[3]>=box[1])hits.push({kind:'device',id:d.id});
 }
 for(const w of wires){if(contained?w.points.every(inBox):w.points.some(inBox)||w.points.some((p,i)=>i>0&&segmentBox(w.points[i-1],p,box)))hits.push({kind:'wire',id:w.id});}
 for(const j of junctions)if(inBox([j.x,j.y]))hits.push({kind:'junction',id:j.id});return hits;
}
// Liang-Barsky: diagonal wires are supported and bbox-only false hits excluded.
function segmentBox(a:Point,b:Point,r:Box){let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1];for(const [p,q] of [[-dx,a[0]-r[0]],[dx,r[2]-a[0]],[-dy,a[1]-r[1]],[dy,r[3]-a[1]]]){if(p===0){if(q<0)return false;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}}return true;}
