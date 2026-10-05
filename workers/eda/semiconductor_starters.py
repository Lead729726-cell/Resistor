"""Authoritative, bounded starting conditions. PDK information is not adapter support."""
import copy
import hashlib
import json
from pathlib import Path
import re

from geometry import EDAError
import native
import profile
import design_tools

S = None
VERSION = 'register-semiconductor-starters-1'
TECHNOLOGIES = [
    {'id': 'sky130A', 'name': 'SkyWater SKY130', 'node': '130nm CMOS', 'voltages': '1.8V core · 별도 고전압 소자',
     'features': ['디지털 CMOS', '아날로그·센서', '공개 모델·물리 설계'], 'adapter': True,
     'source_url': 'https://skywater-pdk.readthedocs.io/en/main/rules.html'},
    {'id': 'gf180mcuD', 'name': 'GF180MCU', 'node': '180nm MCU CMOS', 'voltages': '3.3V / 6V 소자군',
     'features': ['MCU·입출력', '고전압 아날로그', '공개 PDK'], 'adapter': False,
     'reason': '공정 특징 비교용입니다. 현재 스타터 회로의 GF180 모델·PCell 어댑터는 연결되지 않았습니다.',
     'source_url': 'https://github.com/google/gf180mcu-pdk'},
    {'id': 'ihp-sg13g2', 'name': 'IHP SG13G2', 'node': '130nm SiGe BiCMOS', 'voltages': '1.2V core / 3.3V 소자군',
     'features': ['아날로그·RF', 'SiGe HBT', '공개 PDK'], 'adapter': False,
     'reason': '공정 특징 비교용입니다. 현재 스타터 회로의 IHP 모델·PCell 어댑터는 연결되지 않았습니다.',
     'source_url': 'https://github.com/IHP-GmbH/IHP-Open-PDK'},
]
MODES = [
    {'id': 'nominal', 'name': '기본 · TT / 27°C / 1.8V', 'settings': {'corner': 'tt', 'temperature_C': 27, 'supply_V': 1.8, 'vds_V': 1.8}},
    {'id': 'slow_hot', 'name': '저전압·고온 · SS / 125°C / 1.62V', 'settings': {'corner': 'ss', 'temperature_C': 125, 'supply_V': 1.62, 'vds_V': 1.62}},
    {'id': 'fast_cold', 'name': '빠른 코너·저온 · FF / −40°C / 1.8V', 'settings': {'corner': 'ff', 'temperature_C': -40, 'supply_V': 1.8, 'vds_V': 1.8}},
]
PRESETS = {
    'first_cmos': {'title': '내 첫 CMOS', 'subtitle': '입력이 뒤집히는 가장 작은 디지털 회로', 'category': '디지털',
        'example': 'inverter', 'layout': 'physical', 'features': ['NMOS + PMOS', '공개 inv_1 + well tap', '입력·출력·전류 파형'],
        'testbench': {'analysis': 'tran', 'duration_s': 100e-9, 'step_s': 20e-12, 'load_F': 5e-15},
        'observe': ['입력 A와 출력 Y가 반전되는지 확인', '부하·코너 변경에 따른 지연과 공급 전류 비교']},
    'mos_characteristics': {'title': '내 MOS 특성 실험', 'subtitle': '게이트 전압과 드레인 전류의 관계', 'category': '소자',
        'example': 'mosfet', 'layout': 'physical', 'features': ['NMOS 1개', 'W 0.65µm / L 0.15µm', '실제 DC I–V'],
        'testbench': {'analysis': 'dc', 'duration_s': 100e-9, 'step_s': 100e-12},
        'observe': ['VGS에 따라 Id가 달라지는 곡선 확인', '소자 폭·길이를 바꾸고 새 해석 비교']},
    'mux4_reference': {'title': '내 4:1 MUX', 'subtitle': '네 입력 중 하나를 선택하는 20-MOS 회로', 'category': '디지털',
        'template_id': 'mux4', 'parameters': {'w_um': .65, 'l_um': .15, 'slot_ns': 20, 'rise_ns': .1}, 'physical_core': True,
        'layout': 'physical', 'features': ['전송 게이트 + 출력 버퍼', '입력 변경 간격 20ns', '실제 64개 진리표'],
        'testbench': {'analysis': 'tran', 'duration_s': 1280e-9, 'step_s': 100e-12, 'load_F': 5e-15},
        'observe': ['S1/S0에 따라 D0~D3가 선택되는지 확인', 'DRC·LVS·PEX 뒤 post-layout 결과 비교']},
    'current_reference': {'title': '내 전류 기준', 'subtitle': '기준 전류를 다른 가지에 복사하는 회로', 'category': '아날로그',
        'template_id': 'current_mirror', 'parameters': {'w_um': .65, 'l_um': .15, 'reference_current_A': 100e-6}, 'physical_core': True,
        'layout': 'physical', 'features': ['NMOS 전류 미러', '기준 전류 100µA', '실제 OP 전류·복사 비율'],
        'testbench': {'analysis': 'op', 'duration_s': 100e-9, 'step_s': 100e-12},
        'observe': ['실제 출력 전류와 기준 전류의 비율 확인', '출력 전압과 코너를 바꾸어 복사 오차 비교']},
    'differential_sensor': {'title': '내 차동 센서 입력', 'subtitle': '두 입력의 작은 차이를 전류로 읽기', 'category': '아날로그',
        'template_id': 'differential_pair', 'parameters': {'w_um': .65, 'l_um': .15, 'common_mode_V': .9, 'tail_bias_V': .7, 'differential_V': .01}, 'physical_core': True,
        'layout': 'physical', 'features': ['NMOS 3개', '공통 모드 0.9V · 차이 10mV', '실제 출력·tail 전류'],
        'testbench': {'analysis': 'op', 'duration_s': 100e-9, 'step_s': 100e-12},
        'observe': ['두 출력 가지의 전류 차이 확인', '차동 입력·공통 모드·tail 바이어스 변경 비교']},
    'sensor_amplifier': {'title': '내 센서 증폭기', 'subtitle': '바이어스와 AC 입력이 준비된 공통 소스', 'category': '아날로그',
        'template_id': 'common_source_bias', 'parameters': {}, 'physical_core': False,
        'layout': 'schematic', 'features': ['저항 분압 바이어스', '입력 커플링 C', '실제 AC 이득·위상'],
        'testbench': {'analysis': 'ac', 'duration_s': 100e-9, 'step_s': 100e-12},
        'observe': ['저주파 이득과 반전 위상 확인', '저항·커플링 C를 바꾸어 주파수 응답 비교']},
    'common_source_curve': {'title': '내 MOS 증폭 특성', 'subtitle': '저항 부하 MOS의 DC 전달 곡선', 'category': '소자',
        'template_id': 'common_source', 'parameters': {}, 'physical_core': False,
        'layout': 'schematic', 'features': ['NMOS + drain 저항', '실제 입력 전압 sweep', '전달 곡선·동작점'],
        'testbench': {'analysis': 'dc', 'duration_s': 100e-9, 'step_s': 100e-12},
        'observe': ['입력에 따른 OUT 변화 확인', '폭·길이와 drain 저항을 바꾸어 바이어스 비교']},
    'signal_filter': {'title': '내 신호 필터', 'subtitle': '느린 신호는 통과시키는 이상적 RC 기초', 'category': '회로 기초',
        'template_id': 'rc_lowpass', 'parameters': {'resistance_Ohm': 10000, 'capacitance_F': 1e-12}, 'physical_core': False,
        'layout': 'schematic', 'ideal_components': True, 'features': ['R 10kΩ · C 1pF', '설정 시정수 10ns', '실제 응답에서 시정수 측정'],
        'testbench': {'analysis': 'tran', 'duration_s': 200e-9, 'step_s': 100e-12},
        'observe': ['계단 입력 뒤 OUT 상승과 측정 시정수 확인', '이상적 RC이며 반도체 공정 효과는 포함하지 않음']},
}


