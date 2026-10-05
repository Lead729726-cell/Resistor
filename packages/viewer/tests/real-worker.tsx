import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { rpc } from '@mos/contracts';
import type { LayoutCommand, Project, Scene } from '@mos/contracts';
import { LayoutViewer } from '../src';
import type { ViewerDisplay } from '../src';

// Developer integration harness. Every displayed polygon comes from the running KLayout worker.
function ViewerSmoke() {
  const options = new URLSearchParams(window.location.search), performanceMode = options.get('example') === 'performance', example=options.get('example')??'inverter';
  const [scene, setScene] = useState<Scene | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [display, setDisplay] = useState<ViewerDisplay>({ preset: 'top', projection: 'orthographic', explode: 0, clip: { axis: 'none', fraction: 1 },showLabels:options.get('annotations')!=='0',showPins:options.get('annotations')!=='0' });
  const [stage,setStage]=useState('project.create pending');
  const [error, setError] = useState('');
  useEffect(() => { let canceled = false;
    void (options.get('project_id')?rpc<Project>('project.open',{project_id:options.get('project_id')}):rpc<Project>('project.create', { name: performanceMode ? '100k geometry benchmark' : 'Viewer integration smoke', example, ...(performanceMode ? { count: Number(options.get('count') ?? 100000) } : {}) })).then(async next => {
      setStage('view.get_scene pending');
      const layout = await rpc<Scene>('view.get_scene', { project_id: next.id, max_shapes:2000,...(performanceMode?{bounds:['470000','33000','530000','68000']}: {}) });
      if (!canceled) { setProject(next); setScene(layout);setStage('exact scene received'); }
    }).catch(cause => setError(String(cause)));
    return () => { canceled = true; };
  }, []);
  const command = async (command: LayoutCommand) => {
    if (!project) throw new Error('Project not ready');
    const next = await rpc<Project>('layout.apply_command', { project_id: project.id, command });
    const layout = await rpc<Scene>('view.get_scene', { project_id: project.id, max_shapes:display.renderLimit??2000 });
    setProject(next); setScene(layout);
  };
  const requestScope=async(bounds:[string,string,string,string]|undefined,maxShapes:number)=>{if(!project)return;setScene(await rpc<Scene>('view.get_scene',{project_id:project.id,max_shapes:maxShapes,...(bounds?{bounds}:{})}));};
  const presence=options.get('presence')==='1'?[{peerId:'renderer-smoke-peer',name:'Remote renderer test',color:'#ffdf68',selection:scene?.shapes[0]?.id,cursor:scene?.shapes[0]?.polygon[0]?{x:scene.shapes[0].polygon[0][0],y:scene.shapes[0].polygon[0][1]}:null}]:[];
  return <><header style={{ padding: 12 }}><strong>REAL KLAYOUT WORKER · renderer integration</strong> <span data-testid="smoke-selection">{selection ?? 'none'}</span> <small data-testid="rpc-stage">{stage}</small> <button onClick={() => setSelection(null)}>Clear</button>{error && <pre>{error}</pre>}</header>
    <div style={{ display: 'grid', gridTemplateColumns: performanceMode ? '1fr' : '1fr 1fr', gap: 8, height: 720 }}>
      {!performanceMode && <LayoutViewer scene={scene} mode="2d" selection={selection} onSelect={setSelection} onCommand={command} display={display} onDisplayChange={setDisplay} onRequestScope={requestScope} readOnly={options.get('readonly')==='1'} presence={presence}/>}
      <LayoutViewer scene={scene} mode="3d" selection={selection} onSelect={setSelection} onCommand={command} display={display} onDisplayChange={setDisplay} onRequestScope={requestScope} readOnly={options.get('readonly')==='1'} presence={presence}/>
    </div><pre data-testid="smoke-scene" hidden>{scene ? JSON.stringify(scene) : ''}</pre>
  </>;
}

createRoot(document.getElementById('root')!).render(<ViewerSmoke/>);
