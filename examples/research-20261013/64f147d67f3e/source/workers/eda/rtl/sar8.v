// Clocked 8-bit SAR controller. Comparator HIGH keeps the current trial bit.
// One acquisition clock, eight decision clocks; start is ignored while busy.
module sar8_controller(input clk,input reset,input start,input comparator,
 output reg sample,output reg busy,output reg valid,
 output reg [7:0] trial,output reg [7:0] code);
 reg acquiring;reg [2:0] bit_index;
 wire [7:0] accepted = comparator ? trial : (trial & ~(8'b1 << bit_index));
 always @(posedge clk) begin
   if(reset)begin sample<=0;busy<=0;valid<=0;trial<=0;code<=0;acquiring<=0;bit_index<=7;end
   else begin
     valid<=0;
     if(!busy)begin
       if(start)begin sample<=1;busy<=1;acquiring<=1;trial<=0;bit_index<=7;end
     end else if(acquiring)begin sample<=0;acquiring<=0;trial<=8'h80;end
     else if(bit_index==0)begin code<=accepted;trial<=accepted;busy<=0;valid<=1;end
     else begin bit_index<=bit_index-1'b1;trial<=accepted | (8'b1 << (bit_index-1'b1));end
   end
 end
endmodule
