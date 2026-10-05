export type CalculatorInputKind = 'number' | 'select';

export type CalculatorInput = {
  id: string;
  label: string;
  unit?: string;
  kind?: CalculatorInputKind;
  defaultValue: number | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
};

export type CalculatorResult = {
  primaryLabel: string;
  primaryValue: number | string;
  primaryUnit?: string;
  secondary?: { label: string; value: number | string; unit?: string }[];
  explanation: string;
};

export type CalculatorExample = {
  title: string;
  inputs: Record<string, number | string>;
  expected: CalculatorResult;
};

export type CalculatorDefinition = {
  id: string;
  path: string;
  title: string;
  description: string;
  category: string;
  formula: string;
  referenceEquation: string;
  inputs: CalculatorInput[];
  examples: CalculatorExample[];
  edgeCases: { title: string; inputs: Record<string, number | string>; error?: string; expected?: CalculatorResult }[];
  unitTests: { title: string; inputs: Record<string, number | string>; expected: CalculatorResult }[];
  faq: { question: string; answer: string }[];
  related: string[];
  calculate: (inputs: Record<string, number | string>) => CalculatorResult;
};

const bands = {
  black: { digit: 0, multiplier: 1, tolerance: undefined },
  brown: { digit: 1, multiplier: 10, tolerance: 1 },
  red: { digit: 2, multiplier: 100, tolerance: 2 },
  orange: { digit: 3, multiplier: 1_000, tolerance: undefined },
  yellow: { digit: 4, multiplier: 10_000, tolerance: undefined },
  green: { digit: 5, multiplier: 100_000, tolerance: 0.5 },
  blue: { digit: 6, multiplier: 1_000_000, tolerance: 0.25 },
  violet: { digit: 7, multiplier: 10_000_000, tolerance: 0.1 },
  gray: { digit: 8, multiplier: 100_000_000, tolerance: 0.05 },
  white: { digit: 9, multiplier: 1_000_000_000, tolerance: undefined },
  gold: { digit: undefined, multiplier: 0.1, tolerance: 5 },
  silver: { digit: undefined, multiplier: 0.01, tolerance: 10 }
} as const;

const bandOptions = Object.keys(bands).map(value => ({ value, label: value }));
const toleranceOptions = Object.entries(bands).filter(([, band]) => band.tolerance !== undefined).map(([value]) => ({ value, label: value }));
const seriesOptions = ['E6', 'E12', 'E24', 'E48', 'E96'].map(value => ({ value, label: value }));
const unitOptions = [
  { value: 'resistance:ohm:kohm', label: 'ohm to kiloohm' },
  { value: 'resistance:kohm:ohm', label: 'kiloohm to ohm' },
  { value: 'capacitance:uf:nf', label: 'microfarad to nanofarad' },
  { value: 'capacitance:nf:pf', label: 'nanofarad to picofarad' },
  { value: 'current:ma:a', label: 'milliampere to ampere' },
  { value: 'voltage:mv:v', label: 'millivolt to volt' },
  { value: 'frequency:khz:hz', label: 'kilohertz to hertz' }
];

function asNumber(inputs: Record<string, number | string>, id: string) {
  const value = Number(inputs[id]);
  if (!Number.isFinite(value)) throw new Error(`${id} must be a finite number.`);
  return value;
}

function positive(inputs: Record<string, number | string>, id: string) {
  const value = asNumber(inputs, id);
  if (value <= 0) throw new Error(`${id} must be greater than zero.`);
  return value;
}

function nonNegative(inputs: Record<string, number | string>, id: string) {
  const value = asNumber(inputs, id);
  if (value < 0) throw new Error(`${id} must be zero or greater.`);
  return value;
}

