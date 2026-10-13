"""Owned OTA follower noise and seeded public-model mismatch jobs.

Uses native ngspice models, never synthetic offsets. A finite mismatch sample
set is not a calibrated yield prediction or a foundry qualification.
"""
import math
import re
import statistics
import time
from pathlib import Path
from geometry import EDAError
import design_tools
import native


def configuration(p, params):
    if p.get('design_template', {}).get('id') != 'soc_miller_ota':
        raise EDAError('CHARACTERIZATION_UNSUPPORTED', 'The owned noise/mismatch fixture supports the SoC Miller OTA only.')
    raw = params.get('characterization')
    allowed = {'mode', 'samples', 'seed', 'offset_limit_V', 'noise_limit_V', 'frequency_start_Hz', 'frequency_end_Hz', 'points_dec'}
    if not isinstance(raw, dict) or set(raw)-allowed or raw.get('mode') not in {'noise', 'mismatch'}:
        raise EDAError('CHARACTERIZATION_RANGE', 'Select bounded noise or mismatch settings.')
    if params.get('analysis', 'op') != 'op':
        raise EDAError('CHARACTERIZATION_RANGE', 'The dedicated follower fixture uses OP, not the normal open-loop AC fixture.')
    if 'post_layout' in params and not isinstance(params['post_layout'], bool):
        raise EDAError('CHARACTERIZATION_RANGE', 'post_layout must be boolean.')
    c = dict(raw)
    def number(key, default, lo, hi, integer=False):
        value = c.get(key, default)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lo <= value <= hi or (integer and not isinstance(value, int)):
            raise EDAError('CHARACTERIZATION_RANGE', f'{key} must be {"an integer" if integer else "finite"} in {lo}..{hi}.')
        c[key] = value
    if c['mode'] == 'mismatch':
        if set(c)&{'noise_limit_V', 'frequency_start_Hz', 'frequency_end_Hz', 'points_dec'}:
            raise EDAError('CHARACTERIZATION_RANGE', 'Noise settings do not apply to mismatch.')
        number('samples', 16, 4, 64, True)
        number('seed', 729726, 1, 1000000000, True)
        number('offset_limit_V', .01, 1e-6, .1)
    else:
        if set(c)&{'samples', 'seed', 'offset_limit_V'}:
            raise EDAError('CHARACTERIZATION_RANGE', 'Mismatch settings do not apply to noise.')
        number('noise_limit_V', .0001, 1e-9, .1)
        number('frequency_start_Hz', 10., .1, 1e8)
        number('frequency_end_Hz', 1e7, 1., 1e9)
        number('points_dec', 40, 10, 100, True)
        if c['frequency_end_Hz'] <= c['frequency_start_Hz']:
            raise EDAError('CHARACTERIZATION_RANGE', 'Noise frequencies must be strictly ascending.')
    settings = native.testbench({**p.get('testbench', {}), **{key:params[key] for key in native.TESTBENCH if key in params}, 'analysis':'op'})
    if not 1.6 <= settings['supply_V'] <= 1.8:
        raise EDAError('STIMULUS_RANGE', 'The follower fixture supports 1.6..1.8V.')
    return c, settings


def ports(p, netlist):
    matches = re.findall(r'^\.subckt\s+'+re.escape(p['cell'])+r'\s+([^\n]+)', Path(netlist).read_text(), re.I|re.M)
    sub = matches[0].split() if len(matches) == 1 else []
    if len(sub) != len(p['ports']) or len(set(sub)) != len(sub) or set(sub) != set(p['ports']):
        raise EDAError('PORT_MISMATCH', 'Owned follower ports differ from actual emitted/extracted ports.')
    return ['OUT' if n == 'INN' else n for n in sub]


def fixture(p, folder, netlist, model_deck, settings):
    s = settings['supply_V']
    dest = Path(folder)/'follower.spice'
    dest.write_text('\n'.join(['Resistor actual OTA voltage follower characterization', f'.include "{model_deck}"',
        f'.include "{netlist}"', f'.temp {settings["temperature_C"]}', 'VGND VGND 0 0',
        f'VDD VPWR VGND {s:.17g}', f'VINP INP VGND DC {s/2:.17g} AC 1', 'VBIAS BIAS VGND 0.9',
        'CLOAD OUT VGND 1p', 'XU '+' '.join(ports(p, netlist))+' '+p['cell'], '.end'])+'\n')
    return dest


