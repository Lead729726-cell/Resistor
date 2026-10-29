// Shared display/routing policy. Does not activate licenses or contact a provider.
export const purchaseChannel=product=>product.purchase_channel??'direct';
export const directSalesAllowed=(catalog,product)=>catalog.direct_sales_enabled!==false&&purchaseChannel(product)==='direct';
export function inflearnCourseUrl(catalog){
 if(catalog.inflearn_course?.publication_status!=='published')return null;
 try{const u=new URL(catalog.inflearn_course.public_url);if(u.protocol!=='https:'||!['www.inflearn.com','inflearn.com'].includes(u.hostname)||u.port||u.username||u.password||!/^\/course\/.+/.test(u.pathname)||/^\/course\/(?:edit(?:\/|$)|temp_|draft)/.test(u.pathname))return null;return u.origin+u.pathname;}catch{return null;}
}
export function purchaseAction(catalog,product){
 if(purchaseChannel(product)==='inflearn'){const url=inflearnCourseUrl(catalog);return {url:url??'/shop/#inflearn',label:url?'인프런에서 수강 신청':'인프런 강의 준비 안내',price_label:'인프런 판매 예정가',notice:'수강 신청과 결제는 인프런에서 진행합니다. 실제 판매가는 인프런 강의 페이지에서 확인하세요.'};}
 if(!directSalesAllowed(catalog,product))return {url:'/shop/#conditions',label:'자체 판매 보류 안내',price_label:'자체 판매 보류',notice:'인프런 강의 판매를 우선 진행합니다. Edu 단품 자체 판매는 보류합니다.'};
 return {url:'/checkout/?product='+encodeURIComponent(product.id),label:product.purchasable?'구매하기':'구성·구매 준비 상태 보기',price_label:product.purchasable?'부가세 포함':'예정 가격 · 현재 결제 불가',notice:''};
}
