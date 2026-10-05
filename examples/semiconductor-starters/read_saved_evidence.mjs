// Read only the project created through the live UI. Never create or run a design here.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runtimeConfig, workerRpc } from '../../scripts/runtime.mjs';

const root = process.cwd(), out = path.join(root, 'examples/semiconductor-starters');
const config = await runtimeConfig(root);
const response = await workerRpc(config, 'project.snapshot', { project_id: '67f6658d2cd64f5c870147647f3080e6' });
if (!response.ok) throw new Error(response.error.message);
const project = response.result, run = project.runs.find(item => item.id === 'eb3e3de8ca09457097ab7451a4ad794c');
if (project.semiconductor_starter?.id !== 'mux4_reference' || project.semiconductor_starter.mode !== 'slow_hot') throw new Error('Wrong starter project');
if (project.testbench.corner !== 'ss' || project.testbench.temperature_C !== 125 || project.testbench.supply_V !== 1.62 || project.testbench.load_F !== 50e-15 || project.testbench.step_s !== 50e-12) throw new Error('Saved conditions changed');
if (!run || run.execution_status !== 'completed' || run.analysis_result !== 'pass' || run.digital_verification.passed_cases !== 64) throw new Error('Actual MUX analysis failed');
const projectSetup = { id: project.id, name: project.name, cell: project.cell, pdk: project.pdk, revision: project.revision, testbench: project.testbench, semiconductor_starter: project.semiconductor_starter, schematic: project.schematic };
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'saved-project.json'), JSON.stringify(projectSetup, null, 2));
const summary = structuredClone(run);
delete summary.waveforms; delete summary.current_flow;
await writeFile(path.join(out, 'actual-run.json'), JSON.stringify(summary, null, 2));
await writeFile(path.join(out, 'actual-truth-table.json'), JSON.stringify(run.digital_verification, null, 2));
const records = {};
for (const [name, nativePath] of Object.entries({ manifest: run.manifest_path, testbench: run.artifacts.testbench, reference: run.artifacts.reference_netlist, stdout: run.artifacts.stdout })) {
  if (!nativePath.startsWith('/workspace/')) throw new Error('Artifact is outside the workspace');
  const bytes = await readFile(path.join(root, nativePath.slice('/workspace/'.length)));
  const filename = path.basename(nativePath);
  await writeFile(path.join(out, filename), bytes);
  records[name] = { file: filename, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await writeFile(path.join(out, 'artifact-receipt.json'), JSON.stringify({ read_at: new Date().toISOString(), project_id: project.id, run_id: run.id, actual_conditions: project.testbench, passed_cases: 64, artifacts: records }, null, 2));
console.log('Saved live-UI project: SS / 125C / 1.62V / 50fF, actual MUX 64/64 PASS.');
