import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from spice_inputs import prepare, SpiceInputError


class SpiceInputPaths(unittest.TestCase):
    def test_unicode_space_workspace_uses_ascii_relative_argv_and_unchanged_sources(self):
        with tempfile.TemporaryDirectory(prefix='design 공간 Ω-') as root:
            folder = Path(root); models=folder/'공정 models'; models.mkdir()
            model=models/'저항 library.spice'; model.write_text('.lib tt\n.param resistance=10000\n.endl tt\n',encoding='utf-8')
            circuit=folder/'회로.spice'; circuit.write_text(f'.lib "{model.as_posix()}" tt\nR1 IN OUT resistance\nR2 OUT 0 resistance\n',encoding='utf-8')
            deck=folder/'testbench.spice'; deck.write_text(f'Title\n.include "{circuit.as_posix()}"\nV1 IN 0 1.8\n.control\nop\nwrdata result.dat v(OUT)\nquit\n.endc\n.end\n',encoding='utf-8')
            before={p:p.read_bytes() for p in (model,circuit,deck)}
            command,provenance=prepare(folder,['ngspice','-b',str(deck)])
            self.assertEqual(command[:2],['ngspice','-b']);self.assertTrue(command[2].isascii());self.assertFalse(Path(command[2]).is_absolute())
            self.assertEqual(len(provenance['files']),3)
            for item in provenance['files']:
                self.assertEqual(item['source_sha256'],hashlib.sha256(before[Path(item['source'])]).hexdigest())
                copied=(folder/item['execution_file']).read_text(encoding='utf-8');self.assertNotIn(root,copied)
            self.assertEqual(before,{p:p.read_bytes() for p in before})
            self.assertIn('.lib tt', (folder/next(x['execution_file'] for x in provenance['files'] if x['source']==str(model))).read_text())

    def test_nested_relative_dependencies_and_controller_are_preserved(self):
        with tempfile.TemporaryDirectory(prefix='설계-') as root:
            folder=Path(root); model=folder/'model'; model.mkdir();(model/'leaf.spice').write_text('.param r=1000\n')
            (model/'library.spice').write_text('.include "leaf.spice"\n')
            circuit=folder/'회로.spice';circuit.write_text('.include "model/library.spice"\nR1 A 0 r\n')
            controller=folder/'testbench.spice';controller.write_text('Title\n.control\nsource "'+circuit.as_posix()+'"\nquit\n.endc\n.end\n',encoding='utf-8')
            command,record=prepare(folder,['ngspice','-b',str(controller)])
            self.assertEqual(len(record['files']),4);text=(folder/command[2]).read_text();self.assertIn('source ngspice-input-',text);self.assertNotIn(str(circuit),text)

    def test_missing_input_does_not_run_and_other_tools_are_unchanged(self):
        with tempfile.TemporaryDirectory() as root:
            folder=Path(root);deck=folder/'testbench.spice';deck.write_text('Title\n.include missing.spice\n.end\n')
            with self.assertRaises(SpiceInputError):prepare(folder,['ngspice','-b',str(deck)])
            cmd=['magic','-dnull',str(deck)];self.assertEqual(prepare(folder,cmd),(cmd,None))

    def test_source_title_is_not_a_controller_file_directive(self):
        with tempfile.TemporaryDirectory() as root:
            folder=Path(root);deck=folder/'testbench.spice';original='Source controlled divider\nV1 A 0 1\nR1 A 0 1000\n.end\n';deck.write_text(original)
            argv,_=prepare(folder,['ngspice','-b',str(deck)])
            self.assertEqual((folder/argv[2]).read_text(),original)

    def test_source_switch_element_outside_control_is_not_rewritten(self):
        for position in ('before', 'after'):
            with self.subTest(position=position), tempfile.TemporaryDirectory(prefix='설계-') as root:
                folder=Path(root)
                (folder/'models.spice').write_text('.model SWMODEL sw(ron=1 roff=1e9 vt=.5 vh=.1)\n')
                (folder/'corners.spice').write_text('.lib tt\n.param r=1000\n.endl tt\n')
                circuit=folder/'회로.spice';circuit.write_text('Loaded circuit\nV1 A 0 1\nR1 A 0 1000\n.end\n')
                switch='source OUT 0 CTRL 0 SWMODEL\n'
                control=f'.control\nsource "{circuit.as_posix()}"\n.endc\n'
                original='Switch circuit\n.include "models.spice"\n.lib "corners.spice" tt\n'+(switch+control if position=='before' else control+switch)+'.end\n'
                deck=folder/'testbench.spice';deck.write_text(original,encoding='utf-8')
                argv,record=prepare(folder,['ngspice','-b',str(deck)])
                output=(folder/argv[2]).read_text(encoding='utf-8')
                self.assertEqual(len(record['files']),4)
                self.assertIn(switch,output)
                self.assertIn('.control\nsource ngspice-input-',output)
                self.assertRegex(output,r'\.include "ngspice-input-[^\"]+"')
                self.assertRegex(output,r'\.lib "ngspice-input-[^\"]+" tt')
                self.assertEqual(deck.read_text(encoding='utf-8'),original)

    @unittest.skipUnless(os.environ.get('RESISTOR_TEST_NGSPICE') or shutil.which('ngspice'),'Actual ngspice executable is required')
    def test_actual_ngspice_divider_in_unicode_cwd(self):
        executable=os.environ.get('RESISTOR_TEST_NGSPICE') or shutil.which('ngspice')
        with tempfile.TemporaryDirectory(prefix='design 공간 Ω-') as root:
            folder=Path(root); circuit=folder/'회로.spice';circuit.write_text('R1 IN OUT 10000\nR2 OUT 0 10000\n',encoding='utf-8')
            deck=folder/'testbench.spice';deck.write_text(f'Actual Unicode workspace divider\n.include "{circuit.as_posix()}"\nV1 IN 0 1.8\n.control\nop\nset wr_singlescale\nwrdata result.dat v(OUT) i(V1)\nquit\n.endc\n.end\n',encoding='utf-8')
            command,record=prepare(folder,[executable,'-b',str(deck)])
            self.assertTrue(command[-1].isascii());self.assertEqual(record['original_deck'],str(deck.resolve()))
            completed=subprocess.run(command,cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=20)
            self.assertEqual(completed.returncode,0,completed.stdout.decode(errors='replace'))
            values=[float(v) for v in (folder/'result.dat').read_text().splitlines()[0].split()]
            self.assertAlmostEqual(values[-2],.9,places=8);self.assertAlmostEqual(values[-1],-90e-6,places=10)


if __name__=='__main__':unittest.main()
