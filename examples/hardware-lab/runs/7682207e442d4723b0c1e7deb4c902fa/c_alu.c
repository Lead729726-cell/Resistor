#include <stdint.h>
uint32_t c_alu(uint32_t a, uint32_t b, uint32_t sel) {
  uint32_t y = (a + b) & 15u;
  if (sel != 0u) y = (a ^ b) & 15u;
  return y;
}
