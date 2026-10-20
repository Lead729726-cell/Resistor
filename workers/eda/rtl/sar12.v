// Twelve decisions. Each bit has a reset/preparation clock and an evaluation
// clock before it is accepted. Comparator HIGH keeps the current trial bit.
module sar12_controller(input clk,input reset,input start,input comparator,
 output reg sample,output reg eval,output reg busy,output reg valid,
 output reg [11:0] trial,output reg [11:0] code);
 reg acquiring;reg phase;reg [3:0] bit_index;
 wire [11:0] accepted = comparator ? trial : (trial & ~(12'b1 << bit_index));
 always @(posedge clk) begin
   if(reset)begin sample<=0;eval<=0;busy<=0;valid<=0;trial<=0;code<=0;acquiring<=0;phase<=0;bit_index<=11;end
   else begin
     valid<=0;
     if(!busy)begin
       if(start)begin sample<=1;eval<=0;busy<=1;acquiring<=1;phase<=0;trial<=0;bit_index<=11;end
     end else if(acquiring)begin sample<=0;eval<=0;acquiring<=0;phase<=0;trial<=12'h800;end
     else if(!phase)begin eval<=1;phase<=1;end
     else begin
       eval<=0;phase<=0;
       if(bit_index==0)begin code<=accepted;trial<=accepted;busy<=0;valid<=1;end
       else begin bit_index<=bit_index-1'b1;trial<=accepted | (12'b1 << (bit_index-1'b1));end
     end
   end
 end
endmodule
