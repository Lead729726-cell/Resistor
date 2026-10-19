// Local instructor/student material builder. No network publication or narration.
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {zipSync} from 'fflate';

export const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const demoDefinitions={divider:{example:'schematic'},rc:{template:'rc_lowpass'},inverter:{example:'inverter'},layout:{example:'layout'},ring:{template:'osc_ring5'},sensor:{template:'osc_rc_sensor'},beat:{template:'osc_beat'},burst:{template:'osc_burst'}};
export function validateCourse(data){
  if(!data||data.schema_version!==1||!/^[-a-z0-9]{1,80}$/.test(data.id)||!Array.isArray(data.lessons)||!data.lessons.length||data.lessons.length>100)throw Error('Invalid bounded course manifest.');
  const plain=(v,max=20000)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
  if(!plain(data.title,180)||!plain(data.audience,1000))throw Error('Course title/audience is missing.');
  try{if(new URL(data.platform_reference?.url).protocol!=='https:')throw Error();}catch{throw Error('Use an HTTPS platform reference.');}
  const ids=new Set();let minutes=0;
  for(const l of data.lessons){
    if(!/^\d{2,3}$/.test(l.id)||ids.has(l.id)||!Number.isFinite(l.planned_minutes)||l.planned_minutes<=0||l.planned_minutes>60||!Object.hasOwn(demoDefinitions,l.demo))throw Error('Invalid lesson ID, duration or demo.');
    ids.add(l.id);minutes+=l.planned_minutes;
    for(const key of ['section','title','goal','opening','reading','trap','assignment','answer'])if(!plain(l[key]))throw Error('Missing lesson content: '+key);
    for(const key of ['explain','actions'])if(!Array.isArray(l[key])||!l[key].length||l[key].length>30||l[key].some(v=>!plain(v)))throw Error('Missing bounded lesson list: '+key);
    if(!['divider','rc','layout','inverter','osc-ring','osc-sensor','osc-beat','osc-burst'].includes(l.plan))throw Error('Unknown app lecture plan.');
  }
  if(minutes!==data.planned_total_minutes)throw Error('Course duration differs from lesson totals.');
  return data;
}
export function plannedCues(lesson){
  const total=Math.round(lesson.planned_minutes*60),parts=[.1,.2,.45,.18],labels=['결과와 목표','핵심 개념','앱 조작과 설명','실제 결과 읽기','과제와 다음 회차'];
  let start=0;return labels.map((title,i)=>{const duration=i===4?total-start:Math.round(total*parts[i]),cue={title,planned_start_s:start,planned_duration_s:duration,timing_kind:'planned-not-recorded'};start+=duration;return cue;});
}
const time=n=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const csv=v=>typeof v==='number'?String(v):'"'+String(v??'').replaceAll('"','""')+'"';
const list=items=>'<ul>'+items.map(v=>'<li>'+escapeHTML(v)+'</li>').join('')+'</ul>';

