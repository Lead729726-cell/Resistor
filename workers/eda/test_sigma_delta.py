"""Mathematical, hierarchy, freshness and real RTL/gate ADC checks; no worker DB."""
import copy
import json
from pathlib import Path
import random
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
import native
import sigma_delta as A
from geometry import EDAError

class SigmaDeltaTests(unittest.TestCase):
    def test_all_nineteen_real_circuits_validate_and_emit(self):
        self.assertEqual(len(A.CATALOG),19)
        for kind in A.CATALOG:
            ir=A.schematic(kind)
            self.assertTrue(native.validate(ir)['valid'],kind)
            self.assertTrue(ir['devices'],kind)
            self.assertIn('.subckt '+kind,native.emit(ir,kind,ir['ports']))
            for cell in ir['cells'].values():self.assertTrue(cell['devices'],kind)

    def test_gate_oracle_random_reset_and_all_edges(self):
        rng=random.Random(815)
        bits=[rng.randrange(2) for i in range(8000)]
        resets=[int(i<8 or 1020<=i<1030 or 5103<=i<5109) for i in range(len(bits))]
        reference=A.cic_reference(bits,resets)
        # Independent convolution of the triangular CIC2 impulse response.
        start=None;phase=0;stages=[1,1]
        for i,(bit,reset) in enumerate(zip(bits,resets)):
            active=stages[1];stages=[1,1] if reset else [0,stages[0]]
            if active:start=None;phase=0;continue
            if start is None:start=i
            if phase==255:
                total=sum(bits[j]*(256-abs(255-(i-j))) for j in range(max(start,i-510),i+1))
                self.assertEqual(reference[i][1],min(255,total>>8))
                self.assertEqual(reference[i][2],1)
            else:self.assertEqual(reference[i][2],0)
            phase=(phase+1)%256
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            A.replay_files(folder,bits,resets)
            simcells='/foss/tools/yosys/share/yosys/simcells.v'
            (folder/'ir-replay.v').write_text(A.logic_ir_verilog(A.schematic('sdm8_filter')))
            for sources in ([A.RTL],[simcells,A.GATE_RTL],[folder/'ir-replay.v']):
                compiled=subprocess.run(['iverilog','-g2012','-s','replay','-o','replay.vvp',*map(str,sources),'replay.v'],cwd=folder,capture_output=True,text=True)
                self.assertEqual(compiled.returncode,0,compiled.stderr)
                subprocess.run(['vvp','replay.vvp'],cwd=folder,check=True,capture_output=True)
                self.assertEqual(A.read_replay(folder/'replay.csv'),reference)

    def test_known_density_conversion_and_saturation(self):
        for density,expected in [(0,0),(1,1),(64,64),(128,128),(192,192),(255,255),(256,255)]:
            bits=[0]*12;resets=[1]*8+[0]*4;acc=0
            for i in range(2048):
                acc+=density;bit=int(acc>=256);acc-=bit*256
                bits.append(bit);resets.append(0)
            output=[c for i,c,v in A.cic_reference(bits,resets) if v][2:]
            self.assertTrue(output)
            self.assertEqual(set(output),{expected})

    def test_duration_bounds_do_not_expand_other_circuits(self):
        with self.assertRaises(EDAError):native.testbench(A.DEFAULT_SETTINGS)
        self.assertEqual(A.settings(A.DEFAULT_SETTINGS)['step_s'],125e-9)
        for settings in ({'duration_s':.021},{'step_s':126e-9},{'duration_s':.02,'step_s':1e-9},{'analysis':'op'},{'supply_V':1.2}):
            with self.assertRaises(EDAError):A.settings({**A.DEFAULT_SETTINGS,**settings})

    def test_input_range_unit_conversions(self):
        self.assertAlmostEqual(1e6/256,3906.25)
        self.assertAlmostEqual(1.8/256,7.03125e-3)
        for values in ({'input_V':.9,'sine_amplitude_V':1.,'sine_frequency_Hz':60.}, {'input_V':.9,'sine_amplitude_V':.5,'sine_frequency_Hz':2000.}):
            with self.assertRaises(EDAError):A.parameters('sigma_delta8',values)

    def test_digital_electrical_edits_never_use_stale_rtl(self):
        p={'schematic':A.schematic('sigma_delta8'),'design_template':{'id':'sigma_delta8'}}
        p['schematic']['cells']['DFF']['devices'][0]['parameters']['dc']=1
        with self.assertRaises(EDAError) as ctx:A.simulation_core(p)
        self.assertEqual(ctx.exception.code,'ADC_RTL_MISMATCH')
        p={'schematic':A.schematic('sigma_delta8'),'design_template':{'id':'sigma_delta8'}}
        p['schematic']['cells']['SDM8_OTA']['devices'][0]['x']+=10
        self.assertTrue(A.simulation_core(p)['devices'])
        p['schematic']['devices'][0]['pins']['VIN']='BAD'
        with self.assertRaises(EDAError):A.simulation_core(p)

    def test_fft_known_signal_and_noncoherent_guard(self):
        import numpy as np
        values=128+60*np.sin(2*np.pi*3*np.arange(64)/64)+.1*np.sin(2*np.pi*11*np.arange(64)/64)
        result=A.spectrum(values,3906.25*3/64,3906.25)
        self.assertAlmostEqual(result['SINAD_dB'],20*np.log10(600),places=5)
        self.assertIsNone(A.spectrum(values,61,3906.25)['ENOB_bits'])
        self.assertIsNone(A.spectrum([128]*64,3906.25*3/64,3906.25)['ENOB_bits'])

if __name__=='__main__':unittest.main(verbosity=2)
