`timescale 1ns/1ps
module resistor_vector_tb;
reg [0:0] a;
wire [3:0] y;
unknown_x dut(.a(a),.y(y));
initial begin
$dumpfile("digital.vcd"); $dumpvars(1,resistor_vector_tb);
a = 1'h0;
#10;
if (y !== 4'h0) $fatal(1,"vector 0 output y mismatch or X/Z");
$display("RESISTOR_VECTOR_COMPLETE checks=1"); $finish;
end
endmodule
