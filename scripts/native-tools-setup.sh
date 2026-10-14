#!/bin/sh
# Run intentionally on the host Mac/Linux or inside an independent Ubuntu WSL.
# No Docker. No user design deletion. Build public tools into a user-owned prefix.
set -eu
prefix="$HOME/.local/share/resistor/tools"
engine="$HOME/.local/share/resistor/engine"
build="$HOME/.local/share/resistor/tool-build"
case "${RESISTOR_SKIP_SYSTEM_PACKAGES:-0}" in 0|1) ;; *) echo 'RESISTOR_SKIP_SYSTEM_PACKAGES must be 0 or 1.'; exit 1;; esac
mkdir -p "$prefix" "$build"
if [ "$(uname -s)" = Darwin ]; then
  command -v brew >/dev/null || { echo 'Install Homebrew from https://brew.sh first.'; exit 1; }
  brew install python@3.13 tcl-tk@8 libx11 libxrender libxext cairo readline autoconf automake libtool pkg-config yosys icarus-verilog ngspice
  tcl_root=$(brew --prefix tcl-tk@8)
  export PKG_CONFIG_PATH="$tcl_root/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
  python="$(brew --prefix python@3.13)/bin/python3.13"
else
  command -v apt-get >/dev/null || { echo 'See docs/native-runtime.md for non-Debian systems.'; exit 1; }
  if [ "${RESISTOR_SKIP_SYSTEM_PACKAGES:-0}" != 1 ]; then
    if [ "$(id -u)" = 0 ]; then elevation=''; else elevation=sudo; fi
    $elevation apt-get update
    $elevation apt-get install -y build-essential git curl python3 python3-venv tcl8.6-dev tk8.6-dev libx11-dev libxrender-dev libxext-dev libcairo2-dev libreadline-dev autoconf automake libtool pkg-config ngspice yosys iverilog xschem
  fi
  tcl_root=/usr
  python=python3
fi
"$python" -m venv "$engine"
"$engine/bin/python3" -m pip install --disable-pip-version-check 'klayout==0.30.5'
build_tool() {
  name=$1
  revision=$2
  folder="$build/$name-$revision"
  if [ ! -d "$folder/.git" ]; then git clone "https://github.com/RTimothyEdwards/$name.git" "$folder"; fi
  cd "$folder"
  # The pinned public commits match the existing verified adapter versions.
  git checkout --detach "$revision"
  if [ "$(uname -s)" = Darwin ]; then
    ./configure --prefix="$prefix" --with-tcl="$tcl_root/lib" --with-tk="$tcl_root/lib" --x-includes="$(brew --prefix libx11)/include" --x-libraries="$(brew --prefix libx11)/lib"
  else ./configure --prefix="$prefix"; fi
  make -j2
  make install
}
build_tool magic 89b27c1bdaf6ee120cd066e03a261890116d5845
build_tool netgen fa39bec8bc85fb639059781b306ade6fe95d2ec6
printf '\nNative tools prepared in %s\n' "$prefix"
printf 'Reconnect the Resistor engine and inspect tool versions. Actual DRC/LVS/PEX results appear only after runs.\n'
