// Public formula workbook only. This does not package/activate the EDA application
// and never changes the official serial service or native installer manifests.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {zipSync} from 'fflate';

const root=process.cwd(),out=path.resolve(process.env.RESISTOR_WORKBOOK_OUTPUT||'.runtime/edu-workbook-release/artifacts');
if(!out.startsWith(root+path.sep))throw Error('Workbook output must remain inside the checkout.');
await mkdir(out,{recursive:true});
const edition=JSON.parse(await readFile('product-edition.json','utf8'));
if((process.env.RESISTOR_EDITION||edition.edition)!=='edu')throw Error('Build the public workbook from Resistor Edu.');
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),release='2026.10.31 · '+revision.slice(0,7);
const bundle=await build({entryPoints:['packages/ui/src/WorkbookStandalone.tsx'],outdir:out,entryNames:'workbook',bundle:true,format:'iife',platform:'browser',target:'es2022',jsx:'automatic',minify:true,write:false,metafile:true,legalComments:'external',define:{__RESISTOR_EDITION__:JSON.stringify('edu'),__WORKBOOK_RELEASE__:JSON.stringify(release),'process.env.NODE_ENV':JSON.stringify('production')}});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))?.text,styles=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text;
if(!js||!styles)throw Error('Workbook JS/CSS output missing.');
const inputs=Object.keys(bundle.metafile.inputs);
if(inputs.some(p=>/workers\/|platform\/licensing|packages\/contracts|CoursePractice.*\.bak|\.env/.test(p)))throw Error('Standalone workbook unexpectedly includes engine/private runtime modules.');
// Generate appearance tokens in memory; do not rewrite user-edited theme files.
const presets=JSON.parse(await readFile('packages/ui/src/appearance-presets.json','utf8'));
const declarations=values=>Object.entries(values).map(([k,v])=>{if(!/^#[a-f0-9]{6}$/i.test(v))throw Error('Invalid palette token');return `--${k}:${v};`;}).join('');
let theme='';for(const mode of ['dark','light']){theme+=`${mode==='dark'?':root,':''}:root[data-theme="${mode}"]{color-scheme:${mode};${declarations(presets.modes[mode])}}`;for(const [skin,colors]of Object.entries(presets.skins))theme+=`${skin==='graphite'&&mode==='dark'?':root,':''}:root[data-theme="${mode}"][data-skin="${skin}"]{${declarations(colors[mode])}}`;}
theme+=':root{--border:var(--line);--input:var(--bg);--raised:var(--panel-raised);--shadow:0 18px 60px #0003}';
const css=theme+styles,esc=s=>s.replace(/<\/script/gi,'<\\/script'),styleSafe=s=>s.replace(/<\/style/gi,'<\\/style');
const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#161a20"><title>전자회로 실험 워크북 | Resistor Edu</title><meta name="description" content="Resistor Edu 무료 전자회로 워크북. 예측·계산·비교·내 설명을 기록하고 오프라인에서도 학습하세요.">';
const body='<div id="root"></div><noscript>이 수식 실습은 브라우저 JavaScript가 필요합니다. 브라우저에서 JavaScript를 켜고 다시 열어 주세요.</noscript>';
const online=`<!doctype html><html lang="ko"><head>${head}<link rel="canonical" href="https://resistor.kr/edu-practice/"><link rel="stylesheet" href="/edu-workbook/workbook.css"><script src="/edu-workbook/workbook.js" defer></script></head><body>${body}</body></html>\n`;
const offline=`<!doctype html><html lang="ko"><head>${head}<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${createHash('sha256').update(esc(js)).digest('base64')}'; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'"><style>${styleSafe(css)}</style></head><body>${body}<script>${esc(js)}</script></body></html>\n`;
const files={'course-workbook.html':Buffer.from(online),'workbook.js':Buffer.from(js),'workbook.css':Buffer.from(css),'Resistor-Edu-Workbook.html':Buffer.from(offline),'LICENSE.txt':await readFile('LICENSE')};
for(const name of ['react','react-dom','scheduler','three']){const license=await readFile('node_modules/'+name+'/LICENSE');files['licenses/'+name+'.txt']=license;}
for(const file of bundle.outputFiles.filter(f=>f.path.endsWith('.LEGAL.txt')))files['licenses/'+path.basename(file.path)]=Buffer.from(file.contents);
files['README.txt']=Buffer.from(`Resistor Edu · 무료 첫 회로 워크북\n버전: ${release}\n\n1. ZIP 압축을 풀고 Resistor-Edu-Workbook.html을 브라우저로 엽니다.\n2. 예측을 쓰고, 조건 계산·기록을 누른 뒤 변수 하나를 바꿔 비교합니다.\n3. 학생이 설명을 작성하고 JSON 내려받기로 기록을 보관합니다.\n\nWindows / macOS / Linux의 최신 Chrome, Edge, Firefox, Safari에서 사용할 수 있는 HTML 문서입니다. 설치 프로그램, Node, Docker, API 키는 필요하지 않습니다. 브라우저에서 파일을 여는 보안 정책에 따라 자동 저장이 제한될 수 있으므로 중요한 기록은 JSON으로 내보내세요. 온라인 https://resistor.kr/course/ 에서는 JSON 기록 다시 열기로 옮길 수 있습니다.\n\n지원: 8개 미션의 예측/설명 기록, 이상 저항·분압·RC 수식 계산, 변경 전후 비교, 보고서 인쇄, JSON 저장/복원.\n미지원: 회로도·레이아웃 편집, 실제 ngspice 파형, DRC/LVS/PEX, AI 호출, 강의 시리얼 인증. 전체 EDA 앱의 설치 파일이 아닙니다. 오프라인 문서는 네트워크 요청을 허용하지 않습니다. 외부 링크는 사용자가 선택해 브라우저로 이동하는 안내입니다.\n\n학생 기록·키·PDK·기존 사용자 프로젝트는 포함하지 않습니다. 수식 결과/학생 자기 점검은 실제 엔진 PASS나 제조용 검증이 아닙니다.\n소스: https://github.com/Lead729726-cell/Resistor/tree/codex/resistor-edu\n`,'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest={schema_version:1,edition:'edu',product_id:'resistor.edu.public-workbook',release_kind:'offline-formula-workbook',source_revision:revision,built_at:new Date().toISOString(),official_native_installer:false,actual_engine_included:false,paid_ai_calls:0,files:Object.fromEntries(Object.entries(files).map(([p,b])=>[p,{bytes:b.length,sha256:sha(b)}])),source_inputs:Object.fromEntries(await Promise.all(inputs.filter(p=>!p.startsWith('node_modules/')).map(async p=>[p,sha(await readFile(p))])))};
files['manifest.json']=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
const archiveFiles=Object.fromEntries(Object.entries(files).filter(([p])=>!['course-workbook.html','workbook.js','workbook.css','manifest.json'].includes(p)));
archiveFiles['manifest.json']=Buffer.from(JSON.stringify({...manifest,files:Object.fromEntries(Object.keys(archiveFiles).map(p=>[p,manifest.files[p]]))},null,2)+'\n');
const zip=zipSync(archiveFiles,{level:6});files['Resistor-Edu-Workbook.zip']=Buffer.from(zip);
for(const [name,bytes]of Object.entries(files)){await mkdir(path.dirname(path.join(out,name)),{recursive:true});await writeFile(path.join(out,name),bytes);}
await writeFile(path.join(out,'release-receipt.json'),JSON.stringify({edition:'edu',release_kind:manifest.release_kind,source_revision:revision,zip:{name:'Resistor-Edu-Workbook.zip',bytes:zip.length,sha256:sha(zip)},html:{name:'Resistor-Edu-Workbook.html',bytes:files['Resistor-Edu-Workbook.html'].length,sha256:sha(files['Resistor-Edu-Workbook.html'])},manifest_sha256:sha(files['manifest.json']),official_native_installer:false},null,2)+'\n');
console.log(JSON.stringify({output:out,edition:'edu',kind:manifest.release_kind,zip_bytes:zip.length,zip_sha256:sha(zip),official_native_installer:false},null,2));
