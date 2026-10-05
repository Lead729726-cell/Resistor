import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { unzipSync } from 'fflate';

// Reports locations and rule names only. Never print credential contents.
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const issues = [];
let bytes = 0, archives = 0;
const rules = [
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['google-api-key', /\bAIza[A-Za-z0-9_-]{35}\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}\b/g],
  ['credential-literal', /["']?(?:token|api[_-]?key|secret|password|client[_-]?secret)["']?\s*[:=]\s*["'][A-Za-z0-9_+/=-]{32,}["']/gi],
];
function scan(name, data) {
  if (data.includes(0)) return;
  const text = new TextDecoder().decode(data);
  for (const [rule, regex] of rules) {
    for (const match of text.matchAll(regex)) issues.push({ file: name, line: text.slice(0, match.index).split('\n').length, rule });
  }
}
for (const file of files) {
  const size = statSync(file).size;
  bytes += size;
  if (size > 50 * 1024 * 1024) issues.push({ file, rule: 'file-over-50-MiB' });
  if (/(?:^|\/)(?:\.runtime|\.secrets|node_modules|release)\//.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file) && !/\.example$/.test(file)) issues.push({ file, rule: 'private-or-generated-path' });
  const data = readFileSync(file);
  if (file.endsWith('.zip')) {
    archives++;
    try {
      const entries = unzipSync(data, { filter: entry => entry.originalSize <= 50 * 1024 * 1024 });
      for (const [name, content] of Object.entries(entries)) {
        if (/(?:^|\/)(?:\.env|worker\.json|credentials\.json|\.secrets)(?:\/|$)/.test(name)) issues.push({ file: `${file}!${name}`, rule: 'private-archive-path' });
        scan(`${file}!${name}`, content);
      }
    } catch { issues.push({ file, rule: 'unreadable-archive' }); }
  } else scan(file, data);
}
console.log(JSON.stringify({ files: files.length, sizeMiB: Math.round(bytes / 1048576 * 100) / 100, archives, issues }, null, 2));
if (issues.length) process.exitCode = 1;
