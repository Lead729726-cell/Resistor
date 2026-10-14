const fs=require('node:fs');
const path=require('node:path');
const definitions=require('./product-editions.json');
function getProductEdition({root=path.resolve(__dirname,'../..'),edition,env=process.env}={}){
  let selected=edition??env.RESISTOR_EDITION;
  if(selected===undefined){try{const data=JSON.parse(fs.readFileSync(path.join(root,'product-edition.json'),'utf8'));if(data.schema_version!==1)throw Error('Unsupported product edition schema');selected=data.edition;}catch(e){if(e.code!=='ENOENT')throw e;selected='indust';}}
  if(selected!=='edu'&&selected!=='indust')throw Error('RESISTOR_EDITION must be edu or indust');
  return {...definitions[selected]};
}
module.exports={getProductEdition};
