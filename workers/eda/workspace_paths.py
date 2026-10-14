"""Read historical Win/WSL artifact aliases only inside the same workspace."""
from pathlib import Path, PureWindowsPath
import re


def legacy_local_path(value, workspace, runtime_kind):
    if not isinstance(value, str) or any(c in value for c in '\0\r\n'):
        return None
    root = Path(workspace).resolve()
    candidate = None
    if runtime_kind.startswith('wsl-') and re.match(r'^[A-Za-z]:[\\/]', value):
        parts = root.parts
        if len(parts) < 3 or parts[1] != 'mnt' or len(parts[2]) != 1:
            return None
        host = PureWindowsPath(parts[2].upper() + ':\\', *parts[3:])
        try:
            relative = PureWindowsPath(value).relative_to(host)
        except ValueError:
            return None
        candidate = root.joinpath(*relative.parts).resolve()
    elif runtime_kind == 'native-win32' and root.drive:
        match = re.match(r'^/mnt/([A-Za-z])/(.*)$', value)
        if not match:
            return None
        host = PureWindowsPath(match.group(1).upper() + ':\\', *match.group(2).split('/'))
        try:
            relative = host.relative_to(PureWindowsPath(root))
        except ValueError:
            return None
        candidate = root.joinpath(*relative.parts).resolve()
    return str(candidate) if candidate is not None and candidate.is_relative_to(root) else None
