"""Actual Netgen negative control: change one reference MOS width by 20%."""
import hashlib, importlib.util, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
OUT = WORK / 'digital-lvs'
spec = importlib.util.spec_from_file_location('digital_lvs', ROOT / 'scripts/paper-digital-lvs.py')
L = importlib.util.module_from_spec(spec)
spec.loader.exec_module(L)


def main():
    source = (OUT / 'reference.spice').read_text()
    match = re.search(r'\bw=([+\-0-9.eE]+)u\b', source)
    if not match:
        raise ValueError('No native geometry property to perturb')
    value = float(match[1]) * 1.2
    changed = source[:match.start(1)] + format(value, '.17g') + source[match.end(1):]
    (OUT / 'fault-width.spice').write_text(changed)
    L.command([str(Path.home() / '.local/share/resistor/tools/bin/netgen'), '-batch', 'lvs',
               'layout.spice sar12_controller', 'fault-width.spice sar12_controller',
               str(L.PDK / 'libs.tech/netgen/sky130A_setup.tcl'), 'fault-width.log', '-json'], 'fault-netgen.log')
    log = (OUT / 'fault-width.log').read_text()
    if L.lvs_matched(log) or 'property errors' not in log.lower():
        raise RuntimeError('Native LVS failed to reject the changed MOS width')
    result = {'edition': 'Resistor Indust', 'width_factor': 1.2, 'native_result': 'rejected',
              'expected_negative_control': True, 'reference_sha256': hashlib.sha256(source.encode()).hexdigest(),
              'fault_sha256': hashlib.sha256(changed.encode()).hexdigest(),
              'scope': 'Only a negative control; never used as the design reference.'}
    (OUT / 'fault-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
