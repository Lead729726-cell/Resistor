import { useMemo, useRef, useState } from 'react';
import type { Device, Project, SchematicCommand } from '@mos/contracts';

interface Props { project: Project; selection: string | null; onSelect: (id: string | null) => void; onCommand: (command: SchematicCommand) => Promise<void>; onValidate: () => void; onExport: () => void; }
export const pinOffsets = (device: Device): Record<string, [number, number]> => {
  if (device.kind === 'nmos' || device.kind === 'pmos') return { D: [30, device.kind === 'pmos' ? 42 : -42], G: [-46, 0], S: [30, device.kind === 'pmos' ? -42 : 42], B: [49, 0] };
  if (device.kind === 'ground') return { G: [0, -30] };
  if (device.kind === 'port') return { P: [-30, 0] };
  return Object.fromEntries(Object.keys(device.pins).map((name, index) => [name, [0, index ? 44 : -44]]));
};
function Symbol({ device }: { device: Device }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (device.kind === 'nmos' || device.kind === 'pmos') return <g {...common}>
    <path d="M-46 0 H-15 M-15 -26 V26 M-5 -26 V26 M-5 -22 H30 V-42 M-5 22 H30 V42 M-5 0 H49"/>
    <path d={device.kind === 'nmos' ? 'M15 0 L7 -5 M15 0 L7 5' : 'M7 0 L15 -5 M7 0 L15 5'}/>
    {device.kind === 'pmos' && <circle cx={-22} cy={0} r={5}/>}
  </g>;
  if (device.kind === 'resistor') return <path {...common} d="M0 -44 V-26 L-8 -20 L8 -12 L-8 -4 L8 4 L-8 12 L8 20 L0 26 V44"/>;
  if (device.kind === 'capacitor') return <g {...common}><path d="M0 -44 V-8 M-18 -8 H18 M-18 8 H18 M0 8 V44"/></g>;
  if (device.kind === 'ground') return <g {...common}><path d="M0 -30 V0 M-20 0 H20 M-13 7 H13 M-6 14 H6"/></g>;
  if (device.kind === 'port') return <g {...common}><path d="M-30 0 H-12 L0 -12 H30 V12 H0 L-12 0"/></g>;
  return <g {...common}><path d="M0 -44 V-23 M0 23 V44"/><circle r={23}/>{device.kind === 'voltage' ? <path d="M-7 -9 H7 M0 -16 V-2 M-7 10 H7"/> : <path d="M0 13 V-13 M-6 -6 L0 -13 L6 -6"/>}</g>;
}

