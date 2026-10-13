"""Reproduce the bounded CMOS hierarchy from real Yosys synthesis (inside EDA worker)."""
import collections
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'workers/eda'))
import chip_references as C
import digital_units as D
import native

RTL = ROOT / 'workers/eda/rtl/sar8.v'
OUT = ROOT / 'workers/eda/rtl'
TMP = ROOT / '.runtime/sar8/synthesis'
TMP.mkdir(parents=True, exist_ok=True)
command = f'read_verilog {RTL}; hierarchy -top sar8_controller; proc; opt; memory; opt; techmap; opt; dffunmap; abc -g simple; opt_clean; stat; write_json {TMP}/yosys.json; write_verilog -noattr {OUT}/sar8_gate.v'
result = subprocess.run(['yosys', '-p', command], check=True, capture_output=True, text=True)
(TMP / 'yosys.log').write_text(result.stdout)
data = json.loads((TMP / 'yosys.json').read_text())
library = D.make_library(1)
nor = C.cell(['A', 'B', 'Y', 'VPWR', 'VGND'])
C.mos(nor, 'P0', 'pmos', 'P', 'A', 'VPWR', .65, .15)
C.mos(nor, 'P1', 'pmos', 'Y', 'B', 'P', .65, .15)
C.mos(nor, 'N0', 'nmos', 'Y', 'A', 'VGND', .65, .15)
C.mos(nor, 'N1', 'nmos', 'Y', 'B', 'VGND', .65, .15)
library['NOR2'] = nor
or_cell = C.cell(nor['ports'])
C.block(or_cell, 'NOR', 'NOR2', nor['ports'], {'Y': 'N'})
C.block(or_cell, 'INV', 'INV', library['INV']['ports'], {'A': 'N', 'Y': 'Y'})
library['OR2'] = or_cell
dffn = C.cell(['D', 'CLK', 'Q', 'VPWR', 'VGND'])
C.block(dffn, 'CLOCK', 'INV', library['INV']['ports'], {'A': 'CLK', 'Y': 'CLKB'})
C.block(dffn, 'LATCH', 'DFF', library['DFF']['ports'], {'CLK': 'CLKB'})
library['DFF_N'] = dffn
mapping = {'$_NOT_': 'INV', '$_AND_': 'AND2', '$_OR_': 'OR2', '$_XOR_': 'XOR2', '$_MUX_': 'MUX2', '$_DFF_P_': 'DFF'}
counts = collections.Counter()
aliases = []

def port_names(name, bits):
    return [name.upper() + (str(i) if len(bits) > 1 else '') for i in range(len(bits))]

for name, module in data['modules'].items():
    ports = [p for key, value in module['ports'].items() for p in port_names(key, value['bits'])] + ['VPWR', 'VGND']
    ir = C.cell(ports)
    nets = {'0': 'VGND', '1': 'VPWR'}
    # Prefer input names. Aliased output ports get real noninverting CMOS buffers.
    for direction in ('input', 'output'):
        for key, value in module['ports'].items():
            if value['direction'] != direction:
                continue
            for pin, bit in zip(port_names(key, value['bits']), value['bits']):
                previous = nets.setdefault(bit, pin)
                if previous != pin:
                    if direction != 'output':
                        raise ValueError('Aliased input ports need an explicit adapter')
                    n = len(aliases)
                    C.block(ir, f'ALIAS_N{n}', 'INV', library['INV']['ports'], {'A': previous, 'Y': f'ALIAS{n}'})
                    C.block(ir, f'ALIAS_P{n}', 'INV', library['INV']['ports'], {'A': f'ALIAS{n}', 'Y': pin})
                    aliases.append({'module': name, 'from': previous, 'to': pin, 'implementation': 'two CMOS inverters'})
    def net(bit):
        if bit == 'x' or bit == 'z':
            raise ValueError('Undefined constants cannot enter the CMOS hierarchy')
        return nets.get(bit, 'N' + str(bit))
    for i, (_, gate) in enumerate(sorted(module['cells'].items())):
        typ = gate['type']
        if typ == '$scopeinfo':
            continue
        counts[typ] += 1
        target = mapping.get(typ, typ.upper())
        pins = {}
        for key, bits in gate['connections'].items():
            keys = port_names(key, bits) if typ not in mapping else [({'C': 'CLK'}.get(key, key))]
            for pin, bit in zip(keys, bits):
                pins[pin] = net(bit)
        if typ == '$_AND_':
            # AND2 uses named A/B ports; do not rely on Yosys positional ordering.
            pass
        C.block(ir, f'G{i}', target, (library[target]['ports'] if target in library else [p for key, v in data['modules'][typ]['ports'].items() for p in port_names(key, v['bits'])] + ['VPWR', 'VGND']), pins)
    library[name.upper()] = ir

root = library.pop('SAR8_CONTROLLER')
root['cells'] = library
validation = native.validate(root)
if not validation['valid']:
    raise ValueError(validation['issues'])
payload = {'schema_version': 1, 'rtl_sha256': hashlib.sha256(RTL.read_bytes()).hexdigest(), 'gate_rtl_sha256':hashlib.sha256((OUT/'sar8_gate.v').read_bytes()).hexdigest(), 'synthesizer': data['creator'], 'gate_counts': dict(counts), 'port_alias_buffers': aliases, 'schematic': root}
(OUT / 'sar8_cmos.json').write_text(json.dumps(payload, indent=2) + '\n')
print(json.dumps({k: v for k, v in payload.items() if k != 'schematic'}))
