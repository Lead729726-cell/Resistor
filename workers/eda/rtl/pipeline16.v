// Fourteen 1.5-bit stages and a final two-bit flash. Each stage advances one
// sample clock. Stage i's live thermometer belongs to sample (now-i), flash
// to (now-14). Align all data to the same original sample; preserve bubbles.
module pipeline16_align(input clk,reset,sample_valid,
 input [27:0] stage_codes, input [2:0] flash_therm,
 output reg [15:0] code, output reg valid, output reg error);
 reg [13:0] valid_pipe;
 wire [27:0] aligned;
 genvar s;
 generate for(s=0;s<14;s=s+1)begin:stage_delay
  reg [1:0] delay[0:13-s];
  integer j;
  always @(posedge clk) begin
   if(reset)for(j=0;j<14-s;j=j+1)delay[j]<=0;
   else begin
    delay[0]<=stage_codes[2*s+:2];
    for(j=1;j<14-s;j=j+1)delay[j]<=delay[j-1];
   end
  end
  assign aligned[2*s+:2]=delay[13-s];
 end endgenerate
 reg signed [18:0] sum;
 reg malformed;
 integer i;
 always @* begin
  sum=32766;malformed=0;
  for(i=0;i<14;i=i+1)begin
   case(aligned[2*i+:2])
    2'b00:sum=sum-(19'sd1<<(14-i));
    2'b01:sum=sum;
    2'b11:sum=sum+(19'sd1<<(14-i));
    default:malformed=1;
   endcase
  end
  case(flash_therm)
   3'b000:sum=sum;
   3'b001:sum=sum+1;
   3'b011:sum=sum+2;
   3'b111:sum=sum+3;
   default:malformed=1;
  endcase
 end
 always @(posedge clk)begin
  if(reset)begin valid_pipe<=0;code<=0;valid<=0;error<=0;end
  else begin
   valid_pipe<={valid_pipe[12:0],sample_valid};
   valid<=valid_pipe[13]&&!malformed;error<=valid_pipe[13]&&malformed;
   if(valid_pipe[13]&&!malformed)begin
    if(sum<0)code<=0;
    else if(sum>65535)code<=16'hffff;
    else code<=sum[15:0];
   end
  end
 end
endmodule
