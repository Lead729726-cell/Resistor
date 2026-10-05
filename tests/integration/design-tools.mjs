import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const child = spawn('docker', ['exec', '-e', 'REGISTER_DESIGN_NATIVE=1', 'mos-studio-eda', 'python3', '/workspace/workers/eda/test_design_tools.py'], { stdio: 'inherit', windowsHide: true });
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
if (code !== 0) process.exit(code ?? 1);
const evidence = JSON.parse(readFileSync('docs/evidence/design-tools.json', 'utf8'));
if (evidence.passed !== evidence.case_count || evidence.case_count < 22 || evidence.commercial_execution_verified !== false) throw new Error('Design-tools actual evidence is incomplete.');
for (const [path, hash] of Object.entries(evidence.source_sha256)) {
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== hash) throw new Error('Evidence source mismatch: ' + path);
}
console.log(`Actual design tools: ${evidence.passed}/${evidence.case_count} PASS. Canonical evidence hashes match.`);
