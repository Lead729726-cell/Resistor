module qa;
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
$display("SAR12_LOGIC_COMPLETE %0d",count);$finish;end endmodule
