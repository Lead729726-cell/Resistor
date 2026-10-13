import runtime_resources
"""Editable SKY130 first-order ADC hierarchy and measured SPICE/RTL co-simulation.

Eight output bits are an interface specification, not a claim of eight ENOB.
The digital circuit is real Yosys-synthesized CMOS IR, not an empty black box.
"""
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil
import bisect
import chip_references as C
import digital_units as D
import native
from geometry import EDAError

HERE = Path(__file__).parent
RTL = HERE / 'rtl/sigma_delta8.v'
GATE_RTL = HERE / 'rtl/sigma_delta8_gate.v'
CMOS = HERE / 'rtl/sigma_delta8_cmos.json'
SUPPLY = ['VPWR', 'VGND']
PERIOD = 1e-6
R = 256

def used(ir, library):
    result = copy.deepcopy(ir)
    selected = {}
    def visit(cell):
        for device in cell['devices']:
            if device['kind'] == 'block' and device['cell_name'] not in selected:
                name = device['cell_name']
                selected[name] = copy.deepcopy(library[name])
                visit(library[name])
    visit(ir)
    result['cells'] = selected
    return result

def analog_library():
    lib = D.make_library(1)
    lib['SDM8_OTA_FIRST'] = C.ota(10)
    ota = C.cell(['INP', 'INN', 'BIAS', 'OUT'] + SUPPLY)
    C.block(ota, 'FIRST', 'SDM8_OTA_FIRST', lib['SDM8_OTA_FIRST']['ports'], {'OUT': 'PRE'})
    C.mos(ota, 'P_SECOND', 'pmos', 'OUT', 'PRE', 'VPWR', 20, 1)
    C.mos(ota, 'N_SECOND', 'nmos', 'OUT', 'BIAS', 'VGND', 10, 1)
    C.passive(ota, 'C_MILLER', 'capacitor', 'PRE', 'COMP', .5e-12)
    C.passive(ota, 'R_ZERO', 'resistor', 'COMP', 'OUT', 1000)
    lib['SDM8_OTA'] = ota
    comp = C.schematic('chip_comparator', {'input_width_um': 10})
    lib['PREAMP'] = comp.pop('cells')['PREAMP']
    lib['SDM8_COMPARATOR'] = comp
    ref = C.cell(['VCM'] + SUPPLY)
    C.passive(ref, 'R_TOP', 'resistor', 'VPWR', 'VCM', 100000)
    C.passive(ref, 'R_BOTTOM', 'resistor', 'VCM', 'VGND', 100000)
    C.passive(ref, 'C_DECAP', 'capacitor', 'VCM', 'VGND', 20e-12)
    lib['SDM8_REFERENCE'] = ref
    bias = C.cell(['BIAS'] + SUPPLY)
    C.passive(bias, 'R_BIAS', 'resistor', 'VPWR', 'BIAS', 200000)
    C.mos(bias, 'N_DIODE', 'nmos', 'BIAS', 'BIAS', 'VGND', 2, 1)
    lib['SDM8_BIAS'] = bias
    front = C.cell(['VIN', 'OUT'] + SUPPLY)
    C.passive(front, 'R_AA', 'resistor', 'VIN', 'OUT', 10000)
    C.passive(front, 'C_AA', 'capacitor', 'OUT', 'VGND', 100e-12)
    lib['SDM8_INPUT_FILTER'] = front
    reset = C.cell(['RESET', 'RESETB', 'VCM', 'SUM', 'OUT'] + SUPPLY)
    for i, node in enumerate(['SUM', 'OUT']):
        C.mos(reset, f'N_RESET{i}', 'nmos', node, 'RESET', 'VCM', 2, .15)
        C.mos(reset, f'P_RESET{i}', 'pmos', node, 'RESETB', 'VCM', 4, .15)
    lib['SDM8_RESET_SWITCH'] = reset
    integrator = C.cell(['VIN', 'DACB', 'VCM', 'BIAS', 'OUT', 'RESET', 'RESETB'] + SUPPLY)
    C.block(integrator, 'AMP', 'SDM8_OTA', ota['ports'], {'INP': 'VCM', 'INN': 'SUM'})
    C.passive(integrator, 'R_INPUT', 'resistor', 'VIN', 'SUM', 500000)
    C.passive(integrator, 'R_FEEDBACK', 'resistor', 'DACB', 'SUM', 500000)
    C.passive(integrator, 'C_INT', 'capacitor', 'OUT', 'SUM', 4e-12)
    C.block(integrator, 'RESET_SWITCH', 'SDM8_RESET_SWITCH', reset['ports'], {})
    lib['SDM8_INTEGRATOR'] = integrator
    latch = C.cell(['D', 'CLK', 'RESET', 'Q'] + SUPPLY)
    C.block(latch, 'RESET_DATA', 'MUX2', lib['MUX2']['ports'], {'A': 'D', 'B': 'VGND', 'S': 'RESET', 'Y': 'DATA'})
    C.block(latch, 'SAMPLE', 'DFF', lib['DFF']['ports'], {'D': 'DATA'})
    lib['SDM8_SAMPLE_LATCH'] = latch
    dac = C.cell(['BITSTREAM', 'DACB'] + SUPPLY)
    C.block(dac, 'NRZ', 'INV', lib['INV']['ports'], {'A': 'BITSTREAM', 'Y': 'DACB'})
    lib['SDM8_DAC'] = dac
    clock = C.cell(['CLK', 'CLK_OUT'] + SUPPLY)
    C.block(clock, 'FIRST', 'INV', lib['INV']['ports'], {'A': 'CLK', 'Y': 'CLKB'})
    C.block(clock, 'SECOND', 'INV', lib['INV']['ports'], {'A': 'CLKB', 'Y': 'CLK_OUT'})
    lib['SDM8_CLOCK_BUFFER'] = clock
    mod = C.cell(['VIN', 'CLK', 'RESET', 'BITSTREAM', 'VCM', 'BIAS', 'INT_OUT'] + SUPPLY)
    for instance, target, mapping in [
        ('INPUT', 'SDM8_INPUT_FILTER', {'OUT': 'FILTERED'}),
        ('REFERENCE', 'SDM8_REFERENCE', {}), ('BIAS_SOURCE', 'SDM8_BIAS', {}),
        ('CLOCK', 'SDM8_CLOCK_BUFFER', {'CLK_OUT': 'SAMPLE_CLK'}),
        ('RESET_INV', 'INV', {'A': 'RESET', 'Y': 'RESETB'}),
        ('INTEGRATOR', 'SDM8_INTEGRATOR', {'VIN': 'FILTERED', 'OUT': 'INT_OUT'}),
        ('QUANTIZER', 'SDM8_COMPARATOR', {'INP': 'VCM', 'INN': 'INT_OUT', 'OUT': 'CMP'}),
        ('BIT_LATCH', 'SDM8_SAMPLE_LATCH', {'D': 'CMP', 'CLK': 'SAMPLE_CLK', 'Q': 'BITSTREAM'}),
        ('FEEDBACK_DAC', 'SDM8_DAC', {})]:
        C.block(mod, instance, target, lib[target]['ports'], mapping)
    lib['SDM8_MODULATOR'] = mod
    return lib

