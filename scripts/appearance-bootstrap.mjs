// Match appearance.ts before React loads. This never writes preferences.
export function appearanceBootstrap({edition,presets,eduPalette}) {
  const edu=edition==='edu',palette=edu?{...presets.skins,graphite:eduPalette}:presets.skins;
  const colors=Object.fromEntries(Object.entries(palette).map(([key,value])=>[key,{dark:value.dark,light:value.light}]));
  return `/* Generated early appearance; no network, storage writes or engine access. */
(()=>{const edu=${edu},colors=${JSON.stringify(colors)},modes=['dark','light','system'];let p={mode:'system',skin:'graphite'};
try{const saved=JSON.parse(localStorage.getItem(edu?'resistor.edu.appearance.v1':'register.appearance')||(edu?localStorage.getItem('register.appearance'):null)||'null');if(saved?.version===1){if(modes.includes(saved.mode))p.mode=saved.mode;if(Object.hasOwn(colors,saved.skin))p.skin=saved.skin;}else{const old=JSON.parse(localStorage.getItem('mos.theme')||'null');if(modes.slice(0,2).includes(old))p.mode=old;}}catch{}
const theme=p.mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p.mode,root=document.documentElement,palette=colors[p.skin][theme];
root.dataset.edition=edu?'edu':'indust';root.dataset.theme=theme;root.dataset.skin=p.skin;root.style.colorScheme=theme;root.style.backgroundColor=palette.bg;
if(edu&&p.skin==='graphite')for(const [key,value]of Object.entries(palette))root.style.setProperty('--'+key,value);
const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=palette.panel;})();
`;
}
