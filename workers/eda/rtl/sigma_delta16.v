// Unsigned one-bit input, third-order CIC, R=256, gain=2^24.
// 25-bit modulo arithmetic is exact for the bounded nonnegative FIR output.
// The first two decimated startup words are withheld, not silently discarded.
module sigma_delta16_filter(input clk, reset, bit_in,
 output reg [15:0] code, output reg valid);
 reg [24:0] i1,i2,i3,d1,d2,d3;
 reg [7:0] phase;
 reg [1:0] warmup;
 wire [24:0] n1=i1+bit_in;
 wire [24:0] n2=i2+n1;
 wire [24:0] n3=i3+n2;
 wire [24:0] c1=n3-d1;
 wire [24:0] c2=c1-d2;
 wire [24:0] c3=c2-d3;
 always @(posedge clk) begin
  if(reset) begin
   i1<=0;i2<=0;i3<=0;d1<=0;d2<=0;d3<=0;
   phase<=0;warmup<=0;code<=0;valid<=0;
  end else begin
   i1<=n1;i2<=n2;i3<=n3;phase<=phase+1'b1;valid<=0;
   if(phase==255) begin
    d1<=n3;d2<=c1;d3<=c2;
    if(warmup<2)warmup<=warmup+1'b1;
    else begin code<=c3[24]?16'hffff:c3[23:8];valid<=1;end
   end
  end
 end
endmodule
