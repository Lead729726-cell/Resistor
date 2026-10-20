"""Exhaustive synchronous logic checks, independent of the MOS ADC bridge."""
import hashlib,json,re,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'workers/eda'))
import sar12 as A,runtime_resources
folder=ROOT/'.runtime/sar12/controller-qa';folder.mkdir(parents=True,exist_ok=True)
(folder/'ir.v').write_text(A.controller_ir_verilog())
tb=r'''module qa;
reg clk=0,reset=1,start=0,comparator=0;wire sample,eval,busy,valid;wire [11:0] trial,code;
integer vin,b,expected,accepted,prior,count=0;
sar12_controller dut(clk,reset,start,comparator,sample,eval,busy,valid,trial,code);
task tick;begin #5;clk=1;#5;clk=0;end endtask
task check(input ok);begin if(ok !== 1'b1)$fatal(1,"SAR12 logic assertion vin=%0d bit=%0d trial=%0d code=%0d",vin,b,trial,code);count=count+1;end endtask
initial begin tick;check(!sample&&!eval&&!busy&&!valid&&trial==0&&code==0);reset=0;prior=0;
for(vin=0;vin<4096;vin=vin+1)begin
 start=1;tick;check(sample&&!eval&&busy&&!valid&&trial==0&&code==prior);
 // START held high during BUSY must not restart acquisition.
 tick;check(!sample&&!eval&&busy&&!valid&&trial==2048);expected=2048;
 for(b=11;b>=0;b=b-1)begin
  check(trial==expected&&!eval);tick;
  check(eval&&busy&&!valid&&!sample&&trial==expected&&code==prior);
  comparator=(vin>=expected);
`ifdef FAULT_X_COMPARE
  if(vin==100 && b==3)comparator=1'bx;
`endif
  accepted=comparator?expected:(expected&~(1<<b));tick;
  if(b==0)begin check(valid&&!busy&&!eval&&!sample&&code==vin&&trial==vin);prior=vin;end
  else begin expected=accepted|(1<<(b-1));check(!valid&&busy&&!sample&&!eval&&code==prior&&trial==expected);end
 end
 start=0;tick;check(!valid&&!busy&&!eval&&code==prior);
end
// Synchronous reset aborts acquisition, prepare and evaluate, even with START.
for(b=0;b<3;b=b+1)begin
 start=1;tick;if(b>0)tick;if(b>1)tick;reset=1;tick;
 check(!sample&&!eval&&!busy&&!valid&&trial==0&&code==0);
 reset=0;start=0;tick;check(!busy&&!valid&&!eval&&code==0);
end
$display("SAR12_LOGIC_COMPLETE %0d",count);$finish;end endmodule'''
(folder/'qa.v').write_text(tb+'\n');reports=[]
for name,sources in [('rtl',[A.RTL]),('gate',[runtime_resources.yosys_simcells(),A.GATE]),('editable_ir',[folder/'ir.v'])]:
    output=''
    for args in [['iverilog','-g2012','-s','qa','-o',str(folder/(name+'.vvp')),*map(str,sources),str(folder/'qa.v')],['vvp',str(folder/(name+'.vvp'))]]:
        r=subprocess.run(args,cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60);output+=r.stdout
        if r.returncode:raise RuntimeError(output)
    (folder/(name+'.log')).write_text(output);match=re.search(r'SAR12_LOGIC_COMPLETE (\d+)',output)
    if not match or int(match[1])!=159751:raise RuntimeError(output)
    reports.append(dict(implementation=name,all_codes=4096,assertions=int(match[1]),passed=True))
subprocess.run(['iverilog','-g2012','-DFAULT_X_COMPARE','-s','qa','-o',str(folder/'fault.vvp'),str(A.RTL),str(folder/'qa.v')],cwd=folder,check=True,timeout=60)
fault=subprocess.run(['vvp',str(folder/'fault.vvp')],cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60)
(folder/'fault-x.log').write_text(fault.stdout)
if fault.returncode==0 or 'SAR12 logic assertion' not in fault.stdout:raise RuntimeError('A four-state unknown comparator must fail the independent controller assertions.')
report=dict(schema_version=1,edition='Resistor Indust',reports=reports,scope='Exhaustive synchronous digital oracle only. Not 4096 MOS ADC conversions, transistor timing, analog accuracy or ENOB.')
report['fault_injection']={'unknown_comparator_rejected':True,'returncode':fault.returncode}
report['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir() if p.suffix in ('.v','.log')}
(folder/'evidence.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