export default function Schematic({ project, selection, onSelect, onCommand, onValidate, onExport }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ id: string; start: [number, number]; original: [number, number]; position: [number, number] } | null>(null);
  const devices = project.schematic.devices;
  const viewport = useMemo(() => {
    const xs = devices.map(d => d.x), ys = devices.map(d => d.y);
    const xmin = xs.length ? Math.min(...xs) : 200, ymin = ys.length ? Math.min(...ys) : 100;
    const xmax = xs.length ? Math.max(...xs) : 400, ymax = ys.length ? Math.max(...ys) : 300;
    const width = Math.max(500, xmax - xmin + 360), height = Math.max(360, ymax - ymin + 190);
    const left = (xmin + xmax) / 2 - width / 2 + 30, top = (ymin + ymax) / 2 - height / 2;
    return { left, top, width, height };
  }, [devices]);
  const view = `${viewport.left + viewport.width * (1 - 1 / zoom) / 2} ${viewport.top + viewport.height * (1 - 1 / zoom) / 2} ${viewport.width / zoom} ${viewport.height / zoom}`;
  const coords = (event: React.PointerEvent<SVGElement>): [number, number] => {
    const point = svg.current!.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const next = point.matrixTransform(svg.current!.getScreenCTM()!.inverse()); return [next.x, next.y];
  };
  const position = (device: Device): [number, number] => drag?.id === device.id ? drag.position : [device.x, device.y];
  const nets = useMemo(() => {
    const map = new Map<string, { device: Device; pin: string; offset: [number, number] }[]>();
    devices.forEach(device => Object.entries(device.pins).forEach(([pin, net]) => {
      const offset = pinOffsets(device)[pin] || [0, 0];
      if (net) map.set(net, [...(map.get(net) || []), { device, pin, offset }]);
    })); return map;
  }, [devices]);
  return <div className="schematic-view">
    <div className="viewport-caption"><span className="live-dot"/> Native schematic IR <span>핀의 net 이름을 기준으로 연결 / Net graph</span></div>
    <div className="schematic-tools"><button onClick={onValidate} title="실제 pin/net 연결 검사">Check graph</button><button onClick={onExport} title="실제 native IR SPICE netlist">SPICE</button><button onClick={() => setZoom(z => Math.min(3, z * 1.2))} title="확대 / Zoom in">＋</button><button onClick={() => setZoom(z => Math.max(.4, z / 1.2))} title="축소 / Zoom out">−</button><button onClick={() => setZoom(1)}>Fit</button></div>
    <svg ref={svg} viewBox={view} className="schematic-svg" role="img" aria-label="편집 가능한 회로도 / Editable circuit schematic" onPointerDown={event => { if (event.target === event.currentTarget) onSelect(null); }} onPointerMove={event => {
      if (!drag) return; const next = coords(event); setDrag({ ...drag, position: [Math.round((drag.original[0] + next[0] - drag.start[0]) / 10) * 10, Math.round((drag.original[1] + next[1] - drag.start[1]) / 10) * 10] });
    }} onPointerUp={() => {
      if (!drag) return; const current = drag; setDrag(null);
      if (current.position[0] !== current.original[0] || current.position[1] !== current.original[1]) void onCommand({ type: 'move_device', id: current.id, x: current.position[0], y: current.position[1] }).catch(() => {});
    }} onPointerCancel={() => setDrag(null)}>
      <defs><pattern id="schematic-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="var(--grid-color)"/></pattern></defs>
      <rect x={viewport.left - 1000} y={viewport.top - 1000} width={viewport.width + 2000} height={viewport.height + 2000} fill="url(#schematic-grid)" onPointerDown={() => onSelect(null)}/>
      {[...nets].map(([net, points]) => <g key={net} className={`schematic-net ${points.some(p => p.device.id === selection) ? 'net-highlight' : ''}`}>
        {points.slice(1).map((point, index) => { const anchor = points[0], [ax, ay] = position(anchor.device), [bx, by] = position(point.device); const a = [ax + anchor.offset[0], ay + anchor.offset[1]], b = [bx + point.offset[0], by + point.offset[1]], middle = (a[0] + b[0]) / 2;
          return <path key={`${point.device.id}-${point.pin}`} d={`M${a[0]} ${a[1]} H${middle} V${b[1]} H${b[0]}`} fill="none" stroke="currentColor" strokeWidth="1.7" opacity={.74} />;
        })}
      </g>)}
      {devices.map(device => { const [x, y] = position(device); return <g key={device.id} transform={`translate(${x} ${y})`} className={`schematic-device ${device.kind} ${selection === device.id ? 'selected' : ''}`} tabIndex={0} role="button" aria-label={`${device.name} ${device.kind}`} onKeyDown={event => { if (event.key === 'Enter') onSelect(device.id); }} onPointerDown={event => {
          event.stopPropagation(); onSelect(device.id); const start = coords(event); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: device.id, start, original: [device.x, device.y], position: [device.x, device.y] });
        }}>
        <rect className="device-target" x={-57} y={-55} width={160} height={115} rx={8}/>
        <Symbol device={device}/><text x={61} y={-13} className="device-name">{device.name}</text>
        <text x={61} y={5} className="device-kind">{device.kind.toUpperCase()}</text>
        <text x={61} y={24} className="device-value">{device.parameters.w_um ? `W ${device.parameters.w_um} / L ${device.parameters.l_um} µm` : Object.entries(device.parameters).slice(0, 1).map(([key, value]) => `${key}=${value}`).join('')}</text>
        {Object.entries(device.pins).map(([pin, net]) => { const offset = pinOffsets(device)[pin] || [0, 0]; return <g key={pin}><circle cx={offset[0]} cy={offset[1]} r={2.7} className="pin-point"/><text x={offset[0] + 5} y={offset[1] - 7} className="pin-net">{net || '○ floating'}</text></g>; })}
      </g>; })}
    </svg>
    <div className="viewport-footnote"><span>10 unit snap · drag to move · inspector to connect pins</span><span>{devices.length} devices · {nets.size} nets · 교차선은 junction을 생성하지 않습니다</span></div>
  </div>;
}
