"""Evidence I/O failures must not leave an engine job running or certified PASS."""
import sys
from pathlib import Path


def write_job_evidence(run, manifest, folder, dump, sha):
    folder = Path(folder)
    temporary = folder/'manifest.json.tmp'
    try:
        manifest.update(ended_at=run.get('ended_at'), elapsed_s=run.get('elapsed_s'),
                        execution_status=run['execution_status'], analysis_result=run['analysis_result'],
                        artifacts={str(f): sha(f) for f in folder.iterdir()
                                   if f.is_file() and f.name not in {'manifest.json', temporary.name}})
        dump(temporary, manifest)
        temporary.replace(folder/'manifest.json')
        return True
    except Exception as error:
        detail = 'Evidence could not be saved: '+str(error)
        if run['execution_status'] != 'canceled':run['execution_status'] = 'failed'
        run['analysis_result'] = 'unknown'
        run['message'] = (run.get('message', '')+'; '+detail).lstrip('; ')
        manifest.update(execution_status=run['execution_status'], analysis_result='unknown',
                        evidence_error={'code': 'EVIDENCE_WRITE_FAILED', 'message': str(error)})
        try:temporary.unlink(missing_ok=True)
        except OSError:pass
        print(detail, file=sys.stderr, flush=True)
        return False
