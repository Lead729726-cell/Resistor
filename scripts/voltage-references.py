"""Authored Register layouts and explicit Voltage process assumptions; no foundry Z claims."""
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path
import klayout.db as k

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'workers/eda'))
import geometry

OUT = ROOT / 'examples/voltage-references'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = 'Register authored CC0 reference; assumed dimensions, not measured or foundry process data'
COLORS = ['#67b8a7', '#88aef0', '#dfb963', '#a29ae8', '#df879d']
LAYER_NAMES = ['substrate-outline', 'mesa-or-hole-mask', 'metal1', 'dielectric-opening', 'metal2']

def package_references():
    logos=OUT/'logo';logos.mkdir(exist_ok=True)
    shutil.copyfile(ROOT/'public/register-symbol.svg',logos/'register-resistor.svg')
    shutil.copyfile(ROOT/'apps/desktop/assets/register.png',logos/'register-resistor.png')
    # Register's scene contract labels authored example geometry as fixture.
    for file in OUT.glob('*/*.register-view.json'):
        value=json.loads(file.read_text(encoding='utf-8'));value['scene']['source']='fixture'
        file.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    archive=ROOT/'examples/register-voltage-references.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for file in sorted(OUT.rglob('*')):
            if file.is_file():z.write(file,file.relative_to(OUT).as_posix())
    return archive

if '--package-only' in sys.argv:
    print(package_references());sys.exit(0)

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def step(ident, name, kind, amount, model='conformal', sidewall=1, mask='all', target=0):
    return dict(id=ident, name=name, kind=kind, model=model, amount=amount,
                sidewall=sidewall, color=COLORS[(len(ident)+target) % len(COLORS)],
                mask=mask, inverse=False, target=target, source=SOURCE)

def recipe(initial, steps, height=.55, heightmap=None):
    value = dict(schema_version=1, model='voltage-voxel-emulation-v1',
                 domain=dict(bounds=[-1.6,-1.2,1.6,1.2], zMin=-1.05,zMax=1.45,nx=64,ny=48,nz=100),
                 initial=initial, initialHeight=height, initialMask='2/0', threshold=45,steps=steps)
    if heightmap: value['heightmap']=heightmap
    return value

def authored(ident, name, objective, draw, config):
    folder=OUT/ident; folder.mkdir(exist_ok=True)
    layout=k.Layout(); layout.dbu=.001; top=layout.create_cell(ident.upper().replace('-','_'))
    def box(layer, x1,y1,x2,y2):
        top.shapes(layout.layer(layer,0)).insert(k.Box(*[round(v*1000) for v in [x1,y1,x2,y2]]))
    def wire(layer, points, width):
        top.shapes(layout.layer(layer,0)).insert(k.Path([k.Point(round(x*1000),round(y*1000)) for x,y in points],round(width*1000)))
    box(1,-1.6,-1.2,1.6,1.2); draw(box,wire)
    geometry.assign_ids(layout)
    gds=folder/(ident+'.gds');layout.write(str(gds))
    sha=hashlib.sha256(gds.read_bytes()).hexdigest()
    layers=[]
    for i in layout.layer_indices():
        info=layout.get_info(i); li=info.layer
        layers.append(dict(gds_layer=li,datatype=0,name=LAYER_NAMES[li-1],color=COLORS[li-1],opacity=.8,
                           z_start=[-.1,0,.55,.85,1.05][li-1],thickness=[.1,.55,.12,.12,.16][li-1],
                           kind=['marker','active','routing','contact','routing'][li-1],material='authored',source=SOURCE))
    save(folder/(ident+'.stack.json'),dict(schema_version=1,units='um',name=name+' · 작성 가정',layers=layers))
    if config['initial'].startswith('gds') or any(s['mask']!='all' for s in config['steps']): config['geometry_hash']=sha
    save(folder/(ident+'.recipe.json'),config)
    if config.get('heightmap'): save(folder/(ident+'.heightmap.json'),config['heightmap'])
    register_layers=[dict(id=f"{l['gds_layer']}/0",name=l['name'],gds=[l['gds_layer'],0],color=l['color'],opacity=l['opacity'],
                         z_display_um=l['z_start'],thickness_display_um=l['thickness'],source='illustrative',
                         physical_z_um=None,physical_thickness_um=None,material=l['material'],style_source='illustrative') for l in layers]
    project=dict(id='voltage-reference-'+ident,revision=1,cell=top.name,dbu_um=.001,grid_dbu=1,source='fixture',schematic=dict(devices=[]))
    scene=geometry.scene(layout,project,register_layers)
    save(folder/(ident+'.register-view.json'),dict(schema_version=1,kind='register-view',name=name,scene=scene,
              display=dict(projection='orthographic',preset='iso',explode=0,clip=dict(axis='none',fraction=1),layers={},showLabels=True)))
    return dict(id=ident,name=name,objective=objective,kind='authored-geometry-and-process-assumptions',gds=ident+'/'+gds.name,
                stack=ident+'/'+ident+'.stack.json',recipe=ident+'/'+ident+'.recipe.json',register_view=ident+'/'+ident+'.register-view.json',
                sha256=sha,shapes=scene['total_shape_count'],process_initial=config['initial'])

