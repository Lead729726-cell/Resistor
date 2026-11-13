// Public course outline: a production plan, never evidence of recorded or published videos.
// IDs, titles and target minutes match the source plan and director scripts below.
const lessons = [
  ['01','Resistor Edu로 무엇을 만들고 남길까',5,'core'],
  ['02','내 OS에 설치하고 Edu 인증·첫 화면 확인하기',12,'core'],
  ['03','내 실습 노트 만들기: 단위 입력·저장·백업',12,'core'],
  ['04','소자 놓기와 핀 배선: 회로를 직접 연결하기',10,'core'],
  ['05','첫 실험 완성: 분압기 계산·변경·비교',10,'core'],
  ['06','실수 복구: 단위·연결 오류를 하나씩 찾기',8,'core'],
  ['07','RC 실습 준비: 계산 조건과 실제 회로 연결',10,'core'],
  ['08','실제 시뮬레이션 실행: 전압·전류·revision 읽기',10,'core'],
  ['09','NMOS 실습: 핀 연결과 입력 변경으로 스위치 이해하기',10,'core'],
  ['10','레이아웃 직접 그리기와 회로·단면 연결해서 읽기',16,'core'],
  ['11','혼자 복습하기: 문제 재사용·AI 도움·오류 문의',16,'core'],
  ['12','내 결과물 완성: 실험 보고서·백업·재열기',10,'core'],
  ['C1','출력에 부하를 붙이면 왜 달라질까',12,'clinic'],
  ['C2','같은 비율, 다른 소비 전류',12,'clinic'],
  ['C3','목표 응답 시간으로 RC 고르기',12,'clinic'],
  ['C4','모르는 것을 남기는 설계 리뷰',12,'clinic']
].map(([id,title,minutes,kind])=>({id,title,minutes,kind,status:'planned'}));
const coreLessons=lessons.filter(lesson=>lesson.kind==='core');
const clinicLessons=lessons.filter(lesson=>lesson.kind==='clinic');
const sumMinutes=items=>items.reduce((total,lesson)=>total+lesson.minutes,0);

export const coursePlan = {
  schema_version:1,
  edition:'edu',
  product_id:'resistor.edu',
  revision:'edu-product-training-20261101.1',
  title:'Resistor Edu 실전 사용법: 설치부터 회로 설계·시뮬레이션까지',
  status:'planned',
  duration_basis:'estimate-not-recorded',
  core_lesson_count:coreLessons.length,
  clinic_lesson_count:clinicLessons.length,
  core_minutes:sumMinutes(coreLessons),
  clinic_minutes:sumMinutes(clinicLessons),
  total_minutes:sumMinutes(lessons),
  optional_clinics_registration:'draft-proposal-not-confirmed',
  source_refs:[
    'docs/teaching/RESISTOR-EDU-PRODUCT-COURSE.json',
    'docs/teaching/director-20261101/lessons-01-04.json',
    'docs/teaching/director-20261101/lessons-05-09.json',
    'docs/teaching/director-20261101/lessons-10-C4.json'
  ],
  lessons
};

// Six public overview groups, two core lessons each. These are presentation groups;
// they do not rename or re-register the original instructor section/lesson IDs.
export const courseModules = [
  {title:'시작과 설치',description:'내 OS에 설치하고 Edu 인증·엔진 상태 확인하기'},
  {title:'내 회로를 다루는 법',description:'새 노트를 보관하고 소자·핀을 직접 연결하기'},
  {title:'첫 실험과 오류 복구',description:'저항 하나를 바꿔 비교하고 단위·연결 오류 고치기'},
  {title:'실제 시뮬레이션과 파형',description:'RC 조건을 준비하고 같은 시각의 전압·전류 읽기'},
  {title:'NMOS와 레이아웃',description:'입력 연결을 비교하고 도형·회로·단면의 관계 확인하기'},
  {title:'혼자 복습하고 결과 남기기',description:'문제·피드백을 다시 열고 내 보고서·백업 완성하기'}
].map((module,index)=>{
  const items=coreLessons.slice(index*2,index*2+2);
  return {...module,lesson_ids:items.map(lesson=>lesson.id),lessons:items.map(lesson=>lesson.title),minutes:sumMinutes(items)};
});
export const courseClinics = clinicLessons.map(lesson=>lesson.title);
