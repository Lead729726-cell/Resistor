import { readFile, writeFile, mkdir } from 'node:fs/promises';
const presets=JSON.parse(await readFile('packages/ui/src/appearance-presets.json','utf8'));
const modes=['dark','light'],skins=Object.keys(presets.skins);
const declarations=values=>Object.entries(values).map(([key,value])=>{
  if(!/^#[a-f0-9]{6}$/i.test(value))throw new Error(`Invalid appearance token: ${key}`);
  return `--${key}:${value};`;
}).join('');
let css='/* Generated from appearance-presets.json by scripts/appearance-assets.mjs. */\n';
for(const mode of modes){
  css+=`${mode==='dark'?':root,':''}:root[data-theme="${mode}"]{color-scheme:${mode};${declarations(presets.modes[mode])}}\n`;
  for(const skin of skins)css+=`${skin==='graphite'&&mode==='dark'?':root,':''}:root[data-theme="${mode}"][data-skin="${skin}"]{${declarations(presets.skins[skin][mode])}}\n`;
}
css+=':root{--border:var(--line);--input:var(--bg);--raised:var(--panel-raised);--success-soft:color-mix(in srgb,var(--green) 11%,var(--panel));--warning-soft:color-mix(in srgb,var(--yellow) 11%,var(--panel));--danger-soft:color-mix(in srgb,var(--red) 11%,var(--panel));--shadow:0 18px 60px #0003}\n';
css+=':root[data-theme="light"]{--shadow:0 18px 60px #24364a20}\n';
await writeFile('packages/ui/src/theme.css',css);
await mkdir('public',{recursive:true});
const panels = {}, backgrounds = {};
for (const key of skins) { panels[key] = Object.fromEntries(modes.map(mode => [mode, presets.skins[key][mode].panel])); backgrounds[key] = Object.fromEntries(modes.map(mode => [mode, presets.skins[key][mode].bg])); }
await writeFile('public/appearance-init.js', `/* Apply saved appearance before the first paint; no network or engine access. */
(()=>{const modes=${JSON.stringify([...modes,'system'])},skins=${JSON.stringify(skins)},panels=${JSON.stringify(panels)},backgrounds=${JSON.stringify(backgrounds)};let p={mode:'system',skin:'graphite'};try{const saved=JSON.parse(localStorage.getItem('register.appearance')||'null');if(saved&&saved.version===1){if(modes.includes(saved.mode))p.mode=saved.mode;if(skins.includes(saved.skin))p.skin=saved.skin;}else{const old=JSON.parse(localStorage.getItem('mos.theme')||'null');if(modes.slice(0,2).includes(old))p.mode=old;}}catch{}const theme=p.mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p.mode;document.documentElement.dataset.theme=theme;document.documentElement.dataset.skin=p.skin;document.documentElement.style.colorScheme=theme;document.documentElement.style.backgroundColor=backgrounds[p.skin][theme];const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=panels[p.skin][theme];})();
`);
console.log('Appearance assets: 4 skins, dark/light and early saved-theme restore.');