def resistor(box, wire):
    box(2,-1.3,-.7,1.3,.7)
    wire(3,[(-1.25,-.65),(-1.25,.65),(-.65,.65),(-.65,-.65),(0,-.65),(0,.65),(.65,.65),(.65,-.65),(1.25,-.65),(1.25,.65)],.14)
    for x in [-1.25,1.25]:box(5,x-.17,-.95,x+.17,-.65)

def terrace(box, wire):
    box(2,-1.25,-.85,-.25,.85);box(2,.3,-.85,.85,.85)
    wire(3,[(-1.45,0),(1.45,0)],.22)

def holes(box, wire):
    for x in [-.9,0,.9]:
        box(2,x-.19,-.26,x+.19,.26);box(4,x-.25,-.32,x+.25,.32)
    wire(3,[(-1.4,-.7),(1.4,-.7)],.2);wire(5,[(-1.4,.7),(1.4,.7)],.2)

def crossing(box, wire):
    box(2,-.7,-.7,.7,.7);wire(3,[(-1.4,-.35),(1.4,-.35)],.22)
    wire(5,[(.35,-1.05),(.35,1.05)],.22);box(4,.19,-.51,.51,-.19)

surface=dict(schema_version=1,units='um',source=SOURCE+'; authored shallow dish and raised shoulders',
             x_um=[-1.6,-.9,0,.9,1.6],y_um=[-1.2,-.5,0,.5,1.2],
             height_um=[[0,0,0,0,0],[0,.18,.08,.18,0],[0,.18,-.12,.18,0],[0,.18,.08,.18,0],[0,0,0,0,0]])
refs=[
    authored('01-serpentine-resistor','지그재그 저항 배선','좁은 저항 배선과 접점, 평탄하지 않은 초기 표면 위 피복',resistor,
             recipe('heightmap',[step('oxide','절연막 가정','deposit',.10),step('resistor-film','저항막 가정','deposit',.14,'directional',.4,'3/0')],heightmap=surface)),
    authored('02-step-coverage','단차 위 금속 피복','높은 terrace와 낮은 field를 연결하는 금속의 측벽 피복 비교',terrace,
             recipe('gds-mesa',[step('liner','절연 liner 가정','deposit',.10),step('pvd-metal','방향성 금속 가정','deposit',.18,'directional',.2)])),
    authored('03-deep-via-holes','깊은 홀과 via 입구','3개 hole의 측벽, 바닥과 상부 입구를 3축 단면으로 확인',holes,
             recipe('gds-hole',[step('barrier','등방 barrier 가정','deposit',.08),step('fill-metal','방향성 fill 가정','deposit',.20,'directional',.18)],height=.72)),
    authored('04-crossing-cmp','다층 배선과 CMP','직교 배선, via 마스크와 CMP 전후 매립 구조 비교',crossing,
             recipe('gds-mesa',[step('metal1','하부 금속 가정','deposit',.16,'directional',.35,'3/0'),step('imd','층간 절연막 가정','deposit',.3),step('cmp','CMP 기준면 가정','cmp',.64),step('via-etch','via 수직 식각 가정','etch',.32,'vertical',1,'4/0',3),step('metal2','상부 금속 가정','deposit',.18,'directional',.35,'5/0')],height=.35))
]

