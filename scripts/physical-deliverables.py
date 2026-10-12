"""Build reference-specific instructions and plots from preserved native results."""
import csv,hashlib,json,math,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'examples/physical-library'
INFO={
 'chip_ldo':('PMOS LDO','差動 오류 증폭기 → PMOS 패스 소자 → OUT → 피드백 분압 → 오류 증폭기','VREF=0.6V, 외부 바이어스와 출력 커패시터, 20–60µs 부하 스텝','부하별 출력 구간·회복·undershoot. 보상·패스 폭을 수정하면 LVS와 PEX부터 다시 실행합니다.'),
 'chip_sc_dcdc':('2:1 switched-cap DC-DC','4쌍의 transmission gate와 외부 flying capacitor','비중첩 2위상 클록; FLYTOP/FLYBOTTOM에 외부 1nF 연결, 출력 C와 부하','OUT 평균·리플·시간 적분 전력단 효율. 클록 드라이버의 전력은 효율에 포함되지 않습니다.'),
 'chip_vco':('Current-starved ring VCO','전류 제한 3단 링과 CTRL 바이어스','CTRL=0.9V, 명시된 초기 조건과 외부 부하','실제 문턱 교차에서 주파수와 duty 계산. 초기 조건 없는 자가 시동·전체 tuning range는 별도 시험입니다.'),
 'chip_pll':('XOR type-I PLL','CMOS XOR 위상 검출 → RC filter → ring VCO; divide-by-1','30MHz 외부 기준 클록, 바이어스와 초기 조건','주파수 오차·위상 span·CTRL. 현재 잠금 실패를 유지했습니다. 필터·VCO tuning·배선 수정 후 같은 기준으로 재검사합니다.'),
 'chip_ota':('Five-transistor OTA','차동 NMOS 쌍, PMOS mirror, tail source','명시된 바이어스·차동 AC 입력·외부 출력 부하','소신호 이득·위상·3dB bandwidth. matching/common-centroid·offset·noise·통계와 feedback 안정성은 별도입니다.'),
 'chip_comparator':('Static comparator','차동 전치 증폭기 → CMOS 출력 inverter','기준과 입력 차이를 양/음으로 전환, 외부 출력 부하','입력 극성과 안정된 출력 구간. 작은 차동 입력의 지연·offset·hysteresis는 별도입니다.')}
GATES={'inv':(['A'],lambda a:1-a[0]),'nand2':(['A','B'],lambda a:1-(a[0]&a[1])),'nor2':(['A','B'],lambda a:1-(a[0]|a[1])),'and2':(['A','B'],lambda a:a[0]&a[1]),'or2':(['A','B'],lambda a:a[0]|a[1]),'xor2':(['A','B'],lambda a:a[0]^a[1]),'xnor2':(['A','B'],lambda a:1-(a[0]^a[1])),'mux2':(['A','B','S'],lambda a:a[1] if a[2] else a[0])}
def fmt(x):
 if isinstance(x,list):return ' → '.join(fmt(v) for v in x)
 if isinstance(x,(int,float)):return f'{x:.8g}'
 return str(x)