export async function buildCourseKit({root,base,course,readiness,workbenchURL='http://127.0.0.1:5188/eda'}){
  validateCourse(course);root=path.resolve(root);base=path.resolve(base);
  for(const d of readiness?.demos||[])if(!Object.hasOwn(demoDefinitions,d.id)||!/^[a-f0-9]{32}$/i.test(d.project_id))throw Error('Invalid prepared demo ID.');
  const out=path.join(base,'package'),student=path.join(out,'student');
  await mkdir(student,{recursive:true});
  const save=async(file,body)=>{const dest=path.join(out,file);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,body);};
  let rehearsalLink='';
  try{
    await mkdir(path.join(out,'instructor'),{recursive:true});
    await copyFile(path.join(base,'rehearsal/Resistor-actual-app-silent-rehearsal-1080p.mp4'),path.join(out,'instructor/rehearsal.mp4'));
    rehearsalLink='<a href="instructor/rehearsal.html">무음 앱 조작 리허설</a>';
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const sourceFiles=['packages/ui/src/lecture-model.ts','packages/ui/src/oscillator-lecture-plans.ts','packages/ui/src/LectureStudio.tsx','packages/ui/src/App.tsx','workers/eda/oscillator_projects.py','scripts/course-kit.mjs','scripts/inflearn-course.mjs'];
  const source={git_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),kind:'git-commit',source_sha256:{},normalization:'UTF-8 source text with LF line endings; solver artifacts keep original bytes'};
  for(const f of sourceFiles){const text=(await readFile(path.join(root,f),'utf8')).replaceAll('\r\n','\n');source.source_sha256[f]=sha(text);try{if(sha(execFileSync('git',['show','HEAD:'+f],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).replaceAll('\r\n','\n'))!==source.source_sha256[f])source.kind='working-tree';}catch{source.kind='working-tree';}}
  const css=await readFile(path.join(root,'scripts/course/course.css'),'utf8');
  await save('course.css',css);await save('presenter.js',await readFile(path.join(root,'scripts/course/presenter.js')));
  const page=(title,body,prefix='')=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)} · Resistor</title><link rel="stylesheet" href="${prefix}course.css"></head><body><header><a href="${prefix}index.html">Resistor · 강사용 촬영 패키지</a><span>로컬 전용 · 메모 창은 캡처에서 제외</span></header><main>${body}</main></body></html>`;
  const projectURL=l=>{const p=readiness?.demos?.find(d=>d.id===l.demo);if(!p)return null;const url=new URL(workbenchURL);url.searchParams.set('project',p.project_id);url.searchParams.set('lecture',l.plan);return url.href;};
  const proofRows=(readiness?.demos||[]).map(d=>`<tr><td>${escapeHTML(d.id)}</td><td>r${d.revision}</td><td>${escapeHTML(d.execution_status||'수치 해석 대상 아님')}</td><td>${escapeHTML(d.analysis_result||'미실행')}</td><td>${d.run_id?escapeHTML(d.run_id):'GDS 파일 왕복 검사'}</td></tr>`).join('');
  const lessonCards=course.lessons.map(l=>`<article class="lesson-card"><small>${escapeHTML(l.section)} · EP${l.id}</small><h2>${escapeHTML(l.title)}</h2><p>${escapeHTML(l.goal)}</p><p class="muted">목표 ${l.planned_minutes}분 · 미촬영</p><div class="actions"><a href="instructor/EP${l.id}.html">대본·조작 순서</a><a href="cards/EP${l.id}.html">촬영용 키워드 화면</a>${projectURL(l)?`<a href="${escapeHTML(projectURL(l))}" target="_blank" rel="noopener">앱에서 실습 열기 ↗</a>`:''}</div><label><input type="checkbox" data-human-check="${course.id}:${l.id}">내 촬영 준비 확인</label></article>`).join('');
  await save('index.html',page(course.title,`<section class="intro"><small>RESISTOR INDUST · INSTRUCTOR WORKSPACE</small><h1>${escapeHTML(course.title)}</h1><p>${escapeHTML(course.subtitle)}</p><div class="stats"><b>${course.lessons.length}강</b><b>목표 ${course.planned_total_minutes}분</b><b>1920×1080 / 30fps</b></div><p>${escapeHTML(course.audience)}</p><p class="notice">대본과 실습은 준비 자료입니다. 본 강의·마이크 촬영·편집·인프런 등록은 완료되지 않았습니다. 아래 체크는 개인 준비 기록이며 엔진 판정이 아닙니다.</p><nav class="actions"><a href="instructor/recording-checklist.html">촬영 전 확인</a><a href="instructor/course-introduction.html">인프런 소개 초안</a><a href="student/workbook.html">학생용 워크북</a><a href="student/Student-Kit.zip" download>학생 실습 ZIP ↓</a><a href="curriculum.csv" download>커리큘럼 CSV ↓</a></nav></section><section class="lesson-grid">${lessonCards}</section><section><h2>이번 준비 세션의 실제 엔진 기록</h2><p>학습·촬영 체크박스와 연결하지 않습니다. 저장된 프로젝트를 바꾸면 이 준비 시점의 기록과 달라질 수 있으므로 앱에서 현재 revision을 다시 확인하세요.</p><div class="table-scroll"><table><thead><tr><th>데모</th><th>Revision</th><th>실행</th><th>판정</th><th>실제 기록</th></tr></thead><tbody>${proofRows}</tbody></table></div><a href="demo-readiness.json">원본 준비 기록 JSON</a></section><script src="presenter.js"></script>`));
  const worksheet=[],answerRows=[];
  if(rehearsalLink)await save('instructor/rehearsal.html',page('무음 앱 조작 리허설',`<h1>실제 앱 조작 리허설</h1><p>회차 자료 열기, 새 발진기 데모, 화면 확대와 실제 Simulate 조작을 자동 브라우저로 기록했습니다. 원본은 실제 1920×1080·25fps이며 MP4는 프레임을 복제해 30fps로 내보냈습니다. 음성은 없고 호환용 빈 오디오 트랙만 있습니다. 본 강의 촬영이나 마이크 테스트가 아닙니다.</p><video controls preload="metadata" width="100%" src="rehearsal.mp4"></video><p><a href="rehearsal.mp4" download>MP4 내려받기</a></p>`,'../'));
  for(const l of course.lessons){
    const cues=plannedCues(l),url=projectURL(l);
    const texts=[l.opening,l.explain.join('\n\n'),l.actions.map((a,i)=>`${i+1}. ${a}`).join('\n'),l.reading,l.assignment];
    const scenes=cues.map((c,i)=>`<section class="script-scene" data-scene><p class="eyebrow">계획 ${time(c.planned_start_s)} · ${c.planned_duration_s}초</p><h2>${escapeHTML(c.title)}</h2><div class="spoken">${texts[i].split('\n\n').map(p=>'<p>'+escapeHTML(p).replaceAll('\n','<br>')+'</p>').join('')}</div></section>`).join('');
    await save(`instructor/EP${l.id}.html`,page(`EP${l.id} ${l.title}`,`<small>EP${l.id} · ${escapeHTML(l.section)} · 목표 ${l.planned_minutes}분</small><h1>${escapeHTML(l.title)}</h1><p>${escapeHTML(l.goal)}</p><div class="actions">${url?`<a href="${escapeHTML(url)}" target="_blank" rel="noopener">촬영용 앱 열기 ↗</a>`:''}<a href="../cards/EP${l.id}.html">키워드 화면</a><button data-prompter>큰 글씨 대본</button><button data-print>인쇄 / PDF</button></div><p class="notice">시간은 촬영 계획입니다. 실제 영상의 챕터나 자막 타임코드가 아닙니다. 조작·관찰 중에는 문장을 급히 읽지 말고 화면을 보여주세요.</p>${scenes}<section><h2>오류와 재촬영 포인트</h2><p>${escapeHTML(l.trap)}</p><h2>강사용 과제 해설</h2><p>${escapeHTML(l.answer)}</p></section>${Number(l.id)<course.lessons.length?`<div class="actions"><a href="EP${(Number(l.id)+1).toString().padStart(2,'0')}.html">다음 회차 →</a></div>`:''}<script src="../presenter.js"></script>`,'../'));
    const plain=`EP${l.id} ${l.title}\n목표 ${l.planned_minutes}분 — 실제 촬영 길이 아님\n\n${cues.map((c,i)=>`[계획 ${time(c.planned_start_s)}] ${c.title}\n\n${texts[i]}\n`).join('\n')}\n오류·재촬영\n${l.trap}\n\n강사용 해설\n${l.answer}\n`;
    await save(`instructor/EP${l.id}-script.txt`,plain);
    await save(`cards/EP${l.id}.html`,page(`EP${l.id} 키워드`, `<article class="title-card"><small>RESISTOR CIRCUIT LAB · EP${l.id}</small><h1>${escapeHTML(l.title)}</h1><p>${escapeHTML(l.goal)}</p>${list([l.reading,l.assignment])}<footer>조건 → 실제 실행 → 관찰 → 설명</footer></article>`,'../'));
    worksheet.push(`<section class="worksheet"><small>EP${l.id} · ${escapeHTML(l.section)}</small><h2>${escapeHTML(l.title)}</h2><p>${escapeHTML(l.goal)}</p><h3>실습 순서</h3>${list(l.actions)}<h3>과제</h3><p>${escapeHTML(l.assignment)}</p><p class="blank">소스 / 모델 / VDD / 온도 / corner / R·C / revision / 실제 run:</p><p class="blank">예상값과 관측값:</p><p class="blank">차이의 원인과 아직 확인하지 않은 것:</p></section>`);
    answerRows.push(`<h2>EP${l.id} ${escapeHTML(l.title)}</h2><p>${escapeHTML(l.assignment)}</p><p>${escapeHTML(l.answer)}</p>`);
  }
  const studentPage=(title,body)=>page(title,body,'../').replace('Resistor · 강사용 촬영 패키지','Resistor · 수강생 실습 자료').replace('로컬 전용 · 메모 창은 캡처에서 제외','직접 실행하고 조건과 관측값을 기록합니다');
  await save('student/workbook.html',studentPage('학생용 실습 워크북',`<h1>Resistor 회로 실습 워크북</h1><p>교재의 체크와 수강 완료는 엔진 PASS가 아닙니다. 직접 실행한 조건·프로젝트·revision과 관측값을 적으세요. 다른 환경의 참조값과 차이가 날 수 있습니다.</p>${worksheet.join('')}`));
  await save('student/report-template.html',studentPage('최종 설계 보고서',`<h1>정전용량 센서 인터페이스 설계 보고서</h1>${['목적과 검증 범위','회로 구조와 포트·단위','소스·도구·모델·해석 조건','5·10·20pF 실제 실행 표','선택한 추가 조건과 비교','원본 파형·프로젝트·실행 기록','오류·차이의 원인','미실행 검증과 다음 실험'].map(s=>`<section><h2>${s}</h2><p class="blank">직접 작성</p></section>`).join('')}<p>학생 실습이며 실물 센서 보정·DRC/LVS/PEX·제조 승인 보고서가 아닙니다.</p>`));
  await save('instructor/answer-key.html',page('강사용 과제 해설',`<h1>과제 해설과 평가 기준</h1><p>강사용 자료입니다. 절대 수치만 비교하지 말고 실제 조건·근거·설명·재현성을 함께 봅니다.</p>${answerRows.join('')}`,'../'));
  await save('student/environment.html',studentPage('실습 환경 준비',`<h1>같은 실습 환경으로 시작하기</h1><p>이 과정은 Resistor Indust와 공개 SKY130 기반 실습입니다. 기존 공개 0.28 설치 파일에는 새 발진기 진행안이 포함되지 않았습니다.</p><p>이 패키지의 소스 상태: <strong>${escapeHTML(source.kind)}</strong> · <code>${escapeHTML(source.git_commit)}</code></p><pre>git clone https://github.com/Lead729726-cell/Resistor.git
