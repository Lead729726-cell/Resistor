export type ShortcutScope='global'|'layout'|'schematic';
export interface ShortcutEvent {key:string;code?:string;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;shiftKey?:boolean;repeat?:boolean;isComposing?:boolean}
export interface ShortcutContext {apple?:boolean;textEditing?:boolean;modalOpen?:boolean;readOnly?:boolean;pending?:boolean;drawing?:boolean}
export interface ShortcutDefinition {id:string;scope:ShortcutScope;keys:string[];label:string;note?:string;mutates?:boolean;drawingOnly?:boolean;allowText?:boolean}
export const shortcutDefinitions:ShortcutDefinition[]=[
 {id:'help',scope:'global',keys:['F1','?','Primary+/'],label:'단축키 안내',note:'F1은 입력 칸에서도 안내를 엽니다.'},
 {id:'new',scope:'global',keys:['Primary+N'],label:'새 프로젝트'},
 {id:'open',scope:'global',keys:['Primary+O'],label:'프로젝트 열기'},
 {id:'save',scope:'global',keys:['Primary+S'],label:'프로젝트 저장',allowText:true,note:'적용된 프로젝트를 저장합니다. 속성 입력은 변경 적용 후 저장하세요.'},
 {id:'undo',scope:'global',keys:['Primary+Z'],label:'실행 취소',mutates:true},
 {id:'redo',scope:'global',keys:['Primary+Shift+Z','Ctrl+Y'],label:'다시 실행',mutates:true,note:'Ctrl+Y는 Windows/Linux에서 사용합니다.'},
 {id:'tab_schematic',scope:'global',keys:['Alt+1'],label:'회로도 화면'},
 {id:'tab_layout2d',scope:'global',keys:['Alt+2'],label:'Layout 2D 화면'},
 {id:'tab_layout3d',scope:'global',keys:['Alt+3'],label:'Layout 3D 화면'},
 {id:'tab_simulation',scope:'global',keys:['Alt+4'],label:'시뮬레이션 화면',note:'화면만 전환합니다. 엔진을 실행하지 않습니다.'},
 {id:'logs',scope:'global',keys:['Primary+Shift+L'],label:'결과·로그 패널 표시 전환'},
 {id:'cancel',scope:'layout',keys:['Escape'],label:'초안·선택 취소'},
 {id:'area',scope:'layout',keys:['A'],label:'2D 영역 선택',note:'왼→오 완전 포함, 오→왼 걸침. Shift 추가, Alt 제외.'},
 {id:'select_all',scope:'layout',keys:['Primary+A'],label:'로드된 선택 가능 도형 전체 선택'},
 {id:'select',scope:'layout',keys:['V'],label:'선택 도구'},
 {id:'box',scope:'layout',keys:['R'],label:'사각형',mutates:true,note:'Layout 2D · 드래그 또는 두 모서리 클릭'},
 {id:'polygon',scope:'layout',keys:['P'],label:'다각형',mutates:true,note:'Layout 2D · 꼭짓점 클릭 후 Enter'},
 {id:'route',scope:'layout',keys:['W'],label:'Manhattan 배선',mutates:true,note:'Layout 2D · 경유점 클릭 후 Enter'},
 {id:'move',scope:'layout',keys:['M'],label:'XY 이동 도구',mutates:true},
 {id:'copy',scope:'layout',keys:['C'],label:'원본·새 위치 클릭으로 도형 복사',mutates:true,note:'Layout 2D · 회로 연결은 별도로 확인하세요.'},
 {id:'duplicate',scope:'layout',keys:['Primary+D'],label:'선택 도형 복제',mutates:true,note:'X/Y 각각 1 µm 이동한 마스크 복사. 격자·하위 셀 보호를 적용합니다.'},
 {id:'nudge',scope:'layout',keys:['Arrows','Shift+Arrows'],label:'선택 도형 미세 이동',mutates:true,note:'방향키 1 grid, Shift+방향키 10 grid. Layout 2D 선택 모드에서 사용합니다.'},
 {id:'fit',scope:'layout',keys:['F'],label:'전체 맞춤'},
 {id:'zoom_in',scope:'layout',keys:['+','='],label:'확대'},
 {id:'zoom_out',scope:'layout',keys:['-'],label:'축소'},
 {id:'layers',scope:'layout',keys:['L'],label:'레이어 패널 표시 전환'},
 {id:'finish',scope:'layout',keys:['Enter'],label:'그리기·복사 완료',drawingOnly:true,mutates:true},
 {id:'undo_point',scope:'layout',keys:['Backspace'],label:'이전 클릭 취소',drawingOnly:true,mutates:true},
 {id:'bend',scope:'layout',keys:['Space'],label:'배선 꺾임 방향 변경',drawingOnly:true,mutates:true},
 {id:'cancel',scope:'schematic',keys:['Escape'],label:'초안·선택 취소'},
 {id:'area',scope:'schematic',keys:['A'],label:'영역 선택',note:'왼→오 완전 포함, 오→왼 걸침. Shift 추가, Alt 제외.'},
 {id:'select_all',scope:'schematic',keys:['Primary+A'],label:'현재 셀 전체 선택'},
 {id:'select',scope:'schematic',keys:['V'],label:'선택·이동 도구'},
 {id:'wire',scope:'schematic',keys:['W'],label:'배선 도구',mutates:true},
 {id:'junction',scope:'schematic',keys:['J'],label:'접점 도구',mutates:true},
 {id:'pan',scope:'schematic',keys:['H'],label:'화면 이동 도구'},
 {id:'rotate',scope:'schematic',keys:['R'],label:'90° 회전',mutates:true,note:'배치 중 소자 또는 선택 소자를 회전합니다.'},
 {id:'mirror',scope:'schematic',keys:['M'],label:'좌우 반전',mutates:true},
 {id:'duplicate',scope:'schematic',keys:['Primary+D'],label:'선택 소자·배선 복제',mutates:true},
 {id:'place_resistor',scope:'schematic',keys:['Shift+R'],label:'저항 배치',mutates:true},
 {id:'place_capacitor',scope:'schematic',keys:['Shift+C'],label:'커패시터 배치',mutates:true},
 {id:'place_voltage',scope:'schematic',keys:['Shift+V'],label:'전압원 배치',mutates:true},
 {id:'place_current',scope:'schematic',keys:['Shift+I'],label:'전류원 배치',mutates:true},
 {id:'place_nmos',scope:'schematic',keys:['Shift+N'],label:'NMOS 배치',mutates:true},
 {id:'place_pmos',scope:'schematic',keys:['Shift+P'],label:'PMOS 배치',mutates:true},
 {id:'place_ground',scope:'schematic',keys:['Shift+G'],label:'GND 배치',mutates:true},
 {id:'place_port',scope:'schematic',keys:['Shift+O'],label:'Port 배치',mutates:true},
 {id:'nudge',scope:'schematic',keys:['Arrows','Shift+Arrows'],label:'선택 소자·배선·접점 미세 이동',mutates:true,note:'방향키 10 unit, Shift+방향키 100 unit. 선택 모드에서 사용합니다.'},
 {id:'fit',scope:'schematic',keys:['F'],label:'전체 맞춤'},
 {id:'zoom_in',scope:'schematic',keys:['+','='],label:'확대'},
 {id:'zoom_out',scope:'schematic',keys:['-'],label:'축소'},
 {id:'finish',scope:'schematic',keys:['Enter'],label:'배선 완료',drawingOnly:true,mutates:true},
 {id:'undo_point',scope:'schematic',keys:['Backspace'],label:'이전 클릭 취소',drawingOnly:true,mutates:true},
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
export function resolveShortcut(scope:ShortcutScope,e:ShortcutEvent,c:ShortcutContext={}):ShortcutDefinition|null{
 if(e.isComposing||e.key==='Process'||e.repeat||c.modalOpen)return null;
 return shortcutDefinitions.find(d=>d.scope===scope&&(!d.drawingOnly||c.drawing)&&(!d.mutates||!c.readOnly&&!c.pending)&&(!c.textEditing||d.allowText||d.id==='help'&&e.key==='F1')&&d.keys.some(k=>!(c.apple&&k==='Ctrl+Y')&&matches(k,e,c.apple??false)))??null;
}
export function nudgeVector(key:string,shift=false,step=1):[number,number]{
 const n=step*(shift?10:1);return [key==='ArrowLeft'?-n:key==='ArrowRight'?n:0,key==='ArrowUp'?n:key==='ArrowDown'?-n:0];
}
