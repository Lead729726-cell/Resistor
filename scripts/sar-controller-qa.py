"""Native reset / busy / all-code controller QA independent of SPICE bridge."""
import hashlib,json,subprocess,sys
from pathlib import Path
sys.path.insert(0,'/workspace/workers/eda')
import sar_adc as A
folder=Path('/workspace/.runtime/sar8/controller-qa');folder.mkdir(parents=True,exist_ok=True)
(folder/'ir.v').write_text(A.controller_ir_verilog())
tb=r'''module qa;
reg clk=0,reset=1,start=0,comparator=0;wire sample,busy,valid;wire [7:0] trial,code;
integer vin,bitn,expected,accepted,prior,count=0;
sar8_controller dut(clk,reset,start,comparator,sample,busy,valid,trial,code);
task tick;begin #5;clk=1;#5;clk=0;end endtask
task check(input ok);begin if(!ok)$fatal(1,"SAR assertion failed vin=%0d bit=%0d trial=%0d code=%0d",vin,bitn,trial,code);count=count+1;end endtask
initial begin tick;check(!sample&&!busy&&!valid&&trial==0&&code==0);reset=0;prior=0;
for(vin=0;vin<256;vin=vin+1)begin
 start=1;tick;check(sample&&busy&&!valid&&trial==0&&code==prior);
 // Holding START high throughout conversion must not restart acquisition.
 tick;check(!sample&&busy&&!valid&&trial==128);expected=128;
 for(bitn=7;bitn>=0;bitn=bitn-1)begin
  check(trial==expected);comparator=(vin>=expected);
  accepted=comparator?expected:(expected & ~(1<<bitn));tick;
  if(bitn==0)begin check(valid&&!busy&&!sample&&code==vin&&trial==vin);prior=vin;end
  else begin expected=accepted|(1<<(bitn-1));check(!valid&&busy&&!sample&&code==prior&&trial==expected);end
 end start=0;tick;check(!valid&&!busy&&code==prior);
end
// Abort halfway through a conversion. Reset takes precedence over START.
start=1;tick;tick;comparator=1;tick;reset=1;tick;check(!sample&&!busy&&!valid&&code==0&&trial==0);
reset=0;start=0;tick;check(!busy&&!valid&&code==0);
$display("SAR_CONTROLLER_QA_COMPLETE %0d",count);$finish;end
endmodule'''
(folder/'qa.v').write_text(tb+'\n');reports=[]
for name,sources in [('rtl',[A.RTL]),('gate',[Path('/foss/tools/yosys/share/yosys/simcells.v'),A.GATE]),('cmOS_ir',[folder/'ir.v'])]:
    output=''
    for args in [['iverilog','-g2012','-s','qa','-o',str(folder/(name+'.vvp')),*map(str,sources),str(folder/'qa.v')],['vvp',str(folder/(name+'.vvp'))]]:
        r=subprocess.run(args,cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60);output+=r.stdout
        if r.returncode:raise RuntimeError(output)
    (folder/(name+'.log')).write_text(output)
    if 'SAR_CONTROLLER_QA_COMPLETE 4867' not in output:raise RuntimeError(output)
    reports.append(dict(implementation=name,all_codes=256,assertions=4867,pass_=True))
report=dict(schema_version=1,source='actual Icarus RTL / synthesis / CMOS IR execution',reports=reports,scope='Clocked digital logic, reset priority, busy START ignore, valid pulse, every trial and all 256 codes; no transistor timing.')
report['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir() if p.suffix in ('.v','.log')}
(folder/'evidence.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
