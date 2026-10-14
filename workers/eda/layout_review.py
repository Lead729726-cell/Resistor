"""Local, revision-bound design intent review. KLayout owns all mask geometry.

No circuit, material, device or signoff conclusion is inferred from GDS.
Reviews and reports are separate from native engine job verdicts.
"""
import copy
from decimal import Decimal
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import re
import uuid
import klayout.db as k
import geometry as G
from geometry import EDAError

S = None
ADAPTER_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
MAX_SHAPES = 20000
MAX_VERTICES = 200000
KINDS = {
    'symmetry': ('Exact reflected mask XOR', ['layout', 'axis']),
    'spacing': ('Exact minimum polygon edge distance', ['layout', 'minimum_spacing']),
    'fixed_region': ('Baseline/candidate clipped mask XOR', ['layout', 'baseline', 'region']),
    'relative_position': ('Bounding-box edge ordering', ['layout', 'direction']),
    'orientation': ('Recorded instance transform', ['instance_transform', 'expected_orientation']),
    'matching': ('Electrical matching requires characterized device/model/PVT evidence', ['netlist', 'models', 'simulation', 'acceptance_criteria']),
    'dummy': ('Designer inspection; device and process mapping required', ['device_mapping', 'pdk_rules', 'acceptance_criteria']),
    'route_length': ('Electrical route length requires an extracted path', ['extracted_path', 'acceptance_criteria']),
    'shielding': ('Shield connectivity and process rules required', ['netlist', 'layer_mapping', 'pdk_rules', 'acceptance_criteria']),
    'well_body': ('Body/well connectivity requires extracted connectivity', ['netlist', 'extraction', 'pdk_rules', 'acceptance_criteria']),
    'note': ('Designer review note; no automatic verdict', ['human_review']),
}
LIMITS = [
    'Geometric intent checks are not DRC, LVS, PEX, electrical matching or foundry signoff.',
    'GDS/OASIS does not establish a circuit, material stack or physical thickness.',
    'No customer or PDK data is sent to an external AI service by this workflow.',
    'Customer value and superiority over existing tools remain unmeasured.',
    'Whole expanded mask review is bounded at 20000 shapes / 200000 vertices; limits fail closed.',
]

def configure(server):
    global S
    S = server
    S.DB.executescript('''CREATE TABLE IF NOT EXISTS layout_reviews(id TEXT PRIMARY KEY, project_id TEXT, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS layout_review_reports(id TEXT PRIMARY KEY, review_id TEXT, data TEXT NOT NULL, sha256 TEXT NOT NULL);''')
    S.DB.commit()

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()).hexdigest()

def text(value, name, maximum=2048):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum or any(ord(c) < 32 and c not in '\n\t' for c in value):
        raise EDAError('INVALID_REVIEW', name + ' must be nonempty bounded text.')
    return value.strip()

def integer(value):
    return G.coord(value)

def box(value):
    if not isinstance(value, list) or len(value) != 4:
        raise EDAError('INVALID_REVIEW', 'Region needs four integer DBU strings.')
    numbers = [integer(v) for v in value]
    if numbers[0] >= numbers[2] or numbers[1] >= numbers[3]:
        raise EDAError('INVALID_REVIEW', 'Region must have positive area.')
    return numbers

def context(p):
    return {'schema_version': 1, 'edition': 'indust', 'product_id': 'resistor.indust', 'product_name': 'Resistor Indust',
            'project_id': p['id'], 'revision': p['revision'], 'process': {'id': p['pdk_id'], 'source': p['source'],
            'mapping_status': 'configured-analysis' if p.get('analysis_setup') else 'public-reference' if p.get('template_source') else 'unconfirmed',
            'lock_sha256': S.cached_sha(S.snapshot_dir(p) / 'pdk-lock.json')},
            'engine': {'name': 'KLayout', 'version': k.__version__, 'review_adapter_sha256': ADAPTER_SHA256,
                       'implementation_sha256': digest(S.ENGINE_ADAPTERS)}}

