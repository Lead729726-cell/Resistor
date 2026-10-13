"""Locate installed public tool data without tying the engine to an image."""
import os
import shutil
import sys
from pathlib import Path


def installed_file(variable, relative, legacy):
    if os.environ.get(variable):
        return Path(os.environ[variable])
    for command in ('yosys', 'xschem'):
        executable = shutil.which(command)
        if executable:
            root = Path(executable).resolve().parent.parent
            candidate = root / relative
            if candidate.exists():
                return candidate
    for root in (Path('/opt/homebrew'), Path('/usr/local'), Path('/usr')):
        candidate = root / relative
        if candidate.exists():
            return candidate
    return Path(legacy)


def yosys_simcells():
    return installed_file('YOSYS_SIMCELLS', 'share/yosys/simcells.v', '/foss/tools/yosys/share/yosys/simcells.v')


def xschem_share():
    return installed_file('XSCHEM_SHARE', 'share/xschem', '/foss/tools/xschem/share/xschem')


def engine_files():
    """Fingerprint the actual interpreter, executables and loadable modules."""
    paths = [Path(sys.executable), yosys_simcells()]
    for name in ('magic', 'ngspice', 'netgen', 'yosys', 'iverilog', 'vvp'):
        executable = shutil.which(name)
        if executable:
            paths.append(Path(executable))
            prefix = Path(executable).resolve().parent.parent
            for library in ('lib/magic/tcl', 'lib/netgen/tcl'):
                for pattern in ('*.so', '*.dylib', '*.dll', '*exec', 'magicdnull'):
                    paths.extend((prefix / library).glob(pattern))
    import klayout
    root = Path(klayout.__file__).parent
    for pattern in ('*core*.so', '*core*.pyd', '*core*.dll', '*core*.dylib'):
        paths.extend(root.glob(pattern))
    return sorted(set(p for p in paths if p.is_file()))
