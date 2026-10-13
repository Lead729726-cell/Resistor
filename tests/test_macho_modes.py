import importlib.util,struct,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('mac_archive',Path(__file__).resolve().parents[1]/'scripts/verify-mac-archive.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class MachOModes(unittest.TestCase):
    def header(self,kind):return struct.pack('<8I',0xfeedfacf,0x100000c,0,kind,0,0,0,0)
    def test_loadable_libraries_do_not_need_execute_bits(self):
        for kind in (6,8):module.verify_macho_mode(self.header(kind),0o100644,'library')
    def test_program_requires_execute_bit(self):
        module.verify_macho_mode(self.header(2),0o100755,'python')
        with self.assertRaises(AssertionError):module.verify_macho_mode(self.header(2),0o100644,'python')
    def test_unreadable_library_is_rejected(self):
        with self.assertRaises(AssertionError):module.verify_macho_mode(self.header(6),0o100000,'library')
if __name__=='__main__':unittest.main()
