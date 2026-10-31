import {Component,useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import CoursePractice from './CoursePractice';
import AppearanceControl from './AppearanceControl';
import {RegisterMark} from './Brand';
import EduDepthDialog from './EduDepthDialog';
import './workbook-standalone.css';

declare const __WORKBOOK_RELEASE__:string;
class WorkbookBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<main className="standalone-failure"><h1>워크북을 열지 못했습니다</h1><p>Chrome·Edge·Safari·Firefox의 최신 버전에서 다시 열어 주세요. 기존 학습 기록은 삭제하지 않았습니다.</p><a href="https://resistor.kr/course/">온라인 워크북 열기</a></main>:this.props.children;}
}
function WorkbookStandalone(){
 const [engineHelp,setEngineHelp]=useState(false);
 const offline=location.protocol==='file:';
 return <>
  <a className="standalone-skip" href="#workbook">실습으로 바로 이동</a>
  <header className="standalone-header"><a href="https://resistor.kr/edu/" className="standalone-brand"><RegisterMark size={30}/><span>Resistor Edu<small>첫 회로 워크북 · {offline?'오프라인 파일':'웹 실습'}</small></span></a><nav aria-label="워크북 메뉴">{!offline&&<a href="/edu-workbook/Resistor-Edu-Workbook.zip" download>오프라인 다운로드</a>}<a href="https://resistor.kr/shop/">강의 안내</a><AppearanceControl/></nav></header>
  <div className="standalone-scope"><strong>무료 수식 실습</strong><span>설치 없이 시작 · AI 호출 없음 · 학습 기록은 현재 브라우저에 저장</span><details><summary>지원 범위</summary><p>저항·분압·RC 수식 계산과 예측·비교·보고서를 지원합니다. 이 파일에는 회로도·레이아웃 편집기, ngspice, DRC/LVS/PEX 엔진이 없습니다. 입체 보드는 학습 UI 모형입니다. 정식 Edu 앱이나 강의 시리얼을 대체하지 않습니다.</p><p>파일로 열면 저장 방식이 브라우저·파일 위치에 따라 달라질 수 있습니다. 중요한 기록은 <b>JSON 내려받기</b>로 보관하고, 다른 기기나 온라인 워크북에서 <b>JSON 기록 다시 열기</b>로 옮기세요.</p></details></div>
  <div id="workbook"><CoursePractice active onAppPractice={()=>setEngineHelp(true)}/></div>
  <footer className="standalone-footer">Resistor Edu · {__WORKBOOK_RELEASE__} · <a href="https://github.com/Lead729726-cell/Resistor/tree/codex/resistor-edu">오픈소스</a> · <a href="https://resistor.kr/download/edu/">전체 Edu 앱 안내</a></footer>
  <EduDepthDialog open={engineHelp} title="실제 해석은 Edu 앱에서 진행해요" subtitle="현재 워크북은 수식 실습용입니다. 회로 연결·MOS 파형은 Edu 앱과 설치된 엔진·공정 모델이 필요합니다." onClose={()=>setEngineHelp(false)} footer={<button className="button primary" onClick={()=>setEngineHelp(false)}>워크북으로 돌아가기</button>}><p>이 화면에서는 실행하지 않은 결과를 표시하지 않습니다.</p><ol><li>현재 노트를 JSON으로 내려받아 보관합니다.</li><li>Edu 앱에서 회로 퍼즐 또는 연결 실습을 엽니다.</li><li>엔진 상태를 확인하고 해석을 실행합니다.</li><li>실행 ID·revision·입력 조건과 관찰한 사실을 이 노트에 적습니다.</li></ol><p><a href="https://resistor.kr/download/edu/" target="_blank" rel="noreferrer">Edu 앱의 제공 버전·설치 안내 확인 ↗</a></p></EduDepthDialog>
 </>;
}
createRoot(document.getElementById('root')!).render(<WorkbookBoundary><WorkbookStandalone/></WorkbookBoundary>);
