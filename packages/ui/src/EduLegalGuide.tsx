import {useEffect,useReducer} from 'react';
import EduDepthDialog from './EduDepthDialog';
import {eduGuidePage,eduLegalPages} from './edu-legal-content';
import './edu-legal.css';

export default function EduLegalGuide({open,onClose,onBack}:{open:boolean;onClose:()=>void;onBack?:()=>void}){
 const [index,move]=useReducer(eduGuidePage,0);
 // A help visit never writes a consent flag, changes licensing or touches learner data.
 useEffect(()=>{if(!open)move('reset');},[open]);
 const page=eduLegalPages[index],last=index===eduLegalPages.length-1;
 const back=()=>index>0?move('back'):(onBack??onClose)();
 return <EduDepthDialog open={open} title={page.title} subtitle={page.summary}
  step={{current:index+1,total:eduLegalPages.length}} onClose={onClose} onBack={back}
  footer={<button type="button" className="button primary" onClick={()=>last?onClose():move('next')}>{last?'안내 닫기':'다음 →'}</button>}>
  <article className="edu-legal-page" data-guide-page={page.id}>
   <span className="edu-legal-kind">이용·데이터 안내</span>
   {page.sections.map(section=><section key={section.title}><h3>{section.title}</h3><p>{section.text}</p></section>)}
   <p className="edu-legal-note">{page.note}</p>
   {page.links.length>0&&<nav className="edu-legal-links" aria-label={page.title+' 관련 공식 안내'}>
    {page.links.map(link=><a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}<span className="edu-legal-link-context"> · 새 창</span><span aria-hidden="true"> ↗</span></a>)}
   </nav>}
  </article>
 </EduDepthDialog>;
}
