"""Bounded, non-executing result adapters. These do not validate a vendor license.

Only the documented narrow text grammars below and explicit column mappings are
accepted. Binary PSF/PSFXL, encrypted databases, scalar AC direction, and guessed
layout/net associations are deliberately unsupported. Tests use our own grammar
fixtures; vendor execution evidence must come from the separate runner receipt.
"""
import csv
import hashlib
import io
import json
import math
import re
from pathlib import Path

MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_TOTAL_BYTES = 48 * 1024 * 1024
MAX_ROWS = 200000
MAX_COLUMNS = 512
MAX_VALUES = 4000000
MAX_CURRENT_VALUES = 2000000
ROLES = {'summary', 'waves', 'currents', 'rc', 'exchange'}
NUM = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?\Z')
SPICE_NUM = re.compile(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?)([A-Za-z]*)\Z')
FAILURE = re.compile(r'(?im)^\s*(?:\*+\s*)?(?:fatal(?:\s+error)?\b|error\s*(?:[:(]|\*+)|simulation\s+aborted\b|job\s+aborted\b|license\s+(?:checkout\s+)?(?:failed|failure|denied|unavailable)\b|(?:cannot|could\s+not|failed\s+to|unable\s+to)\s+(?:check\s*out|obtain|acquire)\s+(?:a\s+)?license\b)')
INCOMPLETE = re.compile(r'(?im)\b(?:results?\s+(?:were\s+)?truncated|maximum\s+(?:result|error)\s+count\s+(?:was\s+)?(?:reached|exceeded)|run\s+(?:was\s+)?(?:incomplete|aborted)|partial\s+results?)\b')


class ResultError(ValueError):
    def __init__(self, message, status='unsupported'):
        super().__init__(message)
        self.status = status


def _text(value, label, maximum=512):
    if not isinstance(value, str) or not value or len(value) > maximum or any(ord(c) < 32 for c in value):
        raise ResultError('Invalid bounded string: ' + label)
    return value


def _number(value, suffix=False):
    if isinstance(value, bool):
        raise ResultError('Boolean is not a numeric result')
    if isinstance(value, (int, float)):
        result = float(value)
    elif isinstance(value, str):
        value = value.strip()
        if suffix:
            m = SPICE_NUM.fullmatch(value)
            factors = {'': 1, 't': 1e12, 'g': 1e9, 'meg': 1e6, 'k': 1e3, 'm': 1e-3, 'u': 1e-6, 'n': 1e-9, 'p': 1e-12, 'f': 1e-15}
            if not m or m[2].lower() not in factors:
                raise ResultError('Unsupported numeric suffix or expression')
            result = float(m[1].replace('D', 'E').replace('d', 'e')) * factors[m[2].lower()]
        else:
            if not NUM.fullmatch(value):
                raise ResultError('Only finite real scalar samples are supported')
            result = float(value.replace('D', 'E').replace('d', 'e'))
    else:
        raise ResultError('Numeric result required')
    if not math.isfinite(result):
        raise ResultError('Nonfinite result or overflow')
    return result


def _count(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > 10**12:
        raise ResultError('Invalid nonnegative result count')
    return value


def _samples(value):
    if not isinstance(value, list) or not value or len(value) > MAX_ROWS:
        raise ResultError('Sample count must be 1..200000')
    return [_number(v) for v in value]


def _json(text):
    def pairs(items):
        result = {}
        for k, v in items:
            if k in result:
                raise ResultError('Duplicate JSON field: ' + str(k))
            result[k] = v
        return result
    try:
        return json.loads(text, object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ResultError('Nonfinite JSON result')))
    except (json.JSONDecodeError, RecursionError) as e:
        raise ResultError('Invalid bounded JSON exchange') from e


