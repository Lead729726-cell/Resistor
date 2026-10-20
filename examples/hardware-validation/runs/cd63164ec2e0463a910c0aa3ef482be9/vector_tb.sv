`timescale 1ns/1ps
module resistor_vector_tb;
reg [0:0] a;
wire [0:0] y;
observe dut(.a(a),.y(y));
initial begin
$dumpfile("digital.vcd"); $dumpvars(1,resistor_vector_tb);
a = 1'h0;
#10;
a = 1'h1;
#10;
$display("RESISTOR_VECTOR_COMPLETE checks=0"); $finish;
end
endmodule
