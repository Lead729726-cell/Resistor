import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Historical engine logs may refer to machine-local artifacts. This checks the
// public entry documents against Git candidates, not files left on one machine.
const tracked = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
const documents = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'SECURITY.md', 'docs/open-source.md', 'docs/precision-workbench.md','docs/online-updates.md','docs/analog-soc.md','docs/sar-adc.md','examples/bounded-sar/README.md','examples/analog-soc/README.md',...Array.from(tracked).filter(f=>/^examples\/(?:analog-soc\/soc_[^/]+|bounded-sar\/(?:soc_[^/]+|sar8_analog))\/README\.md$/.test(f))];
const missing = [];
documents.push('docs/oscillator-lab.md','examples/oscillator-lab/README.md',...Array.from(tracked).filter(f=>/^examples\/oscillator-lab\/osc_[^/]+\/README\.md$/.test(f)));
documents.push('docs/literature-update-2026.md');
documents.push('docs/instructor-course.md');
documents.push('docs/hardware-workbench.md', 'docs/hardware-validation.md', 'examples/hardware-validation/README.md','examples/hardware-lab/README.md');
documents.push('docs/sar12.md','docs/sar12-convergence.md','examples/sar12-lab/README.md','examples/sar12-lab/NOTICE.md');
documents.push('docs/paper-signoff-validation.md','examples/paper-signoff/README.md','examples/paper-signoff/THIRD_PARTY.md');
documents.push('docs/adc16-lab.md','examples/adc16-lab/README.md','examples/adc16-lab/NOTICE.md');
documents.push('docs/native-runtime.md','docs/schematic-quickstart.md','docs/gds-schematic-conversion.md','docs/workbench-usability.md');
documents.push('docs/physical-tools.md');
documents.push('docs/logic-composition.md','docs/logic-transient.md');
documents.push('docs/assistant-workbench.md','docs/design-assistant.md','docs/lecture-studio.md','docs/download-editions.md');
documents.push('docs/product-editions.md','docs/website-design.md','docs/industry-layout-review.md','docs/industry-qualification.md','docs/area-selection.md');
documents.push('docs/tutorial-library.md','docs/tutorial-site.md','docs/integrated-design.md');
let checked = 0;
for (const document of documents) {
  const source = readFileSync(document, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].split(/[\s#]/)[0];
    if (!link || /^(?:https?:|mailto:|#)/.test(link)) continue;
    checked++;
    const file = path.posix.normalize(path.posix.join(path.posix.dirname(document), decodeURIComponent(link)));
    const directory=Array.from(tracked).some(candidate=>candidate.startsWith(file.replace(/\/$/,'')+'/'));
    if (!tracked.has(file)&&!directory) missing.push({ document, link });
  }
}
console.log(JSON.stringify({ documents: documents.length, checked, missing }, null, 2));
if (missing.length) process.exitCode = 1;
