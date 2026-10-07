import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rpc, type Project } from '@mos/contracts';
import './workspace-bundle.css';

interface Props { currentId?: string; onOpen: (project: Project) => Promise<void>; onCreate: () => void; }
type WorkspaceEntry = Pick<Project, 'id' | 'name' | 'cell' | 'pdk_id' | 'revision' | 'source'>;
export default function WorkspaceBrowser({ currentId, onOpen, onCreate }: Props) {
  const [projects, setProjects] = useState<WorkspaceEntry[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const input=useRef<HTMLInputElement>(null),importReceipt=useRef<{hash:string;id:string;project?:Project}|undefined>(undefined);
  const load = useCallback(async () => {
    setLoading(true); setListError(null);
    try { setProjects(await rpc<WorkspaceEntry[]>('project.list', { metadata_only: true })); } catch (cause) { setListError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => projects.filter(project => `${project.name} ${project.cell} ${project.pdk_id} ${project.id}`.toLowerCase().includes(query.toLowerCase())), [projects, query]);
  const execute = async (key: string, task: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  };
  const importFile=async(file:File)=>execute('import',async()=>{
    if(!file.size||file.size>24*1024*1024)throw Error('설계 파일은 24 MiB 이하의 Resistor 프로젝트 ZIP을 선택하세요.');
    const bytes=new Uint8Array(await file.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(importReceipt.current?.hash!==hash)importReceipt.current={hash,id:crypto.randomUUID()};
    let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    const saved=importReceipt.current!;saved.project??=await rpc<Project>('project.import_bundle',{bundle_base64:btoa(binary),mode:'new',command_id:saved.id});const p=saved.project;
    setBusy('open:import');await onOpen(p);importReceipt.current=undefined;
  });
  const exportFile=async(p:WorkspaceEntry)=>execute(`export:${p.id}`,async()=>{
    const bundle=await rpc<{bundle_base64:string}>('project.export_bundle',{project_id:p.id,revision:p.revision,inline:true});
    const binary=atob(bundle.bundle_base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'})),anchor=document.createElement('a');
    anchor.href=url;anchor.download=`${p.cell}-r${p.revision}.register-project.zip`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  return <div className="workspace-browser">
    <div className="workspace-browser-toolbar"><input data-testid="workspace-search" autoFocus aria-label="프로젝트 검색" placeholder="이름, cell, PDK 검색…" value={query} onChange={event => setQuery(event.target.value)}/><button className="button small" disabled={!!busy || loading} onClick={() => void load()}>새로고침</button><button className="button small" data-testid="workspace-import" disabled={!!busy} onClick={()=>input.current?.click()}>설계 파일 가져오기</button><input ref={input} hidden type="file" accept=".zip,.register-project.zip" data-testid="workspace-bundle-input" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importFile(file);}}/><button className="button primary small" disabled={!!busy} onClick={onCreate}>새 프로젝트</button></div>
    <p className="workspace-index-note">{loading ? '로컬 worker의 프로젝트 목록 확인 중…' : `로컬 worker의 저장된 프로젝트 ${projects.length}개 · 실제 snapshot과 revision`}</p>
    {listError && <div className="inline-error" role="alert">프로젝트 목록: {listError}</div>}
    {error && <div className="inline-error" role="alert">{error}</div>}
    {busy && <div className="workspace-operation" role="status">{busy === 'import' ? '설계 파일을 검증하고 가져오는 중…' : busy === 'open:import' ? '가져온 설계의 레이아웃과 계층을 여는 중…' : busy.startsWith('export:') ? '설계 파일을 저장하는 중…' : busy.startsWith('open:') ? '프로젝트를 여는 중…' : busy.startsWith('rename:') ? '프로젝트 이름을 저장하는 중…' : '프로젝트를 복제하는 중…'}</div>}
    <div className="workspace-project-list">{filtered.map(project => <article className={`workspace-project-card ${project.id === currentId ? 'current' : ''}`} key={project.id}>
      <div className="workspace-project-icon">{project.source === 'fixture' ? '◇' : '▧'}</div><div className="workspace-project-info">
        {renaming === project.id ? <form onSubmit={event => { event.preventDefault(); void execute(`rename:${project.id}`, async () => { await rpc('project.rename', { project_id: project.id, name: name.trim() }); setRenaming(null); await load(); }); }}><input autoFocus aria-label="새 프로젝트 이름" value={name} onChange={event => setName(event.target.value)}/><button className="button small" disabled={!name.trim() || !!busy}>적용</button><button className="text-button" type="button" onClick={() => setRenaming(null)}>취소</button></form> : <strong>{project.name}</strong>}
        <div><span className="tag">{project.pdk_id}</span><span>{project.cell}</span><span className="mono">r{project.revision}</span>{project.id === currentId && <span className="current-project-tag">현재 열림</span>}</div><code>{project.id}</code>
      </div><div className="workspace-project-actions"><button className="button small" disabled={!!busy} onClick={() => void execute(`open:${project.id}`, async () => { await onOpen(await rpc<Project>('project.open', { project_id: project.id })); })}>열기</button><button className="text-button" data-testid={`workspace-export-${project.id}`} disabled={!!busy} onClick={()=>void exportFile(project)}>설계 파일 저장</button><button className="text-button" disabled={!!busy} onClick={() => { setRenaming(project.id); setName(project.name); }}>이름 변경</button><button className="text-button" disabled={!!busy} onClick={() => void execute(`clone:${project.id}`, async () => { const clone = await rpc<Project>('project.clone', { project_id: project.id, name: `${project.name} copy` }); await onOpen(clone); })}>복제</button></div>
    </article>)}</div>
    {loading && <div className="empty-panel" role="status">프로젝트 목록을 읽는 중… 파일 가져오기와 새 프로젝트는 바로 사용할 수 있습니다.</div>}
    {!busy && !loading && !listError && !filtered.length && <div className="empty-panel">{query ? '검색 결과가 없습니다.' : '저장된 프로젝트가 없습니다. 새 프로젝트를 만드세요.'}</div>}
    <div className="workspace-storage-note"><strong>Local workspace</strong><span>설계 ZIP은 새 프로젝트로 가져옵니다. 기존 설계는 보존하며 회로·원본 레이아웃·조건을 저장합니다. 해석 로그와 파형은 검증 기록으로 별도 보관하세요.</span></div>
  </div>;
}
