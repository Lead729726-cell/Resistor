import type { CurrentFlow, Scene } from '@mos/contracts';
import { deltaUm } from './geometry';
import type { LocalFrame } from './geometry';

export type CurrentBranch = CurrentFlow['branches'][number];
export function sampleIndex(flow: CurrentFlow, requested: number) {
  return Math.max(0, Math.min(Math.max(0, flow.x.length - 1), Number.isFinite(requested) ? Math.trunc(requested) : 0));
}
export function branchCurrent(branch: CurrentBranch, index: number): number | null {
  const value = branch.values_A[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function currentDirection(value: number | null): 'forward' | 'reverse' | 'zero' | 'missing' {
  return value === null || !Number.isFinite(value) ? 'missing' : value > 0 ? 'forward' : value < 0 ? 'reverse' : 'zero';
}
export function formatCurrent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '자료 없음';
  if (value === 0) return '0 A';
  const units: [number, string][] = [[1e9,'G'],[1e6,'M'],[1e3,'k'],[1,''],[1e-3,'m'],[1e-6,'µ'],[1e-9,'n'],[1e-12,'p'],[1e-15,'f']];
  const unit=units.find(([factor])=>Math.abs(value)>=factor);
  return unit ? `${Number((value/unit[0]).toPrecision(4))} ${unit[1]}A` : `${value.toExponential(3)} A`;
}
export function flowStatus(flow: CurrentFlow, scene: Scene | null) {
  if(flow.schema_version!==1||flow.convention!=='conventional')return {active:false,reason:'지원되지 않는 전류 규약 · 수치만 표시'};
  if(flow.analysis.trim().toLowerCase()==='ac')return {active:false,reason:'복소수 AC 위상 결과 · 전류 방향 표시 미지원'};
  if(flow.freshness==='stale')return {active:false,reason:'STALE · 모델·PDK 또는 해석 입력이 변경됨 · 수치만 표시'};
  if (!scene) return { active: false, reason: '레이아웃 연결 없음 · 수치만 표시' };
  if (flow.project_id && flow.project_id !== scene.project_id) return { active: false, reason: '다른 프로젝트 결과 · 수치만 표시' };
  if (flow.revision !== scene.revision) return { active: false, reason: `STALE · 결과 r${flow.revision} / 설계 r${scene.revision}` };
  return { active: true, reason: `${flow.source} · ${flow.analysis} · r${flow.revision}` };
}
/** Only the explicit from→to DBU path supplies a spatial mapping. No nearest-shape inference. */
export function currentPath(branch: CurrentBranch, value: number | null, frame: LocalFrame): [number,number][] | null {
  if (currentDirection(value) === 'missing' || currentDirection(value) === 'zero' || branch.mapping === 'unmapped' || !branch.path_dbu || branch.path_dbu.length<2) return null;
  const path=branch.path_dbu.map(([x,y])=>[deltaUm(x,frame.origin[0],frame.dbuUm),deltaUm(y,frame.origin[1],frame.dbuUm)] as [number,number]);
  return value! < 0 ? path.reverse() : path;
}
/** Display-path projection of the signed branch current; this is not a spatial current-density field. */
export function projectedCurrent(branch: CurrentBranch, value: number | null, frame: LocalFrame) {
  if(value===null||!branch.path_dbu||branch.path_dbu.length<2||branch.mapping==='unmapped')return null;
  const [a,b]=branch.path_dbu;
  const dx=deltaUm(b[0],frame.origin[0],frame.dbuUm)-deltaUm(a[0],frame.origin[0],frame.dbuUm),dy=deltaUm(b[1],frame.origin[1],frame.dbuUm)-deltaUm(a[1],frame.origin[1],frame.dbuUm),length=Math.hypot(dx,dy);
  return length>0 ? {x_A:value*dx/length,y_A:value*dy/length} : null;
}
