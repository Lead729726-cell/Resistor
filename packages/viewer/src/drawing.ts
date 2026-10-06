import type {LayoutCommand} from '@mos/contracts';
import {decimalCoordinate,snappedDelta,type DecimalPoint,type LocalFrame} from './geometry';
export type DrawTool='box'|'polygon'|'route';
export const conductorLayers=new Set(['67/20','68/20','69/20','70/20','71/20','72/20']);
const min=-(1n<<63n),max=(1n<<63n)-1n;
function coordinate(value:string){const v=decimalCoordinate(value);if(v<min||v>max)throw new Error('좌표가 64 bit DBU 범위를 넘습니다.');return v;}
function same(a:DecimalPoint,b:DecimalPoint){return coordinate(a[0])===coordinate(b[0])&&coordinate(a[1])===coordinate(b[1]);}
/** Snap the absolute integer coordinate, including an origin that is off grid. */
export function drawingPoint(x:number,y:number,frame:LocalFrame,grid:number):DecimalPoint{
  if(!Number.isSafeInteger(grid)||grid<1)throw new Error('양의 정수 grid가 필요합니다.');
  const g=BigInt(grid);
  return [x,y].map((v,i)=>{const remainder=((frame.origin[i]%g)+g)%g;const snapped=frame.origin[i]-remainder+decimalCoordinate(snappedDelta(v+Number(remainder)*frame.dbuUm,frame.dbuUm,grid));coordinate(String(snapped));return String(snapped);}) as DecimalPoint;
}
export function appendDrawingPoint(points:DecimalPoint[],point:DecimalPoint,tool:DrawTool,order:'x-first'|'y-first'):DecimalPoint[]{
  const last=points.at(-1);if(last&&same(last,point))return points;
  if(tool!=='route'||!last||last[0]===point[0]||last[1]===point[1])return [...points,point];
  return [...points,order==='x-first'?[point[0],last[1]]:[last[0],point[1]],point];
}
function cross(a:bigint[],b:bigint[],c:bigint[]){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function on(a:bigint[],b:bigint[],p:bigint[]){return cross(a,b,p)===0n&&p[0]>=(a[0]<b[0]?a[0]:b[0])&&p[0]<=(a[0]>b[0]?a[0]:b[0])&&p[1]>=(a[1]<b[1]?a[1]:b[1])&&p[1]<=(a[1]>b[1]?a[1]:b[1]);}
function intersects(a:bigint[],b:bigint[],c:bigint[],d:bigint[]){const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);return (p>0n&&q<0n||p<0n&&q>0n)&&(r>0n&&s<0n||r<0n&&s>0n)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
export function drawingCommand(tool:DrawTool,layer:string,points:DecimalPoint[],grid:number,width:string,net:string):LayoutCommand{
  if(!Number.isSafeInteger(grid)||grid<1)throw new Error('양의 정수 grid가 필요합니다.');
  const g=BigInt(grid),p=points.map(point=>point.map(v=>{const n=coordinate(v);if(n%g)throw new Error('좌표가 grid에 맞지 않습니다.');return n;}));
  const metadata=net.trim()?{net:net.trim()}:{};
  if(tool==='box'){
    if(p.length!==2)throw new Error('대각선 모서리 두 점을 클릭하세요.');
    const [a,b]=p;if(a[0]===b[0]||a[1]===b[1])throw new Error('사각형의 가로와 세로는 0보다 커야 합니다.');
    return {type:'add_box',layer_id:layer,box:[String(a[0]<b[0]?a[0]:b[0]),String(a[1]<b[1]?a[1]:b[1]),String(a[0]>b[0]?a[0]:b[0]),String(a[1]>b[1]?a[1]:b[1])],...metadata};
  }
  if(tool==='polygon'){
    if(p.length>1&&same(points[0],points.at(-1)!)){p.pop();points=points.slice(0,-1);}
    if(p.length<3)throw new Error('다각형에는 최소 세 꼭짓점이 필요합니다.');
    let area=0n;
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if(a[0]===b[0]&&a[1]===b[1])throw new Error('중복 꼭짓점을 제거하세요.');area+=a[0]*b[1]-b[0]*a[1];for(let j=i+1;j<p.length;j++){if(j===i+1||i===0&&j===p.length-1)continue;if(intersects(a,b,p[j],p[(j+1)%p.length]))throw new Error('다각형 경계가 교차하거나 겹칩니다.');}}
    if(area===0n)throw new Error('다각형 면적이 0입니다.');
    return {type:'add_polygon',layer_id:layer,polygon:points,...metadata};
  }
  if(!conductorLayers.has(layer))throw new Error('배선은 지원되는 conductor 레이어를 선택하세요.');
  const w=coordinate(width);if(w<=0n||w%(2n*g))throw new Error(`배선 폭은 ${2*grid} DBU의 양의 배수여야 합니다.`);
  if(p.length<2)throw new Error('배선에는 최소 두 점이 필요합니다.');
  for(let i=0;i<p.length;i++){if(p[i].some(v=>v-w/2n<min||v+w/2n>max))throw new Error('배선 가장자리가 좌표 범위를 넘습니다.');if(i&& (same(points[i-1],points[i])||p[i][0]!==p[i-1][0]&&p[i][1]!==p[i-1][1]))throw new Error('배선은 서로 다른 점을 잇는 수평·수직 구간이어야 합니다.');}
  return {type:'add_route',layer_id:layer,points,width:String(w),...metadata};
}
