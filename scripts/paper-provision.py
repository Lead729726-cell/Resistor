"""Prepare pinned, public reference inputs; does not install commercial tools.

Requires an existing native SKY130 engine/toolchain and optional QA Python deps.
Downloads only official source data, never executes downloaded shell scripts.
"""
import hashlib, json, re, subprocess
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
spec = importlib.util.spec_from_file_location('paper_prepare', ROOT / 'scripts/paper-prepare.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
FORMATTER = '7198cf647113f56041e02abf3eb623692820c5e1'


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    receipts = []
    base = f'https://raw.githubusercontent.com/The-OpenROAD-Project/OpenROAD-flow-scripts/{prepare.ORFS}/flow/platforms'
    sources = [(f'sky130hd/lef/{name}', 'lef/' + name) for name in ['sky130_fd_sc_hd.tlef', 'sky130_fd_sc_hd_merged.lef', 'sky130io_fill.lef']]
    sources += [('sky130hd/lib/sky130_fd_sc_hd__tt_025C_1v80.lib', 'lib/sky130_fd_sc_hd__tt_025C_1v80.lib'),
                ('sky130hd/make_tracks.tcl', 'make_tracks.tcl'), ('sky130hd/setRC.tcl', 'setRC.tcl'),
                ('sky130hs/rcx_patterns.rules', 'rcx_patterns.rules')]
    for path, dest in sources:
        receipts.append(prepare.fetch(base + '/' + path, WORK / dest))
    compiler = f'https://raw.githubusercontent.com/google/skywater-pdk/{FORMATTER}/scripts/python-skywater-pdk/skywater_pdk'
    for name in ('liberty.py', 'sizes.py', 'utils.py'):
        receipts.append(prepare.fetch(compiler + '/' + name, WORK / 'skywater_pdk' / name))
    (WORK / 'skywater_pdk/__init__.py').write_text('# Standalone formatter adapter; upstream modules are unmodified.\n')
    # Original TT characterization is preserved. Mark only the documented
    # multi-power/probe cell families unavailable to the single-supply mapper.
    native = (WORK / 'lib/sky130_fd_sc_hd__tt_025C_1v80.lib').read_text()
    derived, excluded = re.subn(r'(cell\s*\(\s*"?sky130_fd_sc_hd__(?:lpflow\w*|probe\w*)"?\s*\)\s*\{)',
                               r'\1\n    dont_use : true;', native)
    (WORK / 'lib/sky130_hd_mapping.lib').write_text(derived)
    timing = WORK / 'timing'
    timing.mkdir(exist_ok=True)
    ys = timing / 'synthesize.ys'
    ys.write_text(f'''read_liberty -lib {WORK / 'lib/sky130_hd_mapping.lib'}
read_verilog {ROOT / 'workers/eda/rtl/sar12.v'}
hierarchy -check -top sar12_controller
synth -top sar12_controller
dfflibmap -liberty {WORK / 'lib/sky130_hd_mapping.lib'}
abc -liberty {WORK / 'lib/sky130_hd_mapping.lib'}
clean
check -assert
stat -liberty {WORK / 'lib/sky130_hd_mapping.lib'}
write_verilog -noattr -noexpr -nodec {timing / 'sar12_mapped.v'}
write_json {timing / 'sar12_mapped.json'}
''')
    with (timing / 'synthesis.log').open('w') as log:
        subprocess.run(['yosys', '-s', str(ys)], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                       timeout=180, check=True)
    report = {'edition': 'Resistor Indust', 'openroad_flow_commit': prepare.ORFS,
              'formatter_commit': FORMATTER, 'downloads': receipts, 'excluded_single_supply_cells': excluded,
              'mapping_lib_sha256': hashlib.sha256(derived.encode()).hexdigest(),
              'rtl_sha256': hashlib.sha256((ROOT / 'workers/eda/rtl/sar12.v').read_bytes()).hexdigest()}
    (WORK / 'provision-receipt.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'input_files': len(receipts), 'excluded_single_supply_cells': excluded}))


if __name__ == '__main__':
    main()
