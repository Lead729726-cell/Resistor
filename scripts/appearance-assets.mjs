import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {getProductEdition} from '../apps/desktop/product-edition.cjs';
import {appearanceBootstrap} from './appearance-bootstrap.mjs';
const presets=JSON.parse(await readFile('packages/ui/src/appearance-presets.json','utf8'));
const eduPalette=JSON.parse(await readFile('packages/ui/src/edu-appearance.json','utf8'));
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
await writeFile('public/appearance-init.js',appearanceBootstrap({edition:getProductEdition().edition,presets,eduPalette}));
console.log('Appearance assets: 4 skins, dark/light and early saved-theme restore.');