ANALOG_PARTS = {
    'sdm8_input_filter': ('SDM8_INPUT_FILTER', '입력 RC anti-alias 필터'),
    'sdm8_reference': ('SDM8_REFERENCE', 'VDD/2 기준전압 · 디커플링'),
    'sdm8_bias': ('SDM8_BIAS', '저항·다이오드 MOS 바이어스'),
    'sdm8_ota': ('SDM8_OTA', '7-MOS 2단 Miller OTA'),
    'sdm8_integrator': ('SDM8_INTEGRATOR', '합산 저항 · 피드백 적분기'),
    'sdm8_comparator': ('SDM8_COMPARATOR', '7-MOS 1비트 비교기'),
    'sdm8_sample_latch': ('SDM8_SAMPLE_LATCH', '샘플 DFF · reset MUX'),
    'sdm8_dac': ('SDM8_DAC', '1비트 NRZ 피드백 DAC'),
    'sdm8_clock_buffer': ('SDM8_CLOCK_BUFFER', '2단 클록 버퍼'),
    'sdm8_reset_switch': ('SDM8_RESET_SWITCH', '적분기 초기화 전송 게이트'),
    'sdm8_modulator': ('SDM8_MODULATOR', '1차 아날로그 시그마델타 모듈레이터'),
}
DIGITAL_PARTS = {
    'sdm8_reset_sync': ('SDM8_RESET_SYNC', '리셋 해제 2FF 동기화'),
    'sdm8_frame_counter': ('SDM8_FRAME_COUNTER', '256 샘플 프레임 카운터'),
    'sdm8_cic_integrators': ('SDM8_CIC_INTEGRATORS', '17비트 CIC 적분기 2단'),
    'sdm8_cic_combs': ('SDM8_CIC_COMBS', '17비트 CIC comb 2단'),
    'sdm8_scale_saturate': ('SDM8_SCALE_SATURATE', '8비트 스케일 · 포화 처리'),
    'sdm8_output_register': ('SDM8_OUTPUT_REGISTER', '8비트 출력 레지스터 · VALID'),
    'sdm8_filter': ('SIGMA_DELTA8_FILTER', 'CIC2 ×256 디지털 필터 전체'),
}

def digital_payload():
    value = json.loads(CMOS.read_text())
    if value['rtl_sha256'] != hashlib.sha256(RTL.read_bytes()).hexdigest():
        raise EDAError('STALE_SYNTHESIS', 'ADC RTL changed. Re-synthesize the committed CMOS hierarchy before use.')
    if value.get('gate_rtl_sha256') != hashlib.sha256(GATE_RTL.read_bytes()).hexdigest():
        raise EDAError('STALE_SYNTHESIS', 'Synthesized replay source differs from the committed CMOS synthesis.')
    return value

