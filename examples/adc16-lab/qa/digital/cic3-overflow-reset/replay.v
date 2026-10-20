module replay;
reg clk=0,reset=1,bit_in=0;wire[15:0]code;wire valid;reg bits[0:22535-1],resets[0:22535-1];integer i,out;
sigma_delta16_filter dut(clk,reset,bit_in,code,valid);
initial begin $readmemb("bits.mem",bits);$readmemb("resets.mem",resets);out=$fopen("codes.csv","w");
for(i=0;i<22535;i=i+1)begin reset=resets[i];bit_in=bits[i];#5;clk=1;#5;clk=0;$fwrite(out,"%0d %0d %0d\n",i,code,valid);end
$fclose(out);$finish;end endmodule