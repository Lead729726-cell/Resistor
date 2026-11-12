// Add shared chrome without rewriting educational bodies, scripts or download links.
export function documentFamily(file){
 if(file==='index.html'||file==='shop.html')return 'course';
 if(file.startsWith('learning/'))return 'lesson';
 if(file.startsWith('download-')||file==='editions.html'||file==='updates.html')return 'download';
 if(['terms.html','privacy.html','terms/index.html','privacy/index.html'].includes(file))return 'legal';
 if(file.startsWith('license-mail'))return 'mail';
 if(file==='course-workbook.html'||file==='checkout.html')return 'commerce';
 if(file==='edu.html')return 'edu';
 if(file==='pdk-links.html'||file==='references.html')return 'resource';
 if(file==='research.html'||file.startsWith('engine-verification-'))return 'research';
 return 'tutorial';
}

export function applyCourseDocumentDesign(html,file,{header,footer}){
 if(!/<html\b/i.test(html)||!/<body\b/i.test(html))throw Error(`Expected a complete public HTML page: ${file}`);
 if(!/<head\b/i.test(html))html=html.replace(/<html\b[^>]*>/i,match=>match+'<head></head>');
 const family=documentFamily(file),document=family!=='course';
 // Only known site chrome is replaced. A document's own heading and local nav remain.
 html=html.replace(/<a class="wb-skip"[^>]*>[\s\S]*?<\/a>/g,'');
 if(/<header\b[^>]*class="wb-site-header"[^>]*>/i.test(html))html=html.replace(/<header\b[^>]*class="wb-site-header"[^>]*>[\s\S]*?<\/header>/i,header);
 else html=html.replace(/<body\b[^>]*>/i,match=>match+header);
 html=html.replace(/<body\b([^>]*)>/i,(_,attributes)=>{
  const existing=attributes.match(/\bclass="([^"]*)"/)?.[1]?.split(/\s+/).filter(Boolean)||[];
  const classes=[...new Set([...existing,'academy-page',...(document?['academy-document']:[])])];
  const rest=attributes.replace(/\s*class="[^"]*"/,'').replace(/\s*data-site-family="[^"]*"/,'');
  return `<body${rest} class="${classes.join(' ')}" data-site-family="${family}">`;
 });
 // Old footer notes can include license/simulation limits and downloadable resources.
 // Retain their exact inner HTML where they were, in an optional document disclosure.
 html=html.replace(/<footer\b([^>]*)>([\s\S]*?)<\/footer>/gi,(_,attributes,contents)=>
  /\bclass="[^"]*\bacademy-footer\b/.test(attributes)?'':
  `<details class="academy-document-note" data-document-footer><summary>이 문서의 추가 안내</summary><div>${contents}</div></details>`);
 html=html.replace(/<\/body>/i,footer+'</body>');
 if(!html.includes('src="/course-site.mjs"'))html=html.replace('</head>','<script type="module" src="/course-site.mjs"></script></head>');
 if(!/<script\b[^>]*src="(?:\/|\.\/)?appearance\.js"/i.test(html))html=html.replace('</head>','<script src="/appearance.js"></script></head>');
 for(const asset of ['course-site.css',...(document?['course-documents.css']:[])]){
  html=html.replace(new RegExp(`<link\\b[^>]*href="/${asset.replace('.','\\.')}"[^>]*>`,'g'),'');
  html=html.replace('</head>',`<link rel="stylesheet" href="/${asset}"></head>`);
 }
 return html;
}
