"""Recheck 4096 codes on actual mapped and hold-repaired controller gates."""
import ast, hashlib, json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
OUT = WORK / 'controller'


def run(command, name):
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=120)
    text = result.stdout + result.stderr
    (OUT / name).write_text(text)
    if result.returncode:
        raise RuntimeError(text[-2000:])
    return text


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # Extract the existing independent oracle without executing its script.
    tree = ast.parse((ROOT / 'scripts/sar12-controller-qa.py').read_text())
    tb = next(node.value.value for node in tree.body if isinstance(node, ast.Assign)
              and any(isinstance(t, ast.Name) and t.id == 'tb' for t in node.targets))
    pins = ['clk', 'reset', 'start', 'comparator', 'sample', 'eval', 'busy', 'valid', 'trial', 'code']
    tb = tb.replace('sar12_controller dut(' + ','.join(pins) + ');',
                    'sar12_controller dut(' + ','.join('.' + p + '(' + p + ')' for p in pins) + ');')
    (OUT / 'qa.v').write_text(tb + '\n')
    models = OUT / 'functional-cells.v'
    ys = OUT / 'models.ys'
    ys.write_text(f'read_liberty -ignore_miss_func -ignore_miss_dir {WORK / "lib/sky130_fd_sc_hd__tt_required.lib"}\nwrite_verilog -noattr {models}\n')
    run(['yosys', '-s', str(ys)], 'models.log')
    reports = []
    for key, netlist in [('mapped', WORK / 'timing/sar12_mapped.v'), ('routed', WORK / 'pnr/routed-signal.v')]:
        target = OUT / (key + '.vvp')
        run(['iverilog', '-g2012', '-s', 'qa', '-o', str(target), str(models), str(netlist), str(OUT / 'qa.v')], key + '-compile.log')
        text = run(['vvp', str(target)], key + '.log')
        if 'SAR12_LOGIC_COMPLETE 159751' not in text:
            raise RuntimeError('Exhaustive native digital assertions did not complete')
        reports.append({'implementation': key, 'codes': 4096, 'assertions': 159751,
                        'result': 'pass', 'netlist_sha256': hashlib.sha256(netlist.read_bytes()).hexdigest()})
    target = OUT / 'fault.vvp'
    run(['iverilog', '-g2012', '-DFAULT_X_COMPARE', '-s', 'qa', '-o', str(target), str(models), str(WORK / 'pnr/routed-signal.v'), str(OUT / 'qa.v')], 'fault-compile.log')
    fault = subprocess.run(['vvp', str(target)], cwd=ROOT, capture_output=True, text=True, timeout=120)
    (OUT / 'fault.log').write_text(fault.stdout + fault.stderr)
    if fault.returncode == 0 or 'SAR12 logic assertion' not in fault.stdout:
        raise RuntimeError('Unknown comparator negative control was not rejected')
    result = {'edition': 'Resistor Indust', 'reports': reports, 'unknown_comparator_rejected': True,
              'scope': 'Functional Liberty models and actual gate connectivity. Not analog conversions or delay-annotated digital/analog co-simulation.',
              'manufacturing_signoff': False}
    (OUT / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
