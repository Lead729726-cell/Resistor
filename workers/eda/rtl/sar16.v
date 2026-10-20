// 16-bit synchronous SAR. 16 acquisition clocks, one non-overlap clock,
// then one preparation and one evaluation clock per decision. HIGH keeps bit.
module sar16_controller(input clk, reset, start, comparator,
 output reg sample, eval, busy, valid,
 output reg [15:0] trial, code);
 reg acquiring, holding, phase;
 reg [3:0] acquisition, bit_index;
 wire [15:0] accepted = comparator ? trial : (trial & ~(16'b1 << bit_index));
 always @(posedge clk) begin
  if (reset) begin
   sample<=0;eval<=0;busy<=0;valid<=0;trial<=0;code<=0;
   acquiring<=0;holding<=0;phase<=0;acquisition<=0;bit_index<=15;
  end else begin
   valid<=0;
   if (!busy) begin
    if (start) begin
     sample<=1;eval<=0;busy<=1;acquiring<=1;holding<=0;
     acquisition<=0;phase<=0;trial<=0;bit_index<=15;
    end
   end else if (acquiring) begin
    if (acquisition==15) begin sample<=0;acquiring<=0;holding<=1;end
    else acquisition<=acquisition+1'b1;
   end else if (holding) begin holding<=0;trial<=16'h8000;end
   else if (!phase) begin eval<=1;phase<=1;end
   else begin
    eval<=0;phase<=0;
    if (bit_index==0) begin code<=accepted;trial<=accepted;busy<=0;valid<=1;end
    else begin bit_index<=bit_index-1'b1;trial<=accepted | (16'b1 << (bit_index-1'b1));end
   end
  end
 end
endmodule
