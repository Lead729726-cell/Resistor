import type { Run } from '@mos/contracts';
import { describeRun, freshnessExplanation } from './run-status';

export default function RunStatus({ run, revision, analysisOnly = false }: { run?: Run; revision?: number; analysisOnly?: boolean }) {
  const state = describeRun(run, analysisOnly);
  const freshness = freshnessExplanation(run, revision);
  return <>
    <span data-execution={run?.execution_status || 'not-run'} data-result={run?.analysis_result || 'unknown'} className={`status ${state.tone}`}>{state.label}</span>
    {run?.workflow === 'imported-results' && <span className="status neutral">외부 파일 수치 · 실행 없음</span>}
    {run && freshness && <span className="status stale" title={freshness} aria-label={freshness}>STALE · r{run.revision}</span>}
  </>;
}
