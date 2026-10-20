export type ShortcutScope='global'|'layout'|'schematic';
export interface ShortcutEvent {key:string;code?:string;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;shiftKey?:boolean;repeat?:boolean;isComposing?:boolean}
export interface ShortcutContext {apple?:boolean;textEditing?:boolean;modalOpen?:boolean;readOnly?:boolean;pending?:boolean;drawing?:boolean;previewRedo?:boolean}
export interface ShortcutDefinition {id:string;scope:ShortcutScope;keys:string[];label:string;note?:string;mutates?:boolean;drawingOnly?:boolean;previewRedoOnly?:boolean;allowText?:boolean}
export const shortcutProfile='virtuoso-style-v1';
export const shortcutDefinitions:ShortcutDefinition[]=[
 {id:'help',scope:'global',keys:['F1','?','Primary+/'],label:'단축키 안내',note:'F1은 입력 칸에서도 안내를 엽니다.'},
 {id:'new',scope:'global',keys:['Primary+N'],label:'새 프로젝트'},
 {id:'open',scope:'global',keys:['Primary+O'],label:'프로젝트 열기'},
 {id:'save',scope:'global',keys:['Primary+S','F2'],label:'프로젝트 저장',allowText:true,note:'적용된 프로젝트를 저장합니다. 속성 입력은 변경 적용 후 저장하세요.'},
 {id:'undo',scope:'global',keys:['Primary+Z','U'],label:'실행 취소',mutates:true,note:'초안의 이전 점을 먼저 취소합니다. 초안이 없으면 실제 엔진 이력을 취소합니다.'},
 {id:'redo',scope:'global',keys:['Primary+Shift+Z','Ctrl+Y','Shift+U'],label:'다시 실행',mutates:true,note:'초안 되살리기가 우선합니다. Ctrl+Y는 Windows/Linux에서 사용합니다.'},
 {id:'tab_schematic',scope:'global',keys:['Alt+1'],label:'회로도 화면'},
 {id:'tab_layout2d',scope:'global',keys:['Alt+2'],label:'Layout 2D 화면'},
 {id:'tab_layout3d',scope:'global',keys:['Alt+3'],label:'Layout 3D 화면'},
 {id:'tab_simulation',scope:'global',keys:['Alt+4'],label:'시뮬레이션 화면',note:'화면만 전환합니다. 엔진을 실행하지 않습니다.'},
 {id:'logs',scope:'global',keys:['Primary+Shift+L'],label:'결과·로그 패널 표시 전환'},
 {id:'cancel',scope:'layout',keys:['Escape'],label:'초안·선택 취소'},
 {id:'select',scope:'layout',keys:['V'],label:'선택 도구'},
 {id:'box',scope:'layout',keys:['R'],label:'사각형',mutates:true,note:'Layout 2D · 드래그 또는 두 모서리 클릭'},
 {id:'polygon',scope:'layout',keys:['Shift+P'],label:'다각형',mutates:true,note:'Layout 2D · 꼭짓점 클릭 후 Enter'},
 {id:'route',scope:'layout',keys:['P','W'],label:'Manhattan 배선',mutates:true,note:'Layout 2D · P는 Path, W는 Resistor 추가 키. 경유점 클릭 후 Enter'},
 {id:'move',scope:'layout',keys:['M','Shift+M'],label:'XY 이동 도구',mutates:true},
 {id:'copy',scope:'layout',keys:['C'],label:'원본·새 위치 클릭으로 도형 복사',mutates:true,note:'Layout 2D · 회로 연결은 별도로 확인하세요.'},
 {id:'deselect',scope:'layout',keys:['Primary+D'],label:'선택 해제'},
 {id:'duplicate',scope:'layout',keys:['Primary+Shift+D'],label:'선택 도형 즉시 복제',mutates:true,note:'Resistor 추가 키. X/Y 각각 1 µm 이동한 마스크 복사. 격자·하위 셀 보호를 적용합니다.'},
 {id:'instance',scope:'layout',keys:['I'],label:'셀 인스턴스·배열 배치',mutates:true,note:'실제 DBU 입력 도구를 엽니다. PCell 자동 생성과 다릅니다.'},
 {id:'properties',scope:'layout',keys:['Q'],label:'선택 도형 속성'},
 {id:'options',scope:'layout',keys:['F3'],label:'현재 그리기 옵션'},
 {id:'display',scope:'layout',keys:['E'],label:'레이어·표시 설정'},
 {id:'redraw',scope:'layout',keys:['F6','Ctrl+R'],label:'화면 다시 그리기'},
 {id:'nudge',scope:'layout',keys:['Arrows','Shift+Arrows'],label:'선택 도형 미세 이동',mutates:true,note:'방향키 1 grid, Shift+방향키 10 grid. Layout 2D 선택 모드에서 사용합니다.'},
 {id:'fit',scope:'layout',keys:['F'],label:'전체 맞춤'},
 {id:'zoom_in',scope:'layout',keys:['+','='],label:'확대'},
 {id:'zoom_out',scope:'layout',keys:['-'],label:'축소'},
 {id:'layers',scope:'layout',keys:['L'],label:'레이어 패널 표시 전환'},
 {id:'finish',scope:'layout',keys:['Enter'],label:'그리기·복사 완료',drawingOnly:true,mutates:true},
 {id:'undo_point',scope:'layout',keys:['Primary+Z','U'],label:'초안의 이전 클릭 취소',drawingOnly:true,mutates:true},
 {id:'redo_point',scope:'layout',keys:['Primary+Shift+Z','Ctrl+Y','Shift+U'],label:'초안의 클릭 다시 실행',previewRedoOnly:true,mutates:true},
 {id:'bend',scope:'layout',keys:['Space'],label:'배선 꺾임 방향 변경',drawingOnly:true,mutates:true},
 {id:'cancel',scope:'schematic',keys:['Escape'],label:'초안·선택 취소'},
 {id:'select',scope:'schematic',keys:['V'],label:'선택·이동 도구'},
 {id:'wire',scope:'schematic',keys:['W'],label:'배선 도구',mutates:true},
 {id:'junction',scope:'schematic',keys:['J'],label:'접점 도구',mutates:true},
 {id:'pan',scope:'schematic',keys:['H'],label:'화면 이동 도구'},
 {id:'instance',scope:'schematic',keys:['I'],label:'소자·계층 블록 선택',mutates:true},
 {id:'block_palette',scope:'schematic',keys:['B'],label:'계층 블록 검색·배치',mutates:true,note:'셀 검색 → 선택 → 클릭으로 반복 배치. R 회전 · Shift+R 반전 · Esc 취소. 핀은 미연결 상태로 시작합니다.'},
 {id:'move',scope:'schematic',keys:['M','Shift+M'],label:'이동 도구',mutates:true,note:'드래그로 이동. 현재 엔진은 배선 끝을 늘리는 Stretch를 지원하지 않습니다. 이동 후 연결을 검사하세요.'},
 {id:'rotate',scope:'schematic',keys:['R'],label:'90° 회전',mutates:true,note:'배치 중 소자 또는 선택 소자를 회전합니다.'},
 {id:'mirror',scope:'schematic',keys:['Shift+R'],label:'좌우 반전',mutates:true},
 {id:'duplicate',scope:'schematic',keys:['C','Primary+Shift+D'],label:'선택 소자·배선 즉시 복제',mutates:true,note:'X/Y 각각 20 회로도 unit의 사본을 만듭니다. Virtuoso의 클릭 배치 Copy와 동작 차이가 있습니다.'},
 {id:'deselect',scope:'schematic',keys:['Primary+D'],label:'선택 해제'},
 {id:'properties',scope:'schematic',keys:['Q'],label:'선택 소자 속성·값'},
 {id:'options',scope:'schematic',keys:['F3'],label:'현재 도구 옵션'},
 {id:'label',scope:'schematic',keys:['L'],label:'새 배선의 Net label 입력',mutates:true,note:'현재 또는 다음 배선의 라벨입니다. 기존 net의 일괄 이름 변경은 아닙니다.'},
 {id:'hierarchy',scope:'schematic',keys:['Shift+T'],label:'셀 계층 목록'},
 {id:'descend',scope:'schematic',keys:['E','Shift+E'],label:'선택 블록의 하위 셀 열기'},
 {id:'ascend',scope:'schematic',keys:['Ctrl+E'],label:'이전 상위 셀로 돌아가기'},
 {id:'check',scope:'schematic',keys:['X'],label:'실제 회로 연결 검사',note:'DRC/LVS/PEX·시뮬레이션과 별개입니다.'},
 {id:'redraw',scope:'schematic',keys:['F6'],label:'화면 다시 그리기'},
 {id:'place_resistor',scope:'schematic',keys:['Alt+R'],label:'저항 배치',mutates:true,note:'Resistor 추가 키. Shift+R은 반전입니다.'},
 {id:'place_capacitor',scope:'schematic',keys:['Shift+C'],label:'커패시터 배치',mutates:true},
 {id:'place_voltage',scope:'schematic',keys:['Shift+V'],label:'전압원 배치',mutates:true},
 {id:'place_current',scope:'schematic',keys:['Shift+I'],label:'전류원 배치',mutates:true},
 {id:'place_nmos',scope:'schematic',keys:['Shift+N'],label:'NMOS 배치',mutates:true},
 {id:'place_pmos',scope:'schematic',keys:['Shift+P'],label:'PMOS 배치',mutates:true},
 {id:'place_ground',scope:'schematic',keys:['Shift+G'],label:'GND 배치',mutates:true},
 {id:'place_port',scope:'schematic',keys:['P','Shift+O'],label:'Port 배치',mutates:true},
 {id:'nudge',scope:'schematic',keys:['Arrows','Shift+Arrows'],label:'선택 소자·배선·접점 미세 이동',mutates:true,note:'방향키 10 unit, Shift+방향키 100 unit. 선택 모드에서 사용합니다.'},
 {id:'fit',scope:'schematic',keys:['F'],label:'전체 맞춤'},
 {id:'zoom_in',scope:'schematic',keys:['+','='],label:'확대'},
 {id:'zoom_out',scope:'schematic',keys:['-'],label:'축소'},
 {id:'finish',scope:'schematic',keys:['Enter'],label:'배선 완료',drawingOnly:true,mutates:true},
 {id:'undo_point',scope:'schematic',keys:['Primary+Z','U'],label:'초안의 이전 클릭 취소',drawingOnly:true,mutates:true},
 {id:'redo_point',scope:'schematic',keys:['Primary+Shift+Z','Ctrl+Y','Shift+U'],label:'초안의 클릭 다시 실행',previewRedoOnly:true,mutates:true},
 {id:'bend',scope:'schematic',keys:['Space'],label:'배선 꺾임 방향 변경',drawingOnly:true,mutates:true},
];
const arrowKeys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
export function shortcutKeyLabel(combo:string,apple=false):string{
 return combo.replaceAll('Primary',apple?'⌘':'Ctrl').replaceAll('Alt',apple?'⌥':'Alt').replaceAll('Shift',apple?'⇧':'Shift').replaceAll('Arrows','↑ ↓ ← →').replaceAll('Escape','Esc').replaceAll('Space','Space');
}
function matches(combo:string,e:ShortcutEvent,apple:boolean):boolean{
 if(combo==='?')return e.key==='?'&&!e.ctrlKey&&!e.metaKey&&!e.altKey;
 if(combo==='+')return e.key==='+'&&!e.ctrlKey&&!e.metaKey&&!e.altKey;
 const tokens=combo.split('+'),key=tokens.pop()!,primary=tokens.includes('Primary');
 const ctrl=tokens.includes('Ctrl')||(primary&&!apple),meta=primary&&apple;
 if(!!e.ctrlKey!==ctrl||!!e.metaKey!==meta||!!e.altKey!==tokens.includes('Alt')||!!e.shiftKey!==tokens.includes('Shift'))return false;
 if(key==='Arrows')return arrowKeys.includes(e.key);
 if(key==='Space')return e.key===' '||e.code==='Space';
 if(key.length===1){const physical=/^[A-Z]$/.test(key)?'Key'+key:/^[0-9]$/.test(key)?'Digit'+key:key==='/'?'Slash':null;return e.key.toLowerCase()===key.toLowerCase()||!!physical&&e.code===physical;}
 return e.key===key;
}
/** Claims blocked canvas keys too, so a pending draft cannot fall through to project undo. */
export function shortcutDecision(scope:ShortcutScope,e:ShortcutEvent,c:ShortcutContext={}):{action:ShortcutDefinition;blocked:boolean}|null{
 if(e.isComposing||e.key==='Process'||e.repeat||c.modalOpen)return null;
 const action=shortcutDefinitions.find(d=>d.scope===scope&&(!d.drawingOnly||c.drawing)&&(!d.previewRedoOnly||c.drawing||c.previewRedo)&&(!c.textEditing||d.allowText||d.id==='help'&&e.key==='F1')&&d.keys.some(k=>!(c.apple&&k==='Ctrl+Y')&&matches(k,e,c.apple??false)));
 return action?{action,blocked:!!action.mutates&&!!(c.readOnly||c.pending)}:null;
}
export function resolveShortcut(scope:ShortcutScope,e:ShortcutEvent,c:ShortcutContext={}):ShortcutDefinition|null{
 const decision=shortcutDecision(scope,e,c);return decision&&!decision.blocked?decision.action:null;
}
export function nudgeVector(key:string,shift=false,step=1):[number,number]{
 const n=step*(shift?10:1);return [key==='ArrowLeft'?-n:key==='ArrowRight'?n:0,key==='ArrowUp'?n:key==='ArrowDown'?-n:0];
}
