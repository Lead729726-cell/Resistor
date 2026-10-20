`timescale 1ns/1ps
module resistor_vector_tb;
reg [0:0] clk;
reg [0:0] rst;
wire [3:0] q;
counter4 dut(.clk(clk),.rst(rst),.q(q));
initial begin
$dumpfile("digital.vcd"); $dumpvars(1,resistor_vector_tb);
clk = 1'h0;
rst = 1'h1;
#10;
clk = 1'h1;
rst = 1'h1;
#10;
if (q !== 4'h0) $fatal(1,"vector 1 output q mismatch or X/Z");
clk = 1'h0;
rst = 1'h0;
#10;
if (q !== 4'h0) $fatal(1,"vector 2 output q mismatch or X/Z");
clk = 1'h1;
rst = 1'h0;
#10;
if (q !== 4'h1) $fatal(1,"vector 3 output q mismatch or X/Z");
clk = 1'h0;
rst = 1'h0;
#10;
if (q !== 4'h1) $fatal(1,"vector 4 output q mismatch or X/Z");
clk = 1'h1;
rst = 1'h0;
#10;
if (q !== 4'h2) $fatal(1,"vector 5 output q mismatch or X/Z");
$display("RESISTOR_VECTOR_COMPLETE checks=5"); $finish;
end
endmodule