def schematic(kind, params=None):
    analog = analog_library()
    if kind in ANALOG_PARTS:
        return used(analog[ANALOG_PARTS[kind][0]], analog)
    digital = digital_payload()['schematic']
    if kind == 'sdm8_filter':
        return used(digital, digital['cells'])
    if kind in DIGITAL_PARTS:
        return used(digital['cells'][DIGITAL_PARTS[kind][0]], digital['cells'])
    if kind != 'sigma_delta8':
        raise EDAError('UNSUPPORTED_TEMPLATE', 'Unknown ADC block.')
    cells = {**analog, **digital['cells'], 'SIGMA_DELTA8_FILTER': {k: v for k, v in digital.items() if k != 'cells'}}
    ports = ['VIN', 'CLK', 'RESET', 'BITSTREAM', 'VCM', 'BIAS', 'INT_OUT', *[f'CODE{i}' for i in range(8)], 'VALID'] + SUPPLY
    root = C.cell(ports)
    C.block(root, 'MODULATOR', 'SDM8_MODULATOR', analog['SDM8_MODULATOR']['ports'], {})
    C.block(root, 'DECIMATOR', 'SIGMA_DELTA8_FILTER', digital['ports'], {'BIT_IN': 'BITSTREAM'})
    return used(root, cells)

CATALOG = {}
for key, (target, name) in {**ANALOG_PARTS, **DIGITAL_PARTS, 'sigma_delta8': ('SIGMA_DELTA8', '8비트 시그마델타 ADC · 전체 하위 블록')}.items():
    circuit = schematic(key)
    full = key in ('sigma_delta8', 'sdm8_modulator')
    CATALOG[key] = dict(name='ΣΔ · ' + name, ports=circuit['ports'], parameter_defaults={'input_V': .9, 'sine_amplitude_V': 0.0, 'sine_frequency_Hz': 61.03515625} if full else {}, analyses=['tran'], physical_status='not-generated', scope='1.8V SKY130 · 실제 CMOS 계층 · SPICE/RTL 혼합 검증' if full else '편집·재사용 가능한 실제 CMOS/RC 하위 블록', targets=['actual waveforms', 'block hierarchy'], physical_supported=False)

def parameters(kind, values):
    if kind in ('sigma_delta8', 'sdm8_modulator'):
        if not 0 <= values['input_V'] - values['sine_amplitude_V'] or values['input_V'] + values['sine_amplitude_V'] > 1.8 or not 0 <= values['sine_amplitude_V'] <= .8 or not 0 < values['sine_frequency_Hz'] <= 1953.125:
            raise EDAError('PARAMETER_RANGE', 'ADC stimulus must stay within 0..1.8V and output Nyquist frequency.')
    return values

def settings(raw):
    result = native.testbench(raw, duration_limit_s=.02)
    if result['analysis'] != 'tran' or not 1.5 <= result['supply_V'] <= 1.8 or result['step_s'] > PERIOD / 8 or not 16 * PERIOD <= result['duration_s'] <= .02:
        raise EDAError('ADC_TESTBENCH_RANGE', 'ADC requires transient, 1.5..1.8V, duration 16us..20ms, step <=125ns; maximum 200000 points.')
    return result

DEFAULT_SETTINGS = dict(analysis='tran', duration_s=(12 + 8 * R) * PERIOD, step_s=PERIOD / 8)

def electrical(ir):
    return [{'name': d['name'], 'kind': d['kind'], 'cell_name': d.get('cell_name'), 'pins': d['pins'], 'parameters': d['parameters'], 'model': d.get('model')} for d in ir['devices']]

def simulation_core(p):
    kind = p['design_template']['id']
    if kind == 'sigma_delta8':
        expected = schematic(kind)
        if electrical(p['schematic']) != electrical(expected):
            raise EDAError('ADC_COSIM_BINDING', 'Mixed simulation requires the declared top-level analog/digital connections. Changed root wiring must be re-bound explicitly.')
        # Never silently simulate old RTL when a user changes the gate hierarchy.
        digital_names = (set(digital_payload()['schematic']['cells']) | {'SIGMA_DELTA8_FILTER'}) & set(expected['cells'])
        for name in digital_names:
            if electrical(p['schematic']['cells'].get(name, {'devices': []})) != electrical(expected['cells'][name]):
                raise EDAError('ADC_RTL_MISMATCH', 'Digital CMOS edits require corresponding RTL changes and re-synthesis before co-simulation.')
        return used(p['schematic']['cells']['SDM8_MODULATOR'], p['schematic']['cells'])
    if kind == 'sdm8_modulator':
        return copy.deepcopy(p['schematic'])
    raise EDAError('ADC_BLOCK_SIMULATION', 'Use the integrated modulator/filter testbench for this standalone block. Its native CMOS schematic can be exported and reused.')

