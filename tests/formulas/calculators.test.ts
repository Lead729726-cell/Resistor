import test from 'node:test';
import assert from 'node:assert/strict';
import { calculators, defaultInputs, type CalculatorResult } from '../../packages/calculators/src';

function close(actual: number | string | undefined, expected: number | string | undefined, label: string) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', `${label} should be numeric`);
    const tolerance = Math.max(1e-9, Math.abs(expected) * 1e-6);
    assert.ok(Math.abs((actual as number) - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
    return;
  }
  assert.equal(actual, expected, label);
}

function compareResult(actual: CalculatorResult, expected: CalculatorResult) {
  assert.equal(actual.primaryLabel, expected.primaryLabel);
  assert.equal(actual.primaryUnit, expected.primaryUnit);
  close(actual.primaryValue, expected.primaryValue, actual.primaryLabel);
  assert.equal(actual.secondary?.length || 0, expected.secondary?.length || 0);
  expected.secondary?.forEach((item, index) => {
    const actualItem = actual.secondary?.[index];
    assert.equal(actualItem?.label, item.label);
    assert.equal(actualItem?.unit, item.unit);
    close(actualItem?.value, item.value, item.label);
  });
}

test('every calculator has the standard content contract', () => {
  assert.ok(calculators.length >= 17);
  const paths = new Set<string>();
  for (const calculator of calculators) {
    assert.match(calculator.path, /^\/[a-z0-9-]+$/);
    assert.ok(!paths.has(calculator.path), `duplicate path ${calculator.path}`);
    paths.add(calculator.path);
    assert.ok(calculator.title);
    assert.ok(calculator.description);
    assert.ok(calculator.formula);
    assert.ok(calculator.referenceEquation);
    assert.ok(calculator.inputs.length > 0);
    assert.ok(calculator.examples.length > 0);
    assert.ok(calculator.edgeCases.length > 0);
    assert.ok(calculator.faq.length > 0);
    assert.ok(calculator.related.length > 0);
  }
});

test('default inputs produce finite deterministic results', () => {
  for (const calculator of calculators) {
    const result = calculator.calculate(defaultInputs(calculator));
    assert.ok(result.primaryLabel, calculator.id);
    if (typeof result.primaryValue === 'number') assert.ok(Number.isFinite(result.primaryValue), calculator.id);
    result.secondary?.forEach(item => {
      if (typeof item.value === 'number') assert.ok(Number.isFinite(item.value), `${calculator.id}:${item.label}`);
    });
  }
});

test('known examples and unit conversion fixtures match expected outputs', () => {
  for (const calculator of calculators) {
    for (const fixture of [...calculator.examples, ...calculator.unitTests]) {
      compareResult(calculator.calculate(fixture.inputs), fixture.expected);
    }
  }
});

test('edge cases reject invalid inputs with explicit errors', () => {
  for (const calculator of calculators) {
    for (const edge of calculator.edgeCases.filter(item => item.error)) {
      assert.throws(() => calculator.calculate(edge.inputs), new RegExp(edge.error!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
});

test('related calculators point at existing calculators', () => {
  const ids = new Set(calculators.map(calculator => calculator.id));
  for (const calculator of calculators) {
    for (const related of calculator.related) assert.ok(ids.has(related), `${calculator.id} references missing ${related}`);
  }
});
