"""Read-only executable presence and public-deck provenance, no license probing."""
import hashlib, json, os, shutil, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'


def main():
    names = ['virtuoso', 'spectre', 'assura', 'pegasus', 'quantus', 'custom_compiler',
             'primesim', 'hspice', 'icv', 'starrc', 'icc_shell', 'icc2_shell',
             'fc_shell', 'calibre', 'innovus', 'tempus', 'pt_shell']
    commercial = [{'executable': name, 'path': shutil.which(name),
                   'availability': 'on_path' if shutil.which(name) else 'not_on_path',
                   'license_state': 'not_tested', 'execution_validation': 'not_run'} for name in names]
    # Explicitly limited PATH discovery. No secret variables, credentials,
    # license server queries, paid calls or untrusted binary downloads.
    environment = {**os.environ, 'LD_LIBRARY_PATH': str(Path.home() / '.local/share/resistor/cudd-3.0.0/lib')}
    public = []
    for name, candidate, flag in [('ngspice', shutil.which('ngspice'), '--version'),
                                  ('yosys', shutil.which('yosys'), '-V'),
                                  ('OpenROAD', shutil.which('openroad'), '-version'),
                                  ('OpenSTA', str(Path.home() / '.local/share/resistor/tools/bin/sta'), '-version')]:
        if not candidate or not Path(candidate).is_file():
            public.append({'name': name, 'availability': 'unavailable'})
            continue
        response = subprocess.run([candidate, flag], capture_output=True, text=True, env=environment, timeout=30)
        public.append({'name': name, 'path': candidate,
                       'version_output': (response.stdout + response.stderr).strip(), 'returncode': response.returncode,
                       'binary_sha256': hashlib.sha256(Path(candidate).read_bytes()).hexdigest()})
    pdk = Path.home() / '.local/share/resistor/pdks/sky130A'
    decks = {str(p.relative_to(pdk)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in [pdk / 'libs.tech/magic/sky130A.magicrc', pdk / 'libs.tech/magic/sky130A.tech', pdk / 'libs.tech/netgen/sky130A_setup.tcl'] if p.is_file()}
    report = {'edition': 'Resistor Indust', 'host_scope': 'ResistorEDA native WSL worker PATH; not a scan of every remote host or license server',
              'commercial': commercial, 'public': public, 'public_deck_sha256': decks,
              'foundry_approved_deck': 'not_provided', 'manufacturing_signoff': False}
    (WORK / 'tool-preflight.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'commercial_on_path': [r['executable'] for r in commercial if r['path']], 'public': [p['name'] for p in public], 'manufacturing_signoff': False}))


if __name__ == '__main__':
    main()