def snapshot(p):
    layout = S.load_layout(p)
    scene = G.scene(layout, p, p['layers'], {'max_shapes': MAX_SHAPES})
    if scene['truncated']:
        raise EDAError('REVIEW_LIMIT', 'Whole-layout review exceeds 20000 shapes; no partial PASS is returned.')
    count = 0
    records = []
    ids = set()
    for shape, poly, layer, cell_path in G.walk(layout, layout.cell(p['cell'])):
        count += poly.num_points()
        if count > MAX_VERTICES:
            raise EDAError('REVIEW_LIMIT', 'Whole-layout review exceeds 200000 vertices.')
        ident = cell_path + '/' + str(shape.property(1))
        if ident in ids:
            raise EDAError('AMBIGUOUS_TARGET', 'Duplicate expanded shape IDs require explicit source repair.')
        ids.add(ident)
        hull = G.canonical_ring(poly.each_point_hull())
        holes = sorted(G.canonical_ring(poly.each_point_hole(i)) for i in range(poly.holes()))
        payload = {'layer_id': layer, 'hull': hull, 'holes': holes}
        bounds = poly.bbox()
        records.append({'id': ident, 'cell_path': cell_path, **payload, 'signature': digest(payload),
                        'bbox': [str(bounds.left), str(bounds.bottom), str(bounds.right), str(bounds.top)],
                        'net': shape.property(2), 'device_id': shape.property(3)})
    unsupported = []
    for cell in layout.each_cell():
        for li in layout.layer_indices():
            for shape in cell.shapes(li).each():
                if G.shape_poly(shape) is None and not shape.is_text():
                    unsupported.append({'cell': cell.name, 'layer': layout.get_info(li).to_s()})
    if unsupported:
        raise EDAError('UNSUPPORTED_GEOMETRY', 'Unreviewable elements exist; review is not a successful export.', unsupported[:20])
    frequencies = {}
    for row in records: frequencies[row['signature']] = frequencies.get(row['signature'], 0) + 1
    for row in records: row['signature_occurrences'] = frequencies[row['signature']]
    return {'context': context(p), 'dbu_um': str(layout.dbu), 'top_cell': p['cell'],
            'layout_sha256': S.cached_sha(S.snapshot_dir(p) / 'layout.oas'),
            'geometry_hash': G.semantic_hash(layout, layout.cell(p['cell'])), 'hierarchy_hash': G.hierarchy_hash(layout),
            'identity_hash': G.identity_hash(layout), 'shape_count': len(records), 'shapes': records,
            'scene': scene, 'annotations': scene['labels'], 'instances': scene['instances']}

def polygon(record):
    poly = k.Polygon([k.Point(*pt) for pt in record['hull']])
    for ring in record['holes']:
        poly.insert_hole([k.Point(*pt) for pt in ring])
    return poly

def region(records):
    result = k.Region()
    for record in records:
        result.insert(polygon(record))
    return result.merged()

def resolve(anchor, snap):
    by_id = [row for row in snap['shapes'] if row['id'] == anchor['id']]
    if len(by_id) == 1:
        return {'status': 'stable_id', 'changed': by_id[0]['signature'] != anchor['signature'], 'shape': by_id[0]}
    exact = [row for row in snap['shapes'] if row['signature'] == anchor['signature']]
    if len(exact) == 1 and anchor.get('signature_occurrences', 1) == 1:
        return {'status': 'unique_exact_geometry', 'changed': False, 'shape': exact[0]}
    return {'status': 'ambiguous' if exact else 'unresolved', 'changed': None, 'shape': None}

def require_review(params):
    row = S.DB.execute('SELECT data FROM layout_reviews WHERE id=?', (params.get('review_id'),)).fetchone()
    if not row:
        raise EDAError('NOT_FOUND', 'Layout review not found.')
    review = json.loads(row[0])
    if params.get('project_id') != review['project_id']:
        raise EDAError('PROJECT_MISMATCH', 'Review belongs to another project.')
    return review

def put(review):
    S.DB.execute('INSERT OR REPLACE INTO layout_reviews VALUES(?,?,?)', (review['id'], review['project_id'], json.dumps(review, ensure_ascii=False)))

def guard(review, params):
    if 'expected_revision' not in params or not params.get('command_id'):
        raise EDAError('REVISION_REQUIRED', 'A revision and idempotent command_id are required.')
    if params.get('expected_review_revision') != review['review_revision']:
        raise EDAError('REVIEW_CONFLICT', 'Review notes changed; reload before applying.', {'review_revision': review['review_revision']})

def catalog():
    return {'schema_version': 1, 'edition': 'indust', 'product_name': 'Resistor Indust', 'kinds': [
        {'id': name, 'method': method, 'required_data': required,
         'automatic': name in ('symmetry', 'spacing', 'fixed_region', 'relative_position')}
        for name, (method, required) in KINDS.items()], 'limits': LIMITS, 'local_only': True, 'automatic_modification': False}