folder=OUT/'05-sky130-mux4';folder.mkdir(exist_ok=True)
src=ROOT/'examples/mux4/mux4.gds';shutil.copyfile(src,folder/'sky130-mux4.gds')
project=json.loads((ROOT/'examples/mux4/mux4.project.json').read_text(encoding='utf-8'))
save(folder/'sky130-mux4.stack.json',dict(schema_version=1,units='um',name='Register SKY130A MUX4 · 실제 XY / Z 미지정',
    layers=[dict(gds_layer=l['gds'][0],datatype=l['gds'][1],name=l['name'],color=l['color'],opacity=l['opacity'],z_start=None,thickness=None,kind='unknown',material='mask',source='Register SKY130A layout; physical Z is not provided') for l in project['layers']]))
refs.append(dict(id='05-sky130-mux4',name='실제 SKY130A 4:1 MUX',objective='레지스터의 기존 실제 PDK 설계로 hierarchy와 다층 배선을 확인; Z 정보는 별도 공정 자료 필요',kind='existing-register-sky130-layout',gds='05-sky130-mux4/sky130-mux4.gds',stack='05-sky130-mux4/sky130-mux4.stack.json',sha256=hashlib.sha256(src.read_bytes()).hexdigest()))
save(OUT/'catalog.json',dict(schema_version=1,producer='Register',consumer='Voltage',license='CC0 for the four authored examples; SKY130 MUX uses the existing Register/public PDK layout provenance',references=refs,
    limitations=['GDS contains XY only. Stack Z, heightmap and process recipes are explicitly authored assumptions.', 'Process emulation is not measured, calibrated TCAD or foundry signoff.', 'No electrical current, resistance or reliability result is asserted by these reference files.']))
guide='''# 레지스터 → 볼테지 레퍼런스 5종

각 폴더에서 GDS와 stack JSON을 짝으로 사용하세요.

1. 볼테지의 `파일 열기`에서 `.gds`를 선택합니다.
2. 메타데이터 파일로 같은 폴더의 `.stack.json`을 선택하고 `업로드 & 탐색`을 누릅니다.
3. 공정 형상 검사를 열고 `설정 열기`에서 같은 폴더의 `.recipe.json`을 불러옵니다. `전체 공정 검사 실행`을 누릅니다.
4. `투시 검토`, `단면 검토`, XY/XZ/YZ 연동 단면, 국부 두께와 재료 집중을 사용하세요.
5. CMP 예제는 단계 수를 줄여 2단계(CMP 전), 3단계(CMP 후), 5단계(상부 금속 후)를 비교할 수 있습니다.

- 01: 저항 배선 + 작성한 높이 지도. recipe에 heightmap이 포함되어 있습니다.
- 02: 두 terrace 위의 방향성 금속 피복.
- 03: 깊은 via hole, barrier와 방향성 fill.
- 04: 직교 다층 배선, 절연막, CMP와 via 식각.
- 05: 기존 레지스터 SKY130A MUX4 실제 XY 설계. Z/공정 recipe는 제공하지 않습니다.

01~04의 `.register-view.json`은 레지스터 독립 뷰어에서 열 수 있습니다.

작성한 Z/막 두께/초기 표면은 설명용 가정이며 실측값이나 foundry PDK 값이 아닙니다. GDS 자체에 Z나 전류 계산 결과는 없습니다. 01~04는 원본 교육용 기하 자료(CC0), 05는 기존 실제 설계의 레이아웃 참조입니다.
'''
(OUT/'README.md').write_text(guide,encoding='utf-8')
archive=package_references()
print(json.dumps(dict(references=len(refs),archive=str(archive),bytes=archive.stat().st_size),ensure_ascii=False))
