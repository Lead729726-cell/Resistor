library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity vhdl_adder is
  port(a,b: in std_logic_vector(3 downto 0); sum: out std_logic_vector(4 downto 0));
end entity;
architecture rtl of vhdl_adder is begin
  sum <= std_logic_vector(resize(unsigned(a),5) + resize(unsigned(b),5));
end architecture;