def create(params):
    def action():
        p = S.get_project(params['project_id'])
        snapshot(p)  # Validate before making a copy.
        work = S.clone_project({'project_id': p['id'], 'name': params.get('name') or p['name'] + ' · review'})
        work['review_source'] = {'project_id': p['id'], 'revision': p['revision']}
        # The immutable copied layout is the baseline. Source is never edited.
        review = {'id': uuid.uuid4().hex, 'schema_version': 1, 'edition': 'indust', 'project_id': work['id'],
                  'revision': work['revision'], 'review_revision': 1, 'baseline_revision': work['revision'],
                  'source': {**context(p), 'layout_sha256': snapshot(p)['layout_sha256'], 'import': p.get('import_metadata')},
                  'name': work['name'], 'created_at': S.now(), 'constraints': [], 'decisions': [], 'reports': [], 'latest': None}
        put(review)
        return {**review, 'context': context(work), 'working_project': work, 'source_preserved': True, 'limits': LIMITS}
    if 'expected_revision' not in params or not params.get('command_id'):
        raise EDAError('REVISION_REQUIRED', 'Review creation requires the source revision and command_id.')
    return S.mutate('review.create', params, action)

def constraint(review, value, candidate):
    if not isinstance(value, dict) or set(value) - {'kind', 'title', 'reason', 'priority', 'author', 'target_ids', 'criteria', 'id'}:
        raise EDAError('INVALID_REVIEW', 'Unsupported constraint fields.')
    kind = value.get('kind')
    if kind not in KINDS:
        raise EDAError('INVALID_REVIEW', 'Unsupported intent kind.')
    targets = value.get('target_ids', [])
    if not isinstance(targets, list) or len(targets) > 32 or len(set(targets)) != len(targets) or any(not isinstance(v, str) for v in targets):
        raise EDAError('INVALID_REVIEW', 'Choose at most 32 distinct target IDs.')
    by_id = {row['id']: row for row in candidate['shapes']}
    if any(t not in by_id for t in targets):
        raise EDAError('TARGET_MISSING', 'Target must exist in the current whole-layout snapshot.')
    if kind in ('symmetry', 'spacing', 'relative_position') and len(targets) != 2:
        raise EDAError('INVALID_REVIEW', 'This first-phase check needs exactly two mask shapes.')
    criteria = value.get('criteria')
    if criteria is not None:
        if not isinstance(criteria, dict):
            raise EDAError('INVALID_REVIEW', 'Criteria must be a JSON object or omitted.')
        allowed = {'symmetry': {'axis', 'axis_twice_dbu'}, 'spacing': {'minimum_dbu'},
                   'fixed_region': {'box', 'layers'}, 'relative_position': {'direction'}}.get(kind, {'description'})
        if set(criteria) - allowed:
            raise EDAError('INVALID_REVIEW', 'Unsupported criteria fields.')
        if kind == 'symmetry':
            if criteria.get('axis') not in ('x', 'y'):
                raise EDAError('INVALID_REVIEW', 'Axis must be x or y.')
            integer(criteria.get('axis_twice_dbu'))
        if kind == 'spacing' and integer(criteria.get('minimum_dbu')) < 0:
            raise EDAError('INVALID_REVIEW', 'Minimum spacing must be nonnegative.')
        if kind == 'fixed_region':
            box(criteria.get('box'))
            layers = criteria.get('layers')
            if not isinstance(layers, list) or not layers or len(layers) > 128 or any(not re.fullmatch(r'\d{1,5}/\d{1,5}', v) for v in layers):
                raise EDAError('INVALID_REVIEW', 'Fixed region needs explicit layer/datatype IDs.')
            known = {v['id'] for v in candidate['scene']['layers']}
            if set(layers)-known: raise EDAError('UNKNOWN_LAYER', 'Choose existing layer/datatype entries; unknown process layers are not inferred.')
        if kind == 'relative_position' and criteria.get('direction') not in ('left', 'right', 'above', 'below'):
            raise EDAError('INVALID_REVIEW', 'Unsupported bbox ordering.')
        if len(json.dumps(criteria)) > 4096:
            raise EDAError('INVALID_REVIEW', 'Criteria exceed the bounded data limit.')
    priority = value.get('priority', 'must')
    if priority not in ('must', 'should', 'note'):
        raise EDAError('INVALID_REVIEW', 'Priority must be must, should or note.')
    return {'id': uuid.uuid4().hex, 'kind': kind, 'title': text(value.get('title'), 'Title', 160),
            'reason': text(value.get('reason'), 'Design rationale'), 'priority': priority,
            'author': text(value.get('author'), 'Author', 128), 'revision': candidate['context']['revision'],
            'review_revision': review['review_revision'] + 1, 'created_at': S.now(), 'criteria': criteria,
            'method': KINDS[kind][0], 'required_data': KINDS[kind][1], 'targets': [copy.deepcopy(by_id[t]) for t in targets]}

