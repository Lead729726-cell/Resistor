"""Actual pre-route and post-CTS/SPEF STA of the complete SAR12 controller.

The complete analog ADC is not a digital synchronous top. No exceptions waive
its analog interface obligations and no path or wire delay is fabricated.
"""
import hashlib, json, os, re, shutil, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
DIR = WORK / 'timing'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def slacks(text):
    values = [re.search(r'worst slack ' + mode + r'\s+([+\-\d.]+)', text) for mode in ('max', 'min')]
    if any(v is None for v in values):
        raise ValueError('Missing native setup/hold result')
    return [float(v[1]) for v in values]


def main():
    executable = shutil.which('sta') or str(Path.home() / '.local/share/resistor/tools/bin/sta')
    environment = {**os.environ, 'LD_LIBRARY_PATH': str(Path.home() / '.local/share/resistor/cudd-3.0.0/lib') + ':' + os.environ.get('LD_LIBRARY_PATH', '')}
    version = subprocess.run([executable, '-version'], capture_output=True, text=True, env=environment, check=True).stdout.strip()
    # OpenROAD exports two otherwise unused supply ports in its signal-only
    # Verilog. Verify they have no logic connection, then omit ONLY those empty
    # declarations in a separate timing view. Full physical Verilog is retained.
    physical = (WORK / 'pnr/routed.v').read_text()
    for supply in ('VPWR', 'VGND'):
        if len(re.findall(r'\b' + supply + r'\b', physical)) != 2:
            raise ValueError('Supply participates in logic; cannot omit from timing view')
    header = re.search(r'module sar12_controller\s*\((.*?)\);', physical, re.S)
    if not header:
        raise ValueError('Unexpected physical Verilog top declaration')
    ports = [p.strip() for p in header[1].split(',') if p.strip() not in ('VPWR', 'VGND')]
    signal = physical[:header.start(1)] + ',\n    '.join(ports) + physical[header.end(1):]
    signal = re.sub(r'^\s*inout (?:VPWR|VGND);\s*$', '', signal, flags=re.M)
    signal_path = WORK / 'pnr/routed-signal.v'
    signal_path.write_text(signal)
    cases = []
    for stage in ('pre-route', 'post-route'):
      for corner in ['tt_025C_1v80', 'ss_100C_1v60', 'ff_n40C_1v95']:
       for period, negative in [(250., False), (.2, True)]:
        key = corner + ('-negative' if negative else '')
        out = DIR / key if stage == 'pre-route' else DIR / 'post-route' / key
        out.mkdir(parents=True, exist_ok=True)
        lib = WORK / 'lib' / ('sky130_fd_sc_hd__' + corner + '.lib')
        netlist = DIR / 'sar12_mapped.v' if stage == 'pre-route' else signal_path
        spef = WORK / 'pnr/routed.spef'
        max_io, min_io, setup, hold = (.02, .005, .005, 0.) if negative else (25., .5, .5, .1)
        parasitics = '' if stage == 'pre-route' else f'read_spef {{{spef}}}\nset_propagated_clock [all_clocks]\nreport_parasitic_annotation -report_unannotated\n'
        tcl = f'''read_liberty {{{lib}}}
read_verilog {{{netlist}}}
link_design sar12_controller
create_clock -name SAR_CLK -period {period} [get_ports clk]
set_clock_uncertainty -setup {setup} [get_clocks SAR_CLK]
set_clock_uncertainty -hold {hold} [get_clocks SAR_CLK]
set_input_delay -clock SAR_CLK -max {max_io} [get_ports {{reset start comparator}}]
set_input_delay -clock SAR_CLK -min {min_io} [get_ports {{reset start comparator}}]
set_input_transition 0.1 [get_ports {{reset start comparator}}]
set_output_delay -clock SAR_CLK -max {max_io} [get_ports {{sample eval busy valid trial* code*}}]
set_output_delay -clock SAR_CLK -min {min_io} [get_ports {{sample eval busy valid trial* code*}}]
set_load 0.01 [get_ports {{sample eval busy valid trial* code*}}]
{parasitics}
puts "SETUP_SANITY [check_setup -verbose]"
report_checks -path_delay max -group_path_count 30 -format full_clock_expanded
report_checks -path_delay min -group_path_count 30 -format full_clock_expanded
report_worst_slack -max
report_worst_slack -min
report_tns
report_check_types -max_slew -max_capacitance -max_fanout -violators
report_clock_properties
write_sdc {{{out / 'constraints.sdc'}}}
write_sdf {{{out / 'delay.sdf'}}}
puts STA_NATIVE_COMPLETE
exit
'''
        script = out / 'run.tcl'
        script.write_text(tcl)
        r = subprocess.run([executable, '-no_init', '-exit', str(script)], cwd=out,
                           env=environment, capture_output=True, text=True, timeout=120)
        text = r.stdout + r.stderr
        (out / 'sta.log').write_text(text)
        if r.returncode or 'STA_NATIVE_COMPLETE' not in text or 'SETUP_SANITY 1' not in text or re.search(r'(^|\n)Error', text):
            raise RuntimeError(key + ': ' + text[-3500:])
        setup_ns, hold_ns = slacks(text)
        if negative and setup_ns >= 0:
            raise RuntimeError('Overclock negative control was not detected: ' + key)
        cases.append({'stage': stage, 'corner': corner, 'clock_period_ns': period,
                      'input_delay_max_ns': max_io, 'input_delay_min_ns': min_io,
                      'output_delay_max_ns': max_io, 'output_delay_min_ns': min_io,
                      'load_pF': .01, 'input_transition_ns': .1,
                      'setup_uncertainty_ns': setup, 'hold_uncertainty_ns': hold,
                      'setup_slack_ns': setup_ns, 'hold_slack_ns': hold_ns,
                      'analysis_result': 'pass' if setup_ns >= 0 and hold_ns >= 0 else 'fail',
                      'expected_negative_control': negative, 'constraints_sanity_pass': True,
                      'library_sha256': digest(lib), 'netlist_sha256': digest(netlist),
                      'spef_sha256': digest(spef) if stage == 'post-route' else None,
                      'raw_log_sha256': digest(out / 'sta.log'),
                      'clock': 'propagated CTS with OpenRCX routed SPEF' if stage == 'post-route' else 'ideal; no routed wire parasitics'})
        print(json.dumps({k: cases[-1][k] for k in ('stage', 'corner', 'clock_period_ns', 'setup_slack_ns', 'hold_slack_ns', 'analysis_result')}), flush=True)
    report = {'edition': 'Resistor Indust', 'tool': version, 'tool_binary_sha256': digest(executable),
              'rtl_sha256': digest(ROOT / 'workers/eda/rtl/sar12.v'), 'cases': cases,
              'physical_verilog_sha256': digest(WORK / 'pnr/routed.v'),
              'scope': 'Entire sar12_controller digital top only; all signal I/O constrained, no false-path waiver. Same nominal OpenRCX wire model in all cell PVT corners; not multi-RC-corner or coupled-noise/OCV signoff. No complete analog+digital ADC timing closure. Comparator synchronization and external sample/hold protocol remain obligations.',
              'manufacturing_signoff': False}
    (DIR / 'report.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
