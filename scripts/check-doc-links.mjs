import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Historical engine logs may refer to machine-local artifacts. This checks the
// public entry documents against Git candidates, not files left on one machine.
const tracked = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
const documents = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'SECURITY.md', 'docs/open-source.md', 'docs/precision-workbench.md','docs/online-updates.md','docs/analog-soc.md','docs/sar-adc.md','examples/bounded-sar/README.md','examples/analog-soc/README.md',...Array.from(tracked).filter(f=>/^examples\/(?:analog-soc\/soc_[^/]+|bounded-sar\/(?:soc_[^/]+|sar8_analog))\/README\.md$/.test(f))];
const missing = [];
documents.push('docs/literature-update-2026.md','docs/edu-study-league.md','docs/edu-learning-workflow.md','docs/edu-inverter-lab.md','docs/edu-self-study.md');
documents.push('docs/native-runtime.md','docs/schematic-quickstart.md','docs/gds-schematic-conversion.md','docs/workbench-usability.md');
documents.push('docs/physical-tools.md');
documents.push('docs/logic-composition.md','docs/logic-transient.md');
documents.push('docs/product-editions.md','docs/website-design.md');
documents.push('docs/tutorial-library.md','docs/tutorial-site.md','docs/integrated-design.md');
let checked = 0;
for (const document of documents) {
  const source = readFileSync(document, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].split(/[\s#]/)[0];
    if (!link || /^(?:https?:|mailto:|#)/.test(link)) continue;
    checked++;
    const file = path.posix.normalize(path.posix.join(path.posix.dirname(document), decodeURIComponent(link)));
    if (!tracked.has(file)) missing.push({ document, link });
  }
}
console.log(JSON.stringify({ documents: documents.length, checked, missing }, null, 2));
if (missing.length) process.exitCode = 1;