def configure(server):
    global S
    S = server


def configuration(preset_id, mode='nominal'):
    if not isinstance(preset_id,str) or not isinstance(mode,str) or preset_id not in PRESETS or mode not in {m['id'] for m in MODES}:
        raise EDAError('UNSUPPORTED_STARTER', 'Unknown semiconductor preset or operating condition.')
    preset = copy.deepcopy(PRESETS[preset_id])
    if preset.get('ideal_components') and mode != 'nominal':
        raise EDAError('UNSUPPORTED_STARTER_MODE', 'Ideal RC has no process corner effect.')
    conditions = next(m for m in MODES if m['id'] == mode)
    preset['testbench'] = native.testbench({**preset['testbench'], **conditions['settings']})
    if preset_id == 'mux4_reference' and mode == 'slow_hot':
        preset['testbench'].update(step_s=50e-12, load_F=50e-15)
    preset['metadata'] = {'schema_version': 1, 'catalog_version': VERSION, 'id': preset_id, 'title': preset['title'],
        'technology_id': 'sky130A', 'mode': mode, 'mode_name': conditions['name'],
        'initial_testbench': copy.deepcopy(preset['testbench']), 'layout_scope': preset['layout'],
        'ideal_components': preset.get('ideal_components', False), 'observe': preset['observe'],
        'source_url': TECHNOLOGIES[0]['source_url'], 'verification': 'not-run'}
    return preset


