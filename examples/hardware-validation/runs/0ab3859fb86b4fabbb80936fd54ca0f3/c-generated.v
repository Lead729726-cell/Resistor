module c_alu(input [31:0] a, input [31:0] b, input [31:0] sel, output [31:0] result);
wire [31:0] c_value_1 = (a) + (b);
wire [31:0] c_value_2 = (c_value_1) & (32'd15);
wire [31:0] c_value_3 = (sel) != (32'd0);
wire [31:0] c_value_4 = (a) ^ (b);
wire [31:0] c_value_5 = (c_value_4) & (32'd15);
wire [31:0] c_value_6 = (c_value_3) ? (c_value_5) : (c_value_2);
assign result = c_value_6;
endmodule
