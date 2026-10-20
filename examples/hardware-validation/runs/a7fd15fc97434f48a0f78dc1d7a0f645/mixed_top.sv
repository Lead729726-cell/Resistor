module mixed_top(input [3:0] a,b, output [4:0] y);wire [4:0] sum;vhdl_adder u(a,b,sum);assign y=sum ^ 5'b10101;endmodule
