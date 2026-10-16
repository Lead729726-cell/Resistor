import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(n,scale=1)=>typeof n==='number'&&Number.isFinite(n)?(n/scale).toPrecision(6):'미측정';
const guides={
  osc_ring5:{goal:'부하가 클록을 얼마나 늦추는지 살펴보기',nodes:'Q0 → Q1 → Q2 → Q3 → OUT → Q0',
    steps:['단계 C=2pF로 TRAN을 실행하고 Q0·Q1·OUT의 순차 전환을 겹쳐 봅니다.','C=4pF로 별도 프로젝트를 만들어 주파수와 공급 전류를 비교합니다.','TT/27°C/1.8V와 SS/125°C/1.62V, FF/−40°C/1.8V를 각각 실행합니다.'],
    formula:'f = 1 / T, 평균 단계 지연 ≈ T / (2 × 5). 단계별 동일 지연을 가정한 환산값입니다.'},
  osc_rc_sensor:{goal:'정전용량 변화를 주파수로 바꾸는 터치·근접 센서의 출발점',nodes:'OUT → R_TIMING → CAP → 저항 피드백 인버터 → OUT',
    steps:['OUT과 CAP을 겹쳐 커패시터 충·방전 및 실제 전환 전압을 확인합니다.','동일 R에서 C=5pF·10pF·20pF로 세 프로젝트를 만들고 주파수를 비교합니다.','전환 전압으로 계산한 이상적 RC 기준과 MOS 해석의 차이를 설명합니다. 실제 손가락·전극 모델과 보정은 추가해야 합니다.'],
    formula:'Tideal = RC { ln[(VHIGH−VL)/(VHIGH−VH)] + ln[(VH−VLOW)/(VL−VLOW)] }. 실제 전환 전압을 사용하되 피드백 부하·MOS 지연·기생 성분은 포함하지 않은 비교식입니다.'},
  osc_beat:{goal:'빠른 두 발진기의 차이를 더 느린 비트 파형으로 읽기',nodes:'REFERENCE_RING + SENSOR_RING → CMOS XOR → RC → OUT',
    steps:['REF와 SENSE가 외부 클록 없이 독립적으로 발진하는지 확인합니다.','XOR와 저역통과 OUT을 함께 읽고 주파수 차와 관측 비트 주파수를 대조합니다.','SENSOR 링의 C 증가율을 5~30% 범위에서 바꾸어 봅니다. 차이가 너무 작거나 필터가 부적절하면 관측 시간·필터를 조정하고 실패 항목을 읽습니다.'],
    formula:'fbeat ≈ |fREF − fSENSE|. OUT은 XOR 듀티를 RC로 평균한 파형입니다. 실제 출력의 반복 주기와 독립 링들의 주파수 차를 비교합니다.'},
  osc_burst:{goal:'이벤트가 있을 때만 동작하는 웨이크업 클록',nodes:'외부 EN → NAND + 인버터 4단 링 → OUT',
    steps:['EN·OUT을 겹쳐 두 번의 시작·정지 구간을 확인합니다.','EN=LOW에서 OUT이 HIGH로 정지하는지, 두 번째 EN에서도 다시 발진하는지 확인합니다.','실행 결과의 구간별 공급 전력을 비교합니다. 전력 절감 비율은 실제 조건의 측정으로 판단하고 누설·부하·EN 구동 전력 범위를 명시합니다.'],
    formula:'Pavg = VDD × ∫ I(VDD) dt / Δt. EN 입력의 외부 드라이버 전력은 포함하지 않습니다.'},
};

