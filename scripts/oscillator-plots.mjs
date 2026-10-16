// Preview paths use actual solver samples; downloadable waveform.dat is complete.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function waveformSVG(job,title){
  const kind=job.reference_verification.kind;
  const names=kind==='osc_rc_sensor'?['OUT','CAP']:kind==='osc_beat'?['REF','SENSE','OUT']:kind==='osc_burst'?['EN','OUT']:['Q0','Q1','OUT'];
  const traces=names.map(n=>job.waveforms.find(w=>w.name===n)).filter(Boolean);
  const duration=traces[0].x.at(-1),end=kind==='osc_burst'?duration:kind==='osc_beat'?duration*.75:duration*.65;
  const start=kind==='osc_burst'?0:duration*.5,width=1100,height=100+150*traces.length;
  const colors=['#61d7cd','#f7c778','#a6b9ff'];
  const body=traces.map((w,i)=>{
    const samples=w.x.map((t,j)=>[t,w.y[j]]).filter(([t])=>t>=start&&t<=end);
    const stride=Math.max(1,Math.ceil(samples.length/5500));
    const selected=samples.filter((_,j)=>j%stride===0||j===samples.length-1);
    const points=selected.map(([x,y])=>`${(90+950*(x-start)/(end-start)).toFixed(2)},${(100+150*i+105-100*y/1.8).toFixed(2)}`).join(' ');
    return `<text x="24" y="${95+150*i}" fill="${colors[i]}">${esc(w.name)} · V</text><path d="M90 ${105+150*i}H1040 M90 ${205+150*i}H1040" stroke="#344149"/><polyline points="${points}" fill="none" stroke="${colors[i]}" stroke-width="1.4"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)} 실제 ngspice 파형"><rect width="100%" height="100%" rx="12" fill="#182126"/><g font-family="system-ui,sans-serif" font-size="16" fill="#ecf2f4"><text x="24" y="35">${esc(title)}</text><text x="24" y="61" font-size="13" fill="#a2b0b8">Actual ngspice 47 samples · TT / 27°C / 1.8 V · preview sample subset</text>${body}<text x="90" y="${height-15}" font-size="13">${(start*1e6).toFixed(3)} µs</text><text x="1040" y="${height-15}" text-anchor="end" font-size="13">${(end*1e6).toFixed(3)} µs</text></g></svg>`;
}