function finiteResult(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} produced a non-finite result.`);
  return value;
}

function result(primaryLabel: string, primaryValue: number | string, primaryUnit: string | undefined, explanation: string, secondary: CalculatorResult['secondary'] = []): CalculatorResult {
  return { primaryLabel, primaryValue, primaryUnit, explanation, secondary };
}

function round(value: number, digits = Math.abs(value) > 0 && Math.abs(value) < 0.001 ? 9 : 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatValue(value: number) {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000 || abs < 0.001) return value.toExponential(6).replace(/0+e/, 'e');
  return String(round(value, abs >= 100 ? 3 : 6));
}

function resistorNetwork(inputs: Record<string, number | string>, mode: 'series' | 'parallel') {
  const values = ['r1', 'r2', 'r3', 'r4'].map(id => nonNegative(inputs, id)).filter(value => value > 0);
  if (!values.length) throw new Error('At least one resistor must be greater than zero.');
  const ohms = mode === 'series' ? values.reduce((sum, value) => sum + value, 0) : 1 / values.reduce((sum, value) => sum + 1 / value, 0);
  return result('Equivalent resistance', round(ohms), 'ohm', mode === 'series' ? 'Series resistors add directly.' : 'Parallel branches add by conductance, then invert back to resistance.', [{ label: 'Active resistors', value: values.length }]);
}

const preferredValues: Record<string, number[]> = {
  E6: [10, 15, 22, 33, 47, 68],
  E12: [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82],
  E24: [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91],
  E48: Array.from({ length: 48 }, (_, i) => round(10 * 10 ** (i / 48), 2)),
  E96: Array.from({ length: 96 }, (_, i) => round(10 * 10 ** (i / 96), 2))
};

function nearestSeries(target: number, series: string) {
  const decade = 10 ** Math.floor(Math.log10(target / 10));
  const candidates = preferredValues[series].flatMap(value => [value * decade, value * decade * 10]);
  return candidates.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, candidates[0]);
}

export const calculators: CalculatorDefinition[] = [
  {
    id: 'resistor-color-code', path: '/resistor-color-code', title: 'Resistor color code', category: 'Resistance', description: 'Decode a 4-band resistor into resistance and tolerance.', formula: 'R = (10 x first digit + second digit) x multiplier', referenceEquation: 'IEC 60062 color band convention',
    inputs: [
      { id: 'band1', label: 'Band 1', kind: 'select', defaultValue: 'brown', options: bandOptions.filter(option => !['gold', 'silver'].includes(option.value)) },
      { id: 'band2', label: 'Band 2', kind: 'select', defaultValue: 'black', options: bandOptions.filter(option => !['gold', 'silver'].includes(option.value)) },
      { id: 'multiplier', label: 'Multiplier', kind: 'select', defaultValue: 'red', options: bandOptions },
      { id: 'tolerance', label: 'Tolerance', kind: 'select', defaultValue: 'gold', options: toleranceOptions }
    ],
    calculate: inputs => {
      const first = bands[String(inputs.band1) as keyof typeof bands].digit;
      const second = bands[String(inputs.band2) as keyof typeof bands].digit;
      const multiplier = bands[String(inputs.multiplier) as keyof typeof bands].multiplier;
      const tolerance = bands[String(inputs.tolerance) as keyof typeof bands].tolerance;
      if (first === undefined || second === undefined || tolerance === undefined) throw new Error('Invalid color band selection.');
      const ohms = (first * 10 + second) * multiplier;
      return result('Resistance', round(ohms), 'ohm', `The selected bands represent ${first}${second} multiplied by ${multiplier}.`, [{ label: 'Tolerance', value: `±${tolerance}`, unit: '%' }]);
    },
    examples: [{ title: 'Brown black red gold', inputs: { band1: 'brown', band2: 'black', multiplier: 'red', tolerance: 'gold' }, expected: result('Resistance', 1000, 'ohm', 'The selected bands represent 10 multiplied by 100.', [{ label: 'Tolerance', value: '±5', unit: '%' }]) }],
    edgeCases: [{ title: 'Reject invalid digit band', inputs: { band1: 'gold', band2: 'black', multiplier: 'red', tolerance: 'gold' }, error: 'Invalid color band selection.' }],
    unitTests: [],
    faq: [{ question: 'Does this support 5-band precision parts?', answer: 'The first release supports the common 4-band workflow; the formula core is ready for a 5-band extension.' }],
    related: ['resistor-series', 'parallel-resistor', 'power-dissipation']
  },
  {
    id: 'resistor-series', path: '/resistor-series', title: 'Resistor series', category: 'Resistance', description: 'Find the nearest preferred E-series resistor value.', formula: 'nearest value in selected IEC E-series', referenceEquation: 'IEC 60063 preferred number series',
    inputs: [{ id: 'target', label: 'Target resistance', unit: 'ohm', defaultValue: 4700, min: 0, step: 1 }, { id: 'series', label: 'Series', kind: 'select', defaultValue: 'E24', options: seriesOptions }],
    calculate: inputs => {
      const target = positive(inputs, 'target');
      const series = String(inputs.series || 'E24');
      const nearest = nearestSeries(target, series);
      return result('Nearest value', round(nearest), 'ohm', `${series} chooses the closest preferred value to the requested resistance.`, [{ label: 'Error', value: round((nearest - target) / target * 100, 3), unit: '%' }]);
    },
    examples: [{ title: '4.6 kohm in E24', inputs: { target: 4600, series: 'E24' }, expected: result('Nearest value', 4700, 'ohm', 'E24 chooses the closest preferred value to the requested resistance.', [{ label: 'Error', value: 2.174, unit: '%' }]) }],
    edgeCases: [{ title: 'Reject zero target', inputs: { target: 0, series: 'E24' }, error: 'target must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Are E48/E96 exact catalog values?', answer: 'They are generated from the logarithmic IEC rule and rounded for utility use.' }],
    related: ['resistor-color-code', 'led-resistor', 'voltage-divider']
  },
  {
    id: 'parallel-resistor', path: '/parallel-resistor', title: 'Parallel resistor', category: 'Resistance', description: 'Calculate equivalent resistance for up to four parallel resistors.', formula: '1 / Req = 1/R1 + 1/R2 + ...', referenceEquation: 'Ohm law network reduction',
    inputs: ['r1', 'r2', 'r3', 'r4'].map((id, index) => ({ id, label: `R${index + 1}`, unit: 'ohm', defaultValue: index < 2 ? 1000 : 0, min: 0, step: 1 })),
    calculate: inputs => resistorNetwork(inputs, 'parallel'),
    examples: [{ title: 'Two 1 kohm resistors', inputs: { r1: 1000, r2: 1000, r3: 0, r4: 0 }, expected: result('Equivalent resistance', 500, 'ohm', 'Parallel branches add by conductance, then invert back to resistance.', [{ label: 'Active resistors', value: 2 }]) }],
    edgeCases: [{ title: 'Reject empty network', inputs: { r1: 0, r2: 0, r3: 0, r4: 0 }, error: 'At least one resistor must be greater than zero.' }],
    unitTests: [{ title: 'kohm entered as ohm', inputs: { r1: 2200, r2: 3300, r3: 0, r4: 0 }, expected: result('Equivalent resistance', 1320, 'ohm', 'Parallel branches add by conductance, then invert back to resistance.', [{ label: 'Active resistors', value: 2 }]) }],
    faq: [{ question: 'Can any branch be left blank?', answer: 'Use 0 for unused branches; it is ignored rather than treated as a short.' }],
    related: ['resistor-series', 'ohms-law', 'power-dissipation']
  },
  {
    id: 'series-resistor', path: '/series-resistor', title: 'Series resistor', category: 'Resistance', description: 'Add up to four series resistors.', formula: 'Req = R1 + R2 + ...', referenceEquation: 'Ohm law network reduction',
    inputs: ['r1', 'r2', 'r3', 'r4'].map((id, index) => ({ id, label: `R${index + 1}`, unit: 'ohm', defaultValue: index < 2 ? 1000 : 0, min: 0, step: 1 })),
    calculate: inputs => resistorNetwork(inputs, 'series'),
    examples: [{ title: '1 kohm + 2.2 kohm', inputs: { r1: 1000, r2: 2200, r3: 0, r4: 0 }, expected: result('Equivalent resistance', 3200, 'ohm', 'Series resistors add directly.', [{ label: 'Active resistors', value: 2 }]) }],
    edgeCases: [{ title: 'Reject empty network', inputs: { r1: 0, r2: 0, r3: 0, r4: 0 }, error: 'At least one resistor must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Does tolerance stack linearly?', answer: 'Worst-case tolerance can stack linearly; RSS tolerance is a separate statistical calculation.' }],
    related: ['parallel-resistor', 'voltage-divider', 'power-dissipation']
  },
  {
    id: 'voltage-divider', path: '/voltage-divider', title: 'Voltage divider', category: 'Analog', description: 'Calculate output voltage and divider current.', formula: 'Vout = Vin x R2 / (R1 + R2)', referenceEquation: 'Two-resistor divider',
    inputs: [{ id: 'vin', label: 'Input voltage', unit: 'V', defaultValue: 5, step: 0.1 }, { id: 'r1', label: 'Top resistor', unit: 'ohm', defaultValue: 10000 }, { id: 'r2', label: 'Bottom resistor', unit: 'ohm', defaultValue: 10000 }],
    calculate: inputs => {
      const vin = asNumber(inputs, 'vin'), r1 = positive(inputs, 'r1'), r2 = positive(inputs, 'r2');
      const current = vin / (r1 + r2);
      return result('Output voltage', round(vin * r2 / (r1 + r2)), 'V', 'The output node is the ratio of the lower resistor to the total divider resistance.', [{ label: 'Divider current', value: round(current), unit: 'A' }, { label: 'Total resistance', value: r1 + r2, unit: 'ohm' }]);
    },
    examples: [{ title: '5 V split in half', inputs: { vin: 5, r1: 10000, r2: 10000 }, expected: result('Output voltage', 2.5, 'V', 'The output node is the ratio of the lower resistor to the total divider resistance.', [{ label: 'Divider current', value: 0.00025, unit: 'A' }, { label: 'Total resistance', value: 20000, unit: 'ohm' }]) }],
    edgeCases: [{ title: 'Reject zero resistor', inputs: { vin: 5, r1: 0, r2: 10000 }, error: 'r1 must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Does load resistance matter?', answer: 'Yes. This ideal calculator assumes the load impedance is high compared with R2.' }],
    related: ['ohms-law', 'adc-resolution', 'power-dissipation']
  },
  {
    id: 'led-resistor', path: '/led-resistor', title: 'LED resistor', category: 'Analog', description: 'Choose a current limiting resistor for a single LED.', formula: 'R = (Vs - Vf) / If', referenceEquation: 'Ohm law applied to LED current limit',
    inputs: [{ id: 'supply', label: 'Supply voltage', unit: 'V', defaultValue: 5 }, { id: 'forward', label: 'LED forward voltage', unit: 'V', defaultValue: 2 }, { id: 'current_ma', label: 'Target current', unit: 'mA', defaultValue: 10 }],
    calculate: inputs => {
      const supply = positive(inputs, 'supply'), forward = nonNegative(inputs, 'forward'), current = positive(inputs, 'current_ma') / 1000;
      if (supply <= forward) throw new Error('Supply voltage must be greater than LED forward voltage.');
      const resistance = (supply - forward) / current;
      return result('Series resistor', round(resistance), 'ohm', 'The resistor drops the remaining supply voltage at the target LED current.', [{ label: 'Resistor power', value: round((supply - forward) * current), unit: 'W' }]);
    },
    examples: [{ title: '5 V red LED at 10 mA', inputs: { supply: 5, forward: 2, current_ma: 10 }, expected: result('Series resistor', 300, 'ohm', 'The resistor drops the remaining supply voltage at the target LED current.', [{ label: 'Resistor power', value: 0.03, unit: 'W' }]) }],
    edgeCases: [{ title: 'Reject impossible voltage', inputs: { supply: 2, forward: 2, current_ma: 10 }, error: 'Supply voltage must be greater than LED forward voltage.' }],
    unitTests: [],
    faq: [{ question: 'Should I pick the exact resistance?', answer: 'Pick the nearest higher standard value when you want to keep current below the target.' }],
    related: ['resistor-series', 'ohms-law', 'power-dissipation']
  },
  {
    id: 'power-dissipation', path: '/power-dissipation', title: 'Power dissipation', category: 'Analog', description: 'Calculate resistor or load power from voltage and resistance.', formula: 'P = V^2 / R = I^2R = VI', referenceEquation: 'Ohm law power identities',
    inputs: [{ id: 'voltage', label: 'Voltage', unit: 'V', defaultValue: 5 }, { id: 'resistance', label: 'Resistance', unit: 'ohm', defaultValue: 1000 }],
    calculate: inputs => {
      const voltage = asNumber(inputs, 'voltage'), resistance = positive(inputs, 'resistance');
      const current = voltage / resistance;
      return result('Power', round(voltage * current), 'W', 'Power is the rate of energy converted in the load.', [{ label: 'Current', value: round(current), unit: 'A' }]);
    },
    examples: [{ title: '5 V across 1 kohm', inputs: { voltage: 5, resistance: 1000 }, expected: result('Power', 0.025, 'W', 'Power is the rate of energy converted in the load.', [{ label: 'Current', value: 0.005, unit: 'A' }]) }],
    edgeCases: [{ title: 'Reject zero resistance', inputs: { voltage: 5, resistance: 0 }, error: 'resistance must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'How much margin should I use?', answer: 'A common practical choice is a part rated at least twice the calculated dissipation.' }],
    related: ['ohms-law', 'led-resistor', 'voltage-divider']
  },
  {
    id: 'ohms-law', path: '/ohms-law', title: "Ohm's law", category: 'Fundamentals', description: 'Solve voltage, current, resistance, and power.', formula: 'V = I x R', referenceEquation: "Ohm's law",
    inputs: [{ id: 'current', label: 'Current', unit: 'A', defaultValue: 0.01 }, { id: 'resistance', label: 'Resistance', unit: 'ohm', defaultValue: 1000 }],
    calculate: inputs => {
      const current = asNumber(inputs, 'current'), resistance = positive(inputs, 'resistance');
      const voltage = current * resistance;
      return result('Voltage', round(voltage), 'V', 'Voltage is current multiplied by resistance.', [{ label: 'Power', value: round(voltage * current), unit: 'W' }]);
    },
    examples: [{ title: '10 mA through 1 kohm', inputs: { current: 0.01, resistance: 1000 }, expected: result('Voltage', 10, 'V', 'Voltage is current multiplied by resistance.', [{ label: 'Power', value: 0.1, unit: 'W' }]) }],
    edgeCases: [{ title: 'Reject zero resistance', inputs: { current: 1, resistance: 0 }, error: 'resistance must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Why enter current in amperes?', answer: 'The core formula uses SI base units so tests and conversions stay deterministic.' }],
    related: ['power-dissipation', 'parallel-resistor', 'voltage-divider']
  },
  {
    id: 'rc-time-constant', path: '/rc-time-constant', title: 'RC time constant', category: 'Timing', description: 'Calculate RC tau, cutoff frequency, and settling times.', formula: 'tau = R x C, fc = 1 / (2πRC)', referenceEquation: 'First-order RC response',
    inputs: [{ id: 'resistance', label: 'Resistance', unit: 'ohm', defaultValue: 10000 }, { id: 'capacitance', label: 'Capacitance', unit: 'F', defaultValue: 0.000001 }],
    calculate: inputs => {
      const r = positive(inputs, 'resistance'), c = positive(inputs, 'capacitance');
      const tau = r * c;
      return result('Time constant', round(tau), 's', 'One time constant reaches about 63.2 percent of the final step value.', [{ label: 'Cutoff frequency', value: round(1 / (2 * Math.PI * tau)), unit: 'Hz' }, { label: '5 tau settling', value: round(5 * tau), unit: 's' }]);
    },
    examples: [{ title: '10 kohm and 1 uF', inputs: { resistance: 10000, capacitance: 0.000001 }, expected: result('Time constant', 0.01, 's', 'One time constant reaches about 63.2 percent of the final step value.', [{ label: 'Cutoff frequency', value: 15.915494, unit: 'Hz' }, { label: '5 tau settling', value: 0.05, unit: 's' }]) }],
    edgeCases: [{ title: 'Reject zero capacitance', inputs: { resistance: 10000, capacitance: 0 }, error: 'capacitance must be greater than zero.' }],
    unitTests: [{ title: 'nF to F conversion fixture', inputs: { resistance: 1000, capacitance: 0.0000001 }, expected: result('Time constant', 0.0001, 's', 'One time constant reaches about 63.2 percent of the final step value.', [{ label: 'Cutoff frequency', value: 1591.549431, unit: 'Hz' }, { label: '5 tau settling', value: 0.0005, unit: 's' }]) }],
    faq: [{ question: 'Is 5 tau fully settled?', answer: 'Five time constants is about 99.3 percent settled for a first-order step.' }],
    related: ['capacitor-calculator', 'frequency-period', 'rl-time-constant']
  },
  {
    id: 'rl-time-constant', path: '/rl-time-constant', title: 'RL time constant', category: 'Timing', description: 'Calculate RL tau and approximate cutoff frequency.', formula: 'tau = L / R, fc = R / (2πL)', referenceEquation: 'First-order RL response',
    inputs: [{ id: 'inductance', label: 'Inductance', unit: 'H', defaultValue: 0.01 }, { id: 'resistance', label: 'Resistance', unit: 'ohm', defaultValue: 100 }],
    calculate: inputs => {
      const l = positive(inputs, 'inductance'), r = positive(inputs, 'resistance');
      const tau = l / r;
      return result('Time constant', round(tau), 's', 'An RL circuit current changes with a time constant of inductance divided by resistance.', [{ label: 'Cutoff frequency', value: round(r / (2 * Math.PI * l)), unit: 'Hz' }]);
    },
    examples: [{ title: '10 mH and 100 ohm', inputs: { inductance: 0.01, resistance: 100 }, expected: result('Time constant', 0.0001, 's', 'An RL circuit current changes with a time constant of inductance divided by resistance.', [{ label: 'Cutoff frequency', value: 1591.549431, unit: 'Hz' }]) }],
    edgeCases: [{ title: 'Reject zero inductance', inputs: { inductance: 0, resistance: 100 }, error: 'inductance must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Does inductor series resistance count?', answer: 'Yes, include every series resistance that limits current change.' }],
    related: ['rc-time-constant', 'rlc-resonance', 'frequency-period']
  },
  {
    id: 'rlc-resonance', path: '/rlc-resonance', title: 'RLC resonance', category: 'Timing', description: 'Calculate resonant frequency and quality factor for a series RLC circuit.', formula: 'f0 = 1 / (2π√LC), Q = 1/R x √(L/C)', referenceEquation: 'Series RLC resonance',
    inputs: [{ id: 'resistance', label: 'Series resistance', unit: 'ohm', defaultValue: 10 }, { id: 'inductance', label: 'Inductance', unit: 'H', defaultValue: 0.00001 }, { id: 'capacitance', label: 'Capacitance', unit: 'F', defaultValue: 0.0000001 }],
    calculate: inputs => {
      const r = positive(inputs, 'resistance'), l = positive(inputs, 'inductance'), c = positive(inputs, 'capacitance');
      return result('Resonant frequency', round(1 / (2 * Math.PI * Math.sqrt(l * c))), 'Hz', 'At resonance, ideal inductive and capacitive reactances have equal magnitude.', [{ label: 'Q factor', value: round(Math.sqrt(l / c) / r) }]);
    },
    examples: [{ title: '10 uH and 100 nF', inputs: { resistance: 10, inductance: 0.00001, capacitance: 0.0000001 }, expected: result('Resonant frequency', 159154.943092, 'Hz', 'At resonance, ideal inductive and capacitive reactances have equal magnitude.', [{ label: 'Q factor', value: 1 }]) }],
    edgeCases: [{ title: 'Reject zero resistance', inputs: { resistance: 0, inductance: 0.00001, capacitance: 0.0000001 }, error: 'resistance must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Is this for series or parallel RLC?', answer: 'This version reports series RLC Q; the resonant frequency is the same ideal LC value.' }],
    related: ['rl-time-constant', 'rc-time-constant', 'frequency-period']
  },
  {
    id: 'capacitor-calculator', path: '/capacitor-calculator', title: 'Capacitor calculator', category: 'Capacitance', description: 'Calculate stored charge and energy from capacitance and voltage.', formula: 'Q = C x V, E = 1/2 C V²', referenceEquation: 'Capacitor charge and stored energy',
    inputs: [{ id: 'capacitance', label: 'Capacitance', unit: 'F', defaultValue: 0.000001 }, { id: 'voltage', label: 'Voltage', unit: 'V', defaultValue: 5 }],
    calculate: inputs => {
      const c = positive(inputs, 'capacitance'), v = asNumber(inputs, 'voltage');
      return result('Stored charge', round(c * v), 'C', 'Charge is proportional to capacitance and voltage.', [{ label: 'Stored energy', value: round(0.5 * c * v * v), unit: 'J' }]);
    },
    examples: [{ title: '1 uF at 5 V', inputs: { capacitance: 0.000001, voltage: 5 }, expected: result('Stored charge', 0.000005, 'C', 'Charge is proportional to capacitance and voltage.', [{ label: 'Stored energy', value: 0.0000125, unit: 'J' }]) }],
    edgeCases: [{ title: 'Reject zero capacitance', inputs: { capacitance: 0, voltage: 5 }, error: 'capacitance must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Does voltage sign matter for energy?', answer: 'Energy uses voltage squared, so polarity does not change the stored energy.' }],
    related: ['rc-time-constant', 'rlc-resonance', 'unit-converter']
  },
  {
    id: 'adc-resolution', path: '/adc-resolution', title: 'ADC resolution', category: 'Digital', description: 'Calculate quantization step size for an ADC.', formula: 'LSB = Vref / (2^N - 1)', referenceEquation: 'Ideal unipolar ADC code width',
    inputs: [{ id: 'bits', label: 'Bits', defaultValue: 12, min: 1, max: 32, step: 1 }, { id: 'vref', label: 'Reference voltage', unit: 'V', defaultValue: 3.3 }],
    calculate: inputs => {
      const bits = positive(inputs, 'bits'), vref = positive(inputs, 'vref');
      const levels = 2 ** Math.round(bits);
      return result('LSB size', round(vref / (levels - 1)), 'V/code', 'The smallest ideal code step is the reference span divided by the maximum code.', [{ label: 'Codes', value: levels }]);
    },
    examples: [{ title: '12-bit, 3.3 V', inputs: { bits: 12, vref: 3.3 }, expected: result('LSB size', 0.000805861, 'V/code', 'The smallest ideal code step is the reference span divided by the maximum code.', [{ label: 'Codes', value: 4096 }]) }],
    edgeCases: [{ title: 'Reject zero bits', inputs: { bits: 0, vref: 3.3 }, error: 'bits must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Why divide by 2^N - 1?', answer: 'This reports endpoint code spacing for a unipolar ideal converter.' }],
    related: ['dac-resolution', 'voltage-divider', 'unit-converter']
  },
  {
    id: 'dac-resolution', path: '/dac-resolution', title: 'DAC resolution', category: 'Digital', description: 'Calculate ideal DAC step size.', formula: 'LSB = Vfs / (2^N - 1)', referenceEquation: 'Ideal unipolar DAC code width',
    inputs: [{ id: 'bits', label: 'Bits', defaultValue: 10, min: 1, max: 32, step: 1 }, { id: 'vfs', label: 'Full-scale voltage', unit: 'V', defaultValue: 5 }],
    calculate: inputs => {
      const bits = positive(inputs, 'bits'), vfs = positive(inputs, 'vfs');
      const levels = 2 ** Math.round(bits);
      return result('LSB size', round(vfs / (levels - 1)), 'V/code', 'The ideal DAC step is the full-scale span divided by the maximum code.', [{ label: 'Codes', value: levels }]);
    },
    examples: [{ title: '10-bit, 5 V', inputs: { bits: 10, vfs: 5 }, expected: result('LSB size', 0.004888, 'V/code', 'The ideal DAC step is the full-scale span divided by the maximum code.', [{ label: 'Codes', value: 1024 }]) }],
    edgeCases: [{ title: 'Reject zero bits', inputs: { bits: 0, vfs: 5 }, error: 'bits must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Is this INL or DNL?', answer: 'No. This is ideal code spacing, not a converter linearity spec.' }],
    related: ['adc-resolution', 'op-amp-gain', 'unit-converter']
  },
  {
    id: 'op-amp-gain', path: '/op-amp-gain', title: 'Op-amp gain', category: 'Analog', description: 'Calculate non-inverting and inverting op-amp gain.', formula: 'Av(non-inverting)=1+Rf/Rg, Av(inverting)=-Rf/Rin', referenceEquation: 'Ideal op-amp feedback gain',
    inputs: [{ id: 'rf', label: 'Feedback resistor', unit: 'ohm', defaultValue: 10000 }, { id: 'rg', label: 'Ground/input resistor', unit: 'ohm', defaultValue: 1000 }],
    calculate: inputs => {
      const rf = positive(inputs, 'rf'), rg = positive(inputs, 'rg');
      return result('Non-inverting gain', round(1 + rf / rg), 'V/V', 'With ideal negative feedback, the closed-loop gain is set by the resistor ratio.', [{ label: 'Inverting gain magnitude', value: round(rf / rg), unit: 'V/V' }]);
    },
    examples: [{ title: '10 kohm / 1 kohm', inputs: { rf: 10000, rg: 1000 }, expected: result('Non-inverting gain', 11, 'V/V', 'With ideal negative feedback, the closed-loop gain is set by the resistor ratio.', [{ label: 'Inverting gain magnitude', value: 10, unit: 'V/V' }]) }],
    edgeCases: [{ title: 'Reject zero input resistor', inputs: { rf: 10000, rg: 0 }, error: 'rg must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Does this include bandwidth limits?', answer: 'No. It is the ideal low-frequency resistor-set gain.' }],
    related: ['db-conversion', 'resistor-series', 'voltage-divider']
  },
  {
    id: 'db-conversion', path: '/db-conversion', title: 'dB conversion', category: 'Signal', description: 'Convert voltage ratio to dB.', formula: 'dB = 20 log10(Vout/Vin)', referenceEquation: 'Amplitude ratio in decibels',
    inputs: [{ id: 'ratio', label: 'Amplitude ratio', defaultValue: 2, min: 0 }],
    calculate: inputs => {
      const ratio = positive(inputs, 'ratio');
      return result('Gain', round(20 * Math.log10(ratio)), 'dB', 'Voltage or amplitude ratios use 20 times the base-10 logarithm.', [{ label: 'Power ratio equivalent', value: round(ratio * ratio), unit: 'x' }]);
    },
    examples: [{ title: '2x voltage gain', inputs: { ratio: 2 }, expected: result('Gain', 6.0206, 'dB', 'Voltage or amplitude ratios use 20 times the base-10 logarithm.', [{ label: 'Power ratio equivalent', value: 4, unit: 'x' }]) }],
    edgeCases: [{ title: 'Reject zero ratio', inputs: { ratio: 0 }, error: 'ratio must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'When do I use 10 log10?', answer: 'Use 10 log10 for direct power ratios.' }],
    related: ['op-amp-gain', 'frequency-period', 'unit-converter']
  },
  {
    id: 'frequency-period', path: '/frequency-period', title: 'Frequency / period', category: 'Signal', description: 'Convert frequency to period.', formula: 'T = 1 / f', referenceEquation: 'Frequency-period reciprocal',
    inputs: [{ id: 'frequency', label: 'Frequency', unit: 'Hz', defaultValue: 1000 }],
    calculate: inputs => {
      const frequency = positive(inputs, 'frequency');
      return result('Period', round(1 / frequency), 's', 'Period is the time for one cycle.', [{ label: 'Angular frequency', value: round(2 * Math.PI * frequency), unit: 'rad/s' }]);
    },
    examples: [{ title: '1 kHz', inputs: { frequency: 1000 }, expected: result('Period', 0.001, 's', 'Period is the time for one cycle.', [{ label: 'Angular frequency', value: 6283.185307, unit: 'rad/s' }]) }],
    edgeCases: [{ title: 'Reject zero frequency', inputs: { frequency: 0 }, error: 'frequency must be greater than zero.' }],
    unitTests: [],
    faq: [{ question: 'Is duty cycle included?', answer: 'No. This reports only the full cycle period.' }],
    related: ['rc-time-constant', 'rlc-resonance', 'db-conversion']
  },
  {
    id: 'unit-converter', path: '/unit-converter', title: 'Engineering unit converter', category: 'Utilities', description: 'Convert common electrical engineering units.', formula: 'valueout = valuein x scalein / scaleout', referenceEquation: 'SI prefix conversion',
    inputs: [{ id: 'value', label: 'Value', defaultValue: 1 }, { id: 'conversion', label: 'Conversion', kind: 'select', defaultValue: 'resistance:kohm:ohm', options: unitOptions }],
    calculate: inputs => {
      const value = asNumber(inputs, 'value');
      const conversion = String(inputs.conversion).split(':');
      const scales: Record<string, number> = { ohm: 1, kohm: 1_000, uf: 1e-6, nf: 1e-9, pf: 1e-12, ma: 1e-3, a: 1, mv: 1e-3, v: 1, khz: 1e3, hz: 1 };
      const from = conversion[1], to = conversion[2];
      if (!scales[from] || !scales[to]) throw new Error('Unsupported conversion.');
      return result('Converted value', round(value * scales[from] / scales[to]), to, `Converted ${from} to ${to} using SI prefix scale factors.`);
    },
    examples: [{ title: '4.7 kohm to ohm', inputs: { value: 4.7, conversion: 'resistance:kohm:ohm' }, expected: result('Converted value', 4700, 'ohm', 'Converted kohm to ohm using SI prefix scale factors.') }],
    edgeCases: [{ title: 'Reject unsupported conversion', inputs: { value: 1, conversion: 'bad:x:y' }, error: 'Unsupported conversion.' }],
    unitTests: [{ title: '100 nF to pF', inputs: { value: 100, conversion: 'capacitance:nf:pf' }, expected: result('Converted value', 100000, 'pf', 'Converted nf to pf using SI prefix scale factors.') }],
    faq: [{ question: 'Why keep this small?', answer: 'The first converter focuses on electrical units used by the calculators.' }],
    related: ['capacitor-calculator', 'adc-resolution', 'frequency-period']
  }
];

export function getCalculator(pathOrId: string) {
  const normalized = pathOrId.startsWith('/') ? pathOrId : `/${pathOrId}`;
  return calculators.find(calculator => calculator.path === normalized || calculator.id === pathOrId);
}

export function defaultInputs(calculator: CalculatorDefinition) {
  return Object.fromEntries(calculator.inputs.map(input => [input.id, input.defaultValue]));
}

export function calculateSafe(calculator: CalculatorDefinition, inputs: Record<string, number | string>) {
  try {
    return { result: calculator.calculate(inputs), error: null };
  } catch (cause) {
    return { result: null, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export function displayNumber(value: number | string) {
  return typeof value === 'number' ? formatValue(value) : value;
}

export const calculatorPaths = calculators.map(calculator => calculator.path);