def control(folder, circuit, c, seed=None, name='characterization'):
    rows = ['Resistor owned characterization controller', '.control', 'set noaskquit', 'set num_threads=1', 'unset klu']
    if seed is not None: rows.append(f'setseed {seed}')
    # AGAUSS is evaluated on source, so setseed must precede parsing models.
    if re.search(r'\s', str(circuit)):
        raise EDAError('UNSUPPORTED_PATH', 'Owned ngspice controller requires a worker path without whitespace.')
    rows += [f'source {circuit}', 'set numdgt=17', 'set wr_singlescale', 'set wr_vecnames']
    if c['mode'] == 'mismatch':
        rows += ['op', 'let sample_index=0', 'setscale sample_index', 'let supply_current=-i(VDD)', 'wrdata offset.dat v(OUT) v(INP) supply_current']
    else:
        rows += [f'noise v(OUT) VINP dec {c["points_dec"]} {c["frequency_start_Hz"]:.17g} {c["frequency_end_Hz"]:.17g}',
            'setplot noise1', 'wrdata spectrum.dat onoise_spectrum inoise_spectrum',
            'setplot noise2', 'let sample_index=0', 'setscale sample_index', 'wrdata integrated.dat onoise_total inoise_total']
    rows += ['quit', '.endc', '.end']
    dest = Path(folder)/(name+'.spice'); dest.write_text('\n'.join(rows)+'\n'); return dest


def table(path, width):
    if not Path(path).is_file(): raise EDAError('CHARACTERIZATION_FAILED', 'Native output is missing; inspect the retained ngspice log.')
    rows = []
    for line in Path(path).read_text().splitlines()[1:]:
        try: row = [float(v) for v in line.split()]
        except ValueError: raise EDAError('PARSER_FAILED', 'Native characterization has a nonnumeric output.')
        if len(row) != width or any(not math.isfinite(v) for v in row):
            raise EDAError('PARSER_FAILED', 'Native characterization has unexpected/nonfinite columns.')
        rows.append(row)
    if not rows: raise EDAError('PARSER_FAILED', 'Native characterization produced no samples.')
    return rows


def noise_result(spectrum, integrated, c):
    if len(spectrum) < 2 or len(integrated) != 1 or any(b[0] <= a[0] for a,b in zip(spectrum, spectrum[1:])) or any(min(r[1:]) < 0 for r in spectrum):
        raise EDAError('PARSER_FAILED', 'Noise needs ascending finite frequencies and nonnegative spectral density.')
    if not math.isclose(spectrum[0][0], c['frequency_start_Hz'], rel_tol=1e-8) or not math.isclose(spectrum[-1][0], c['frequency_end_Hz'], rel_tol=1e-8):
        raise EDAError('INCOMPLETE_WAVEFORM', 'Noise spectrum does not cover the requested frequency interval.')
    out, inp = integrated[0][1:]
    if min(out, inp) <= 0: raise EDAError('PARSER_FAILED', 'Native integrated noise is not positive.')
    # Cross-check native integration with an independent power-density integral.
    numerical = math.sqrt(sum((b[0]-a[0])*(a[1]**2+b[1]**2)/2 for a,b in zip(spectrum, spectrum[1:])))
    if abs(numerical/out-1) > .02: raise EDAError('PARSER_FAILED', 'Noise units/native integrated result disagree with the independent squared-density integral.')
    return dict(output_noise_rms_V=out, input_noise_rms_V=inp, numerical_output_noise_rms_V=numerical,
                frequency_start_Hz=spectrum[0][0], frequency_end_Hz=spectrum[-1][0], samples=len(spectrum))


def mismatch_result(rows, c):
    if len(rows) != c['samples'] or len({r['seed'] for r in rows}) != len(rows):
        raise EDAError('PARSER_FAILED', 'Mismatch sample/seed coverage is incomplete.')
    values = [r['offset_V'] for r in rows]
    if any(not math.isfinite(v) for v in values): raise EDAError('PARSER_FAILED', 'Mismatch offsets are nonfinite.')
    if max(values)-min(values) <= 1e-12:
        raise EDAError('MISMATCH_INACTIVE', 'Public mismatch model produced no observed variation; no statistical PASS is issued.')
    return dict(samples=len(values), seed=c['seed'], offset_mean_V=statistics.mean(values),
                offset_sample_std_V=statistics.stdev(values), offset_min_V=min(values), offset_max_V=max(values),
                offset_abs_max_V=max(map(abs, values)), within_limit_samples=sum(abs(v) <= c['offset_limit_V'] for v in values))


