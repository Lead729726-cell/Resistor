import type { Run } from '@mos/contracts';
import { describeRun } from './run-status';

export default function RunStatus({ run, revision, analysisOnly = false }: { run?: Run; revision?: number; analysisOnly?: boolean }) {
  const state = describeRun(run, analysisOnly);
  return <>
    <span data-execution={run?.execution_status || 'not-run'} data-result={run?.analysis_result || 'unknown'} className={`status ${state.tone}`}>{state.label}</span>
    {run?.workflow === 'imported-results' && <span className="status neutral">외부 파일 수치 · 실행 없음</span>}
    {run && (run.freshness === 'stale' || run.revision !== revision) && <span className="status stale" title="현재 설계 revision의 검증 결과가 아닙니다.">STALE · r{run.revision}</span>}
  </>;
}
