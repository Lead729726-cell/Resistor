import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Historical engine logs may refer to machine-local artifacts. This checks the
// public entry documents against Git candidates, not files left on one machine.
const tracked = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
const documents = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'SECURITY.md', 'docs/open-source.md'];
const missing = [];
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