cd Resistor
git checkout ${source.git_commit}
npm ci
npm run native:prepare
npm run dev:indust</pre><p>Node.js 24와 해당 소스의 네이티브 엔진 준비 안내를 따르세요. Windows x64/Windows 11 ARM64, macOS 15 이상, Linux x64의 기존 검증 범위와 본인 OS·CPU를 확인합니다. Mac M1은 Apple Silicon 자료를 선택합니다. 모든 환경에서 이 강의의 새 과정을 실기기 검증했다는 뜻은 아닙니다.</p><p>처음 실행할 때 필요한 런타임·공개 PDK를 내려받으므로 인터넷과 디스크 공간이 필요할 수 있습니다. 회로 기본 해석은 Docker 없이 가능하며 전체 물리 검증 도구는 별도입니다.</p><p><a href="https://github.com/Lead729726-cell/Resistor/blob/${source.git_commit}/docs/native-runtime.md">버전별 네이티브 엔진 안내</a> · <a href="https://resistor.kr/download/industry/">OS별 다운로드·범위</a></p><p>앱 워크스페이스에서 제공된 프로젝트 ZIP을 새 프로젝트로 가져오세요. 다른 컴퓨터의 과거 PASS는 상속하지 않습니다. 직접 실행 후 현재 상태를 읽습니다.</p>`));
  await save('instructor/course-introduction.html',page('인프런 등록용 소개 초안',`<h1>${escapeHTML(course.title)}</h1><p>${escapeHTML(course.subtitle)}</p><h2>누구를 위한 강의인가요</h2><p>${escapeHTML(course.audience)}</p><h2>수강 후 직접 하는 일</h2>${list(['분압기·RC·CMOS 인버터를 열고 실제 전압·전류를 설명합니다.','정수 DBU 레이아웃을 그리고 GDS/OASIS로 저장·재열기합니다.','링·정전용량 센서·비트 검출기·버스트 클록을 비교합니다.','조건·revision·실제 원본 결과와 한계를 연결한 보고서를 작성합니다.'])}<h2>준비물</h2><p>지원 OS/CPU의 PC, Node.js 24, 이 과정의 소스와 로컬 엔진·공개 PDK. 전자공학 기본 개념. 유료 상용 EDA 라이선스를 필수로 요구하지 않습니다.</p><h2>강의 구성</h2><p>${course.lessons.length}강 · 목표 ${course.planned_total_minutes}분. 실제 완성 영상 길이는 녹화·편집 후 기입합니다.</p><h2>강사 소개와 가격</h2><p>${escapeHTML(course.instructor_profile)}. 가격: ${escapeHTML(course.price)}.</p><h2>설명할 범위</h2><p>회로도 실습·공개 모델의 결정론적 과도 해석입니다. 상용 도구 실행, 실물 센서 보정, 제조용 레이아웃·전체 DRC/LVS/PEX·foundry signoff·지터·phase-noise를 이 과정의 완성 성과로 홍보하지 않습니다.</p><p class="notice">등록용 초안이며 인프런에 제출·게시하지 않았습니다.</p>`,'../'));
  await save('instructor/recording-checklist.html',page('촬영과 편집 확인',`<h1>첫 촬영 전 30초 테스트</h1>${list(['OBS 창 캡처에서 Resistor 작업 창만 선택합니다. 강사 메모·개인 설계·계정 화면을 제외합니다.','실제 캔버스와 출력을 1920×1080, 16:9, 30fps로 설정합니다. 작은 화면을 단순 확대해 글자가 읽힌다고 가정하지 않습니다.','마이크 입력을 선택하고 음성·팬 소음·반향·찢어짐을 30초 녹화·재생으로 직접 확인합니다. 얼굴 촬영은 선택입니다.','MKV로 안전하게 보관한 뒤 편집 또는 remux로 MP4를 만듭니다. H.264/yuv420p, AAC 스테레오 44.1kHz/256kbps를 이 패키지의 출력 목표로 사용합니다.','파일당 5GB 미만과 실제 프레임·해상도·오디오 트랙을 검사합니다. 본인 귀로 음성을 확인하기 전에는 최종 승인으로 표시하지 않습니다.','조작 대기와 오류 재현을 편집할 때 실제 엔진 실행·조건·결과가 이어지는 근거를 남깁니다.','자막에서 Ω, µA, pF, MHz, OUT, CAP, SKY130과 수식을 직접 검수합니다. 계획 cue는 자막 타임코드로 사용하지 않습니다.','EP번호_제목_take01.mkv → EP번호_제목_edit01.mp4처럼 버전과 take를 기록합니다. 원본은 유지합니다.'])}<p>공식 기준 확인: 2026-10-19. <a href="${escapeHTML(course.platform_reference.url)}">인프런 지식공유자 가이드</a>. 플랫폼 안내는 변경될 수 있으므로 제출 전에 다시 확인하세요.</p><h2>로컬 파일 검사</h2><pre>node scripts/verify-course-video.mjs "촬영파일.mp4" --ffprobe "설치된 ffprobe 경로"</pre><p>파일 검사 통과는 영상 시청·마이크 품질·내용 검수나 인프런 승인을 대신하지 않습니다.</p>`,'../'));
  for(const d of readiness?.demos||[]){const sourceFile=path.join(base,'demos',d.id+'.register.zip');await mkdir(path.join(student,'projects'),{recursive:true});await copyFile(sourceFile,path.join(student,'projects',d.id+'.register.zip'));}
  await save('source-snapshot.json',JSON.stringify(source,null,2)+'\n');
  await save('student/source-snapshot.json',JSON.stringify(source,null,2)+'\n');
  await save('demo-readiness.json',JSON.stringify(readiness,null,2)+'\n');
  await save('curriculum.csv','\ufeff'+['section,episode,title,planned_minutes,demo,video_state',...course.lessons.map(l=>[l.section,l.id,l.title,l.planned_minutes,l.demo,'not-recorded'].map(csv).join(','))].join('\n')+'\n');
  await save('instructor/planned-cues.csv','\ufeff'+['episode,title,planned_start,planned_duration_s,timing_kind',...course.lessons.flatMap(l=>plannedCues(l).map(c=>[l.id,c.title,time(c.planned_start_s),c.planned_duration_s,c.timing_kind].map(csv).join(',')))].join('\n')+'\n');
  await save('instructor/take-log.csv','\ufeffepisode,take,raw_file,edited_file,actual_duration,project_revision,engine_run_ids,microphone_review,subtitle_review,publication\n'+course.lessons.map(l=>`${l.id},01,,,,,,pending,pending,not-uploaded`).join('\n')+'\n');
  await save('README.txt',`Resistor Indust 인프런 촬영 패키지\n\n1. 이 저장소에서 npm run course:serve 실행\n2. http://127.0.0.1:5189/ 에서 회차 선택\n3. 대본·키워드 화면과 앱 실습을 각각 열기\n4. OBS는 Resistor 앱 창만 캡처, 메모 창은 제외\n5. 마이크 30초 테스트를 직접 재생한 뒤 촬영\n\n수강생 배포: student/Student-Kit.zip만 전달\n강사용 정답·대본·데모 준비 기록은 공개하지 않습니다.\n본 강의는 미촬영·미업로드 상태입니다.\nZIP에는 저장소·엔진 런타임이 포함되지 않습니다. 학생용 environment.html 참고.\n`);
  const archive=async(dir)=>{const files={};async function walk(folder){for(const e of await readdir(folder,{withFileTypes:true})){if(e.name==='kit-manifest.json'||e.name.startsWith('.')||e.name.endsWith('.zip')&&!e.name.endsWith('.register.zip'))continue;if(e.isSymbolicLink())throw Error('Symlinks are not included in course archives.');const full=path.join(folder,e.name);if(e.isDirectory())await walk(full);else if(e.isFile())files[path.relative(dir,full).replaceAll('\\','/')]=new Uint8Array(await readFile(full));}}await walk(dir);return files;};
  // Student HTML uses the same local stylesheet, but contains no presenter text or keys.
  await copyFile(path.join(out,'course.css'),path.join(student,'course.css'));
  // Rewrite parent stylesheet links for the self-contained student ZIP.
  for(const f of ['workbook.html','report-template.html','environment.html']){const file=path.join(student,f);await writeFile(file,(await readFile(file,'utf8')).replaceAll('../course.css','course.css').replaceAll('../index.html','workbook.html'));}
  if(rehearsalLink){const f=path.join(out,'index.html');await writeFile(f,(await readFile(f,'utf8')).replace('<a href="curriculum.csv"',rehearsalLink+'<a href="curriculum.csv"'));}
  const studentNames=['workbook.html','report-template.html','environment.html','source-snapshot.json','course.css',...(readiness?.demos||[]).map(d=>'projects/'+d.id+'.register.zip')];
  const studentFiles={};for(const file of studentNames)studentFiles[file]=new Uint8Array(await readFile(path.join(student,file)));
  await writeFile(path.join(student,'Student-Kit.zip'),zipSync(studentFiles,{level:6}));
  const allFiles=await archive(out);allFiles['student/Student-Kit.zip']=new Uint8Array(await readFile(path.join(student,'Student-Kit.zip')));
  const manifest={schema_version:1,course_id:course.id,prepared_at:new Date().toISOString(),private:true,lesson_count:course.lessons.length,planned_minutes:course.planned_total_minutes,source,
    recording_status:'not-recorded',microphone_status:'not-tested',inflearn_publication:'not-uploaded',files:Object.entries(allFiles).map(([file,b])=>({file,bytes:b.length,sha256:sha(b)})),student_files:Object.keys(studentFiles)};
  await save('kit-manifest.json',JSON.stringify(manifest,null,2)+'\n');
  allFiles['kit-manifest.json']=new Uint8Array(await readFile(path.join(out,'kit-manifest.json')));
  await writeFile(path.join(base,'Resistor-Inflearn-Instructor-Kit.zip'),zipSync(allFiles,{level:6}));
  return {out,manifest};
}
