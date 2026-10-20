import copy,itertools,unittest
import c_hardware,hdl_workbench as H,digital_units as D,hierarchy_transfer as T
from geometry import EDAError

def spec(text='module top(input a,output y);assign y=~a;endmodule',language='verilog',name='top.v'):
    return {'top':'top','files':[{'name':name,'language':language,'text':text}],'vectors':[{'inputs':{'a':'0'},'expect':{'y':'1'}}],'step_ns':10}

class HardwareTests(unittest.TestCase):
    def test_validation_is_canonical_and_preserves_sources(self):
        source=spec();before=copy.deepcopy(source);one=H.validate(source)
        self.assertEqual(one,H.validate(one));self.assertEqual(source,before);self.assertEqual(one['files'],source['files']);self.assertEqual(one['chip_limits']['width_um'],1000)
    def test_paths_duplicates_extensions_and_size_rejected(self):
        for name in ('../top.v','/tmp/top.v','top.v;exec','top.txt','top..v','gates.v','VECTOR_TB.sv'):
            s=spec();s['files'][0]['name']=name
            with self.assertRaises(EDAError):H.validate(s)
        s=spec();s['files']+=copy.deepcopy(s['files'])
        with self.assertRaises(EDAError):H.validate(s)
        s=spec('a'*1048577)
        with self.assertRaises(EDAError):H.validate(s)
    def test_filesystem_and_execution_tasks_rejected(self):
        for text in ('`include "/etc/passwd"','initial $system("bad");','initial $readmemh("/etc/passwd",ram);','initial $readmemh(filename,ram);','initial $fopen("x");'):
            with self.assertRaises(EDAError):H.validate(spec(text))
        for text in ('file secret: text open read_mode is "/etc/passwd";','attribute foreign of top : entity is "x";'):
            with self.assertRaises(EDAError):H.validate(spec(text,'vhdl','top.vhd'))
    def test_local_memory_and_harmless_comments(self):
        s=spec('// $system is not executed\nmodule top; reg [7:0] ram[0:2];initial $readmemh("local.mem",ram);endmodule');s['files'].append({'name':'local.mem','language':'data','text':'01\n02\n03\n'})
        self.assertEqual(len(H.validate(s)['files']),2)
    def test_wide_inputs_preserve_exact_strings(self):
        s=spec();s['vectors'][0]['inputs']['a']='340282366920938463463374607431768211455';self.assertEqual(H.validate(s)['vectors'],s['vectors'])
        for value in (1,True,'-1','1e3','0xz','nan'):
            s=spec();s['vectors'][0]['inputs']['a']=value
            with self.assertRaises(EDAError):H.validate(s)
    def test_bad_step_and_unknown_options_rejected(self):
        for value in (0,-1,float('nan'),float('inf'),True,10001):
            s=spec();s['step_ns']=value
            with self.assertRaises(EDAError):H.validate(s)
        s=spec();s['shell']='bad'
        with self.assertRaises(EDAError):H.validate(s)
    def test_vcd_four_state_and_exact_timescale(self):
        t=H.parse_vcd('$timescale\n 10 ps\n$end\n$var wire 4 ! q [3:0] $end\n$enddefinitions $end\n#0\nbxxxx !\n#5\nb1010 !\n#9\nbzzzz !\n')
        self.assertEqual(t[0]['width'],4);self.assertEqual([p[1]for p in t[0]['events']],['xxxx','1010','zzzz']);self.assertAlmostEqual(t[0]['events'][1][0],50e-12)
    def test_vcd_end_time_preserves_last_constant_interval(self):
        t=H.parse_vcd('$timescale 1 ns $end\n$var wire 1 ! y $end\n$enddefinitions $end\n#0\n0!\n#30\n1!\n#40\n')
        self.assertEqual([p[1]for p in t[0]['events']],['0','1']);self.assertAlmostEqual(t[0]['events'][1][0],30e-9);self.assertAlmostEqual(t[0]['end_s'],40e-9)
    def test_c_explicit_width_if_else_and_source_retention(self):
        text='#include <stdint.h>\nuint32_t top(uint32_t a,uint32_t b){uint32_t y=a+b;if(a!=0u)y=a^b;else y=~b;return y;}'
        r=c_hardware.lower(text,'top');self.assertEqual(r['inputs'],['a','b']);self.assertIn('[31:0]',r['verilog']);self.assertIn('?',r['verilog']);self.assertIn('if(a!=0u)',r['c_source'])
    def test_c_unsafe_or_ambiguous_semantics_rejected(self):
        for body in ('return a+1;','return a/2u;','return a<<32u;','return a<<a;','while(a) a=a-1u;return a;','return helper(a);','static uint32_t x=0u;return x;','uint32_t x;return x;','return *(uint32_t*)a;'):
            with self.assertRaises(EDAError):c_hardware.lower('uint32_t top(uint32_t a){'+body+'}','top')
    def test_c_no_headers_globals_or_signed_types(self):
        for text in ('#include <stdio.h>\nuint32_t top(uint32_t a){return a;}','uint32_t g; uint32_t top(uint32_t a){return a;}','int top(int a){return a;}'):
            with self.assertRaises(EDAError):c_hardware.lower(text,'top')
    def test_c_octal_has_c_semantics(self):
        self.assertIn("32'd10",c_hardware.lower('uint32_t top(uint32_t a){return a+012u;}','top')['verilog'])
    def test_unknown_cells_and_constants_never_become_zero(self):
        mod={'ports':{'a':{'direction':'input','bits':[2]},'y':{'direction':'output','bits':['x']}},'cells':{}}
        with self.assertRaises(EDAError):H.yosys_ir({'modules':{'top':mod}},'top')
        mod['ports']['y']['bits']=[3];mod['cells']={'u':{'type':'unsupported','connections':{}}}
        with self.assertRaises(EDAError):H.yosys_ir({'modules':{'top':mod}},'top')
    def test_ascending_and_offset_bus_indices_preserved(self):
        ports={'a':{'direction':'input','bits':[2,3,4,5],'offset':4,'upto':1},'y':{'direction':'output','bits':[2,3,4,5],'offset':8}}
        ir,mapping=H.yosys_ir({'modules':{'top':{'ports':ports,'cells':{}}}},'top')
        self.assertEqual(mapping['a'],['a_7','a_6','a_5','a_4']);self.assertEqual(mapping['y'],['y_8','y_9','y_10','y_11']);self.assertEqual(ir['devices'][0]['pins']['A'],'a_7')
        self.assertEqual(ir['devices'][0]['pin_roles']['Y'],'output')
    def test_hierarchy_port_directions_come_from_compiler_metadata(self):
        p={'ports':['strange_name','wire_4','VPWR','VGND'],'hdl_implementation':{'ports':{'drive':{'direction':'input'},'result':{'direction':'output'}},'port_mapping':{'drive':['strange_name'],'result':['wire_4']}}}
        self.assertEqual(T.hdl_pin_roles(p),{'strange_name':'input','wire_4':'output','VPWR':'power','VGND':'power'})
        p['ports'].append('NEW_PIN');self.assertIsNone(T.hdl_pin_roles(p))
    def test_all_combinational_cmos_mappings_have_independent_truth_tables(self):
        expectations={'AND':lambda a,b,s:a&b,'NAND':lambda a,b,s:1-(a&b),'OR':lambda a,b,s:a|b,'NOR':lambda a,b,s:1-(a|b),'XOR':lambda a,b,s:a^b,'XNOR':lambda a,b,s:1-(a^b),'MUX':lambda a,b,s:b if s else a}
        for gate,truth in expectations.items():
            con={'A':[2],'B':[3],'Y':[5]};ports={'a':{'direction':'input','bits':[2]},'b':{'direction':'input','bits':[3]},'y':{'direction':'output','bits':[5]}}
            if gate=='MUX':con['S']=[4];ports['s']={'direction':'input','bits':[4]}
            ir,_=H.yosys_ir({'modules':{'top':{'ports':ports,'cells':{'u':{'type':'$_'+gate+'_','connections':con}}}}},'top');flat=D.flattened(ir)
            for a,b,s in itertools.product((0,1),repeat=3):
                fixed={'a':a,'b':b,'s':s,'VPWR':1,'VGND':0};state=dict(fixed)
                for _ in range(40):
                    parent={n:n for d in flat['devices'] for n in d['pins'].values()}
                    def root(n):
                        while parent[n]!=n:n=parent[n]
                        return n
                    for d in flat['devices']:
                        p=d['pins'];g=state.get(p['G'])
                        if g==(1 if d['kind']=='nmos' else 0):parent[root(p['D'])]=root(p['S'])
                    power={}
                    for n,v in fixed.items():
                        if n in parent:power.setdefault(root(n),set()).add(v)
                    after={n:next(iter(power[root(n)])) for n in parent if len(power.get(root(n),set()))==1}
                    if after==state:break
                    state=after
                self.assertEqual(state.get('y'),truth(a,b,s),(gate,a,b,s))

if __name__=='__main__':unittest.main()
