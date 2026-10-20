`timescale 1ns/1ps
module resistor_vector_tb;
reg [31:0] a;
reg [31:0] b;
reg [31:0] sel;
wire [31:0] result;
c_alu dut(.a(a),.b(b),.sel(sel),.result(result));
initial begin
$dumpfile("digital.vcd"); $dumpvars(1,resistor_vector_tb);
a = 32'hf;
b = 32'h2;
sel = 32'h0;
#10;
if (result !== 32'h1) $fatal(1,"vector 0 output result mismatch or X/Z");
a = 32'hf;
b = 32'h2;
sel = 32'h1;
#10;
if (result !== 32'hd) $fatal(1,"vector 1 output result mismatch or X/Z");
a = 32'hffffffff;
b = 32'h1;
sel = 32'h0;
#10;
if (result !== 32'h0) $fatal(1,"vector 2 output result mismatch or X/Z");
a = 32'ha;
b = 32'h5;
sel = 32'h1;
#10;
if (result !== 32'hf) $fatal(1,"vector 3 output result mismatch or X/Z");
$display("RESISTOR_VECTOR_COMPLETE checks=4"); $finish;
end
endmodule
