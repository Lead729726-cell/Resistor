typedef unsigned int uint32_t;

uint32_t c_alu(uint32_t a, uint32_t b, uint32_t sel) {
  uint32_t y = (a + b) & 15u;
  if (sel != 0u) y = (a ^ b) & 15u;
  return y;
}

#include <stdio.h>
_Static_assert(sizeof(unsigned int)==4,"Host oracle requires 32-bit unsigned int");
int main(void){
printf("%u\n", (unsigned)c_alu(15u,2u,0u));
printf("%u\n", (unsigned)c_alu(15u,2u,1u));
printf("%u\n", (unsigned)c_alu(4294967295u,1u,0u));
printf("%u\n", (unsigned)c_alu(10u,5u,1u));
return 0;}
