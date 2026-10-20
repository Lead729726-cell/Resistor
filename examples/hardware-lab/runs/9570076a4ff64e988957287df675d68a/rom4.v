module rom4(input [1:0] addr, output [7:0] data);
reg [7:0] rom[0:3];
initial $readmemh("rom.mem",rom);
assign data=rom[addr];
endmodule