def testbench(p, folder, model_deck, core):
    v = p['design_template']['parameters']
    s = settings(p['testbench'])
    supply = s['supply_V']
    if v['input_V'] + v['sine_amplitude_V'] > supply:
        raise EDAError('STIMULUS_RANGE', 'Input exceeds the configured VDD reference.')
    stimulus = f'{v["input_V"]:.12g}' if not v['sine_amplitude_V'] else f'SIN({v["input_V"]:.12g} {v["sine_amplitude_V"]:.12g} {v["sine_frequency_Hz"]:.12g})'
    lines = ['SKY130 transistor sigma delta modulator; external clock and supply', '.options method=gear maxord=2 reltol=1e-4', f'.include "{model_deck}"', '.option scale=1e-6', f'.include "{core}"', f'.temp {s["temperature_C"]:.12g}', f'VDD VPWR 0 {supply:.12g}', 'VGND VGND 0 0', f'VIN VIN 0 {stimulus}', f'VCLK CLK 0 PULSE(0 {supply:.12g} 500n 10n 10n 480n 1u)', f'VRESET RESET 0 PWL(0 {supply:.12g} 7.99u {supply:.12g} 8u 0)', 'XU VIN CLK RESET BITSTREAM VCM BIAS INT_OUT VPWR VGND sdm8_analog', f'.ic v(VCM)={supply/2} v(BIAS)=.75 v(INT_OUT)={supply/2} v(xu.XINTEGRATOR.SUM)={supply/2} v(xu.XINTEGRATOR.XAMP.PRE)={supply/2}', '.control', 'set num_threads=1', 'set numdgt=12', 'set wr_vecnames', 'set wr_singlescale', f'tran {s["step_s"]:.12g} {s["duration_s"]:.12g} 0 {s["step_s"]:.12g} uic', 'linearize v(VIN) v(CLK) v(RESET) v(BITSTREAM) v(INT_OUT) v(VCM) v(BIAS) v(xu.XINTEGRATOR.SUM) i(VDD)', 'wrdata waveform.dat v(VIN) v(CLK) v(RESET) v(BITSTREAM) v(INT_OUT) v(VCM) v(BIAS) v(xu.XINTEGRATOR.SUM) i(VDD)', 'quit', '.endc', '.end']
    return '\n'.join(lines) + '\n'

def cic_reference(bits, resets):
    """Independent integer oracle: old reset synchronizer, modulo 2^17, NBA timing."""
    stages = [1, 1]
    phase = first = second = d1 = d2 = code = 0
    rows = []
    mask = (1 << 17) - 1
    for i, (bit, reset) in enumerate(zip(bits, resets)):
        active_reset = stages[1]
        stages = [1, 1] if reset else [0, stages[0]]
        valid = 0
        if active_reset:
            phase = first = second = d1 = d2 = code = 0
        else:
            first = (first + bit) & mask
            second = (second + first) & mask
            if phase == 255:
                diff = (second - d1) & mask
                filt = (diff - d2) & mask
                code = min(255, filt >> 8)
                d1, d2 = second, diff
                valid = 1
            phase = (phase + 1) & 255
        rows.append((i, code, valid))
    return rows

def replay_files(folder, bits, resets):
    folder = Path(folder)
    (folder / 'bits.mem').write_text(''.join(str(int(b)) + '\n' for b in bits))
    (folder / 'resets.mem').write_text(''.join(str(int(b)) + '\n' for b in resets))
    (folder / 'replay.v').write_text(f'''`timescale 1ns/1ps
module replay;
reg clk=0,reset=1,bit_in=0; wire [7:0] code; wire valid;
reg bits[0:{len(bits)-1}],resets[0:{len(bits)-1}]; integer i,fd;
sigma_delta8_filter dut(clk,reset,bit_in,code,valid);
initial begin
$readmemb("bits.mem",bits);$readmemb("resets.mem",resets);
fd=$fopen("replay.csv","w");
// Synchronous reset must propagate through the two-stage reset synchronizer.
// Warm-up edges are reset-only; no conversion/output word is counted here.
#5 clk=1;#5 clk=0;#5 clk=1;#5 clk=0;#1;
for(i=0;i<{len(bits)};i=i+1)begin
reset=resets[i];bit_in=bits[i];#5 clk=1;#5 clk=0;#1;
$fwrite(fd,"%0d,%0d,%0d\\n",i,code,valid);
end
$fclose(fd);$finish;
end
endmodule
''')

def read_replay(path):
    rows = []
    for line in Path(path).read_text().splitlines():
        parts = line.split(',')
        if len(parts) != 3 or any(not part.isdecimal() for part in parts):
            raise EDAError('RTL_UNKNOWN', 'Unknown/non-numeric digital output; replay is not accepted.')
        rows.append(tuple(int(part) for part in parts))
    return rows