export async function prepareOscillatorPage(root,site,head,footer){
  const base=path.join(root,'examples/oscillator-lab');
  const catalog=JSON.parse(await readFile(path.join(base,'catalog.json'),'utf8'));
  const evidence=JSON.parse(await readFile(path.join(root,'docs/evidence/oscillator-lab/native-verification.json'),'utf8'));
  if(!evidence.completed||catalog.templates.length!==4||evidence.runs.length!==19)throw Error('Complete actual oscillator qualification is required before publication.');
  const hashes={};
  const asset=async(file,destination=file,fromBase=base)=>{const from=path.join(fromBase,file),to=path.join(site,'oscillator-assets',destination);await mkdir(path.dirname(to),{recursive:true});const bytes=await readFile(from);await copyFile(from,to);hashes[destination]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
  const ui=JSON.parse(await readFile(path.join(root,'docs/evidence/oscillator-lab/ui-verification.json'),'utf8'));
  if(!ui.completed||ui.browser_errors.length)throw Error('Actual app workflow must complete before publishing its recording.');
  for(const [f,hash] of Object.entries(ui.source_sha256))if(createHash('sha256').update(await readFile(path.join(root,f))).digest('hex')!==hash)throw Error('UI recording source changed: '+f);
  await asset('docs/evidence/oscillator-lab/oscillator-workflow.webm','app-workflow.webm',root);
  await asset('docs/evidence/oscillator-lab/sensor-results.png','app-results.png',root);
  const cards=[];
  for(const t of catalog.templates){
    const id=t.id,g=guides[id],runs=evidence.runs.filter(r=>r.template===id),nominal=runs.find(r=>r.condition.corner==='tt');
    if(runs.some(r=>r.execution_status!=='completed'||r.analysis_result!=='pass'))throw Error('Published named waveform checks did not pass: '+id);
    for(const file of [id+'.register.zip','waveform.svg','waveform.dat','result-tt.json','core.spice'])await asset(id+'/'+file);
    const url='/oscillator-assets/'+id+'/';
    const rows=['tt','ss','ff'].map(c=>{const r=runs.find(r=>r.condition.corner===c);return `<tr><td>${esc(c.toUpperCase())} · ${r.condition.temperature_C}°C · ${r.condition.supply_V}V</td><td>${num(r.measurements.output_frequency_Hz,1e6)} MHz</td><td>${num(r.measurements.average_supply_power_W,1e-6)} µW</td><td>${r.reference_verification.checks.filter(c=>c.pass).length}/${r.reference_verification.checks.length} 명시된 파형 기준</td></tr>`;}).join('');
    cards.push(`<article class="wb-section" id="${id}" data-oscillator-project><p class="wb-eyebrow">${esc(id)}</p><h2>${esc(t.name)}</h2><p class="lead">${esc(g.goal)}</p><p>${esc(t.scope)}</p><code>${esc(g.nodes)}</code><figure><img src="${url}waveform.svg" width="1100" height="${id==='osc_rc_sensor'||id==='osc_burst'?400:550}" alt="${esc(t.name)} 실제 ngspice 파형" loading="lazy" style="max-width:100%;height:auto"><figcaption>실제 TT 해석 표본의 미리보기 · 원본 전체 데이터는 아래에서 다운로드합니다.</figcaption></figure><div class="wb-intro-links"><a class="button" href="${url}${id}.register.zip" download>편집 가능한 프로젝트 ↓</a><a href="${url}core.spice" download>회로 SPICE</a><a href="${url}waveform.dat" download>실제 파형 원본</a><a href="${url}result-tt.json">측정·검사 JSON</a></div><ol>${g.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><details><summary>공식과 실제 3개 운전 조건</summary><p>${esc(g.formula)}</p><table><thead><tr><th>조건</th><th>출력 주파수</th><th>공급 전력</th><th>관측 결과</th></tr></thead><tbody>${rows}</tbody></table><p>각 조건은 단일 결정론적 실행입니다. 이상적 R/C는 MOS corner에 따라 변하지 않습니다. 전체 PVT·공정 수율·잡음 검증이 아닙니다.</p></details></article>`);
    await writeFile(path.join(base,id,'README.md'),`# ${t.name}\n\nResistor Indust · ${g.goal}.\n\n${t.scope}. 회로 구조: ${g.nodes}.\n\n## 실행\n\n최신 소스 엔진에서 프로젝트 도구 → 내 반도체 → 발진기·센서 프로젝트를 선택하거나 [프로젝트 ZIP](${id}.register.zip)을 가져옵니다. 공개 0.28 설치본에는 새 template adapter가 포함되지 않았습니다.\n\n${g.steps.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\n## 실제 기본 결과\n\nTT/27°C/1.8V: ${num(nominal.measurements.output_frequency_Hz)} Hz · ${num(nominal.measurements.average_supply_power_W)} W.\n\n${g.formula}\n\n[실제 파형](waveform.svg) · [전체 표본](waveform.dat) · [측정과 파형 기준](result-tt.json) · [실행 manifest](manifest.json) · [회로](core.spice).\n\n![실제 ngspice 파형](waveform.svg)\n\n실제 MOS 해석과 이상적 외부 R/C입니다. 초기 조건을 명시했습니다. 레이아웃은 비어 있으며 DRC/LVS/PEX·위상 잡음·지터·센서 보정·제조 signoff는 미검증입니다. 참조값은 부품 오차나 실물 성능 보증이 아닙니다.\n`);
  }
  await mkdir(path.join(site,'oscillator-assets'),{recursive:true});
  await writeFile(path.join(site,'oscillator-assets/SHA256SUMS.json'),JSON.stringify(hashes,null,2)+'\n');
  await writeFile(path.join(site,'oscillator-lab.html'),head('발진기와 센서 프로젝트','5단 CMOS 링 발진기, 정전용량 센서, 비트 검출기와 버스트 클록. 편집 가능한 프로젝트와 실제 SKY130 ngspice 파형.')+`<main class="wb-home"><p class="wb-eyebrow">RESISTOR INDUST · CIRCUIT LAB</p><h1 class="wb-page-title">발진기에서<br>센서까지.</h1><p class="wb-lead">직접 바꿀 수 있는 네 회로.<br>실제 전압·전류와 측정값으로 비교하세요.</p><nav class="wb-utility-links" aria-label="프로젝트 선택">${catalog.templates.map(t=>`<a href="#${t.id}">${esc(t.name.replace(/^.* · /,''))}</a>`).join('')}</nav><section class="wb-section"><h2>먼저 실행 환경을 준비하세요</h2><p>새 template adapter가 필요합니다. 공개 <strong>0.28 설치 파일에는 이 네 프로젝트가 아직 포함되지 않았습니다.</strong> 최신 <a href="https://github.com/Lead729726-cell/Resistor">공통 소스</a>에서 <code>npm ci</code> 후 <code>npm run dev:indust</code>로 실행하세요. 기존 설계는 보존하고 새 프로젝트를 만듭니다.</p><ol><li>프로젝트 도구 → 내 반도체 → 발진기·센서 프로젝트를 선택합니다. 또는 워크스페이스에서 프로젝트 ZIP을 가져옵니다.</li><li>기본 TRAN 설정을 유지하고 실제 해석을 실행합니다. 실행 전에는 결과가 없습니다.</li><li>시뮬레이션에서 노드·전류 파형과 명시된 파형 기준을 읽습니다. 회로를 바꾸면 이전 결과는 과거 revision의 기록입니다.</li></ol><p>검증 범위: 네 회로의 TT/SS/FF, 프로젝트 재가져오기·재실행, 센서 C 변화와 링 부하 변화. 원본 파형·실행 manifest·source hash는 <a href="https://github.com/Lead729726-cell/Resistor/tree/main/examples/oscillator-lab">공개 저장소</a>에 보존합니다.</p></section><section class="wb-section"><h2>실제 앱 조작 기록</h2><p>회로 선택 → 20pF 센서 생성 → 실제 TRAN 실행 → 주파수와 파형 기준 확인. 1600×1000 자동 조작 기록이며 음성은 없습니다.</p><video controls preload="metadata" poster="/oscillator-assets/app-results.png" style="width:100%;max-height:600px;background:#182126" src="/oscillator-assets/app-workflow.webm">브라우저에서 재생되지 않으면 <a href="/oscillator-assets/app-workflow.webm" download>조작 영상을 내려받으세요.</a></video></section>${cards.join('')}<section class="wb-section"><h2>설계에 참고한 공식 자료</h2><p>히스테리시스와 RC 발진 원리를 참고했으며 TI 제품 회로나 사양을 복제하지 않았습니다. 실제 회로는 별도의 SKY130 MOS 그래프입니다.</p><ul><li><a href="https://www.ti.com/lit/pdf/scea046">TI · Understanding Schmitt Triggers, SCEA046B (2025)</a></li><li><a href="https://www.ti.com/lit/pdf/snoa998">TI · Relaxation Oscillator Circuit, SNOA998A (2024)</a></li></ul><p>비어 있는 교환용 OASIS는 칩 레이아웃이 아닙니다. 초기 조건과 이상적 R/C를 사용했으며 DRC/LVS/PEX·확률적 지터·위상 잡음·제조 승인은 별도입니다.</p></section></main>`+footer);
}