def execute(S, run, p, folder, manifest, params, netlist):
    c, settings = configuration(p, params)
    model = design_tools.supported_model_deck(folder, settings['corner'])
    if c['mode'] == 'mismatch':
        text = model.read_text(); marker = '.param mc_mm_switch=0 mc_pr_switch=0'
        if text.count(marker) != 1: raise EDAError('PDK_RULE_UNSUPPORTED', 'Owned public mismatch switch grammar changed.')
        model.write_text(text.replace(marker, '.param mc_mm_switch=1 mc_pr_switch=0'))
    resources = design_tools.model_resources(settings['corner'])
    circuit = fixture(p, folder, netlist, model, settings)
    manifest['characterization'] = dict(config=c, fixture='OTA unity follower, 1pF external load, 0.9V external bias',
        model_resources=resources, mismatch_switch=1 if c['mode']=='mismatch' else 0, process_switch=0,
        model_deck_sha256=S.profile.sha(model), fixture_sha256=S.profile.sha(circuit), solver='SPARSE 1.3')
    run['artifacts'].update(reference_netlist=str(netlist), characterization_fixture=str(circuit), characterization_models=str(model))
    begin=time.monotonic(); rows=[]
    for i in range(c.get('samples', 1)):
        if time.monotonic()-begin > 300: raise EDAError('TIMEOUT', 'Bounded characterization exceeded 300 seconds.')
        seed=c.get('seed', 0)+i if c['mode']=='mismatch' else None
        sub=Path(folder)/f'sample-{i+1:03d}'; sub.mkdir()
        deck=control(sub, circuit, c, seed)
        log=S.process(run, sub, ['ngspice','-b',str(deck)], 'ngspice', manifest, timeout=30)
        with (Path(folder)/'stdout.log').open('a') as output:
            output.write(f'\n--- native {c["mode"]} sample {i+1} ---\n'+log)
        if 'Using SPARSE 1.3' not in log or any(t in log.lower() for t in ('fatal error','error on line','unknown subckt','singular matrix','no such vector')):
            raise EDAError('CHARACTERIZATION_FAILED', 'Native characterization solver/output failed; raw log retained.')
        if c['mode']=='mismatch':
            sample=table(sub/'offset.dat',4)
            if len(sample)!=1: raise EDAError('PARSER_FAILED', 'Each native mismatch solve must have one OP sample.')
            _,out,inp,current=sample[0]
            rows.append(dict(index=i+1,seed=seed,output_V=out,input_V=inp,offset_V=out-inp,supply_current_A=current,
                output_sha256=S.profile.sha(sub/'offset.dat'),controller_sha256=S.profile.sha(deck)))
        else:
            spectrum=table(sub/'spectrum.dat',3); integrated=table(sub/'integrated.dat',3)
            metrics=noise_result(spectrum,integrated,c)
            run['waveforms']=[dict(name=name,unit='V/√Hz',x=[r[0] for r in spectrum],y=[r[col] for r in spectrum]) for name,col in [('output_noise_density',1),('input_noise_density',2)]]
    if c['mode']=='mismatch':
        metrics=mismatch_result(rows,c)
        run['waveforms']=[dict(name='follower_offset',unit='V',x=[r['index'] for r in rows],y=[r['offset_V'] for r in rows])]
        observed=metrics['offset_abs_max_V']; passed=observed <= c['offset_limit_V']; criterion=f'All {c["samples"]} observed offsets ≤ {c["offset_limit_V"]:.6g} V'
    else:
        observed=metrics['output_noise_rms_V']; passed=observed <= c['noise_limit_V']; criterion=f'Integrated output noise ≤ {c["noise_limit_V"]:.6g} V RMS'
    report=dict(schema_version=1,mode=c['mode'],settings=settings,config=c,metrics=metrics,rows=rows,
        native_engine='ngspice',model_resources=resources,post_layout=bool(params.get('post_layout')),pass_=passed,
        scope='Actual installed SKY130 public-model follower characterization. Finite sample set, no foundry-calibrated statistical yield, no global process Monte Carlo or EM/IR/ESD signoff.')
    report['pass']=report.pop('pass_'); target=Path(folder)/'characterization.json'; S.dump(target, report)
    run['artifacts']['characterization']=str(target)
    run['reference_verification']=dict(schema_version=1,kind='ota-'+c['mode'],source='actual-ngspice-public-models',pass_=passed,
        checks=[dict(name=criterion,observed=observed,pass_=passed)],scope=report['scope'])
    verdict=run['reference_verification']; verdict['pass']=verdict.pop('pass_'); verdict['checks'][0]['pass']=verdict['checks'][0].pop('pass_')
    run.update(tool='ngspice',analysis_result='pass' if passed else 'fail',measurements={**metrics,'analysis':c['mode'],'x_unit':'sample' if c['mode']=='mismatch' else 'Hz',
        'x_label':'Seeded native OP sample' if c['mode']=='mismatch' else 'Frequency','corner':settings['corner'],'temperature_C':settings['temperature_C'],
        'supply_V':settings['supply_V'],'solver':'SPARSE 1.3','post_layout':str(bool(params.get('post_layout'))).lower(),'reference_scope':report['scope']},
        message=f'Actual OTA {c["mode"]}: {metrics["samples"]} samples; requested criterion '+('PASS' if passed else 'FAIL'))
