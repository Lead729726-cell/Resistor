"""Stream the real routed DEF plus native SKY130 cell masks to GDS.

No LEF rectangle substitutions for standard-cell internals. Mask mapping is
checked explicitly; this export does not constitute DRC/LVS signoff.
"""
import hashlib, json
from pathlib import Path
import klayout.db as k

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/paper-signoff'
PDK = Path.home() / '.local/share/resistor/pdks/sky130A'


def main():
    native = sorted((PDK / 'libs.ref/sky130_fd_sc_hd/gds').glob('*.gds'))
    if not native:
        raise RuntimeError('Actual SKY130 standard cell GDS is required')
    layout = k.Layout()
    options = k.LoadLayoutOptions()
    cfg = options.lefdef_config
    cfg.lef_files = [str(WORK / 'lef/sky130_fd_sc_hd.tlef'), str(WORK / 'lef/sky130_fd_sc_hd_merged.lef')]
    cfg.macro_layout_files = list(map(str, native))
    cfg.macro_resolution_mode = 2
    cfg.create_other_layers = False
    mapping = k.LayerMap()
    # Public SKY130 masks, same routing/cut mapping as sky130A.map. Separate
    # pin and label purposes are set below; no obstructions enter mask GDS.
    for name, layer, datatype in [('li1', 67, 20), ('mcon', 67, 44), ('met1', 68, 20),
                                 ('via', 68, 44), ('met2', 69, 20), ('via2', 69, 44),
                                 ('met3', 70, 20), ('via3', 70, 44), ('met4', 71, 20),
                                 ('via4', 71, 44), ('met5', 72, 20)]:
        mapping.map(f'{name} : {layer}/{datatype}')
        if name.startswith('met') or name == 'li1':
            mapping.map(f'"{name}.PIN" : {layer}/16')
            mapping.map(f'"{name}.LABEL" : {layer}/5')
    cfg.layer_map = mapping
    cfg.produce_obstructions = False
    cfg.produce_cell_outlines = False
    cfg.produce_regions = False
    cfg.produce_placement_blockages = False
    cfg.produce_lef_pins = False
    cfg.produce_lef_labels = False
    cfg.produce_labels = True
    cfg.labels_datatype = 5
    cfg.produce_pins = True
    cfg.pins_datatype = 16
    cfg.produce_routing = True
    cfg.produce_special_routing = True
    cfg.produce_via_geometry = True
    options.lefdef_config = cfg
    layout.read(str(WORK / 'pnr/routed.def'), options)
    top = layout.cell('sar12_controller')
    if top is None:
        raise RuntimeError('No routed controller top')
    labels = {shape.text.string for index in layout.layer_indexes()
              for shape in top.shapes(index).each() if shape.is_text()}
    required = {'clk', 'reset', 'comparator', 'start', 'busy', 'sample', 'eval', 'valid', 'VPWR', 'VGND'}
    required |= {f'{bus}[{i}]' for bus in ('code', 'trial') for i in range(12)}
    if not required.issubset(labels):
        raise RuntimeError('Missing real DEF pin labels in mask export: ' + repr(required - labels))
    descendants = [layout.cell(i) for i in top.called_cells()]
    cells = [c for c in descendants if c.name.startswith('sky130_fd_sc_hd__')]
    if not cells or any(c.is_empty() for c in cells):
        raise RuntimeError('Unresolved or empty native cell mask')
    # Native diffusion and poly must exist in the hierarchical product.
    for pair in [(65, 20), (66, 20)]:
        index = layout.find_layer(*pair)
        if index is None or k.Region(top.begin_shapes_rec(index)).is_empty():
            raise RuntimeError('Missing real transistor geometry: ' + str(pair))
    dest = WORK / 'pnr/sar12_controller.gds'
    save = k.SaveLayoutOptions()
    save.format = 'GDS2'
    save.select_cell(top.cell_index())
    layout.write(str(dest), save)
    report = {'edition': 'Resistor Indust', 'tool': 'KLayout ' + k.__version__,
              'gds_sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
              'def_sha256': hashlib.sha256((WORK / 'pnr/routed.def').read_bytes()).hexdigest(),
              'native_gds': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in native},
              'native_cell_types': len(cells), 'dbu_um': layout.dbu,
              'top_pin_labels': sorted(labels),
              'bbox_um': str(top.dbbox()), 'manufacturing_signoff': False}
    (WORK / 'pnr/gds-export.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'native_gds'}))


if __name__ == '__main__':
    main()