def logic_ir_verilog(ir):
    """Check converted CMOS-IR wiring using known leaf logic, excluding MOS timing."""
    leaves={'INV':'assign Y=~A;', 'NAND2':'assign Y=~(A0&A1);', 'NOR2':'assign Y=~(A|B);', 'AND2':'assign Y=A&B;', 'OR2':'assign Y=A|B;', 'XOR2':'assign Y=A^B;', 'MUX2':'assign Y=S?B:A;', 'DFF':'always @(posedge CLK) Q<=D;'}
    cells={**ir['cells'],'IR_FILTER':{k:v for k,v in ir.items() if k!='cells'}}
    lines=[]
    for name,cell in cells.items():
        ports=cell['ports']
        outputs=[p for p in ports if p in ('Y','Q','VALID','LAST_SAMPLE','RESET_INTERNAL') or p.startswith(('CODE','NEXT_SUM','FILTERED'))]
        # CODE_IN is an input to the output register.
        outputs=[p for p in outputs if not p.startswith('CODE_IN')]
        inputs=[p for p in ports if p not in outputs]
        lines.append('module '+name+'('+','.join(ports)+');')
        if inputs:lines.append('input '+','.join(inputs)+';')
        if outputs:lines.append(('output reg ' if name=='DFF' else 'output ')+','.join(outputs)+';')
        if name in leaves:
            lines.append(leaves[name])
        else:
            nets=sorted({n for d in cell['devices'] for n in d['pins'].values()}-set(ports))
            if nets:lines.append('wire '+','.join(nets)+';')
            for d in cell['devices']:
                if d['kind']!='block':raise EDAError('ADC_IR_REPLAY','Unknown primitive outside the verified leaf library.')
                lines.append(d['cell_name']+' '+d['name']+'('+','.join('.'+pin+'('+net+')' for pin,net in d['pins'].items())+');')
        lines.append('endmodule')
    lines.extend(['module sigma_delta8_filter(input clk,reset,bit_in,output [7:0] code,output valid);','IR_FILTER f(.CLK(clk),.RESET(reset),.BIT_IN(bit_in),'+','.join(f'.CODE{i}(code[{i}])' for i in range(8))+',.VALID(valid),.VPWR(1\'b1),.VGND(1\'b0));','endmodule'])
    return '\n'.join(lines)+'\n'

def interpolate(rows, time, column):
    times = [row[0] for row in rows]
    index = bisect.bisect_left(times, time)
    if index == 0 or index == len(rows):
        raise EDAError('ADC_SAMPLE_RANGE', 'Missing analog sample at a digital clock edge.')
    a, b = rows[index-1], rows[index]
    return a[column] + (b[column] - a[column]) * (time - a[0]) / (b[0] - a[0])

def spectrum(codes, frequency, sample_rate):
    """Coherent rectangular-window SINAD including harmonics and full Nyquist noise."""
    import numpy as np
    n = len(codes)
    bin_exact = frequency*n/sample_rate
    tone = round(bin_exact)
    if n < 32 or not 0 < tone < n/2 or abs(bin_exact-tone) > 1e-7:
        return {'ENOB_bits':None, 'ENOB_status':'Requires ≥32 coherent settled output words; f_in × N / f_out must be an integer below Nyquist.'}
    values = np.asarray(codes, dtype=float)
    power = np.abs(np.fft.rfft(values-values.mean()))**2
    power[1:] *= 2
    if n % 2 == 0:
        power[-1] /= 2
    power[0] = 0
    signal = float(power[tone])
    residual = float(power.sum()-signal)
    if signal <= 0 or residual <= 0:
        return {'ENOB_bits':None, 'ENOB_status':'Non-positive spectral signal/noise; no infinite ENOB claim.'}
    sinad = 10*math.log10(signal/residual)
    other = power.copy()
    other[tone] = 0
    sfdr = 10*math.log10(signal/float(other.max()))
    return {'SINAD_dB':sinad, 'ENOB_bits':(sinad-1.76)/6.02, 'SFDR_dB':sfdr, 'fft_words':n, 'fft_tone_bin':tone, 'fft_resolution_Hz':sample_rate/n, 'ENOB_status':'Measured deterministic transient, full output Nyquist; harmonics included. Thermal/flicker noise, jitter, mismatch and PVT not characterized.'}

def block_context(p):
    kind = p['design_template']['id']
    if kind not in ANALOG_PARTS or kind == 'sdm8_modulator':
        return p
    context = copy.deepcopy(p)
    ir = schematic('sdm8_modulator')
    target = ANALOG_PARTS[kind][0]
    ir['cells'][target] = {k:v for k,v in copy.deepcopy(p['schematic']).items() if k != 'cells'}
    ir['cells'].update(copy.deepcopy(p['schematic'].get('cells',{})))
    context.update(schematic=ir, ports=ir['ports'], design_template={**p['design_template'], 'id':'sdm8_modulator', 'parameters':{'input_V':.9,'sine_amplitude_V':0.0,'sine_frequency_Hz':61.03515625}})
    return context