def catalog():
    ready = profile.capabilities()['available']
    technologies = copy.deepcopy(TECHNOLOGIES)
    for technology in technologies:
        root = Path('/foss/pdks') / technology['id']
        technology.update(installed=root.is_dir(), execution_available=bool(technology['adapter'] and ready))
    presets = []
    for key, spec in PRESETS.items():
        resolved = configuration(key)
        presets.append({'id': key, 'technology_id': 'sky130A', 'title': spec['title'], 'subtitle': spec['subtitle'],
            'category': spec['category'], 'features': spec['features'], 'observe': spec['observe'], 'layout': spec['layout'],
            'ideal_components': spec.get('ideal_components', False), 'testbench': resolved['testbench'],
            'modes': ['nominal'] if spec.get('ideal_components') else [m['id'] for m in MODES],
            'configurations': {m['id']: configuration(key, m['id'])['testbench'] for m in MODES if not spec.get('ideal_components') or m['id'] == 'nominal'},
            'execution_available': ready})
    return {'schema_version': 1, 'version': VERSION, 'technologies': technologies, 'presets': presets, 'modes': copy.deepcopy(MODES)}


def create(params):
    if set(params) - {'preset_id', 'mode', 'name', 'command_id'}:
        raise EDAError('INVALID_PARAMETER', 'Starter accepts a preset, operating mode, project name and command identifier.')
    config = configuration(params.get('preset_id'), params.get('mode', 'nominal'))
    cid, name = params.get('command_id'), params.get('name') or config['title']
    if not isinstance(cid, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', cid):
        raise EDAError('INVALID_COMMAND_ID', 'Starter creation requires a bounded command identifier.')
    if not isinstance(name, str) or not name.strip() or len(name) > 128 or any(ord(c) < 32 for c in name):
        raise EDAError('INVALID_NAME', 'Project name must have 1..128 plain characters.')
    if 'template_id' in config:
        return design_tools.create_template({'template_id': config['template_id'], 'name': name,
            'parameters': config['parameters'], 'physical_core': config['physical_core'], 'command_id': cid,
            'starter_id': params['preset_id'], 'starter_mode': params.get('mode', 'nominal')})
    fingerprint = hashlib.sha256(json.dumps({'method': 'starter.create', 'params': params}, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    with S.LOCK:
        rows = S.DB.execute('SELECT payload_hash,result FROM receipts WHERE command_id=?', (cid,)).fetchall()
        if rows:
            if len(rows) != 1 or rows[0][0] != fingerprint:
                raise EDAError('COMMAND_ID_CONFLICT', 'Command identifier was already used for different inputs.')
            return json.loads(rows[0][1])
        return S.mutate('starter.create', params, lambda: S.create({'name': name, 'example': config['example']}, starter=config))


def rpc(method, params):
    if method == 'starter.catalog':
        if params:
            raise EDAError('INVALID_PARAMETER', 'Catalog has no input parameters.')
        return catalog()
    if method == 'starter.create':
        return create(params)
    raise EDAError('UNKNOWN_METHOD', 'Unknown semiconductor starter method.')
