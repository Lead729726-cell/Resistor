module replay;
reg clk=0,reset=1,start=0,comparator=0;wire sample,eval,busy,valid;wire [15:0] trial,code;
reg decisions[0:8384-1];reg[15:0] expected[0:524-1];integer f,b,k,out;
sar16_controller dut(clk,reset,start,comparator,sample,eval,busy,valid,trial,code);
task tick;begin #5;clk=1;#5;clk=0;end endtask
initial begin $readmemb("decisions.mem",decisions);$readmemb("expected.mem",expected);out=$fopen("codes.csv","w");tick;reset=0;
for(f=0;f<524;f=f+1)begin
start=1;tick;start=0;if({sample,eval,busy,valid}!==4'b1010)$fatal(1,"acquisition entry");
for(k=0;k<16;k=k+1)begin tick;if(sample!==(k<15))$fatal(1,"acquisition clocks");end
tick;if(trial!==16'h8000||sample!==0||eval!==0)$fatal(1,"nonoverlap/trial");
for(b=15;b>=0;b=b-1)begin tick;if(eval!==1)$fatal(1,"evaluation");comparator=decisions[16*f+15-b];tick;end
if(valid!==1||code!==expected[f]||busy!==0)$fatal(1,"native SAR code replay");
$fwrite(out,"%0d %0d\n",f,code);tick;end $fclose(out);$finish;end endmodule