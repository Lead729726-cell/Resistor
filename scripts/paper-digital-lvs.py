"""Native transistor LVS between routed controller GDS and powered gate netlist.

Reference standard-cell SPICE is fetched unmodified from the pinned public PDK.
Yosys supplies named-pin to positional-SPICE translation; no guessed pin order.
"""
import argparse, hashlib, json, os, re, shutil, subprocess, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
OUT = WORK / 'digital-lvs'
PDK = Path.home() / '.local/share/resistor/pdks/sky130A'
COMMIT = 'ac7fb61f06e6470b94e8afdf7c25268f62fbd7b1'


def lvs_matched(log):
    if 'Final result:' not in log:
        return False
    final = log.rsplit('Final result:', 1)[1].strip()
    return re.fullmatch(r'Circuits match uniquely\.(?:\s+\.)?', final) is not None


def narrow_device_view(source, technology):
    """Apply only the installed extraction deck's explicit width classifier.

    No class alias/equate, tolerance waiver, geometry or terminal modification.
    The unmodified upstream SPICE remains beside this reproducible LVS view.
    """
    marker = 'device msubcircuit sky130_fd_pr__special_nfet_01v8 scnfet'
    if marker not in technology or 'w<0.42' not in technology.split(marker, 1)[1][:180]:
        raise ValueError('Installed public technology does not specify the narrow-device rule')
    lines, changes = [], []
    for line in source.splitlines():
        fields = line.split()
        if fields and fields[0].startswith('X') and 'sky130_fd_pr__nfet_01v8' in fields:
            width = next((p[2:] for p in fields if p.startswith('w=')), None)
            if width is None:
                raise ValueError('Native reference transistor width missing')
            match = re.fullmatch(r'([+\-0-9.eE]+)(u?)', width)
            if not match:
                raise ValueError('Unsupported native reference width unit')
            value = float(match[1]) * (1e-6 if match[2] else 1.)
            if value < .42:
                line = line.replace('sky130_fd_pr__nfet_01v8', 'sky130_fd_pr__special_nfet_01v8')
                changes.append({'instance': fields[0], 'width_um': value, 'from': 'nfet_01v8', 'to': 'special_nfet_01v8'})
        lines.append(line)
    return '\n'.join(lines) + '\n', changes


