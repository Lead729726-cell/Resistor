import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { SKINS, setAppearance, useAppearance, type ColorMode, type Skin } from './appearance';
import { RegisterMark } from './Brand';
import './appearance.css';

const modeOptions: { id: ColorMode; name: string; icon: string }[] = [{ id: 'light', name: '라이트', icon: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0' }, { id: 'dark', name: '다크', icon: 'M20 14.8A8.5 8.5 0 0 1 9.2 4 8.5 8.5 0 1 0 20 14.8Z' }, { id: 'system', name: '시스템', icon: 'M3 4h18v13H3Zm5 17h8m-4-4v4' }];
const skinIds = Object.keys(SKINS) as Skin[];
function arrowChoice<T extends string>(event: KeyboardEvent<HTMLDivElement>, choices: T[], value: T, choose: (value: T) => void) {
  let index = choices.indexOf(value);
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (index + 1) % choices.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = (index + choices.length - 1) % choices.length;
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = choices.length - 1;
  else return;
  event.preventDefault(); choose(choices[index]); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
}
export default function AppearanceControl() {
  const appearance = useAppearance();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <>
    <button ref={trigger} className="appearance-trigger" data-testid="appearance-open" aria-label="화면 스타일 · 테마와 스킨" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} title="다크·라이트 모드와 스킨"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={modeOptions.find(mode => mode.id === appearance.mode)!.icon}/></svg><span>스타일</span><i/></button>
    <dialog className="appearance-dialog" data-testid="appearance-panel" ref={dialog} aria-labelledby="appearance-heading" onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => {
      if (event.target !== dialog.current) return;
      const box = dialog.current.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setOpen(false);
    }}>
      <header><div><span className="appearance-eyebrow">MAKE IT YOUR WORKSPACE</span><h2 id="appearance-heading">화면 스타일</h2><p>설계에 집중하기 좋은 화면을 선택하세요.</p></div><button className="appearance-close" aria-label="화면 스타일 닫기" onClick={() => setOpen(false)}>×</button></header>
      <div className="appearance-mode-group" role="radiogroup" aria-label="색상 모드" onKeyDown={event => arrowChoice(event, modeOptions.map(mode => mode.id), appearance.mode, mode => setAppearance({ mode }))}>{modeOptions.map(mode => <button type="button" key={mode.id} role="radio" aria-checked={appearance.mode === mode.id} tabIndex={appearance.mode === mode.id ? 0 : -1} data-testid={`appearance-mode-${mode.id}`} onClick={() => setAppearance({ mode: mode.id })}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={mode.icon}/></svg>{mode.name}</button>)}</div>
      <div className="appearance-section-title"><h3>스킨</h3><span>{appearance.mode === 'system' ? `시스템 설정 · ${appearance.resolved === 'dark' ? '다크' : '라이트'}` : '모든 화면에 실시간 적용'}</span></div>
      <div className="appearance-skins" role="radiogroup" aria-label="스킨" onKeyDown={event => arrowChoice(event, skinIds, appearance.skin, skin => setAppearance({ skin }))}>{skinIds.map(id => {
        const skin = SKINS[id], palette = skin[appearance.resolved];
        return <button key={id} type="button" role="radio" aria-checked={appearance.skin === id} tabIndex={appearance.skin === id ? 0 : -1} data-testid={`appearance-skin-${id}`} className="appearance-skin-card" onClick={() => setAppearance({ skin: id })} style={{ '--preview-bg': palette.bg, '--preview-panel': palette.panel, '--preview-raised': palette['panel-raised'], '--preview-accent': palette.accent, '--preview-line': palette.line } as CSSProperties}>
          <span className="appearance-skin-preview" aria-hidden="true"><span className="appearance-preview-header"><RegisterMark size={19}/><i/><i/></span><span className="appearance-preview-body"><span><i/><i/><i/></span><svg viewBox="0 0 104 44" fill="none"><path d="M4 36h96M4 22h96M4 8h96" stroke="var(--preview-line)"/><path d="M4 34h14l10-23 12 18 12-9 10 7 12-17 12 12h14" stroke="var(--preview-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span></span>
          <span className="appearance-skin-name">{skin.name}<span aria-hidden="true">{appearance.skin === id ? '✓' : ''}</span></span><span className="appearance-skin-description">{skin.description}</span>
        </button>;
      })}</div>
      <footer><span className="appearance-current" data-testid="appearance-current"><i/>{SKINS[appearance.skin].name} · {appearance.resolved === 'dark' ? '다크' : '라이트'}</span><span>이 기기에 자동 저장</span></footer>
    </dialog>
  </>;
}
