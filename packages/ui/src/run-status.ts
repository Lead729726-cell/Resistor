import type { Run } from '@mos/contracts';

type State = Pick<Run, 'execution_status' | 'analysis_result' | 'workflow' | 'native_execution'>;
const executions: Record<string, string> = { queued: '대기', running: '실행 중', completed: '완료', failed: '실행 실패', canceled: '취소' };
const results: Record<string, string> = { pass: 'PASS', fail: 'FAIL', unsupported: '미지원', unknown: '미판정' };

/** A result can certify completion only when the engine actually completed. */
export function describeRun(run?: State, analysisOnly = false) {
  if (!run) return { label: '미실행', tone: 'neutral' };
  if (run.execution_status !== 'completed') {
    if (analysisOnly) return { label: '미판정', tone: 'neutral' };
    return { label: executions[run.execution_status] || '상태 미확인', tone: ['queued', 'running'].includes(run.execution_status) ? 'running' : run.execution_status === 'failed' ? 'failed' : 'neutral' };
  }
  if (run.workflow === 'imported-results') return { label: '반입 완료', tone: 'neutral' };
  if (run.native_execution === false) return { label: '엔진 미실행', tone: 'neutral' };
  return { label: results[run.analysis_result] || '미판정', tone: run.analysis_result === 'unknown' ? 'neutral' : run.analysis_result };
}
