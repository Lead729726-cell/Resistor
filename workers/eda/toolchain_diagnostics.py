"""Bounded probes with retryable failures; version checks do not certify jobs."""
import copy
import re
import shutil
import subprocess
import threading
import time

COMMANDS = (
    ('ngspice', ('ngspice', '--version')),
    ('KLayout', ('python3', '-c', 'import klayout.db as k; print(k.__version__)')),
    ('Magic', ('magic', '--version')),
    ('Netgen', ('netgen', '-batch')),
    ('Xschem', ('xschem', '--version')),
)


class ToolchainDiagnostics:
    def __init__(self, runner=subprocess.run, which=shutil.which, clock=time.monotonic,
                 commands=COMMANDS, success_ttl=300, failure_ttl=15):
        self.runner, self.which, self.clock = runner, which, clock
        self.commands, self.success_ttl, self.failure_ttl = commands, success_ttl, failure_ttl
        self.cache = {}
        self.lock = threading.Lock()

    def inspect(self, refresh=False):
        with self.lock:
            for name, command in self.commands:
                previous = self.cache.get(name)
                ttl = self.success_ttl if previous and previous[1]['available'] else self.failure_ttl
                if not refresh and previous and self.clock() - previous[0] < ttl:
                    continue
                path = self.which(command[0])
                row = {'name': name, 'path': path, 'version': 'unknown', 'available': False}
                if not path:
                    row.update(probe_status='missing', reason=f'{command[0]} was not found on the worker PATH.')
                else:
                    try:
                        output = self.runner(list(command), text=True, stdout=subprocess.PIPE,
                                             stderr=subprocess.STDOUT, timeout=10)
                        lines = [line.strip() for line in output.stdout.splitlines() if line.strip()]
                        version = next((line for line in lines if re.search(r'\d+\.\d+', line)),
                                       lines[0] if lines else 'unknown')
                        if output.returncode == 0:
                            row.update(version=version, available=True, probe_status='ready')
                        else:
                            row.update(probe_status='failed', reason=f'Version probe exited {output.returncode}: {output.stdout[-500:]}')
                    except subprocess.TimeoutExpired:
                        row.update(probe_status='timeout', reason='Version probe exceeded 10s. Executable found; retry diagnosis after worker load decreases.')
                    except OSError as error:
                        row.update(probe_status='failed', reason=str(error))
                self.cache[name] = (self.clock(), row)
            return [copy.deepcopy(self.cache[name][1]) for name, _ in self.commands]
