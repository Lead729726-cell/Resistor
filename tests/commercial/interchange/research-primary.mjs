// Read-only source author inventory; not part of parser fixture test evidence.
const url='https://api.github.com/repos/YZU-EDALAB/asap7_bb_pdk/contents/tf';
const response=await fetch(url);if(!response.ok)throw new Error(`HTTP ${response.status}`);
const files=await response.json();console.log(JSON.stringify(files.map(f=>({name:f.name,url:f.download_url})),null,2));
