"""Independent full-mask Magic check of streamed native standard-cell GDS."""
import hashlib, json, os, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
OUT = WORK / 'mask-drc'
PDK = Path.home() / '.local/share/resistor/pdks/sky130A'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    gds = WORK / 'pnr/sar12_controller.gds'
    script = OUT / 'check.tcl'
    script.write_text(f'''crashbackups stop
gds read {{{gds}}}
load sar12_controller
select top cell
drc euclidean on
if {{[catch {{drc style {{drc(full)}}}} style_error]}} {{puts stderr $style_error; exit 77}}
drc check
drc catchup
set result [drc listall why]
set f [open markers.tsv w]
set oscale [cif scale out]
set count 0
foreach {{rule boxes}} $result {{
    foreach b $boxes {{
        set coords {{}}
        foreach n $b {{lappend coords [expr {{$n*$oscale}}]}}
        puts $f "[string map {{\t {{ }} \r {{ }} \n {{ }}}} $rule]\t[join $coords \t]"
        incr count
    }}
}}
close $f
set f [open drc-status.json w]
puts $f "{{\\\"marker_count\\\":$count}}"
close $f
puts MASK_DRC_COMPLETE
quit -noprompt
''')
    executable = Path.home() / '.local/share/resistor/tools/bin/magic'
    with (OUT / 'magic.log').open('w') as log:
        subprocess.run([str(executable), '-dnull', '-noconsole', '-rcfile',
                        str(PDK / 'libs.tech/magic/sky130A.magicrc'), str(script)],
                       cwd=OUT, env={**os.environ, 'PDK_ROOT': str(PDK.parent)},
                       stdout=log, stderr=subprocess.STDOUT, timeout=300, check=True)
    if 'MASK_DRC_COMPLETE' not in (OUT / 'magic.log').read_text():
        raise RuntimeError('Native mask check did not complete')
    result = json.loads((OUT / 'drc-status.json').read_text())
    result.update(edition='Resistor Indust', gds_sha256=hashlib.sha256(gds.read_bytes()).hexdigest(),
                  analysis_result='pass' if result['marker_count'] == 0 else 'fail',
                  scope='Public SKY130 Magic drc(full) mask rectangles. Not foundry signoff.',
                  manufacturing_signoff=False)
    (OUT / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
