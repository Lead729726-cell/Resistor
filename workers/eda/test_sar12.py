import copy,math,tempfile,unittest
from pathlib import Path
import sar12 as A,sar12_metrics as M,sar12_physical as L
import native,physical_library as P
from geometry import EDAError

class Sar12Tests(unittest.TestCase):
    def test_all_blocks_are_real_editable_hierarchy(self):
        A.populate_catalog()
        for kind in A.CATALOG:
            ir=A.schematic(kind);self.assertTrue(native.validate(ir)['valid'],kind);self.assertEqual(ir['ports'],A.CATALOG[kind]['ports'])
        ir=A.schematic('sar12_analog');original=copy.deepcopy(ir)
        with self.assertRaises(EDAError):P.materialize(ir)
        flat,replaced=P.materialize(ir,max_primitives=768);self.assertEqual(ir,original)
        caps=[d for d in flat['devices'] if d['kind']=='capacitor'];self.assertEqual(len(caps),512);self.assertLessEqual(len(flat['devices']),768)
        rows,rest=L.array_plan(flat['devices']);self.assertEqual(sum(map(len,rows)),508)
        groups={}
        for r,row in enumerate(rows):
            for c,d,g in row:groups.setdefault(g,[]).append((c,r))
        for g,points in groups.items():self.assertEqual([sum(p[i] for p in points)/len(points) for i in (0,1)],[7.5,15.5],g)
    def test_split_cdac_reference_equation_and_units(self):
        unit=200e-15;fine_total=128*unit;bridge=2*unit*64/63
        effective=bridge*fine_total/(bridge+fine_total);total=126*unit+effective
        self.assertAlmostEqual(effective/(2*unit),1)
        weights=[(2<<(i%6))*unit*(bridge/(bridge+fine_total) if i<6 else 1)/total for i in range(12)]
        for i,w in enumerate(weights):self.assertAlmostEqual(w,2**i/4096)
        self.assertAlmostEqual(2*1.2/4096,585.9375e-6)
        for raw in [dict(input_differential_V=-1.3),dict(reference_V=1.8),dict(unit_F=201e-15),dict(static_batch=16),dict(hold_s=0)]:
            with self.assertRaises(EDAError):A.parameters('sar12_analog',raw)
        A.parameters('sar12_analog',dict(input_differential_V=-.5))
    def test_control_preserves_one_transient_and_checks_each_real_stop(self):
        p=dict(cell='sar12_analog',testbench=A.recommended_settings({}),design_template=dict(parameters=A.DEFAULTS))
        with tempfile.TemporaryDirectory() as f:
            file,values=A.control_testbench(p,f,'models.spice','core.spice',A.schematic('sar12_analog')['ports']);text=file.read_text();lines=text.splitlines()
            self.assertEqual(lines.count('run'),1);self.assertEqual(lines.count('delete all'),26*len(values))
            self.assertEqual(text.count('stop when time ge '),26*len(values));self.assertNotIn('stop when time = ',text)
            self.assertIn('VMARK SAR12_TIMING_MARK VGND PWL(',text)
            self.assertEqual(text.count('SAR12_PAUSE_FAILED'),26*len(values));self.assertIn('RVCM VCM_DRV VCM 10',text)
            self.assertIn('R_VINP VINP_DRV VINP 50',text);self.assertIn('R_VINN VINN_DRV VINN 50',text)
            post,_=A.control_testbench(p,f,'models.spice','core.spice',A.schematic('sar12_analog')['ports'],post_layout=True);lines=post.read_text().splitlines()
            self.assertEqual(sum(l.startswith('stop when time = ')for l in lines),26*len(values));self.assertNotIn('delete all',lines)
            self.assertTrue(all(i<lines.index('run')for i,l in enumerate(lines)if l.startswith('stop when')))
    def test_decision_parser_rejects_forged_truncated_and_nonfinite_records(self):
        vin=A.DEFAULTS['input_differential_V'];code=0;rows=['frame bit trial comp compn topp topn vin decision']
        for bit in reversed(range(12)):
            trial=code+(1<<bit);decision=int(2048>=trial)
            rows.append(f'0 {bit} {trial} {1.8 if decision else 0} {0 if decision else 1.8} .9 .9 {vin} {decision}')
            if decision:code=trial
        with tempfile.TemporaryDirectory()as f:
            file=Path(f)/'decisions.csv';file.write_text('\n'.join(rows)+'\n');_,frames,amb=A.parse_decisions(file,[vin],1.8,1.2)
            self.assertEqual(frames[0]['code'],2048);self.assertEqual(amb,0)
            for damaged in ['\n'.join(rows[:-1]),'\n'.join(rows).replace('0 11 2048','0 11 2047'),'\n'.join(rows).replace('1.8','nan',1)]:
                file.write_text(damaged+'\n')
                with self.assertRaises(EDAError):A.parse_decisions(file,[vin],1.8,1.2)
    def test_test_modes_and_bounded_static_batches(self):
        for mode,n in [(1,64),(2,256)]:self.assertEqual(len(A.inputs({**A.DEFAULTS,'test_mode':mode})),n)
        all_codes=[]
        for batch in range(16):
            values=A.inputs({**A.DEFAULTS,'test_mode':3,'static_batch':batch});all_codes.extend(min(4095,max(0,math.floor((x/1.2+1)*2048))) for x in values)
        self.assertEqual(len(set(all_codes)),4096)
    def test_spectral_fixtures_and_fault_injection(self):
        n=256;tone=17;codes=[min(4095,max(0,math.floor(2048+1800*math.sin(2*math.pi*tone*i/n+.37)))) for i in range(n)]
        result=M.coherent_spectrum(codes,100000,tone);self.assertGreater(result['ENOB_noiseless_bits'],11.3);self.assertLess(result['ENOB_noiseless_bits'],12.3)
        corrupt=[min(4095,max(0,c+int(40*math.sin(2*math.pi*34*i/n)))) for i,c in enumerate(codes)]
        self.assertLess(M.coherent_spectrum(corrupt,100000,tone)['SNDR_dB'],result['SNDR_dB']-20)
        for v in [[0]*n,[float('nan')]*n,codes[:-1]]:
            with self.assertRaises(EDAError):M.coherent_spectrum(v,100000,tone)
        with self.assertRaises(EDAError):M.coherent_spectrum(codes,100000,19)
    def test_coupling_audit_keeps_mutual_capacitance_and_spice_units(self):
        r=M.coupling_audit('.subckt dut TOP BIT\nC1 TOP BIT .5f\nC2 TOP 0 1p\n.ends')
        self.assertEqual(r['capacitor_count'],2);self.assertEqual(r['mutual_capacitance_F'],.5e-15);self.assertEqual(r['ground_capacitance_F'],1e-12)
        with self.assertRaises(EDAError):M.coupling_audit('Cbad TOP BIT bad')
        r=M.coupling_audit('C0 TOP BIT 0 $ **FLOATING\nC1 TOP 0 1p $ native comment\n')
        self.assertEqual(r['capacitor_count'],2);self.assertEqual(r['zero_valued_capacitors'],1);self.assertEqual(r['ground_capacitance_F'],1e-12)
        with self.assertRaises(EDAError):M.coupling_audit('Cbad TOP BIT -1f')
    def test_bounded_display_retains_raw_peaks_and_integrates_all_nonuniform_samples(self):
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'wave.dat';rows=[(i*i*1e-9,1e-6+2*i*i*1e-9,5. if i==517 else 0.)for i in range(1000)]
            file.write_text('time I V\n'+'\n'.join(' '.join(map(str,r))for r in rows)+'\n')
            selected,audit=M.display_trace(file,3,max_points=64,power_sources={1:2.})
            self.assertLessEqual(len(selected),64);self.assertEqual(audit['raw_sample_count'],1000)
            self.assertEqual(selected[0],list(rows[0]));self.assertEqual(selected[-1],list(rows[-1]));self.assertTrue(any(r[2]==5 for r in selected))
            t=rows[-1][0];self.assertAlmostEqual(audit['source_energy']['1']['energy_J'],2*(1e-6*t+t*t),places=15)
            for text in ['time I V\n0 1 2\n0 1 2\n','time I V\n0 nan 2\n','time I V\n0 1\n']:
                file.write_text(text)
                with self.assertRaises(EDAError):M.display_trace(file,3)

if __name__=='__main__':unittest.main()