def command(args, logfile, environment=None):
    with (OUT / logfile).open('w') as log:
        subprocess.run(args, cwd=OUT, env=environment, stdout=log,
                       stderr=subprocess.STDOUT, check=True, timeout=300)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--compare-existing', action='store_true', help='Recompare only hash-matched, already extracted inputs')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.compare_existing:
        result = json.loads((OUT / 'report.json').read_text())
        for key, path in [('gds_sha256', WORK / 'pnr/sar12_controller.gds'),
                          ('reference_sha256', OUT / 'reference.spice'), ('layout_sha256', OUT / 'layout.spice')]:
            if result.get(key) != hashlib.sha256(path.read_bytes()).hexdigest():
                raise ValueError('Cannot reuse changed LVS input: ' + key)
        command([str(Path.home() / '.local/share/resistor/tools/bin/netgen'), '-batch', 'lvs',
                 'layout.spice sar12_controller', 'reference.spice sar12_controller',
                 str(PDK / 'libs.tech/netgen/sky130A_setup.tcl'), 'comparison.log', '-json'], 'netgen.log')
        result['analysis_result'] = 'pass' if lvs_matched((OUT / 'comparison.log').read_text()) else 'fail'
        (OUT / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps({'execution': 'completed', 'analysis_result': result['analysis_result'], 'source_hashes_checked': True}))
        return
    snapshot = OUT / 'input.gds'
    shutil.copy2(WORK / 'pnr/sar12_controller.gds', snapshot)
    gds_sha = hashlib.sha256(snapshot.read_bytes()).hexdigest()
    export = OUT / 'export.tcl'
    export.write_text(f'''read_db {{{WORK / 'pnr/routed.odb'}}}
write_verilog -include_pwr_gnd -remove_cells {{sky130_fd_sc_hd__tapvpwrvgnd_1 sky130_fd_sc_hd__fill_1 sky130_fd_sc_hd__fill_2 sky130_fd_sc_hd__fill_4 sky130_fd_sc_hd__fill_8}} {{{OUT / 'powered.v'}}}
exit
''')
    command(['openroad', '-no_init', '-exit', str(export)], 'export.log')
    text = (OUT / 'powered.v').read_text()
    names = sorted(set(re.findall(r'\bsky130_fd_sc_hd__(\w+)\s+\\?[^\s(]+\s*\(', text)))
    library, stubs, receipts = [], [], []
    for name in names:
        family = name.rsplit('_', 1)[0]
        url = f'https://raw.githubusercontent.com/google/skywater-pdk-libs-sky130_fd_sc_hd/{COMMIT}/cells/{family}/sky130_fd_sc_hd__{name}.spice'
        with urllib.request.urlopen(url, timeout=90) as response:
            content = response.read()
        (OUT / (name + '.spice')).write_bytes(content)
        source = content.decode()
        header = re.search(r'^\.subckt\s+(\S+)\s+([^\n]+)', source, re.M | re.I)
        if not header or header[1] != 'sky130_fd_sc_hd__' + name:
            raise ValueError('Missing native cell port ordering')
        pins = header[2].split()
        stubs.append('(* blackbox *) module ' + header[1] + '(' + ','.join(pins) + ');\ninout ' + ','.join(pins) + ';\nendmodule\n')
        library.append(source)
        receipts.append({'url': url, 'sha256': hashlib.sha256(content).hexdigest()})
    (OUT / 'cells.v').write_text('\n'.join(stubs))
    ys = OUT / 'reference.ys'
    ys.write_text(f'read_verilog -lib {OUT / "cells.v"}\nread_verilog {OUT / "powered.v"}\nhierarchy -check -top sar12_controller\nsetattr -mod -unset top\nwrite_spice -pos VPWR -neg VGND {OUT / "top.spice"}\n')
    command(['yosys', '-s', str(ys)], 'reference.log')
    top = (OUT / 'top.spice').read_text()
    # Yosys SPICE uses bus.bit, whereas DEF/GDS uses bus[bit]. Only the two
    # real RTL buses are normalized by their explicit bit index; connectivity
    # and cell/terminal ordering remain entirely native.
    for bus in ('code', 'trial'):
        for bit in range(12):
            top = re.sub(r'(?<![\w.])' + bus + r'\.' + str(bit) + r'(?![\w.])', bus + '[' + str(bit) + ']', top)
    raw_reference = '\n'.join(library) + '\n' + top
    (OUT / 'raw-reference.spice').write_text(raw_reference)
    technology = (PDK / 'libs.tech/magic/sky130A.tech').read_text()
    reference, changes = narrow_device_view(raw_reference, technology)
    (OUT / 'reference.spice').write_text(reference)
    (OUT / 'narrow-device-classification.json').write_text(json.dumps(changes, indent=2) + '\n')
    script = OUT / 'extract.tcl'
    script.write_text(f'''crashbackups stop
gds read {{{snapshot}}}
load sar12_controller
select top cell
port makeall
extract all
ext2spice lvs
ext2spice scale off
ext2spice format ngspice
ext2spice subcircuit on
ext2spice subcircuit top on
ext2spice hierarchy on
ext2spice -o {{{OUT / 'layout.spice'}}}
puts LVS_EXTRACTION_COMPLETE
quit -noprompt
''')
    command([str(Path.home() / '.local/share/resistor/tools/bin/magic'), '-dnull', '-noconsole', '-rcfile',
             str(PDK / 'libs.tech/magic/sky130A.magicrc'), str(script)], 'magic.log',
            {**os.environ, 'PDK_ROOT': str(PDK.parent)})
    command([str(Path.home() / '.local/share/resistor/tools/bin/netgen'), '-batch', 'lvs',
             'layout.spice sar12_controller', 'reference.spice sar12_controller',
             str(PDK / 'libs.tech/netgen/sky130A_setup.tcl'), 'comparison.log', '-json'], 'netgen.log')
    log = (OUT / 'comparison.log').read_text()
    matched = lvs_matched(log)
    result = {'edition': 'Resistor Indust', 'execution': 'completed',
              'analysis_result': 'pass' if matched else 'fail',
              'gds_sha256': gds_sha,
              'reference_sha256': hashlib.sha256((OUT / 'reference.spice').read_bytes()).hexdigest(),
              'narrow_device_classification': changes,
              'layout_sha256': hashlib.sha256((OUT / 'layout.spice').read_bytes()).hexdigest(),
              'native_cell_references': receipts, 'manufacturing_signoff': False,
              'scope': 'Native Magic/Netgen with public SKY130 setup. Raw upstream cell SPICE retained; reference-view nfets narrower than 0.42um classified exactly as the installed public Magic technology. No equate/ignore waiver. Not foundry signoff.'}
    (OUT / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'native_cell_references'}))


if __name__ == '__main__':
    main()
