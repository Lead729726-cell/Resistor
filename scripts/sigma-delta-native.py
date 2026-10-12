"""Offline native-engine verification; never imports the worker database server."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'workers/eda'))
import sigma_delta as A
import design_tools as T

parser = argparse.ArgumentParser()
parser.add_argument('--input', type=float, default=.9)
parser.add_argument('--amplitude', type=float, default=0)
parser.add_argument('--frames', type=int, default=8)
parser.add_argument('--frequency', type=float, default=61.03515625)
parser.add_argument('--output', default='.runtime/sigma-delta8/native-midscale')
parser.add_argument('--reuse-analog', action='store_true', help='Reuse only an existing byte-identical testbench and successful raw ngspice data')
args = parser.parse_args()
folder = ROOT / args.output
folder.mkdir(parents=True, exist_ok=True)
run = {'artifacts': {}}
manifest = {'commands': [], 'settings': {}}
previous_tb=(folder/'testbench.spice').read_bytes() if args.reuse_analog and (folder/'testbench.spice').is_file() else None
def process(run, folder, cmd, name, manifest, timeout=120):
    manifest['commands'].append({'argv': cmd, 'timeout_s': timeout})
    if name=='ngspice' and args.reuse_analog:
        if previous_tb!=(folder/'testbench.spice').read_bytes() or not (folder/'waveform.dat').is_file():
            raise RuntimeError('Cannot reuse a changed testbench or missing analog data')
        log=(folder/'ngspice.log').read_text()
        if 'ngspice-45.2 done' not in log:raise RuntimeError('Prior analog execution did not finish')
        manifest['commands'][-1].update(reused_prior_execution=True,returncode=0)
        return log
    result = subprocess.run(cmd, cwd=folder, capture_output=True, text=True, timeout=timeout,env={**os.environ,'OMP_NUM_THREADS':'1','NGSPICE_NUM_THREADS':'1'})
    log = result.stdout + result.stderr
    (folder / (name+'.log')).write_text(log)
    manifest['commands'][-1]['returncode'] = result.returncode
    if result.returncode:
        raise RuntimeError(name + ': ' + log[-2500:])
    return log
p = {'schematic': A.schematic('sigma_delta8'), 'design_template': {'id': 'sigma_delta8', 'parameters': A.parameters('sigma_delta8', {'input_V': args.input, 'sine_amplitude_V': args.amplitude, 'sine_frequency_Hz': args.frequency})}, 'testbench': A.settings({**A.DEFAULT_SETTINGS, 'duration_s': (12+args.frames*256)*1e-6})}
started = time.monotonic()
A.execute(SimpleNamespace(process=process, design_tools=T), run, p, folder, manifest, {})
run['elapsed_s'] = time.monotonic() - started
(folder/'run.json').write_text(json.dumps(run, indent=2)+'\n')
(folder/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps({k: v for k,v in run.items() if k not in ('waveforms','artifacts','current_flow')}, indent=2))
