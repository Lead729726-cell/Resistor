"""Fetch pinned public SKY130 characterization for the actual controller cells.

Free public reference data only. Run in the native engine Python environment.
Every download is content hashed; partial SS/FF libraries contain exactly the
required logical cells. Original characterization tables are not edited.
"""
import argparse, concurrent.futures, hashlib, json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
ORFS = 'bf3f9b344bf7d9d999f199778a722833bccbd33c'
SC = 'ac7fb61f06e6470b94e8afdf7c25268f62fbd7b1'


def liberty_subset(text, names):
    """Keep complete unmodified native cell blocks and the library header."""
    starts = list(re.finditer(r'\bcell\s*\(\s*"?([^\s"()]+)"?\s*\)\s*\{', text))
    if not starts:
        raise ValueError('No native Liberty cell blocks')
    selected = {}
    for match in starts:
        if match[1] not in names:
            continue
        depth, quoted, escaped = 1, False, False
        for end in range(match.end(), len(text)):
            char = text[end]
            if escaped:
                escaped = False
            elif char == '\\' and quoted:
                escaped = True
            elif char == '"':
                quoted = not quoted
            elif not quoted:
                depth += (char == '{') - (char == '}')
                if depth == 0:
                    selected[match[1]] = text[match.start():end + 1]
                    break
    if set(selected) != set(names):
        raise ValueError('Required native Liberty cell missing: ' + repr(set(names) - set(selected)))
    return text[:starts[0].start()] + '\n\n'.join(selected[n] for n in sorted(selected)) + '\n}\n'


def fetch(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=90) as response:
            content = response.read()
    except Exception as exc:
        raise RuntimeError('Public dependency download failed: ' + url) from exc
    dest.write_bytes(content)
    return {'url': url, 'file': str(dest.relative_to(WORK)),
            'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mapped-only', action='store_true', help='Fresh P&R input set, independent of any previous routed output')
    args = parser.parse_args()
    # Read the current outputs rather than a stale hand-maintained cell list.
    texts = [(WORK / 'timing/sar12_mapped.v').read_text()]
    if not args.mapped_only and (WORK / 'pnr/routed.v').is_file():
        texts.append((WORK / 'pnr/routed.v').read_text())
    cells = sorted(set(re.findall(r'\bsky130_fd_sc_hd__(\w+)\s+\\?[^\s(]+\s*\(', '\n'.join(texts))))
    cells = [c for c in cells if not c.startswith(('fill_', 'tapvpwrvgnd_'))]
    # Permit real hold/setup repair and CTS while keeping all three corner cell
    # sets identical. These are characterized public cells, never fake buffers.
    cells = sorted(set(cells) | {'buf_' + str(n) for n in (1, 2, 4, 6, 8)} |
                   {'clkbuf_' + str(n) for n in (1, 2, 4, 8)} | {'conb_1', 'clkinv_2'})
    if not cells:
        raise ValueError('Synthesize the controller first; no mapped cells found')
    (WORK / 'timing/cell-types.json').write_text(json.dumps(['sky130_fd_sc_hd__' + c for c in cells], indent=2) + '\n')
    native_tt = WORK / 'lib/sky130_fd_sc_hd__tt_025C_1v80.lib'
    (WORK / 'lib/sky130_fd_sc_hd__tt_required.lib').write_text(
        liberty_subset(native_tt.read_text(), {'sky130_fd_sc_hd__' + c for c in cells}))
    prefix = f'https://raw.githubusercontent.com/google/skywater-pdk-libs-sky130_fd_sc_hd/{SC}'
    paths = ['timing/sky130_fd_sc_hd__common.lib.json',
             'timing/sky130_fd_sc_hd__ss_100C_1v60.lib.json',
             'timing/sky130_fd_sc_hd__ff_n40C_1v95_ccsnoise.lib.json']
    for cell in cells:
        family = cell.rsplit('_', 1)[0]
        for corner in ('ss_100C_1v60', 'ff_n40C_1v95_ccsnoise'):
            paths.append(f'cells/{family}/sky130_fd_sc_hd__{cell}__{corner}.lib.json')
    def download(path):
        return fetch(prefix + '/' + path, WORK / 'corner-source' / path)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        receipts = list(pool.map(download, paths))
    # Record the formatter's exact current source hashes too. The formatter is
    # supplied by the official skywater-pdk package, not an invented Liberty writer.
    formatter = WORK / 'skywater_pdk'
    if not (formatter / 'liberty.py').is_file():
        raise RuntimeError('Install the official skywater_pdk Liberty formatter; see docs/paper-signoff-validation.md')
    sys.path.insert(0, str(WORK))
    from skywater_pdk import liberty as L
    for corner, kind in [('ss_100C_1v60', L.TimingType.basic), ('ff_n40C_1v95', L.TimingType.ccsnoise)]:
        L.generate(str(WORK / 'corner-source'), 'sky130_fd_sc_hd', corner, L.TimingType.basic, kind, cells, str(WORK / 'lib'))
    report = {'skywater_cell_commit': SC, 'openroad_flow_commit': ORFS, 'cells': cells,
              'downloads': receipts, 'formatter_sha256': {
                  p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in formatter.glob('*.py')},
              'scope': 'Public basic NLDM timing, required logical cells only; no foundry signoff qualification.'}
    (WORK / 'corner-source/receipt.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'cell_types': len(cells), 'source_files': len(receipts)}))


if __name__ == '__main__':
    main()
