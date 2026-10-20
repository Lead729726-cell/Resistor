import type {Device,Junction,Wire} from '@mos/contracts';
import {pinOffsets,type Point} from './schematic-drawing';

// Fit visible symbols and transformed terminals, not only device centres.
export function schematicViewport(devices:Device[],wires:Wire[],junctions:Junction[]){
 let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
 const add=([x,y]:Point)=>{xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);};
 for(const d of devices){
  const halfHeight=d.kind==='block'?Math.max(60,Object.keys(d.pins).length*24)/2:55;
  const angle=(d.rotation??0)*Math.PI/180;
  for(let [x,y]of [[-55,-halfHeight],[55,-halfHeight],[55,halfHeight],[-55,halfHeight]]){
   if(d.mirror)x=-x;add([d.x+x*Math.cos(angle)-y*Math.sin(angle),d.y+x*Math.sin(angle)+y*Math.cos(angle)]);
  }
  for(const [x,y]of Object.values(pinOffsets(d)))add([d.x+x,d.y+y]);
  // Name/value labels remain horizontal even when the symbol is rotated.
  add([d.x-62,d.y-55]);add([d.x+Math.max(104,61+Math.min(48,d.name.length)*7),d.y+55]);
 }
 for(const wire of wires)for(const point of wire.points)add(point);
 for(const j of junctions)add([j.x,j.y]);
 if(xmin===Infinity){xmin=200;ymin=100;xmax=400;ymax=300;}
 const width=Math.max(500,xmax-xmin+160),height=Math.max(360,ymax-ymin+160);
 return {left:(xmin+xmax-width)/2,top:(ymin+ymax-height)/2,width,height};
}
