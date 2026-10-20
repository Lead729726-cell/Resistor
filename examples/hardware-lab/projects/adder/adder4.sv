module adder4(input logic [3:0] a, b, output logic [4:0] sum);
  always_comb sum = {1'b0,a} + {1'b0,b};
endmodule
