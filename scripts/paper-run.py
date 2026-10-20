"""Serialized native digital verification; optional analog diagnostic sweeps."""
import argparse, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--analog-pex-run', help='Current owned SAR12 native PEX run id for same-GDS matrix audit')
    parser.add_argument('--include-comparator', action='store_true', help='Run 702 actual MOS transients; several minutes')
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    stages = []
    def execute(name, argv):
        print(name, flush=True)
        path = WORK / (name + '-workflow.log')
        with path.open('w') as log:
            result = subprocess.run(argv, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=1800)
        stages.append({'stage': name, 'execution': 'completed' if result.returncode == 0 else 'failed', 'returncode': result.returncode})
        (WORK / 'workflow.json').write_text(json.dumps({'edition': 'Resistor Indust', 'stages': stages,
            'scope': 'Execution state only. Read native per-analysis results; completion does not mean PASS or manufacturing signoff.'}, indent=2) + '\n')
        if result.returncode:
            raise RuntimeError('Native stage failed: ' + str(path))
    def python(name):
        return [sys.executable, str(ROOT / 'scripts' / (name + '.py'))]
    execute('paper-provision', python('paper-provision'))
    execute('paper-prepare', python('paper-prepare') + ['--mapped-only'])
    execute('paper-digital-pnr', ['openroad', '-no_init', '-exit', '-threads', '4', str(ROOT / 'scripts/paper-digital-pnr.tcl')])
    # The package expects the exact native router log, not a synthetic status.
    (WORK / 'pnr.log').write_bytes((WORK / 'paper-digital-pnr-workflow.log').read_bytes())
    for name in ['paper-sta', 'paper-export-gds', 'paper-mask-drc', 'paper-controller-qa', 'paper-digital-lvs', 'paper-lvs-negative', 'paper-tool-preflight']:
        execute(name, python(name))
    if args.analog_pex_run:
        execute('paper-coupling-qa', python('paper-coupling-qa') + ['--run', args.analog_pex_run])
    if args.include_comparator:
        execute('paper-comparator-qa', python('paper-comparator-qa'))


if __name__ == '__main__':
    main()
