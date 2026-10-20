`timescale 1ns/1ps
module resistor_vector_tb;
reg [0:0] a;
wire [0:0] y;
blif_inv dut(.a(a),.y(y));
initial begin
$dumpfile("digital.vcd"); $dumpvars(1,resistor_vector_tb);
a = 1'h0;
#10;
if (y !== 1'h1) $fatal(1,"vector 0 output y mismatch or X/Z");
a = 1'h1;
#10;
if (y !== 1'h0) $fatal(1,"vector 1 output y mismatch or X/Z");
$display("RESISTOR_VECTOR_COMPLETE checks=2"); $finish;
end
endmodule
