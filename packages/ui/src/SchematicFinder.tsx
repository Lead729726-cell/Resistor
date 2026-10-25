import {useId, useMemo, useRef, useState, useEffect} from 'react';
import type {SchematicCell} from '@mos/contracts';
import {schematicSearchIndex, searchSchematic, type SchematicSearchEntry} from './schematic-search';
import './schematic-finder.css';

export default function SchematicFinder({cell, cellName, blocked, onChoose, onClose}: {
  cell: SchematicCell; cellName: string; blocked: boolean;
  onChoose: (entry: SchematicSearchEntry) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState(''), [kind, setKind] = useState<'all' | 'device' | 'net'>('all');
  const [active, setActive] = useState(0), input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const id = useId(), index = useMemo(() => schematicSearchIndex(cell), [cell]);
  const result = useMemo(() => searchSchematic(index, query, kind), [index, query, kind]);
  const position = Math.min(active, Math.max(0, result.entries.length - 1));
  useEffect(() => {input.current?.focus();}, []);
  useEffect(() => {
    const container=list.current,row=container?.children[position] as HTMLElement|undefined;
    if(!container||!row)return;
    // Scroll only the result list; scrollIntoView also scrolls hidden editor ancestors.
    const top=row.getBoundingClientRect().top-container.getBoundingClientRect().top+container.scrollTop;
    if(top<container.scrollTop)container.scrollTop=top;
    else if(top+row.offsetHeight>container.scrollTop+container.clientHeight)container.scrollTop=top+row.offsetHeight-container.clientHeight;
  }, [position,result.entries]);
  const choose = (entry: SchematicSearchEntry) => {if (!blocked) onChoose(entry);};
  return <section className="schematic-finder" aria-label="회로도 빠른 찾기" data-testid="schematic-finder" onKeyDown={event => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {event.preventDefault(); onClose();}
  }}>
    <div className="schematic-finder-controls">
      <input ref={input} role="combobox" aria-label="소자·넷 검색" aria-expanded="true" aria-autocomplete="list"
        aria-controls={`${id}-results`} aria-activedescendant={result.entries.length ? `${id}-${position}` : undefined}
        placeholder="소자 이름·ID·모델·넷 검색" value={query} onChange={event => {setQuery(event.target.value); setActive(0);}}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setActive(result.entries.length ? (position + (event.key === 'ArrowDown' ? 1 : -1) + result.entries.length) % result.entries.length : 0);
          } else if (event.key === 'Enter' && result.entries[position]) {event.preventDefault(); choose(result.entries[position]);}
        }}/>
      <select aria-label="회로도 검색 종류" value={kind} onChange={event => {setKind(event.target.value as typeof kind); setActive(0);}}>
        <option value="all">전체</option><option value="device">소자</option><option value="net">넷</option>
      </select>
      <button onClick={onClose} aria-label="회로도 찾기 닫기">닫기 · Esc</button>
    </div>
    <p className="schematic-finder-status" role="status">{cellName} · {result.total}개 일치{result.total > result.entries.length ? ` · 처음 ${result.entries.length}개 표시, 검색어를 좁혀 주세요` : ''} · ↑↓ 선택 · Enter 이동</p>
    {blocked && <p className="schematic-finder-warning">배선 초안·드래그 또는 저장을 먼저 완료하거나 취소하세요. 검색어는 유지됩니다.</p>}
    <div ref={list} className="schematic-finder-results" id={`${id}-results`} role="listbox" aria-label="회로도 검색 결과">
      {result.entries.map((entry, i) => <button key={entry.key} id={`${id}-${i}`} role="option" aria-selected={position === i} aria-disabled={blocked}
        className={position === i ? 'active' : ''} onClick={() => choose(entry)} onFocus={() => setActive(i)}>
        <span className="schematic-finder-kind">{entry.kind === 'device' ? '소자' : 'NET'}</span><strong>{entry.label}</strong><small>{entry.detail}</small>
      </button>)}
    </div>
    {!result.total && <p className="schematic-finder-status">일치하는 소자·넷이 없습니다. 이름이나 검색 종류를 바꿔 보세요.</p>}
    <p className="schematic-finder-note">현재 셀의 표기된 net만 검색합니다. 전기적 연결은 연결 검사로 확인하세요. 찾기·화면 이동은 설계와 실행 결과를 변경하지 않습니다.</p>
  </section>;
}
