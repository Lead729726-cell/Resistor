"""Run actual unittest modules; legacy test_*.py CLI integrations are separate."""
import ast,json,os,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];TESTS=ROOT/'workers/eda';sys.path.insert(0,str(TESTS))
installed_pdk=Path.home()/'.local/share/resistor/pdks'
if installed_pdk.is_dir():os.environ.setdefault('PDK_ROOT',str(installed_pdk))
OUT=ROOT/'examples/adc16-lab/qa';OUT.mkdir(parents=True,exist_ok=True);modules=[];legacy=[]
for file in sorted(TESTS.glob('test_*.py')):
 tree=ast.parse(file.read_text(encoding='utf-8'))
 if any(isinstance(n,ast.ClassDef)and any(ast.unparse(b).endswith('TestCase')for b in n.bases)for n in tree.body):modules.append(file.stem)
 else:legacy.append(file.name)
with(OUT/'unit-tests.log').open('w',encoding='utf-8')as log:
 result=unittest.TextTestRunner(stream=log,verbosity=1).run(unittest.defaultTestLoader.loadTestsFromNames(modules))
report=dict(edition='Resistor Indust',runner='Python unittest TestCase modules',tests_run=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),pass_=result.wasSuccessful(),modules=modules,legacy_integration_scripts_not_run=legacy,
 scope='TestCase module regression, not all integration scripts. Plain discover previously attempted legacy CLI imports and raised 15 environment/path errors including fixed /workspace paths; no system symlink or user workspace was changed.')
(OUT/'unit-tests.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items()if k not in('modules','legacy_integration_scripts_not_run','scope')}))
if not result.wasSuccessful():print((OUT/'unit-tests.log').read_text(encoding='utf-8')[-3500:]);sys.exit(1)
