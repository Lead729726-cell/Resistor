// 8-bit output from a one-bit modulator: CIC2, R=256, gain=65536.
// Sample on falling clock edges, after the analog positive-edge bit latch.
module sdm8_reset_sync(input clk,input reset,output reset_internal);
 reg [1:0] stages;
 always @(negedge clk) if(reset)stages<=2'b11;else stages<={stages[0],1'b0};
 assign reset_internal=stages[1];
endmodule

module sdm8_frame_counter(input clk,input reset,output last_sample);
 reg [7:0] phase;
 always @(negedge clk) if(reset)phase<=0;else phase<=phase+1'b1;
 assign last_sample=&phase;
endmodule

module sdm8_cic_integrators(input clk,input reset,input bit_in,output [16:0] next_sum);
 reg [16:0] first,second;
 wire [16:0] next_first=first+bit_in;
 assign next_sum=second+next_first;
 always @(negedge clk) if(reset)begin first<=0;second<=0;end
 else begin first<=next_first;second<=next_sum;end
endmodule

module sdm8_cic_combs(input clk,input reset,input enable,input [16:0] sum,output [16:0] filtered);
 reg [16:0] delay_first,delay_second;
 wire [16:0] difference=sum-delay_first;
 assign filtered=difference-delay_second;
 always @(negedge clk) if(reset)begin delay_first<=0;delay_second<=0;end
 else if(enable)begin delay_first<=sum;delay_second<=difference;end
endmodule

module sdm8_scale_saturate(input [16:0] filtered,output [7:0] code);
 // Floor quantization, 1.8/256 V per code; full-scale 256 saturates to 255.
 assign code=filtered[16]?8'hff:filtered[15:8];
endmodule

module sdm8_output_register(input clk,input reset,input enable,input [7:0] code_in,output reg [7:0] code,output reg valid);
 always @(negedge clk) if(reset)begin code<=0;valid<=0;end
 else begin valid<=enable;if(enable)code<=code_in;end
endmodule

module sigma_delta8_filter(input clk,input reset,input bit_in,output [7:0] code,output valid);
 wire reset_internal,last_sample;wire [16:0] next_sum,filtered;wire [7:0] scaled;
 sdm8_reset_sync control(clk,reset,reset_internal);
 sdm8_frame_counter frame(clk,reset_internal,last_sample);
 sdm8_cic_integrators integrators(clk,reset_internal,bit_in,next_sum);
 sdm8_cic_combs combs(clk,reset_internal,last_sample,next_sum,filtered);
 sdm8_scale_saturate scaler(filtered,scaled);
 sdm8_output_register output_word(clk,reset_internal,last_sample,scaled,code,valid);
endmodule
