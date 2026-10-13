import copy,json,tempfile,unittest
from pathlib import Path
import sar_adc as A,physical_library as P,native
from geometry import EDAError

class SarTests(unittest.TestCase):
    def test_actual_blocks_and_binary_unit_counts(self):
        A.populate_catalog()
        for kind in A.CATALOG:
            ir=A.schematic(kind);self.assertTrue(native.validate(ir)['valid'],kind)
            self.assertEqual(ir['ports'],A.CATALOG[kind]['ports'])
        core=A.schematic('sar8_analog');before=copy.deepcopy(core);flat,rows=P.materialize(core)
        self.assertEqual(core,before);self.assertEqual(len(flat['devices']),361)
        caps=[d for d in flat['devices'] if d['kind']=='capacitor'];self.assertEqual(len(caps),256)
        self.assertEqual(len({(d['parameters']['w_um'],d['parameters']['l_um']) for d in caps}),1)
        for bit in range(8):self.assertEqual(sum(d['pins']['-']=='DAC__BOTTOM'+str(bit) for d in caps),1<<bit)
    def test_out_of_range_does_not_generate_sources(self):
        for raw in [dict(input_V=-.1),dict(reference_V=1.8),dict(acquisition_s=0),dict(bit_period_s=.01)]:
            with self.assertRaises(EDAError):A.parameters('sar8_analog',raw)
    def test_native_extracted_port_continuations(self):
        self.assertEqual(A.subcircuit_ports('* Native Magic\n.SUBCKT SAR8 A B\n* comment\n\n + VPWR VGND\n.ends\n','sar8'),['A','B','VPWR','VGND'])
        self.assertIsNone(A.subcircuit_ports('.subckt Other A B\n.ends','sar8'))
        with self.assertRaises(EDAError):A.subcircuit_ports('+ A B','sar8')
    def test_control_variables_do_not_shadow_saved_voltage_nodes(self):
        ir=A.schematic('sar8_analog');p=dict(cell='sar8_analog',testbench=A.settings(A.SETTINGS),design_template=dict(parameters=A.DEFAULTS))
        with tempfile.TemporaryDirectory() as folder:
            path,_=A.control_testbench(p,folder,'models.spice','core.spice',ir['ports']);text=path.read_text()
            self.assertNotIn('let cmp =',text);self.assertNotIn('let top =',text)
            self.assertIn('v(COMP)[sar_sample_index]',text)
            self.assertIn('RDRV_SAMPLE SAR_DRV_SAMPLE SAMPLE 200',text)
            self.assertIn('CDRV_B0 B0 VGND .5p',text)
    def test_native_parser_checks_real_trial_and_comparator(self):
        rows=[];code=0;vin=.6
        for bit in reversed(range(8)):
            trial=code+(1<<bit);decision=int(trial<=128);cmp=1.8 if decision else 0
            rows.append(f'0 {bit} {trial} {cmp} .9 {vin} {decision}')
            if decision:code=trial
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'decisions.csv';p.write_text('frame bit trial comp top vin decision\n'+'\n'.join(rows)+'\n')
            _,frames,ambiguous=A.parse_decisions(p,[vin],1.8,1.2)
            self.assertEqual(frames[0]['code'],128);self.assertEqual(ambiguous,0)
            p.write_text(p.read_text().replace('0 7 128','0 7 127'))
            with self.assertRaises(EDAError):A.parse_decisions(p,[vin],1.8,1.2)
    def test_context_retains_edited_analog_child(self):
        ir=A.schematic('sar8_unit_cap');ir['devices'][0]['parameters']['value']=110e-15
        p=dict(cell='sar8_unit_cap',ports=ir['ports'],schematic=ir,design_template=dict(id='sar8_unit_cap',parameters={}))
        ctx=A.context(p);self.assertEqual(ctx['schematic']['cells']['SAR8_UNIT']['devices'][0]['parameters']['value'],110e-15)
        self.assertEqual(p['cell'],'sar8_unit_cap')
    def test_edited_controller_cannot_replay_unrelated_rtl(self):
        ir=A.schematic('sar8_controller');ir['devices'][0]['pins']['A']='VGND'
        with self.assertRaises(EDAError):A.context(dict(schematic=ir,design_template=dict(id='sar8_controller',parameters={})))

if __name__=='__main__':unittest.main()