def save_constraint(params):
    def action():
        review = require_review(params); guard(review, params)
        if len(review['constraints']) >= 256:
            raise EDAError('REVIEW_LIMIT', 'Review supports at most 256 constraints.')
        candidate = snapshot(S.get_project(review['project_id']))
        review['constraints'].append(constraint(review, params.get('constraint'), candidate))
        review['review_revision'] += 1; review['latest'] = None; put(review)
        return status(params)
    return S.mutate('review.add_constraint', params, action)

def change_constraint(params, remove=False):
    method = 'review.remove_constraint' if remove else 'review.update_constraint'
    def action():
        review = require_review(params); guard(review, params)
        old = next((c for c in review['constraints'] if c['id'] == params.get('constraint_id')), None)
        if old is None: raise EDAError('NOT_FOUND', 'Constraint not found in this review.')
        next_value = None if remove else constraint(review, params.get('constraint'), snapshot(S.get_project(review['project_id'])))
        review.setdefault('constraint_history', []).append({'action': 'remove' if remove else 'update', 'previous': old, 'review_revision': review['review_revision'] + 1, 'at': S.now()})
        if remove:
            review['constraints'] = [c for c in review['constraints'] if c['id'] != old['id']]
        else:
            next_value['id'] = old['id']; next_value['created_at'] = old['created_at']; next_value['updated_at'] = S.now()
            review['constraints'] = [next_value if c['id'] == old['id'] else c for c in review['constraints']]
        review['review_revision'] += 1; review['latest'] = None; put(review)
        return status(params)
    return S.mutate(method, params, action)