def execute_digital(server, run, p, folder, manifest):
    kind = p['design_template']['id']
    expected_ir = schematic(kind)
    # Source binding includes every electrical field, while allowing visual edits.
    if electrical(p['schematic']) != electrical(expected_ir) or any(electrical(p['schematic'].get('cells',{}).get(n,{'devices':[]})) != electrical(c) for n,c in expected_ir.get('cells',{}).items()):
        raise EDAError('ADC_RTL_MISMATCH', 'Edited digital circuit requires corresponding RTL and re-synthesis.')
    bits, resets = [], []
    accumulator = 0
    for density in (0, 1, 64, 128, 192, 255, 256):
        bits.extend([0]*12); resets.extend([1]*8+[0]*4)
        for i in range(4*R):
            accumulator += density
            bit = int(accumulator >= 256)
            if bit:accumulator -= 256
            bits.append(bit);resets.append(0)
    replay_files(folder,bits,resets)
    reference = cic_reference(bits,resets)
    results=[]
    (folder/'ir-replay.v').write_text(logic_ir_verilog(schematic('sdm8_filter')))
    simcells=runtime_resources.yosys_simcells()
    for name,sources in [('rtl',[RTL]),('gate',[simcells,GATE_RTL]),('ir',[folder/'ir-replay.v'])]:
        server.process(run,folder,['iverilog','-g2012','-s','replay','-o',str(folder/f'{name}.vvp'),*map(str,sources),str(folder/'replay.v')],f'{name}-compile',manifest)
        server.process(run,folder,['vvp',str(folder/f'{name}.vvp')],f'{name}-replay',manifest)
        path=folder/f'{name}-replay.csv';shutil.move(folder/'replay.csv',path)
        results.append(read_replay(path));run['artifacts'][f'{name}_replay']=str(path)
    matched=all(r==reference for r in results)
    rows=results[0]
    run.update(tool='Icarus Verilog',waveforms=[{'name':'CODE','unit':'code','x':[i*PERIOD for i,c,v in rows if v],'y':[c for i,c,v in rows if v]}],measurements={'analysis':'tran','x_unit':'s','x_label':'time','samples':len(bits),'directed_densities':'0,1,64,128,192,255,256 / 256','cosimulation':'RTL / synthesized gates / integer reference','analog_execution':'not performed for digital standalone blocks'},reference_verification={'schema_version':1,'kind':kind,'source':'actual Icarus RTL and synthesized-gate replay','scope':'Block-context digital functional verification; analog execution and transistor timing not performed.','pass':matched,'checks':[{'name':'Every clock matches independent modulo-CIC oracle, including reset and saturation','observed':len(rows) if matched else 0,'pass':matched}]},analysis_result='pass' if matched else 'fail',message=f'Actual Icarus block-context test for {kind}: {len(rows)} clocks, RTL and synthesized gates; no analog execution claim.')
    manifest['settings']['digital_block_context']=kind
    report=folder/'adc-verification.json';report.write_text(json.dumps({'kind':kind,'matched':matched,'clocks':len(rows),'rtl_sha256':hashlib.sha256(RTL.read_bytes()).hexdigest(),'gate_sha256':hashlib.sha256(GATE_RTL.read_bytes()).hexdigest(),'simcells_sha256':hashlib.sha256(simcells.read_bytes()).hexdigest()},indent=2)+'\n')
    shutil.copyfile(RTL,folder/'sigma_delta8.v');shutil.copyfile(GATE_RTL,folder/'sigma_delta8_gate.v')
    run['artifacts'].update(adc_verification=str(report),rtl_source=str(folder/'sigma_delta8.v'),gate_rtl=str(folder/'sigma_delta8_gate.v'),sampled_bits=str(folder/'bits.mem'))