def _read(folder, path):
    root = Path(folder).resolve(strict=True)
    if not isinstance(path, str) or not path or len(path) > 1024 or '\\' in path:
        raise ResultError('Result path must be a bounded relative POSIX path')
    relative = Path(path)
    if relative.is_absolute() or any(p in ('', '.', '..') for p in path.split('/')) or ':' in path:
        raise ResultError('Result path cannot escape its output folder')
    current = root
    for component in relative.parts:
        current = current / component
        if current.is_symlink():
            raise ResultError('Symlink result paths are unsupported')
    resolved = current.resolve(strict=True)
    try:
        resolved.relative_to(root)
    except ValueError as e:
        raise ResultError('Result path escaped its output folder') from e
    before = resolved.stat()
    if not resolved.is_file() or before.st_size > MAX_FILE_BYTES:
        raise ResultError('Result is not a bounded regular file (16 MiB maximum)')
    with resolved.open('rb') as source:
        raw = source.read(MAX_FILE_BYTES + 1)
    after = resolved.stat()
    if len(raw) > MAX_FILE_BYTES or (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
        raise ResultError('Result changed while being parsed')
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError as e:
        raise ResultError('Binary/vendor database needs an explicit supported text export') from e
    if any(ord(c) < 32 and c not in '\r\n\t' for c in text) or any(len(line) > 65536 for line in text.splitlines()):
        raise ResultError('Binary or oversized text record is unsupported')
    return text, {'path': path, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}


def _source(context):
    tool = str(context.get('tool_id', context.get('tool', 'commercial'))).lower()
    if tool == 'ngspice':
        return 'ngspice'
    for name in ('spectre', 'hspice', 'primesim'):
        if name in tool:
            return name
    return 'commercial'


def _analysis(context):
    analysis = _text(context.get('analysis'), 'analysis', 64).strip().lower()
    if analysis not in ('op', 'dc', 'tran'):
        raise ResultError('Only real scalar OP/DC/transient results are supported; complex AC has no scalar current direction')
    return analysis


def _flow(x, unit, branches, context):
    if not branches:
        return None
    revision = context.get('revision')
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
        raise ResultError('Authoritative project revision is required for current results')
    flow = {'schema_version': 1, 'source': _source(context), 'analysis': _analysis(context), 'x': x, 'x_unit': unit,
            'branches': branches, 'convention': 'conventional', 'revision': revision,
            'geometry_linkage': 'unverified',
            'notes': ['Explicit operator column schema; no conductor path or current density inferred.']}
    for key in ('project_id', 'run_id', 'layout_sha256', 'backend_profile_id'):
        if key == 'layout_sha256' and context.get('geometry_binding') is False:
            continue
        if context.get(key) is not None:
            flow[key] = _text(context[key], key)
    if context.get('geometry_binding') is False:
        flow['notes'].append('Electrical result has no verified correspondence to this GDS/OAS layout; numeric branch samples only.')
    if context.get('input_origin'):
        origin = _text(context['input_origin'], 'input origin', 128)
        origin = {'external_native_database': 'external-native-database', 'native_project_export_and_operator_resources': 'project-snapshot'}.get(origin, origin)
        if origin not in ('project-snapshot', 'operator-recipe', 'external-native-database'):
            origin = 'operator-recipe'
        flow['input_origin'] = origin
        flow['notes'].append('Execution input origin: ' + origin)
    if context.get('tool_id'):
        flow['tool'] = _text(context['tool_id'], 'tool_id')
    return flow


def _mapped_columns(x, columns, schema, context):
    if not isinstance(schema, dict) or not isinstance(schema.get('x'), dict):
        raise ResultError('An explicit x/signal/current column schema with SI units is required')
    unit = _text(schema['x'].get('unit'), 'x unit', 32)
    if unit not in ('s', 'V', 'A', 'point'):
        raise ResultError('Unsupported x unit for scalar OP/DC/transient results')
    specs = schema.get('signals', [])
    branches = schema.get('branches', [])
    if not isinstance(specs, list) or not isinstance(branches, list) or not 0 < len(specs) + len(branches) <= MAX_COLUMNS:
        raise ResultError('Schema must select 1..512 signal/current columns')
    if len(x) * (len(specs) + len(branches)) > MAX_VALUES:
        raise ResultError('Selected sample matrix exceeds four million values')
    if len(x) * len(branches) > MAX_CURRENT_VALUES:
        raise ResultError('Current sample matrix exceeds two million values')
    waves, currents, ids, names = [], [], set(), set()
    for spec in specs:
        if not isinstance(spec, dict):
            raise ResultError('Signal schema must be an object')
        name = _text(spec.get('name'), 'signal name')
        if name in names:
            raise ResultError('Duplicate waveform name')
        names.add(name)
        y = columns(spec.get('column'))
        waves.append({'name': name, 'unit': _text(spec.get('unit'), 'signal unit', 32), 'x': x, 'y': y, 'x_unit': unit})
    for spec in branches:
        if not isinstance(spec, dict) or spec.get('unit') != 'A':
            raise ResultError('Current schema must explicitly declare SI unit A')
        ident = _text(spec.get('id'), 'branch ID', 128)
        if ident in ids:
            raise ResultError('Duplicate current branch ID')
        ids.add(ident)
        currents.append({'id': ident, 'name': _text(spec.get('name'), 'branch name'),
                         'from_net': _text(spec.get('from_net'), 'from net'), 'to_net': _text(spec.get('to_net'), 'to net'),
                         'values_A': columns(spec.get('column')), 'mapping': 'unmapped',
                         'source_vector': _text(spec.get('source_vector'), 'source vector')})
    return waves, _flow(x, unit, currents, context)


def _table(text, fmt, schema, context):
    _analysis(context)
    if not isinstance(schema, dict) or not isinstance(schema.get('x'), dict):
        raise ResultError('Explicit column schema is missing')
    if fmt == 'csv':
        reader = csv.reader(io.StringIO(text), strict=True)
        try:
            header = next(reader)
        except StopIteration:
            raise ResultError('CSV is empty')
        if not header or len(header) > MAX_COLUMNS or len(set(header)) != len(header) or any(not n for n in header):
            raise ResultError('CSV header must contain unique bounded column names')
        for name in header:
            _text(name, 'CSV column')
        rows = []
        try:
            for row in reader:
                if len(row) != len(header):
                    raise ResultError('CSV row length differs from its header')
                if len(rows) >= MAX_ROWS or (len(rows) + 1) * len(header) > MAX_VALUES:
                    raise ResultError('CSV sample matrix exceeds bounded limits')
                rows.append([_number(v) for v in row])
        except csv.Error as e:
            raise ResultError('Malformed CSV record') from e
        def index(column):
            if not isinstance(column, str) or column not in header:
                raise ResultError('CSV schema column was not present in header')
            return header.index(column)
    else:
        rows = []
        width = None
        for line in text.splitlines():
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            values = line.split()
            if not values or len(values) > MAX_COLUMNS or (width is not None and len(values) != width):
                raise ResultError('Numeric table must have a consistent bounded column count')
            width = len(values)
            if len(rows) >= MAX_ROWS or (len(rows) + 1) * width > MAX_VALUES:
                raise ResultError('Numeric table exceeds bounded limits')
            rows.append([_number(v) for v in values])
        def index(column):
            if isinstance(column, bool) or not isinstance(column, int) or not width or not 0 <= column < width:
                raise ResultError('Numeric table columns must be explicit zero-based integer indices')
            return column
    if not rows:
        raise ResultError('No scalar result samples found', 'unknown')
    def get(column):
        i = index(column)
        return [row[i] for row in rows]
    return _mapped_columns(get(schema['x'].get('column')), get, schema, context)


def _psf(text, schema, context):
    """Real scalar named and GROUP PSF ASCII subset, one sweep, complete rows."""
    _analysis(context)
    sections, section = {}, None
    order = ['HEADER', 'TYPE', 'SWEEP', 'TRACE', 'VALUE', 'END']
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line in ('HEADER', 'TYPE', 'SWEEP', 'TRACE', 'VALUE', 'END'):
            if line in sections or section == 'END' or (section and order.index(line) <= order.index(section)):
                raise ResultError('Duplicate or trailing PSF section')
            section = line
            sections[line] = []
        elif section:
            sections[section].append(line)
        else:
            raise ResultError('PSF ASCII section header required')
    if not {'TYPE', 'SWEEP', 'TRACE', 'VALUE', 'END'} <= set(sections) or sections['END']:
        raise ResultError('Incomplete PSF ASCII export')
    types = set()
    for line in sections['TYPE']:
        m = re.fullmatch(r'"([^"\\]+)"\s+FLOAT\s+DOUBLE(?:\s+PROP\(.*\))?', line)
        if not m:
            raise ResultError('Only real FLOAT DOUBLE PSF types are supported')
        if m[1] in types:
            raise ResultError('Duplicate PSF scalar type')
        types.add(m[1])
    if len(sections['SWEEP']) != 1:
        raise ResultError('Only one explicit PSF sweep is supported')
    sweep = re.fullmatch(r'"([^"\\]+)"\s+"([^"\\]+)"(?:\s+PROP\(.*\))?', sections['SWEEP'][0])
    if not sweep or sweep[2] not in types:
        raise ResultError('PSF sweep type must be a known scalar type')
    if not isinstance(schema, dict) or not isinstance(schema.get('x'), dict) or schema['x'].get('column') != sweep[1]:
        raise ResultError('PSF schema must select the declared sweep name')
    groups, traces, active = {}, {}, None
    for line in sections['TRACE']:
        group = re.fullmatch(r'"([^"\\]+)"\s+GROUP\s+(\d+)', line)
        if group:
            if active:
                raise ResultError('Incomplete PSF group declaration')
            active = group[1]
            if active in groups or active in traces or not 0 < int(group[2]) <= MAX_COLUMNS:
                raise ResultError('Invalid PSF group')
            groups[active] = {'size': int(group[2]), 'names': []}
            continue
        m = re.fullmatch(r'"([^"\\]+)"\s+"([^"\\]+)"(?:\s+PROP\(.*\))?', line)
        if not m or m[2] not in types or m[1] in traces or m[1] in groups or m[1] == sweep[1]:
            raise ResultError('Unsupported/duplicate PSF trace declaration')
        traces[m[1]] = []
        if active:
            groups[active]['names'].append(m[1])
            if len(groups[active]['names']) == groups[active]['size']:
                active = None
    if active or not traces or len(traces) > MAX_COLUMNS:
        raise ResultError('Incomplete or oversized PSF trace group')
    x, current, data, lines, i = [], None, {}, sections['VALUE'], 0
    def commit():
        if current is None or set(data) != set(traces):
            raise ResultError('Incomplete PSF sample; sparse/compressed samples are unsupported')
        if len(x) >= MAX_ROWS or (len(x) + 1) * len(traces) > MAX_VALUES:
            raise ResultError('PSF sample matrix exceeds bounded limits')
        x.append(current)
        for name in traces:
            traces[name].append(data[name])
    while i < len(lines):
        m = re.fullmatch(r'"([^"\\]+)"\s+(.+)', lines[i])
        if not m:
            raise ResultError('Named PSF value expected')
        name, val = m[1], m[2]
        if name == sweep[1]:
            if current is not None:
                commit()
            current, data = _number(val), {}
        elif current is None:
            raise ResultError('PSF value preceded its sweep sample')
        elif name in groups:
            _number(val)  # group marker is metadata, never a waveform
            for trace in groups[name]['names']:
                i += 1
                if i >= len(lines) or trace in data:
                    raise ResultError('Incomplete/duplicate PSF group sample')
                data[trace] = _number(lines[i])
        elif name in traces and name not in data:
            data[name] = _number(val)
        else:
            raise ResultError('Unknown/duplicate PSF value')
        i += 1
    commit()
    def get(name):
        if name not in traces:
            raise ResultError('Selected PSF trace does not exist')
        return traces[name]
    return _mapped_columns(x, get, schema, context)


def _lis(text, selected):
    if not isinstance(selected, dict) or not selected or len(selected) > 512:
        raise ResultError('HSPICE listing measurements need explicit names and units')
    result = {}
    for name, unit in selected.items():
        _text(name, 'measurement name', 128)
        _text(unit, 'measurement unit', 32)
        # Only approved measurement names; options and arbitrary listing numbers
        # are never discovered as measurements. Repeated ALTER/MC blocks need an
        # explicit CSV/export adapter instead of silently taking the last value.
        matches = re.findall(r'(?im)^[ \t]*' + re.escape(name) + r'[ \t]*=[ \t]*(\S+)(?:[ \t]+[^\r\n]*)?\r?$', text)
        if len(matches) != 1:
            raise ResultError('Missing/ambiguous selected listing measurement: ' + name, 'unknown')
        if matches[0].lower() in ('failed', 'fail', 'not_found', 'undefined'):
            result[name] = None
        else:
            result[name] = _number(matches[0], True)
        result[name + '_unit'] = unit
    return result


def _verification(text, fmt):
    if FAILURE.search(text) or INCOMPLETE.search(text):
        return 'unknown', {'verification_status': 'incomplete_or_error'}
    if fmt == 'calibre-drc-summary':
        # Narrow whole-run summary. Per-cell/per-check RDB errors are not totals.
        checks = re.findall(r'(?im)^\s*TOTAL DRC RuleChecks Executed\s*[:=]\s*(\d+)\s*$', text)
        counts = re.findall(r'(?im)^\s*TOTAL DRC Results Generated\s*[:=]\s*(\d+)\s*$', text)
        completed = re.findall(r'(?im)^\s*DRC (?:RUN )?COMPLETED\s*$', text)
        if len(checks) != 1 or len(counts) != 1 or len(completed) != 1 or int(checks[0]) == 0:
            raise ResultError('Unrecognized/incomplete whole-run DRC summary; use normalized exchange with explicit completion', 'unknown')
        count = _count(int(counts[0]))
        return ('fail' if count else 'pass'), {'drc_violations': count, 'drc_checks_executed': _count(int(checks[0])), 'verification_status': 'complete_summary'}
    values = re.findall(r'(?im)^\s*OVERALL COMPARISON RESULT\s*[:=]\s*(CORRECT|INCORRECT|NOT COMPARED)\s*$', text)
    completed = re.findall(r'(?im)^\s*LVS (?:RUN )?COMPLETED\s*$', text)
    if len(values) != 1 or len(completed) != 1:
        raise ResultError('Unrecognized/incomplete whole-run LVS summary; use normalized exchange with explicit completion', 'unknown')
    status = {'CORRECT': 'pass', 'INCORRECT': 'fail', 'NOT COMPARED': 'unknown'}[values[0].upper()]
    return status, {'verification_status': values[0].lower()}


def _spef(text):
    lines = [s.strip() for s in text.splitlines() if s.strip() and not s.lstrip().startswith('//')]
    if not lines or not re.fullmatch(r'\*SPEF\s+"IEEE 1481-\d{4}"', lines[0]):
        raise ResultError('SPEF IEEE header is required')
    units, nets, seen_nets, section, resistors, capacitors, identities = {}, 0, set(), None, 0, 0, set()
    factors = {'R_UNIT': {'OHM': 1, 'KOHM': 1000}, 'C_UNIT': {'F': 1, 'PF': 1e-12, 'FF': 1e-15}}
    sums = {'resistance_sum_ohm': 0.0, 'capacitance_sum_F': 0.0}
    open_net = False
    headers = {'*DESIGN', '*DATE', '*VENDOR', '*PROGRAM', '*VERSION', '*DESIGN_FLOW', '*DIVIDER', '*DELIMITER', '*BUS_DELIMITER', '*T_UNIT', '*L_UNIT', '*NAME_MAP', '*PORTS'}
    for line in lines[1:]:
        parts = line.split()
        tag = parts[0]
        if tag in ('*R_UNIT', '*C_UNIT'):
            key = tag[1:]
            if key in units or len(parts) != 3 or parts[2].upper() not in factors[key]:
                raise ResultError('Unsupported/duplicate SPEF unit')
            units[key] = _number(parts[1]) * factors[key][parts[2].upper()]
            if units[key] <= 0:
                raise ResultError('SPEF unit must be positive')
        elif tag == '*D_NET':
            if open_net or len(parts) != 3 or set(units) != {'R_UNIT', 'C_UNIT'} or parts[1] in seen_nets:
                raise ResultError('Invalid/duplicate/incomplete SPEF D_NET')
            if _number(parts[2]) < 0:
                raise ResultError('Negative SPEF net capacitance')
            seen_nets.add(parts[1]); nets += 1; open_net = True; section = None; identities = set()
        elif tag == '*END':
            if not open_net or len(parts) != 1:
                raise ResultError('Unexpected SPEF END')
            open_net = False; section = None
        elif tag in ('*CAP', '*RES', '*CONN'):
            if not open_net or len(parts) != 1:
                raise ResultError('SPEF section outside a D_NET')
            section = tag
        elif open_net and section in ('*CAP', '*RES'):
            if not parts[0].isdigit() or len(parts) not in ((3, 4) if section == '*CAP' else (4,)):
                raise ResultError('Unsupported SPEF RC row or multi-corner value')
            identity = (section, parts[0])
            if identity in identities:
                raise ResultError('Duplicate SPEF RC row ID')
            identities.add(identity)
            value = _number(parts[-1])
            if value < 0:
                raise ResultError('Negative SPEF RC value')
            key = 'resistance_sum_ohm' if section == '*RES' else 'capacitance_sum_F'
            sums[key] += value * units['R_UNIT' if section == '*RES' else 'C_UNIT']
            resistors += section == '*RES'; capacitors += section == '*CAP'
        elif open_net:
            if section != '*CONN' or tag not in ('*P', '*I', '*N'):
                raise ResultError('Unsupported detailed SPEF section')
        elif tag in ('*R_NET', '*R_PNET', '*D_PNET'):
            raise ResultError('Reduced/physical SPEF sections are unsupported')
        elif tag in headers or (section == '*NAME_MAP' and re.fullmatch(r'\*\d+', tag)) or (section == '*PORTS' and tag.startswith('*') and len(parts) >= 2 and parts[1] in ('I', 'O', 'B')):
            # Header, name map, port declarations carry no counted elements.
            if tag in ('*NAME_MAP', '*PORTS'):
                section = tag
        else:
            raise ResultError('Unexpected SPEF text outside a net')
    if open_net or not nets or not resistors + capacitors:
        raise ResultError('Incomplete SPEF or no detailed RC elements', 'unknown')
    for value in sums.values():
        _number(value)
    return {'resistors': resistors, 'capacitors': capacitors}, {'spef_nets': nets, **sums}


def _spice_rc(text, fmt):
    rows, current = [], None
    for physical_index, line in enumerate(text.splitlines()):
        line = line.strip()
        if fmt == 'spice-rc' and physical_index == 0 and line and not line.startswith(('*', '.')):
            # The first physical line of a stand-alone SPICE deck is a title,
            # even when its spelling resembles an R/C element.
            continue
        if not line or line.startswith('*'):
            continue
        if line.startswith('+'):
            if current is None:
                raise ResultError('Orphan SPICE continuation')
            current += ' ' + line[1:].strip()
        else:
            if current is not None:
                rows.append(current)
            current = line
    if current is not None:
        rows.append(current)
    if fmt == 'dspf' and not re.search(r'(?im)^\s*\*\|DSPF\b', text):
        raise ResultError('DSPF annotation header is required')
    resistors, capacitors, sums, ids, opened, ended = 0, 0, {'resistance_sum_ohm': 0.0, 'capacitance_sum_F': 0.0}, set(), [], False
    for i, row in enumerate(rows):
        parts = row.split()
        tag = parts[0].lower()
        if tag in ('.subckt', '.ends', '.end'):
            if tag == '.subckt':
                if len(parts) < 2 or opened:
                    raise ResultError('Nested RC subcircuits are unsupported')
                opened.append(parts[1].lower()); ids = set()
            elif tag == '.ends':
                if not opened or len(parts) > 2 or (len(parts) == 2 and parts[1].lower() != opened[-1]):
                    raise ResultError('Mismatched RC subcircuit termination')
                opened.pop(); ended = True
            else:
                if opened or i != len(rows) - 1:
                    raise ResultError('Unexpected RC deck end')
                ended = True
        elif tag[0] in ('r', 'c'):
            if len(parts) != 4 or tag in ids:
                raise ResultError('Only unique literal four-token R/C elements are supported')
            ids.add(tag)
            value = _number(parts[3], True)
            if value < 0:
                raise ResultError('Negative RC value')
            kind = 'resistance_sum_ohm' if tag[0] == 'r' else 'capacitance_sum_F'
            sums[kind] += value
            resistors += tag[0] == 'r'; capacitors += tag[0] == 'c'
        else:
            raise ResultError('RC counting supports self-contained literal R/C decks; includes, models, expressions and executable directives are unsupported')
    if opened or not ended or not resistors + capacitors:
        raise ResultError('Incomplete RC deck or no supported R/C elements', 'unknown')
    for value in sums.values():
        _number(value)
    return {'resistors': resistors, 'capacitors': capacitors}, sums


def _exchange(text, operation, context):
    obj = _json(text)
    if not isinstance(obj, dict) or type(obj.get('schema_version')) is not int or obj.get('schema_version') != 1 or obj.get('format') != 'register-commercial-results' or obj.get('operation') != operation:
        raise ResultError('Expected register-commercial-results v1 with the requested operation')
    for key in ('project_id', 'revision', 'run_id', 'layout_sha256', 'backend_profile_id'):
        if key in obj and (key not in context or obj[key] != context[key]):
            raise ResultError('Exchange does not match authoritative execution context: ' + key, 'unknown')
    completion = obj.get('completion')
    if not isinstance(completion, dict) or completion.get('finished') is not True or completion.get('status') not in ('success', 'failed', 'unknown', 'unsupported'):
        raise ResultError('Exchange requires explicit finished/status evidence', 'unknown')
    status = {'success': 'pass', 'failed': 'fail', 'unknown': 'unknown', 'unsupported': 'unsupported'}[completion['status']]
    result = {'analysis_result': status}
    if operation in ('drc', 'lvs'):
        verification = obj.get('verification')
        if not isinstance(verification, dict) or verification.get('completed') is not True or verification.get('status') not in ('pass', 'fail', 'unknown'):
            raise ResultError('Verification exchange requires explicit completed/status', 'unknown')
        result['analysis_result'] = verification['status'] if status == 'pass' else status
        if operation == 'drc':
            count = _count(verification.get('violations'))
            if (count == 0) != (verification['status'] == 'pass') and verification['status'] != 'unknown':
                raise ResultError('Conflicting DRC status and violation count', 'unknown')
            result['measurements'] = {'drc_violations': count}
    measurements = obj.get('measurements', {})
    if not isinstance(measurements, dict) or len(measurements) > 512:
        raise ResultError('Bounded exchange measurement object required')
    result.setdefault('measurements', {})
    for name, value in measurements.items():
        _text(name, 'measurement name', 128)
        parsed_value = value if value is None else (_text(value, 'measurement value') if isinstance(value, str) else _number(value))
        if name in result['measurements'] and result['measurements'][name] != parsed_value:
            raise ResultError('Exchange measurements conflict with validated verification fields', 'unknown')
        result['measurements'][name] = parsed_value
    if 'parasitics' in obj:
        p = obj['parasitics']
        if not isinstance(p, dict):
            raise ResultError('Invalid RC counts')
        result['parasitics'] = {'resistors': _count(p.get('resistors')), 'capacitors': _count(p.get('capacitors'))}
    if 'waveforms' in obj:
        _analysis(context)
        waves = obj['waveforms']
        if not isinstance(waves, list) or not 0 < len(waves) <= MAX_COLUMNS:
            raise ResultError('Invalid exchange waveform list')
        result['waveforms'], seen, total = [], set(), 0
        for wave in waves:
            if not isinstance(wave, dict):
                raise ResultError('Waveform object required')
            name = _text(wave.get('name'), 'waveform name')
            x, y = _samples(wave.get('x')), _samples(wave.get('y'))
            total += len(x)
            if len(x) != len(y) or name in seen or total > MAX_VALUES:
                raise ResultError('Inconsistent/oversized exchange waveform samples')
            seen.add(name)
            result['waveforms'].append({'name': name, 'unit': _text(wave.get('unit'), 'waveform unit', 32), 'x': x, 'y': y, 'x_unit': _text(wave.get('x_unit'), 'waveform x unit', 32)})
    if 'current_flow' in obj:
        flow = obj['current_flow']
        if not isinstance(flow, dict) or type(flow.get('schema_version')) is not int or flow.get('schema_version') != 1 or flow.get('convention') != 'conventional' or str(flow.get('analysis', '')).strip().lower() != _analysis(context):
            raise ResultError('Scalar conventional current exchange schema/analysis mismatch')
        for key in ('project_id', 'revision', 'run_id', 'layout_sha256', 'backend_profile_id'):
            if key in flow and (key not in context or flow[key] != context[key]):
                raise ResultError('Current exchange binding mismatch: ' + key, 'unknown')
        if flow.get('source') not in (None, _source(context)):
            raise ResultError('Current source cannot contradict the actual execution tool', 'unknown')
        x, branches = _samples(flow.get('x')), flow.get('branches')
        if not isinstance(branches, list) or not 0 < len(branches) <= MAX_COLUMNS or len(x) * len(branches) > MAX_CURRENT_VALUES:
            raise ResultError('Invalid exchange current branch/sample count')
        columns, specs = {}, []
        for b in branches:
            if not isinstance(b, dict) or b.get('unit') != 'A':
                raise ResultError('Exchange branches require explicit unit A')
            ident = _text(b.get('id'), 'branch ID', 128)
            if ident in columns:
                raise ResultError('Duplicate current branch ID')
            values = _samples(b.get('values_A'))
            if len(values) != len(x):
                raise ResultError('Current sample length differs from x')
            columns[ident] = values
            specs.append({**b, 'column': ident})
        _, result['current_flow'] = _mapped_columns(x, lambda name: columns[name], {'x': {'unit': flow.get('x_unit')}, 'branches': specs}, context)
    if operation == 'simulation' and status == 'pass' and not (result.get('waveforms') or result.get('current_flow') or any(isinstance(v, (int, float)) and not isinstance(v, bool) for v in result.get('measurements', {}).values())):
        raise ResultError('Simulation success requires actual numeric results', 'unknown')
    if operation == 'pex' and status == 'pass' and not result.get('parasitics'):
        raise ResultError('PEX success requires explicit RC counts', 'unknown')
    return result


def parse_results(operation, folder, outputs, context):
    """Return Run fields; no processes, interpolation, paths or geometry inference.

    outputs maps allowed role -> relative POSIX filename. context.formats maps
    role -> supported format. wave_schema/current_schema (or column_schema) map
    x and signal/branch columns, with explicit units. Immutable run/project/tool
    identifiers are supplied by the backend, never read from a recipe file.
    Unknown files remain runner artifacts. Failures do not produce current paths.
    """
    result = {'analysis_result': 'unknown', 'message': 'No supported result evidence was parsed.', 'measurements': {}}
    provenance = {'adapter': 'register-commercial-results-v1', 'vendor_execution_verified': False, 'files': {}, 'diagnostics': []}
    result['parser_provenance'] = provenance
    if not isinstance(outputs, dict) or not isinstance(context, dict) or set(outputs) - ROLES or len(outputs) > len(ROLES):
        result.update(analysis_result='unsupported', message='Unsupported output role/context schema.')
        return result
    if not outputs:
        return result
    formats = context.get('formats', {})
    if not isinstance(formats, dict):
        result.update(analysis_result='unsupported', message='Explicit result formats are required.')
        return result
    files, total = {}, 0
    try:
        execution_log = context.get('execution_log', '')
        if not isinstance(execution_log, str) or len(execution_log) > 5 * 1024 * 1024:
            raise ResultError('Authoritative execution diagnostic log must be bounded text', 'unknown')
        if FAILURE.search(execution_log) or INCOMPLETE.search(execution_log) or '[OVERLONG_NATIVE_LINE_DISCARDED_FOR_REDACTION]' in execution_log or '[NATIVE_LOG_TRUNCATED]' in execution_log:
            raise ResultError('Execution/license failure or incomplete result in authoritative native diagnostics; exit zero does not establish PASS', 'unknown')
        for role, path in outputs.items():
            text, item = _read(folder, path)
            total += item['bytes']
            if total > MAX_TOTAL_BYTES:
                raise ResultError('Result set exceeds 48 MiB')
            files[role] = text
            provenance['files'][role] = {**item, 'format': formats.get(role)}
        if any(FAILURE.search(text) or INCOMPLETE.search(text) for role, text in files.items() if role == 'summary') or context.get('execution_status') in ('failed', 'canceled'):
            raise ResultError('Execution/license failure in authoritative summary or receipt; partial numeric data is not PASS', 'unknown')
        if 'exchange' in files:
            if formats.get('exchange') != 'register-exchange-v1':
                raise ResultError('Unknown normalized exchange format')
            result.update(_exchange(files['exchange'], operation, context))
        parsed = bool('exchange' in files)
        exchange_status = result['analysis_result'] if parsed else None
        for role in ('summary', 'waves', 'currents', 'rc'):
            if role not in files:
                continue
            fmt = formats.get(role)
            text = files[role]
            if role == 'summary' and fmt in ('calibre-drc-summary', 'calibre-lvs-summary'):
                if (fmt == 'calibre-drc-summary') != (operation == 'drc') or operation not in ('drc', 'lvs'):
                    raise ResultError('Verification summary does not match requested operation')
                status, measurements = _verification(text, fmt)
                result.update(analysis_result=status)
                result['measurements'].update(measurements); parsed = True
            elif role == 'summary' and fmt == 'hspice-lis' and operation == 'simulation':
                result['measurements'].update(_lis(text, context.get('measurements'))); parsed = True
                result['analysis_result'] = 'fail' if any(v is None for v in result['measurements'].values()) else 'pass'
            elif role in ('waves', 'currents') and fmt in ('csv', 'table', 'psf-ascii') and operation == 'simulation':
                schema = context.get('wave_schema' if role == 'waves' else 'current_schema', context.get('column_schema'))
                waves, flow = _psf(text, schema, context) if fmt == 'psf-ascii' else _table(text, fmt, schema, context)
                if waves:
                    result.setdefault('waveforms', []).extend(waves)
                if flow:
                    if 'current_flow' in result:
                        raise ResultError('Multiple current sources require an explicit merged exchange')
                    result['current_flow'] = flow
                if result['analysis_result'] not in ('fail', 'unsupported'):
                    result['analysis_result'] = 'pass'
                parsed = True
            elif role == 'rc' and fmt in ('spef', 'dspf', 'spice-rc') and operation == 'pex':
                p, measurements = _spef(text) if fmt == 'spef' else _spice_rc(text, fmt)
                result['parasitics'] = p; result['measurements'].update(measurements)
                result['analysis_result'] = 'pass'; parsed = True
            else:
                raise ResultError('Unsupported format/role/operation: ' + str(fmt) + '/' + role + '/' + str(operation))
        if not parsed:
            raise ResultError('No recognized result evidence', 'unknown')
        if exchange_status in ('fail', 'unknown', 'unsupported'):
            result['analysis_result'] = exchange_status
        if len({w['name'] for w in result.get('waveforms', [])}) != len(result.get('waveforms', [])):
            raise ResultError('Duplicate waveform names across outputs')
        if sum(len(w['y']) for w in result.get('waveforms', [])) > MAX_VALUES:
            raise ResultError('Aggregate selected waveforms exceed four million values')
        result['message'] = 'Parsed explicit text result evidence; vendor execution/license verification is recorded separately. No physical current path inferred.'
        result['measurements'].update(result_parser='register-commercial-results-v1', current_path_mapping='unmapped' if result.get('current_flow') else 'unavailable')
    except (ResultError, OSError, ValueError, KeyError, TypeError, RecursionError) as e:
        result = {'analysis_result': e.status if isinstance(e, ResultError) else 'unknown', 'message': str(e)[:1024],
                  'measurements': {'result_parser': 'register-commercial-results-v1'}, 'parser_provenance': provenance}
        provenance['diagnostics'].append({'status': result['analysis_result'], 'message': result['message']})
    return result
