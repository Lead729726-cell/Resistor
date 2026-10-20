`timescale 1ns/1ps
module resistor_vector_tb;
reg [1:0] addr;
wire [7:0] data;
rom4 dut(.addr(addr),.data(data));
initial begin
$dumpfile("digital.vcd"); $dumpvars(1,resistor_vector_tb);
addr = 2'h0;
#10;
if (data !== 8'h3) $fatal(1,"vector 0 output data mismatch or X/Z");
addr = 2'h1;
#10;
if (data !== 8'h55) $fatal(1,"vector 1 output data mismatch or X/Z");
addr = 2'h2;
#10;
if (data !== 8'haa) $fatal(1,"vector 2 output data mismatch or X/Z");
addr = 2'h3;
#10;
if (data !== 8'hff) $fatal(1,"vector 3 output data mismatch or X/Z");
$display("RESISTOR_VECTOR_COMPLETE checks=4"); $finish;
end
endmodule
