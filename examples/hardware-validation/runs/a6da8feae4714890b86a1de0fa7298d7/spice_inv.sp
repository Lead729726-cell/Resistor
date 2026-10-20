.subckt spice_inv A Y VPWR VGND
XMP Y A VPWR VPWR sky130_fd_pr__pfet_01v8_hvt w=0.65 l=0.15
XMN Y A VGND VGND sky130_fd_pr__nfet_01v8 w=0.65 l=0.15
.ends spice_inv
