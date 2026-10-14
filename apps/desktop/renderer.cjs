const fs=require('node:fs');
const path=require('node:path');
function rendererDirectory(root,edition,{packaged=false}={}){
 const preferred=path.join(root,'dist-'+edition.edition);
 const folder=packaged?path.join(root,'dist'):fs.existsSync(path.join(preferred,'index.html'))?preferred:path.join(root,'dist');
 const marker=path.join(folder,'product-context.json');
 if(fs.existsSync(marker)){
  const context=JSON.parse(fs.readFileSync(marker,'utf8'));
  if(context.product_id!==edition.id)throw Error('Renderer belongs to another edition. Build '+edition.name+' first.');
 }else if(edition.edition==='edu')throw Error('Build Resistor Edu before opening the desktop app: npm run build:edu');
 return folder;
}
module.exports={rendererDirectory};
