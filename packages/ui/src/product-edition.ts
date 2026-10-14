import definitions from '../../../apps/desktop/product-editions.json';
declare const __RESISTOR_EDITION__: 'edu'|'indust'|undefined;
export type ProductEdition='edu'|'indust';
const id=typeof __RESISTOR_EDITION__==='undefined'?'indust':__RESISTOR_EDITION__;
export const productEdition=definitions[id];
export const educationMode=id==='edu';
export const editionStorageKey=(key:string)=>educationMode?key+'.edu':key;
