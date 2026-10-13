"""Start image-owned engine code while preserving the mounted design workspace."""
import os
from pathlib import Path
import shutil
import sys


def seed_missing(source, destination):
    """Existing user adapters and examples always win; never copy runtime data."""
    if destination.is_symlink():
        return
    destination.mkdir(parents=True, exist_ok=True)
    for entry in source.iterdir():
        target = destination / entry.name
        if entry.is_dir():
            if not target.exists():
                shutil.copytree(entry, target)
            elif target.is_dir() and not target.is_symlink():
                seed_missing(entry, target)
        elif not target.exists() and not target.is_symlink():
            # Exclusive creation protects edits made during initialization.
            try:
                with target.open('xb') as output, entry.open('rb') as incoming:
                    shutil.copyfileobj(incoming, output)
            except FileExistsError:
                pass


def main():
    root = Path(__file__).resolve().parents[2]
    if not os.environ.get('MOS_TOKEN'):
        raise SystemExit('[RESISTOR] Start the authenticated design engine from Resistor.')
    workspace = Path(os.environ.get('MOS_WORKSPACE', '/workspace')).resolve()
    try:
        workspace.mkdir(parents=True, exist_ok=True)
        for folder in ('adapters', 'examples/sky130'):
            seed_missing(root / folder, workspace / folder)
        state = Path(os.environ.get('MOS_STATE', str(workspace / '.runtime/eda'))).resolve()
        if not state.is_relative_to(workspace):
            raise ValueError('MOS_STATE must stay within MOS_WORKSPACE')
        state.mkdir(parents=True, exist_ok=True)
    except (OSError, ValueError) as error:
        raise SystemExit(f'[RESISTOR] Design storage is unavailable: {error}. Choose a writable project folder.')
    os.environ['MOS_WORKSPACE'] = str(workspace)
    os.environ['MOS_STATE'] = str(state)
    print('[RESISTOR] Engine code: ' + str(root / 'workers/eda/server.py') + '; design storage: ' + str(workspace), flush=True)
    # runpy also works with Windows embedded Python's deliberately isolated
    # module path, and keeps the owned process identity on every platform.
    import runpy
    sys.path.insert(0,str(root/'workers/eda'))
    runpy.run_path(str(root/'workers/eda/server.py'),run_name='__main__')


if __name__ == '__main__':
    main()
