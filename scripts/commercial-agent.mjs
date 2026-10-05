import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = process.argv.slice(2);
const requestedPython = process.env.REGISTER_AGENT_PYTHON;
const candidates = requestedPython ? [[requestedPython, []]] : process.platform === 'win32'
  ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]];
let selected;
for (const [command, prefix] of candidates) {
  const check = spawnSync(command, [...prefix, '-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'],
    { windowsHide: true, stdio: 'ignore', timeout: 5000 });
  if (check.status === 0) { selected = [command, prefix]; break; }
}
if (!selected) throw new Error('Python 3.10+ is required on the installed EDA host. Set REGISTER_AGENT_PYTHON to its executable path.');
const child = spawn(selected[0], [...selected[1], path.join(root, 'platform/commercial/agent.py'), ...options],
  { cwd: root, stdio: 'inherit', windowsHide: true, shell: false });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
