import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {courseSiteHeader,courseSiteFooter} from './course-site-design.mjs';
import {applyCourseDocumentDesign} from './site/course-document-design.mjs';
import {legalOperator,legalReview,productLegalVersion,productLegalReadiness,termsSections,privacySections,legalSourceReferences,legalImplementationSources} from './site/product-legal-content.mjs';

export const productLegalPages=Object.freeze([
 {kind:'terms',route:'/terms/',file:'terms/index.html',title:'Resistor Edu 이용약관·제품 조건',description:'Resistor Edu의 사용권, 개인 기기 2대 인증, 소스 라이선스, 제공·구매·문의 조건을 안내합니다.'},
 {kind:'privacy',route:'/privacy/',file:'privacy/index.html',title:'Resistor Edu 개인정보 처리 안내',description:'기기 저장, 공식 인증, 선택 AI·리그·공동 설계와 시리얼 메일의 정보 처리 범위를 구분합니다.'},
]);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function link({label,href}){
 const external=href.startsWith('https://');
 if(!(external||/^\/[a-zA-Z0-9/_#.-]*$/.test(href)||/^#[a-zA-Z0-9-]+$/.test(href)))throw Error('Unsupported legal-link target');
 return `<a href="${escape(href)}"${external?' target="_blank" rel="noopener noreferrer"':''}>${escape(label)}${external?' <span aria-hidden="true">↗</span>':''}</a>`;
}
function section(value){
 const paragraphs=(value.paragraphs||[]).map(text=>`<p>${escape(text)}</p>`).join('');
 const table=value.table?`<div class="academy-table-scroll" tabindex="0" role="region" aria-label="${escape(value.title)} 표"><table><thead><tr>${value.table.headers.map(text=>`<th scope="col">${escape(text)}</th>`).join('')}</tr></thead><tbody>${value.table.rows.map(row=>`<tr>${row.map((text,index)=>index===0?`<th scope="row">${escape(text)}</th>`:`<td>${escape(text)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'';
 return `<section id="${escape(value.id)}" class="academy-section"><h2>${escape(value.title)}</h2>${paragraphs}${table}${value.links?.length?`<nav class="academy-actions" aria-label="${escape(value.title)} 관련 안내">${value.links.map(link).join('')}</nav>`:''}</section>`;
}

export function renderProductLegalPages({mode='review'}={}){
 if(!['review','final'].includes(mode))throw Error('Legal mode must be review or final');
 const readiness=productLegalReadiness();
 if(mode==='final'&&!readiness.ready)throw Error('Legal publication review is incomplete: '+readiness.missing.join(', '));
 const review=mode!=='final';
 const reviewNotice=review?`<aside class="academy-note" role="note" data-policy-status="review_required"><strong>운영 확인 중인 안내 · 시행일 미확정</strong><p>현재 기능과 데이터 흐름을 정리한 검토본입니다. 보관·파기 절차와 국외 이전 등 확인이 필요한 사항을 아래에 표시했습니다. 완결된 법률 검토나 새로운 동의 절차를 마쳤다는 뜻이 아니며 이 페이지에서 구매·개인정보 입력을 받지 않습니다.</p></aside>`:'';
 const pending=review?`<details id="review-status" class="academy-document-note" data-policy-review><summary>정책 확정 전에 확인할 사항</summary><div><p>다음 항목을 확인한 뒤 시행일과 확정 문구를 반영합니다. 이용자가 이 목록을 확인하는 것으로 운영자의 확인 의무를 대신하지 않습니다.</p>${legalReview.items.filter(item=>item.status!=='verified').map(item=>`<article><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p></article>`).join('')}</div></details>`:'';
 return Object.fromEntries(productLegalPages.map(page=>{
  const sections=page.kind==='terms'?termsSections:privacySections;
  const summary=`<details class="academy-document-note" data-policy-toc><summary>이 문서의 항목</summary><nav aria-label="문서의 항목" class="academy-actions">${sections.map(value=>link({label:value.title,href:'#'+value.id})).join('')}</nav></details>`;
  const references=page.kind==='privacy'?`<details class="academy-document-note" id="references"><summary>확인한 공식 자료</summary><div><p>2026년 11월 12일 확인한 1차 자료입니다. 법령·사업자 문서의 설명과 Resistor의 실제 계정 설정·운영 확인은 구분합니다.</p><ul>${legalSourceReferences.map(item=>`<li>${link({label:item.title,href:item.url})}</li>`).join('')}</ul></div></details>`:'';
  return [page.file,applyCourseDocumentDesign(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}">${review?'<meta name="robots" content="noindex,follow">':''}<meta name="resistor-policy-version" content="${productLegalVersion}"><link rel="canonical" href="https://resistor.kr${page.route}"><link rel="icon" href="/register-symbol.svg" type="image/svg+xml"><script src="/appearance.js"></script><link rel="stylesheet" href="/course-site.css"><link rel="stylesheet" href="/course-documents.css"><script type="module" src="/course-site.mjs"></script></head><body class="academy-page academy-document" data-site-family="legal">${courseSiteHeader}<main id="main-content"><header class="academy-section"><p class="academy-kicker">RESISTOR EDU · 이용 안내</p><h1>${escape(page.title)}</h1><p>${escape(page.description)}</p><p>문서 버전 ${productLegalVersion} · ${review?'작성일 2026-11-12 · 검토본':'시행일 '+escape(legalReview.effective_date)}</p><nav class="academy-actions" aria-label="법적 안내 문서">${link({label:'이용약관·제품 조건',href:'/terms/'})}${link({label:'개인정보 처리 안내',href:'/privacy/'})}${link({label:'운영자 Gmail 연동 안내',href:'/license-mail/privacy/'})}</nav></header>${reviewNotice}${summary}${sections.map(section).join('')}${pending}${references}<section class="academy-section" id="business"><h2>운영 정보</h2><p>${escape(legalOperator.name)} · 대표 ${escape(legalOperator.representative)} · 사업자등록번호 ${escape(legalOperator.business_number)} · 통신판매업 ${escape(legalOperator.mail_order_number)}</p><p>${escape(legalOperator.address)} · <a href="mailto:${escape(legalOperator.email)}">${escape(legalOperator.email)}</a> · ${escape(legalOperator.phone)}</p></section></main>${courseSiteFooter}</body></html>
`,page.file,{header:courseSiteHeader,footer:courseSiteFooter})];
 }));
}

/** Add only new static routes; do not rewrite production Vercel/API/download metadata. */
export async function prepareProductLegalSite(root=process.cwd(),site=path.join(root,'platform/download-site'),options={}){
 await Promise.all(legalImplementationSources.map(relative=>readFile(path.join(root,relative))));
 const rendered=renderProductLegalPages(options),assets=[];
 for(const [relative,html]of Object.entries(rendered)){
  const filename=path.join(site,relative);await mkdir(path.dirname(filename),{recursive:true});await writeFile(filename,html);
  assets.push({file:relative,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')});
 }
 const receipt={schema_version:1,edition:'edu',policy_version:productLegalVersion,mode:options.mode||'review',...productLegalReadiness(),effective_date:legalReview.effective_date,assets};
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const site=path.resolve(process.env.RESISTOR_SITE_OUTPUT||'platform/download-site');
 const receipt=await prepareProductLegalSite(process.cwd(),site,{mode:process.argv.includes('--final')?'final':'review'});
 const evidence=path.resolve('docs/evidence/legal/product-policy-readiness-20261112.json');
 await mkdir(path.dirname(evidence),{recursive:true});await writeFile(evidence,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt,null,2));
}
