import {useEffect,useRef,useState} from 'react';
import {appleKeyboard,shortcutDefinitions,shortcutKeyLabel} from './shortcuts';
import type {ShortcutScope} from '../../shortcuts/src/index';
import './shortcut-help.css';
export default function ShortcutHelp({context,onClose,readOnly=false,viewerOnly=false}:{context:'layout'|'schematic'|'global';onClose:()=>void;readOnly?:boolean;viewerOnly?:boolean}){
 const [scope,setScope]=useState<ShortcutScope|'all'>(context),[query,setQuery]=useState('');
 const root=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),returnFocus=useRef(document.activeElement);
 const apple=appleKeyboard();
 useEffect(()=>{search.current?.focus();return()=>{const previous=returnFocus.current;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 const rows=shortcutDefinitions.filter(d=>(!viewerOnly||d.scope==='layout'||d.id==='help')&&(scope==='all'||d.scope===scope)&&`${d.label} ${d.note??''} ${d.keys.join(' ')} ${d.scope}`.toLowerCase().includes(query.trim().toLowerCase()));
 const names={global:'공통',layout:'레이아웃',schematic:'회로도'};
 return <div className="modal-overlay shortcut-help-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={root} className="modal shortcut-help" role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title" onKeyDown={e=>{
  e.stopPropagation();
  if(e.nativeEvent.isComposing)return;
  if(e.key==='Escape'){e.preventDefault();onClose();}
  if(e.key==='Tab'){const controls=[...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><div className="modal-header"><h2 id="shortcut-help-title">단축키 안내</h2><button className="icon-button" aria-label="단축키 안내 닫기" onClick={onClose}>×</button></div>
 <p className="shortcut-intro">{apple?'Mac · ⌘ Command / ⌥ Option':'Windows / Linux · Ctrl / Alt'} · 편집 키는 해당 캔버스를 클릭한 뒤 사용하세요.</p>
 <div className="shortcut-filter"><div role="tablist" aria-label="단축키 작업 화면">{(['all','layout','schematic','global'] as const).filter(s=>!viewerOnly||s!=='schematic').map(s=><button key={s} role="tab" aria-selected={scope===s} onClick={()=>setScope(s)}>{s==='all'?'전체':names[s]}</button>)}</div><input ref={search} aria-label="단축키 검색" placeholder="도구·조작·키 검색" value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <div className="shortcut-table-wrap"><table><thead><tr><th>단축키</th><th>작업</th><th>화면</th></tr></thead><tbody>{rows.map(d=><tr key={d.scope+'/'+d.id}><td>{d.keys.filter(k=>!(apple&&k==='Ctrl+Y')).map(k=><kbd key={k}>{shortcutKeyLabel(k,apple)}</kbd>)}</td><td><strong>{d.label}</strong>{d.note&&<small>{d.note}</small>}{readOnly&&d.mutates&&<small className="shortcut-readonly">읽기 전용에서 비활성화</small>}</td><td>{names[d.scope]}</td></tr>)}</tbody></table>{!rows.length&&<p className="shortcut-empty">일치하는 단축키가 없습니다.</p>}</div>
 <p className="shortcut-footnote">입력 칸에서는 문자 입력과 기본 텍스트 Undo를 유지합니다. 설정창·단축키 창이 열려 있으면 배경 설계의 편집 키를 차단합니다. Delete로 삭제하며 Mac의 ⌫도 지원합니다. 그리기 중 Backspace는 이전 점을 취소합니다.</p>
 </div></div>;
}