def execute(server, run, p, folder, manifest, params):
    if params.get('post_layout'):
        raise EDAError('ADC_POST_LAYOUT_UNSUPPORTED', 'Full ADC PEX co-simulation is not implemented; no post-layout success is inferred.')
    p = copy.deepcopy(p)
    p['testbench'] = settings({**p['testbench'], **{key: params[key] for key in native.TESTBENCH if key in params}})
    original_kind=p['design_template']['id']
    if original_kind in DIGITAL_PARTS:
        return execute_digital(server,run,p,folder,manifest)
    p=block_context(p)
    manifest['settings']['analog_block_context']=original_kind
    core_ir = simulation_core(p)
    core = folder / 'analog.spice'
    core.write_text(native.emit(core_ir, 'sdm8_analog', core_ir['ports']))
    deck = server.design_tools.supported_model_deck(folder, p['testbench']['corner'])
    tb = folder / 'testbench.spice'
    tb.write_text(testbench(p, folder, deck, core))
    manifest['settings'].update(adc_clock_Hz=1e6, adc_decimation=R, adc_output_rate_Hz=1e6/R, adc_cosimulation='ngspice transistor modulator → Icarus RTL and synthesized-gate replay', analog_initialization='UIC with explicit nodes; reset eight clocks', digital_edge='falling; analog bit latched on preceding rising edge')
    log = server.process(run, folder, ['ngspice', '-b', str(tb)], 'ngspice', manifest, timeout=600)
    path = folder / 'waveform.dat'
    if not path.is_file() or any(t in log.lower() for t in ('fatal error', 'timestep too small', 'unknown subckt', 'singular matrix', 'error on line', 'simulation interrupted')):
        raise EDAError('SIMULATION_FAILED', 'Analog ADC simulation failed; actual log is retained.')
    rows = []
    for line in path.read_text().splitlines()[1:]:
        try:
            nums = [float(x) for x in line.split()]
        except ValueError:
            raise EDAError('PARSER_FAILED', 'ADC analog waveform contains non-numeric data.')
        if len(nums) != 10 or any(not math.isfinite(x) for x in nums):
            raise EDAError('PARSER_FAILED', 'ADC analog waveform has unexpected or non-finite columns.')
        rows.append(nums)
    if len(rows) < 16 or any(b[0] <= a[0] for a, b in zip(rows, rows[1:])):
        raise EDAError('PARSER_FAILED', 'ADC analog time must increase monotonically.')
    times = [row[0] for row in rows]
    def sample(t, column):
        index = bisect.bisect_left(times, t)
        if index == 0 or index == len(rows):
            raise EDAError('ADC_SAMPLE_RANGE', 'Analog clock-edge sample missing.')
        a, b = rows[index-1], rows[index]
        return a[column] + (b[column] - a[column]) * (t - a[0]) / (b[0] - a[0])
    count = int((rows[-1][0] - .125*PERIOD) / PERIOD)
    sample_times = [(i + .875) * PERIOD for i in range(count)]
    voltages = [sample(t, 4) for t in sample_times]
    vdd = p['testbench']['supply_V']
    bits = [int(v > vdd / 2) for v in voltages]
    resets = [int(t < 8*PERIOD) for t in sample_times]
    ambiguous = sum(.3*vdd < v < .7*vdd for v, reset in zip(voltages, resets) if not reset)
    replay_files(folder, bits, resets)
    expected = cic_reference(bits, resets)
    simcells = runtime_resources.yosys_simcells()
    if not simcells.is_file():
        raise EDAError('TOOL_MISSING', 'Yosys standard gate simulation cells are required for gate replay.')
    replays = []
    (folder/'ir-replay.v').write_text(logic_ir_verilog(schematic('sdm8_filter')))
    for name, sources in [('rtl', [RTL]), ('gate', [simcells, GATE_RTL]),('ir',[folder/'ir-replay.v'])]:
        server.process(run, folder, ['iverilog', '-g2012', '-s', 'replay', '-o', str(folder/f'{name}.vvp'), *map(str, sources), str(folder/'replay.v')], f'{name}-compile', manifest)
        server.process(run, folder, ['vvp', str(folder/f'{name}.vvp')], f'{name}-replay', manifest)
        result_path = folder/f'{name}-replay.csv'
        shutil.move(folder/'replay.csv', result_path)
        replays.append(read_replay(result_path))
        run['artifacts'][f'{name}_replay'] = str(result_path)
    same = all(replay == expected for replay in replays)
    frames = [(i, code) for i, code, valid in replays[0] if valid]
    steady = frames[2:]
    if not steady:
        raise EDAError('ADC_INSUFFICIENT_FRAMES', 'At least three decimated frames are required; extend transient duration.')
    analog_names = ['VIN', 'CLK', 'RESET', 'BITSTREAM', 'INT_OUT', 'VCM', 'BIAS', 'SUM', 'supply_current']
    display = rows[::max(1, math.ceil(len(rows)/5000))]
    run['waveforms'] = [{'name': name, 'unit': 'A' if name == 'supply_current' else 'V', 'x': [r[0] for r in display], 'y': [(-r[i+1] if name == 'supply_current' else r[i+1]) for r in display]} for i, name in enumerate(analog_names)]
    run['current_flow']={'schema_version':1,'source':'ngspice','analysis':'tran','x':[r[0] for r in display],'x_unit':'s','convention':'conventional','revision':p.get('revision',1),'project_id':p.get('id'),'run_id':run.get('id'),'geometry_linkage':'unverified','branches':[{'id':'adc_analog_supply','name':'Analog supply (aggregate)','from_net':'VPWR','to_net':'VGND','values_A':[-r[9] for r in display],'mapping':'unmapped','source_vector':'-i(VDD)'}],'node_voltages':[{'net':name,'source_vector':'v('+name+')','values_V':[r[i+1] for r in display]} for i,name in enumerate(analog_names[:7])],'notes':['Actual aggregate analog supply current only; internal device currents and digital RTL power are not computed.','No layout mapping or geometry signoff. Display traces are thinned; full raw analog samples remain in waveform.dat.']}
    frame_times = [(i+1)*PERIOD for i, code in frames]
    digital_rows=[]
    for index,row in enumerate(replays[0]):
        if index==0 or row[1:]!=replays[0][index-1][1:]:
            if index>0 and (not digital_rows or digital_rows[-1][0]!=index-1):digital_rows.append(replays[0][index-1])
            digital_rows.append(row)
    if digital_rows[-1][0]!=len(replays[0])-1:digital_rows.append(replays[0][-1])
    digital_times=[(i+1)*PERIOD for i,code,valid in digital_rows]
    run['waveforms'].extend([{'name':'CODE','unit':'code','x':digital_times,'y':[c for i,c,valid in digital_rows]},{'name':'VALID','unit':'logic','x':digital_times,'y':[valid for i,c,valid in digital_rows]},{'name':'decoded_input','unit':'V','x':digital_times,'y':[c*vdd/256 for i,c,valid in digital_rows]}])
    codes = [code for i, code in steady]
    mean_code = sum(codes)/len(codes)
    v = p['design_template']['parameters']
    error_lsb = abs(mean_code-v['input_V']/vdd*256) if not v['sine_amplitude_V'] else None
    checks = [{'name':'RTL / synthesized gates / independent integer oracle match', 'observed':int(same), 'pass':same}, {'name':'No ambiguous sampled analog logic levels', 'observed':ambiguous, 'pass':ambiguous == 0}, {'name':'Decimated frames after two-frame settling', 'observed':len(steady), 'pass':len(steady) >= 3}]
    if error_lsb is not None:
        checks.append({'name':'Nominal DC conversion error ≤ 2 LSB (not ENOB)', 'observed':error_lsb, 'pass':error_lsb <= 2})
    run['reference_verification'] = {'schema_version':1, 'kind':original_kind, 'source':'actual ngspice transistor samples → Icarus RTL and gate replay', 'scope':'Nominal deterministic conversion and digital consistency; not ENOB8, physical or foundry signoff.', 'pass':all(c['pass'] for c in checks), 'checks':checks}
    run['measurements'] = dict(analysis='tran', x_unit='s', x_label='time', supply_V=vdd, corner=p['testbench']['corner'], temperature_C=p['testbench']['temperature_C'], analog_samples=len(rows), sampled_bits=len(bits), decimated_frames=len(frames), output_bits=8, output_rate_Hz=1e6/R, output_LSB_V=vdd/256, mean_code=mean_code, dc_error_LSB=error_lsb, ambiguous_logic_samples=ambiguous, cosimulation='actual ngspice + Icarus RTL + synthesized gates', current_flow_status='supply-only; internal device-current overlay not computed', ENOB_bits=None, ENOB_status='not measured by a DC run; code width is not effective resolution')
    if v['sine_amplitude_V']:
        run['measurements'].update(spectrum(codes,v['sine_frequency_Hz'],1e6/R))
    run['measurements']['block_context']=original_kind
    import research
    run['measurements']['cic_response'] = research.cic_response(v['sine_frequency_Hz'] if v['sine_amplitude_V'] else 0)
    import signal_metrics
    run['measurements']['analog_supply_energy'] = signal_metrics.supply_metrics({'x':[r[0] for r in rows],'y':[-r[9] for r in rows]},rows[0][0],rows[-1][0],vdd)
    run['measurements']['analog_supply_energy']['scope']='All raw analog samples before display thinning; excludes digital RTL and external input/clock/reset power.'
    provenance = dict(schema_version=1, analog='actual SKY130 MOS, ideal reference resistors/capacitors', rtl_sha256=hashlib.sha256(RTL.read_bytes()).hexdigest(), gate_rtl_sha256=hashlib.sha256(GATE_RTL.read_bytes()).hexdigest(), simcells_sha256=hashlib.sha256(simcells.read_bytes()).hexdigest(), analog_netlist_sha256=hashlib.sha256(core.read_bytes()).hexdigest(), reference='independent modulo-17-bit CIC2 Python oracle', matches=same, analog_samples=len(rows), display_samples=len(display), bit_sample_phase=.875, full_transistor_digital_timing=False, thermal_flicker_noise=False, foundry_signoff=False)
    (folder/'adc-verification.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (folder/'adc-codes.csv').write_text('time_s,code,decoded_V\n' + ''.join(f'{t:.12g},{code},{code*vdd/256:.12g}\n' for t,(i,code) in zip(frame_times, frames)))
    shutil.copyfile(RTL,folder/'sigma_delta8.v');shutil.copyfile(GATE_RTL,folder/'sigma_delta8_gate.v')
    run['artifacts'].update(testbench=str(tb), waveform_data=str(path), reference_netlist=str(core), adc_verification=str(folder/'adc-verification.json'), adc_codes=str(folder/'adc-codes.csv'), sampled_bits=str(folder/'bits.mem'), rtl_source=str(folder/'sigma_delta8.v'), gate_rtl=str(folder/'sigma_delta8_gate.v'))
    run.update(tool='ngspice + Icarus Verilog', analysis_result='pass' if run['reference_verification']['pass'] else 'fail', message=f'Actual SPICE/RTL ADC co-simulation ({original_kind}): {len(rows)} analog samples, {len(frames)} output words; ENOB measured only for a coherent sine record.')