def point_segment_squared(pt, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = dx * dx + dy * dy
    if norm == 0:
        return Fraction((pt[0] - a[0])**2 + (pt[1] - a[1])**2)
    t = max(Fraction(0), min(Fraction(1), Fraction((pt[0]-a[0])*dx+(pt[1]-a[1])*dy, norm)))
    return (Fraction(pt[0])-a[0]-t*dx)**2 + (Fraction(pt[1])-a[1]-t*dy)**2

def distance_squared(a, b):
    pa, pb = polygon(a), polygon(b)
    ra, rb = k.Region(pa), k.Region(pb)
    if not (ra & rb).is_empty():
        return Fraction(0)
    def edges(row):
        return [(p, q) for ring in [row['hull'], *row['holes']] for p, q in zip(ring, ring[1:]+ring[:1])]
    ea, eb = edges(a), edges(b)
    if len(ea) * len(eb) > 200000:
        raise EDAError('REVIEW_LIMIT', 'Exact selected-polygon distance exceeds 200000 edge pairs.')
    answer = None
    for p, q in ea:
        for r, s in eb:
            if k.Edge(k.Point(*p), k.Point(*q)).intersects(k.Edge(k.Point(*r), k.Point(*s))):
                return Fraction(0)
            value = min(point_segment_squared(p, r, s), point_segment_squared(q, r, s),
                        point_segment_squared(r, p, q), point_segment_squared(s, p, q))
            answer = value if answer is None else min(answer, value)
    return answer

def evaluate_constraint(c, base, candidate):
    mapped = [resolve(target, candidate) for target in c['targets']]
    result = {'constraint_id': c['id'], 'title': c['title'], 'kind': c['kind'], 'priority': c['priority'],
              'method': c['method'], 'required_data': c['required_data'], 'mapping': mapped,
              'status': 'not_run', 'markers': [], 'electrical_assessment': 'not_run'}
    if any(v['shape'] is None for v in mapped):
        return {**result, 'reason': 'Target mapping unresolved or ambiguous; do not retarget an old annotation by proximity.'}
    if not c['criteria']:
        return {**result, 'reason': 'Evaluation criteria required.'}
    shapes = [v['shape'] for v in mapped]
    criteria, kind = c['criteria'], c['kind']
    try:
        if kind == 'symmetry':
            a, b = shapes
            n = integer(criteria['axis_twice_dbu'])
            reflected = polygon(a).transformed(k.ICplxTrans(1, 180 if criteria['axis'] == 'x' else 0, True, n if criteria['axis'] == 'x' else 0, n if criteria['axis'] == 'y' else 0))
            diff = (k.Region(reflected) ^ k.Region(polygon(b))).merged()
            passed = diff.is_empty() and a['layer_id'] == b['layer_id']
            metrics = {'xor_area_dbu2': str(diff.area()), 'same_layer': a['layer_id'] == b['layer_id']}
        elif kind == 'spacing':
            squared = distance_squared(*shapes)
            minimum = integer(criteria['minimum_dbu'])
            passed = squared >= minimum * minimum
            metrics = {'distance_squared_dbu2': str(squared), 'distance_um_approx': math.sqrt(float(squared))*float(candidate['dbu_um']),
                       'minimum_dbu': str(minimum), 'verdict_uses_exact_squared_distance': True}
        elif kind == 'fixed_region':
            clip = k.Region(k.Box(*box(criteria['box'])))
            areas = {}
            for layer in criteria['layers']:
                before = region([v for v in base['shapes'] if v['layer_id'] == layer]) & clip
                after = region([v for v in candidate['shapes'] if v['layer_id'] == layer]) & clip
                areas[layer] = str((before ^ after).merged().area())
            passed = all(int(area) == 0 for area in areas.values())
            metrics = {'xor_area_dbu2_by_layer': areas, 'region_dbu': criteria['box']}
            result['markers'] = [{'bbox': criteria['box'], 'layer_id': layer} for layer, area in areas.items() if int(area)]
        elif kind == 'relative_position':
            a, b = (list(map(int, v['bbox'])) for v in shapes)
            passed = {'left': a[2] <= b[0], 'right': a[0] >= b[2], 'above': a[1] >= b[3], 'below': a[3] <= b[1]}[criteria['direction']]
            metrics = {'bbox_a': shapes[0]['bbox'], 'bbox_b': shapes[1]['bbox'], 'direction': criteria['direction']}
        else:
            return {**result, 'reason': 'Required electrical/process/instance inputs are not connected to an evaluator in this first phase.'}
        if not passed and not result['markers']:
            result['markers'] = [{'shape_id': row['id'], 'bbox': row['bbox'], 'layer_id': row['layer_id']} for row in shapes]
        return {**result, 'status': 'pass' if passed else 'fail', 'metrics': metrics,
                'reason': 'Geometric criterion satisfied.' if passed else 'Geometric criterion violated.'}
    except EDAError as error:
        return {**result, 'status': 'error', 'reason': str(error), 'error_code': error.code}

def comparison(base, candidate):
    changed, removed, added, unchanged = [], [], [], 0
    used = set()
    for old in base['shapes']:
        match = resolve(old, candidate)
        new = match['shape']
        if new is None:
            removed.append({'before': old, 'mapping': match['status']})
        else:
            used.add(new['id'])
            if old['signature'] == new['signature']:
                unchanged += 1
            else:
                changed.append({'before': old, 'after': new, 'mapping': match['status']})
    added = [row for row in candidate['shapes'] if row['id'] not in used]
    layers = sorted({v['layer_id'] for v in base['shapes'] + candidate['shapes']})
    masks = []
    for layer in layers:
        before = region([v for v in base['shapes'] if v['layer_id'] == layer])
        after = region([v for v in candidate['shapes'] if v['layer_id'] == layer])
        masks.append({'layer_id': layer, 'added_area_dbu2': str((after-before).area()), 'removed_area_dbu2': str((before-after).area())})
    return {'geometry_equal': all(int(v['added_area_dbu2']) == int(v['removed_area_dbu2']) == 0 for v in masks),
            'file_bytes_equal': base['layout_sha256'] == candidate['layout_sha256'],
            'hierarchy_equal': base['hierarchy_hash'] == candidate['hierarchy_hash'],
            'annotations_equal': digest(base['annotations']) == digest(candidate['annotations']),
            'changed': changed, 'removed': removed, 'added': added, 'unchanged': unchanged, 'layers': masks,
            'electrical_impact': 'not_run', 'scope': 'Whole expanded per-layer merged masks; text and hierarchy reported separately.'}

def run_evidence(p, revision):
    values = []
    for row in S.DB.execute("SELECT data FROM runs WHERE json_extract(data,'$.project_id')=?", (p['id'],)):
        stored = json.loads(row[0])
        if stored['revision'] != revision:
            continue
        run = S.get_run(stored['id'])
        path = run.get('manifest_path')
        manifest = None
        if path:
            try:
                file = S.trusted(path)
                if file.stat().st_size <= 4*1024*1024:
                    manifest = json.loads(file.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                pass
        values.append({'id': run['id'], 'kind': run['kind'], 'revision': revision,
                       'execution_status': run['execution_status'], 'analysis_result': run['analysis_result'],
                       'freshness': run['freshness'], 'tool': run.get('tool'), 'message': run.get('message'),
                       'markers': run.get('markers', []), 'artifacts': run.get('artifacts', {}),
                       'manifest_path': path, 'manifest_sha256': S.cached_sha(S.trusted(path)) if path else None,
                       'input_conditions': manifest, 'evidence_missing': manifest is None,
                       'commercial_execution_verified': False if run.get('workflow') != 'commercial-backend' else None})
    return values

def evaluate(params):
    def action():
        review = require_review(params); guard(review, params)
        p = S.get_project(review['project_id'])
        base = snapshot(S.history_project(p['id'], review['baseline_revision']))
        candidate = snapshot(p)
        results = [evaluate_constraint(c, base, candidate) for c in review['constraints']]
        change = comparison(base, candidate)
        for result, c in zip(results, review['constraints']):
            result['affected_by_change'] = c['kind'] == 'fixed_region' and result['status'] == 'fail' or any(m['changed'] or m['shape'] is None for m in result['mapping'])
        latest = {**context(p), 'review_revision': review['review_revision'], 'baseline_revision': review['baseline_revision'],
                  'checked_at': S.now(), 'results': results, 'comparison': change,
                  'baseline': {key: value for key, value in base.items() if key not in ('scene', 'shapes')},
                  'candidate': {key: value for key, value in candidate.items() if key not in ('scene', 'shapes')},
                  'runs': run_evidence(p, p['revision']), 'limits': LIMITS,
                  'unevaluated': [v['constraint_id'] for v in results if v['status'] not in ('pass', 'fail')],
                  'freshness': 'current', 'signoff': False}
        review['latest'] = latest; put(review)
        return status(params)
    return S.mutate('review.evaluate', params, action)

def status(params):
    review = require_review(params)
    p = S.get_project(review['project_id'])
    latest = review.get('latest')
    if latest:
        latest['freshness'] = 'current' if latest['revision'] == p['revision'] and latest['review_revision'] == review['review_revision'] and latest['engine'] == context(p)['engine'] else 'stale'
        for run in latest['runs']:
            actual = S.get_run(run['id'])
            run['freshness'] = actual['freshness']
            if actual['execution_status'] != run['execution_status'] or actual['analysis_result'] != run['analysis_result']:
                latest['freshness'] = 'stale'
    return {**review, 'context': context(p), 'revision': p['revision'], 'limits': LIMITS}

def scene(params):
    review = require_review(params)
    p = S.history_project(review['project_id'], review['baseline_revision']) if params.get('baseline') else S.get_project(review['project_id'])
    return {**context(p), 'scene': snapshot(p)['scene']}

def save_report(params):
    def action():
        review = require_review(params); guard(review, params)
        current = status(params)
        if not current.get('latest') or current['latest']['freshness'] != 'current':
            raise EDAError('STALE_REVIEW', 'Run review again before saving a current report.')
        decision = params.get('decision')
        if decision not in ('needs_changes', 'accepted_for_review_scope', 'deferred'):
            raise EDAError('INVALID_REVIEW', 'Select a bounded review decision; not manufacturing approval.')
        item = {'id': uuid.uuid4().hex, 'kind': 'resistor-layout-review-report', 'schema_version': 1, 'edition': 'indust',
                'project_id': review['project_id'], 'revision': current['revision'], 'review_id': review['id'],
                'review_revision': review['review_revision'], 'source': review['source'], 'name': review['name'],
                'constraints': copy.deepcopy(review['constraints']), 'evaluation': current['latest'],
                'decision': decision, 'decision_reason': text(params.get('reason'), 'Decision reason'),
                'author': text(params.get('author'), 'Reviewer', 128), 'saved_at': S.now(), 'signoff': False, 'limits': LIMITS}
        if decision == 'accepted_for_review_scope' and (not current['latest']['results'] or any(v['priority'] == 'must' and v['status'] != 'pass' for v in current['latest']['results'])):
            raise EDAError('UNRESOLVED_REQUIREMENT', 'Mandatory failed/unevaluated requirements prevent acceptance for this review scope.')
        sha = digest(item)
        if len(json.dumps(item, ensure_ascii=False).encode()) > 32*1024*1024:
            raise EDAError('REVIEW_LIMIT', 'Complete review report exceeds 32 MiB; no partial report is saved.')
        folder = S.STATE/'projects'/review['project_id']/'reviews'; folder.mkdir(exist_ok=True)
        path = folder/(item['id']+'.review.json')
        S.dump(path, {'sha256': sha, 'report': item})
        S.DB.execute('INSERT INTO layout_review_reports VALUES(?,?,?,?)', (item['id'], review['id'], json.dumps(item, ensure_ascii=False), sha))
        review['reports'].append({'id': item['id'], 'revision': item['revision'], 'review_revision': item['review_revision'], 'sha256': sha, 'path': str(path), 'decision': decision})
        review['decisions'].append({'report_id': item['id'], 'decision': decision, 'author': item['author'], 'revision': item['revision']})
        review['review_revision'] += 1; review['latest']['review_revision'] = review['review_revision']; put(review)
        return {'report': item, 'sha256': sha, 'path': str(path), 'context': current['context']}
    return S.mutate('review.save_report', params, action)

def open_report(params):
    review = require_review(params)
    row = S.DB.execute('SELECT data,sha256 FROM layout_review_reports WHERE id=? AND review_id=?', (params.get('report_id'), review['id'])).fetchone()
    if not row:
        raise EDAError('NOT_FOUND', 'Saved review report not found.')
    report = json.loads(row[0])
    if digest(report) != row[1]:
        raise EDAError('EVIDENCE_CORRUPT', 'Saved report checksum failed.')
    file = S.STATE/'projects'/review['project_id']/'reviews'/(params['report_id']+'.review.json')
    try:
        value = json.loads(file.read_text(encoding='utf-8'))
        if digest(value['report']) != row[1] or value['sha256'] != row[1]:
            raise EDAError('EVIDENCE_CORRUPT', 'Report file differs from immutable stored evidence.')
    except (OSError, ValueError, KeyError) as error:
        raise EDAError('EVIDENCE_MISSING', 'Saved report file cannot be reopened.', str(error))
    p = S.get_project(review['project_id'])
    return {'report': report, 'sha256': row[1], 'path': str(file), 'context': context(p),
            'freshness': 'current' if report['revision'] == p['revision'] and digest(report['constraints']) == digest(review['constraints']) and report['evaluation']['engine'] == context(p)['engine'] else 'stale', 'historical_evidence_preserved': True}

def rpc(method, params):
    with S.LOCK:
        if S.EDITION != 'indust': raise EDAError('EDITION_REQUIRED', 'This review workflow is Resistor Indust; choose that workspace explicitly.')
        if params.get('edition', 'indust') != 'indust': raise EDAError('EDITION_REQUIRED', 'Request edition does not match Resistor Indust.')
        if method == 'review.catalog': return catalog()
        if method == 'review.create': return create(params)
        if method == 'review.list':
            p = S.get_project(params['project_id'])
            rows = [json.loads(v[0]) for v in S.DB.execute('SELECT data FROM layout_reviews WHERE project_id=?', (p['id'],))]
            return {**context(p), 'reviews': [{'id': v['id'], 'name': v['name'], 'baseline_revision': v['baseline_revision'], 'review_revision': v['review_revision']} for v in rows]}
        if method == 'review.status': return status(params)
        if method == 'review.scene': return scene(params)
        if method == 'review.add_constraint': return save_constraint(params)
        if method == 'review.update_constraint': return change_constraint(params)
        if method == 'review.remove_constraint': return change_constraint(params, remove=True)
        if method == 'review.evaluate': return evaluate(params)
        if method == 'review.save_report': return save_report(params)
        if method == 'review.open_report': return open_report(params)
        raise EDAError('UNSUPPORTED', 'Unknown layout review method.')
