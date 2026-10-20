module replay;
 reg clk=0,reset=1,start=0,comparator=0;wire sample,eval,busy,valid;wire [11:0] trial,code;
 reg decisions[0:12-1];integer f,b,out;
 sar12_controller dut(clk,reset,start,comparator,sample,eval,busy,valid,trial,code);
 task tick;begin #5;clk=1;#5;clk=0;end endtask
 initial begin $readmemb("decisions.mem",decisions);out=$fopen("replay.csv","w");tick;reset=0;
 for(f=0;f<1;f=f+1)begin start=1;tick;start=0;
 $fwrite(out,"%0d acquire %0d %0d %0d %0d\n",f,sample,eval,busy,valid);tick;
 for(b=11;b>=0;b=b-1)begin $fwrite(out,"%0d %0d %0d %0d ",f,b,trial,eval);tick;
 $fwrite(out,"%0d ",eval);comparator=decisions[f*12+11-b];tick;
 $fwrite(out,"%0d %0d %0d %0d\n",code,valid,busy,eval);end
 tick;end $fclose(out);$finish;end endmodule