def docs():
 evidence=json.loads((OUT/'evidence.json').read_text(encoding='utf-8'));matrix=[]
 for r in evidence['rows']:
  ref=r['reference'];folder=OUT/ref;conv=json.loads((folder/'physical-conversion.json').read_text(encoding='utf-8'));post=r['jobs'][-1];checks=post['verification']['checks'];m=post['measurements'];rc=r['jobs'][2]['parasitics']
  matrix.append(f"| {r['name'].split(' · ')[0]} | PASS | PASS | {rc['resistors']} R / {rc['capacitors']} C | {'PASS' if r['post_layout_criteria_pass'] else '**FAIL**'} |")
  if ref.startswith('cell_'):
   key=ref[5:];pins,truth=GATES[key];title=key.upper();construction='실제 SKY130 CMOS transistor 회로; AND/OR는 NAND/NOR+inverter, XOR는 4×NAND, XNOR는 XOR+inverter, MUX2는 transmission gate 선택 회로입니다.'
   condition='TT / 27°C / 1.8V, 5fF 외부 출력 부하, 조합당 50ns, 100ps 입력 edge. 각 슬롯의 70–95% 전체 관측 구간을 검사합니다.'
   review='입력/출력이 모두 ≤0.3VDD 또는 ≥0.7VDD인지 검사합니다. 안정된 레벨 기준이며 Liberty timing/power characterization은 아닙니다.'
   table='| '+' | '.join(pins+['Y'])+' |\n|'+'---|'*(len(pins)+1)+'\n'
   import itertools
   for a in itertools.product([0,1],repeat=len(pins)):table+='| '+' | '.join(map(str,[*a,truth(a)]))+' |\n'
  else:title,construction,condition,review=INFO[ref];table=''
  body=f"# {title} — 실제 물리 설계 실습\n\n{construction}\n\n공정: SKY130A / MOS TT / RC typical / 27°C / 1.8V. 다른 코너를 검증한 것으로 해석하지 마세요. 포트: `{', '.join(conv['ports'])}`. 핀 순서는 [core.spice](core.spice)의 subckt 선언이 기준입니다.\n\n## 시작과 제작\n\n1. Resistor 0.17.0 이상에서 Docker 엔진을 연결합니다. 프로젝트 도구 → 내 반도체 → {'기본 로직 셀' if ref.startswith('cell_') else '물리 칩 레퍼런스'} → {title}을 선택합니다. 새 설계를 만들거나 다운로드 묶음의 `{ref}.register.zip`을 프로젝트 탐색에서 가져옵니다.\n2. 회로도에서 MOS D/G/S/B, 실제 공정 모델과 W/L을 확인합니다. 저항 바디는 VGND입니다. 공정 R/C의 목표 value는 크기 추정 기록이며 실제 해석은 W/L 모델로 수행합니다. 속성에서 W/L을 바꾼 뒤 마스크도 수정하고 LVS를 다시 실행하세요.\n3. Layout 2D의 active/poly/LI/contact/M1–M4와 핀을 확인합니다. 참조 배치는 관찰하기 쉽게 떨어뜨린 공개 PCell 배치입니다. 회로 변경이 모든 마스크를 자동 재생성하는 기능은 아닙니다.\n4. DRC를 실행해 violation 좌표와 deck을 확인합니다. LVS는 레이아웃 추출과 원본 회로의 소자·크기·포트를 비교합니다. PEX는 실제 배선 R/C를 추출합니다. 각 단계는 독립된 job입니다.\n5. Testbench에서 아래 조건을 확인하고 pre-layout을 실행합니다. Post-layout을 켜 다시 실행하고 같은 revision의 결과를 비교합니다. 가져온 파일은 이전 PASS를 상속하지 않으므로 직접 실행해야 합니다.\n6. 계층 셀을 재사용할 때 적용 전 추가 도형·경계·겹침과 포트 연결 미리보기를 확인합니다. 배치와 배선 후 모든 검증을 다시 실행하세요.\n7. 편집 프로젝트·GDS/OASIS·sidecar·회로·보고서·파형을 같은 revision으로 저장합니다. GDS 단독에는 회로 조건이나 측정된 Z가 들어 있지 않습니다.\n\n## 시험 조건\n\n{condition}\n\n{review}\n\n{table}\n## 이번 실제 실행\n\n| 단계 | 실행 | 결과 |\n|---|---|---|\n"+'\n'.join(f"| {j['stage']} | {j['execution_status']} | {j['analysis_result'].upper()} |" for j in r['jobs'])+f"\n\n실제 PEX: **{rc['resistors']} 저항 / {rc['capacitors']} 커패시터**.\n\n| 기생 후 검사 | 관측값 | 결과 |\n|---|---|---|\n"+'\n'.join(f"| {c['name']} | {fmt(c.get('observed'))} | {'PASS' if c['pass'] else '**FAIL**'} |" for c in checks)+f"\n\n[실제 전후 파형](response.png) · [검사 원문](post-result.json) · [PEX 원본](pex/pex.spice) · [전기적 축약 감사](post/pex-reduction.json)\n\n원본 PEX는 보존합니다. 해석용 회로만 관측되지 않은 순수 저항 노드를 Schur complement로 제거하며 커패시터·소자·포트·관측 노드는 유지합니다. 전기적 등가 축약이며 정확한 공간 전류 밀도를 복원하는 도구가 아닙니다. AC 복소 전류의 흐름 재생은 지원되지 않습니다.\n\n## 제조 인계에서 추가할 것\n\n이 파일은 공개 deck 물리 참조입니다. full-chip density/antenna, ESD/pad/seal ring/package, 아날로그 matching과 guard ring, 전원 EM/IR, timing/Liberty/STA, noise/Monte Carlo/PVT, 최종 foundry deck과 인계를 별도로 완료해야 합니다. 3D mask 높이는 표시용이며 측정된 공정 지형과 구분합니다. [전체 인계 체크리스트](../MANUFACTURING.md)를 사용하세요.\n"
  (folder/'README.md').write_text(body,encoding='utf-8')
 root='# Resistor 물리 라이브러리 · 14개 실습\n\n8개 CMOS 로직 셀과 6개 전원·클록·아날로그 코어입니다. 공개 PCell 실제 마스크, Magic DRC/PEX, Netgen LVS, ngspice 전후 해석을 실행했습니다. **제조 승인 완료 파일은 아닙니다.**\n\n[설계 파일 전체 다운로드](https://github.com/Lead729726-cell/Resistor/releases/download/v0.17.0/Resistor-Physical-Library.zip) · [영상 가이드](https://resistor-downloads.vercel.app/tutorial/physical-logic) · [칩 실습 영상](https://resistor-downloads.vercel.app/tutorial/physical-chips)\n\n| 레퍼런스 | DRC | LVS | PEX | 기생 후 기준 |\n|---|---|---|---|---|\n'+'\n'.join(matrix)+'\n\nPLL은 실행 완료지만 주파수/위상 잠금 기준 FAIL입니다. 실패 보고서와 파형을 유지합니다. 14개 실제 물리 검사 / 13개 기생 후 기능 기준 통과는 foundry signoff와 다릅니다.\n\n'+ '\n'.join(f"- [{r['name']}]({r['reference']}/README.md)" for r in evidence['rows'])+'\n\n파일: `*.register.zip`은 회로·조건·계층을 편집할 프로젝트, GDS/OASIS는 마스크, `.mos.json`은 회로와 표시 metadata, core SPICE와 pre/post 폴더는 원본 실행 입력·보고서, CSV/PNG는 실제 관측 데이터입니다. 가져온 프로젝트는 runs=0에서 시작합니다. 모든 binary와 sidecar는 다운로드 ZIP에 포함되며 모델과 deck은 설치된 pinned 공개 PDK를 사용합니다.\n\n재현: `node scripts/physical-library.mjs` → `node scripts/physical-import-check.mjs` → `python scripts/physical-deliverables.py`. native tool/model/deck hash는 각 manifest.json, 구현 hash는 evidence.json에 있습니다.\n'
 (OUT/'README.md').write_text(root,encoding='utf-8')
