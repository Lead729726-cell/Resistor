module counter4(input clk, rst, output reg [3:0] q);
  always @(posedge clk) if(rst) q <= 0; else q <= q + 1;
endmodule
