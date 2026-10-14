#!/bin/sh
# Used only in the app-owned Ubuntu import, before any design engine is attached.
set -eu
test "$(id -u)" = 0 || { echo 'Bootstrap requires the imported Linux root user.'; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates build-essential git curl python3 python3-venv tcl8.6-dev tk8.6-dev libx11-dev libxrender-dev libxext-dev libcairo2-dev libreadline-dev autoconf automake libtool pkg-config ngspice yosys iverilog xschem
if ! id resistor >/dev/null 2>&1; then useradd --create-home --shell /bin/bash resistor; fi
# The engine user has no sudo grant, password or automatic access to other editions.
printf '[user]\ndefault=resistor\n[interop]\nappendWindowsPath=false\n' > /etc/wsl.conf
