module vhdl_adder
  (input  [3:0] a,
   input  [3:0] b,
   output [4:0] sum);
  wire [4:0] n1_o;
  wire [4:0] n2_o;
  wire [4:0] n3_o;
  assign sum = n3_o;
  /* vhdl_adder.vhd:8:27  */
  assign n1_o = {1'b0, a};  //  uext
  /* vhdl_adder.vhd:8:51  */
  assign n2_o = {1'b0, b};  //  uext
  /* vhdl_adder.vhd:8:49  */
  assign n3_o = n1_o + n2_o;
endmodule

