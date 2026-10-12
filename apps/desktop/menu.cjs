function macMenuTemplate({name,send}) {
  return [
    {label:name,submenu:[{role:'about'},{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
    {label:'파일',submenu:[{id:'register-new',label:'새 프로젝트',accelerator:'Command+N',click:()=>send('new')},{id:'register-open',label:'프로젝트 열기',accelerator:'Command+O',click:()=>send('open')},{id:'register-save',label:'설계 저장',accelerator:'Command+S',click:()=>send('save')},{role:'close'}]},
    {label:'편집',submenu:[{id:'register-undo',label:'실행 취소',accelerator:'Command+Z',click:()=>send('undo')},{id:'register-redo',label:'다시 실행',accelerator:'Command+Shift+Z',click:()=>send('redo')},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'보기',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
    {role:'windowMenu'},
    {label:'도움말',submenu:[{id:'register-shortcuts',label:'단축키 안내',accelerator:'F1',click:()=>send('shortcuts')}]}
  ];
}
module.exports={macMenuTemplate};
