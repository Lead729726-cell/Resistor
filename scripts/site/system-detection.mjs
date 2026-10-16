// Only browser-local compatibility hints are used. Nothing is uploaded or stored.
export const targets = [
  ['windows-x64','Windows · Intel / AMD x64'],
  ['windows-arm64','Windows 11 · ARM64'],
  ['macos-arm64','macOS · Apple Silicon (M1 이후)'],
  ['macos-x64','macOS · Intel'],
  ['linux-x64','Linux · x64'],
];
export function classifySystem({userAgent='',platform='',maxTouchPoints=0,hints={}}={}) {
  const ua=userAgent, p=hints.platform||platform;
  let os=/Android/i.test(ua)||p==='Android'?'Android':/iPhone|iPad|iPod/i.test(ua)||(p==='MacIntel'&&maxTouchPoints>1)?'iOS / iPadOS':/Windows|Win32|Win64/i.test(p+' '+ua)?'Windows':/macOS|Mac/i.test(p+' '+ua)?'macOS':/Linux|X11/i.test(p+' '+ua)?'Linux':'알 수 없는 OS';
  const mobile=hints.mobile===true||['Android','iOS / iPadOS'].includes(os);
  let arch='unknown';
  if(hints.architecture==='arm') arch=hints.bitness==='64'?'arm64':'arm';
  else if(hints.architecture==='x86') arch=hints.bitness==='64'?'x64':hints.bitness==='32'?'x86':'unknown';
  else if(/\b(aarch64|arm64)\b/i.test(ua))arch='arm64';
  else if(os==='Linux'&&/\b(x86_64|amd64)\b/i.test(ua+' '+p))arch='x64';
  // Safari's Intel Mac and Windows' reduced x64 UA can describe an ARM machine.
  // Never infer a native CPU from those compatibility strings.
  const major=Number.parseInt(hints.platformVersion||'',10);
  const osLabel=os==='Windows'?(major>=13?'Windows 11':major>=1?'Windows 10':'Windows 10 / 11'):os;
  const key=!mobile&&['x64','arm64'].includes(arch)?`${os==='Windows'?'windows':os==='macOS'?'macos':os==='Linux'?'linux':'unknown'}-${arch}`:null;
  const supported=targets.some(([id])=>id===key);
  return {os,osLabel,arch,mobile,target:supported?key:null,unsupported:!!key&&!supported,
    label:osLabel+' · '+({x64:'x64',arm64:'ARM64',arm:'ARM',x86:'32비트',unknown:'CPU 확인 필요'}[arch]),
    note:mobile?'데스크톱용 앱입니다. PC 또는 Mac에서 설치 파일을 받으세요.':supported?'브라우저가 제공한 OS·CPU 계열을 기준으로 추천합니다.':os==='macOS'?'Mac 칩은 브라우저에서 확인되지 않았습니다. 이 Mac에 관하여에서 Apple Silicon / Intel을 확인한 뒤 선택하세요.':arch==='unknown'?'CPU 계열을 확인할 수 없습니다. 시스템 설정에서 확인한 뒤 직접 선택하세요.':'이 시스템용 전용 설치 파일은 없습니다. 지원되는 시스템에서 실행하세요.'};
}
export async function detectSystem(nav) {
  const hints={platform:nav.userAgentData?.platform,mobile:nav.userAgentData?.mobile};
  try {Object.assign(hints,await Promise.race([nav.userAgentData?.getHighEntropyValues?.(['architecture','bitness','platformVersion']),new Promise(resolve=>setTimeout(()=>resolve({}),1500))])||{});} catch { /* A denied or unsupported hint keeps manual selection available. */ }
  return classifySystem({userAgent:nav.userAgent,platform:nav.platform,maxTouchPoints:nav.maxTouchPoints,hints});
}
export async function mountSystemDetection(doc,nav) {
  const panels=[...doc.querySelectorAll('[data-system-detection]')];if(!panels.length)return;
  const detected=await detectSystem(nav);
  for(const panel of panels){
    panel.querySelector('[data-system-label]').textContent=detected.label;
    const select=panel.querySelector('select');
    const update=()=>{
      const key=select.value||detected.target,manual=!!select.value;
      panel.querySelector('[data-system-note]').textContent=manual?'직접 선택: '+targets.find(([id])=>id===key)[1]:detected.note;
      const scope=panel.closest('main'), cards=[...scope.querySelectorAll('[data-platform-target]')];
      cards.forEach(card=>{const selected=card.dataset.platformTarget===key;card.toggleAttribute('data-recommended',selected);const badge=card.querySelector('[data-recommended-label]');if(badge){badge.hidden=!selected;badge.textContent=manual?'선택한 시스템':'현재 시스템 추천';}});
      const action=panel.querySelector('[data-system-action]');
      if(action){const card=cards.find(c=>c.dataset.platformTarget===key),link=card?.querySelector('a[data-native-download]');action.hidden=!link;action.textContent=link?(manual?'선택한 설치 파일 다운로드':'이 시스템용 다운로드'):'';if(link)action.href=link.href;else action.removeAttribute('href');}
    };
    select.addEventListener('change',update);update();
  }
}
if(typeof document!=='undefined')mountSystemDetection(document,navigator);
