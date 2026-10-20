module replay;
reg clk=0,reset=1,sample_valid=0;reg[27:0]stage_codes;reg[2:0]flash_therm;wire[15:0]code;wire valid,error;
reg[27:0]stages[0:270-1];reg[2:0]flash[0:270-1];reg valids[0:270-1];integer i,out;
pipeline16_align dut(clk,reset,sample_valid,stage_codes,flash_therm,code,valid,error);
initial begin $readmemb("stages.mem",stages);$readmemb("flash.mem",flash);$readmemb("valids.mem",valids);out=$fopen("codes.csv","w");#5;clk=1;#5;clk=0;reset=0;
for(i=0;i<270;i=i+1)begin stage_codes=stages[i];flash_therm=flash[i];sample_valid=valids[i];#5;clk=1;#5;clk=0;$fwrite(out,"%0d %0d %0d %0d\n",i,code,valid,error);end
$fclose(out);$finish;end endmodule