def plots():
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 for folder in OUT.iterdir():
  if not folder.is_dir() or not (folder/'post-result.json').exists():continue
  fig,axes=plt.subplots(2,1,figsize=(10,6),layout='constrained');fig.suptitle(folder.name+' | actual ngspice | TT / 27 C / 1.8 V / RC typical')
  for ax,stage in zip(axes,['pre','post']):
   with (folder/(stage+'-waveforms.csv')).open(encoding='utf-8') as f:
    reader=csv.reader(f);headers=next(reader);data=[list(map(float,r)) for r in reader]
   x=[r[0] for r in data];result=json.loads((folder/(stage+'-result.json')).read_text(encoding='utf-8'));ac=result['measurements']['analysis']=='ac';pick=[i for i,h in enumerate(headers) if i and re_signal(h)]
   if not pick:pick=[1]
   stride=max(1,len(data)//10000)
   for i in pick[:5]:
    y=[r[i] for r in data];ax.plot(x[::stride] if ac else [v*1e6 for v in x[::stride]],y[::stride],label=headers[i],linewidth=.8)
   if ac:ax.set_xscale('log')
   ax.set_title(stage+'-layout / criteria '+result['analysis_result'].upper(),loc='left',fontsize=10);ax.set_xlabel('Frequency [Hz]' if ac else 'Time [us]');ax.set_ylabel('See trace units');ax.grid(alpha=.2);ax.legend(fontsize=8,loc='upper right')
  fig.savefig(folder/'response.png',dpi=160);plt.close(fig)
def re_signal(h):return h.split(' [')[0] in ('Y','A','B','S','OUT','REF','CTRL','TUNE','PD','OUT_gain')
def pack():
 entries=[]
 for p in sorted(OUT.rglob('*')):
  if not p.is_file() or p.name=='SHA256SUMS.json':continue
  with p.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
  entries.append({'file':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':sha})
 (OUT/'SHA256SUMS.json').write_text(json.dumps(entries,indent=2)+'\n',encoding='utf-8')
 dest=ROOT/'examples/Resistor-Physical-Library.zip'
 with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for p in sorted(OUT.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(OUT).as_posix())
 with zipfile.ZipFile(dest,'r') as verified:assert verified.testzip() is None
 print(json.dumps({'files':len(entries),'bytes':dest.stat().st_size,'sha256':hashlib.file_digest(dest.open('rb'),'sha256').hexdigest()}))
if __name__=='__main__':docs();plots();pack()
