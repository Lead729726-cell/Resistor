import { useEffect, useMemo, useState } from 'react';
import { Calculator, ChevronRight, Cpu, ExternalLink, Search } from 'lucide-react';
import { calculateSafe, calculators, defaultInputs, displayNumber, getCalculator, type CalculatorDefinition } from '../../calculators/src';
import './calculator-hub.css';
import { RegisterMark } from './Brand';
import AppearanceControl from './AppearanceControl';

function titleFor(calculator: CalculatorDefinition) {
  return `${calculator.title} | Resistor engineering calculators`;
}

function updateSeo(calculator: CalculatorDefinition) {
  document.title = titleFor(calculator);
  const description = document.querySelector('meta[name="description"]') || document.head.appendChild(document.createElement('meta'));
  description.setAttribute('name', 'description');
  description.setAttribute('content', calculator.description);
  const canonical = document.querySelector('link[rel="canonical"]') || document.head.appendChild(document.createElement('link'));
  canonical.setAttribute('rel', 'canonical');
  canonical.setAttribute('href', `${location.origin}${calculator.path}`);
}

function pickInitialCalculator() {
  return getCalculator(location.pathname) || calculators[0];
}

export default function CalculatorHub() {
  const [activeId, setActiveId] = useState(() => pickInitialCalculator().id);
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(() => window.innerWidth > 760);
  const active = calculators.find(calculator => calculator.id === activeId) || calculators[0];
  const [inputs, setInputs] = useState<Record<string, number | string>>(() => defaultInputs(active));
  const evaluated = useMemo(() => calculateSafe(active, inputs), [active, inputs]);
  const filtered = calculators.filter(calculator => `${calculator.title} ${calculator.description} ${calculator.category}`.toLowerCase().includes(query.toLowerCase()));
  const categories = [...new Set(calculators.map(calculator => calculator.category))];

  useEffect(() => {
    updateSeo(active);
    if (location.pathname !== active.path) history.replaceState(null, '', active.path);
    setInputs(defaultInputs(active));
  }, [active.id]);

  const select = (calculator: CalculatorDefinition) => {
    setActiveId(calculator.id);
    setQuery('');
    if (window.innerWidth <= 760) setNavOpen(false);
  };

  return <main className="calculator-app" data-nav-expanded={navOpen}>
    <aside className="calculator-nav" aria-label="Calculators">
      <div className="calculator-brand">
        <span className="calculator-logo"><RegisterMark size={28}/></span>
        <div><strong>Resistor</strong><small>electronics calculator hub</small></div>
      </div>
      <label className="calculator-search">
        <Search size={15}/>
        <input aria-label="계산기 검색" value={query} onChange={event => { setQuery(event.target.value); setNavOpen(true); }} placeholder="Search calculators"/>
      </label>
      <button type="button" className="calculator-nav-toggle" aria-expanded={navOpen} aria-controls="calculator-list" onClick={() => setNavOpen(value => !value)}>계산기 목록 <span>{filtered.length}<ChevronRight size={14}/></span></button>
      <div className="calculator-list" id="calculator-list">{!filtered.length && <p className="calculator-no-results" role="status">검색 결과가 없습니다.</p>}
        {categories.map(category => <section key={category}>
          <h2>{category}</h2>
          {filtered.filter(calculator => calculator.category === category).map(calculator => <button key={calculator.id} className={calculator.id === active.id ? 'active' : ''} onClick={() => select(calculator)}>
            <Calculator size={15}/>
            <span>{calculator.title}</span>
            <ChevronRight size={14}/>
          </button>)}
        </section>)}
      </div>
    </aside>
    <section className="calculator-workspace">
      <header className="calculator-header">
        <div>
          <span className="calculator-kicker"><Cpu size={14}/> Deterministic formulas</span>
          <h1>{active.title}</h1>
          <p>{active.description}</p>
        </div>
        <div className="calculator-header-actions"><AppearanceControl/><a href="/eda" className="eda-link" title="Open the existing EDA workspace"><ExternalLink size={15}/> EDA workspace</a></div>
      </header>

      <div className="calculator-main-grid">
        <form className="calculator-panel" onSubmit={event => event.preventDefault()}>
          <h2>Inputs</h2>
          <div className="calculator-fields">
            {active.inputs.map(input => <label key={input.id}>
              <span>{input.label}{input.unit ? <small>{input.unit}</small> : null}</span>
              {input.kind === 'select'
                ? <select aria-label={input.label} value={String(inputs[input.id] ?? input.defaultValue)} onChange={event => setInputs(current => ({ ...current, [input.id]: event.target.value }))}>
                  {input.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                : <input aria-label={input.label} type="number" value={String(inputs[input.id] ?? input.defaultValue)} min={input.min} max={input.max} step={input.step || 'any'} onChange={event => setInputs(current => ({ ...current, [input.id]: event.target.value }))}/>}
            </label>)}
          </div>
          <h2>Formula</h2>
          <code className="formula-block">{active.formula}</code>
          <p className="reference-line">{active.referenceEquation}</p>
        </form>

        <section className={`result-panel ${evaluated.error ? 'error' : ''}`} aria-live="polite">
          <span>Result</span>
          {evaluated.error ? <>
            <strong>Invalid input</strong>
            <p>{evaluated.error}</p>
          </> : evaluated.result && <>
            <strong>{displayNumber(evaluated.result.primaryValue)}{evaluated.result.primaryUnit ? <small>{evaluated.result.primaryUnit}</small> : null}</strong>
            <p>{evaluated.result.primaryLabel}</p>
            <div className="secondary-results">
              {evaluated.result.secondary?.map(item => <div key={item.label}>
                <span>{item.label}</span>
                <code>{displayNumber(item.value)}{item.unit ? ` ${item.unit}` : ''}</code>
              </div>)}
            </div>
            <p className="result-explanation">{evaluated.result.explanation}</p>
          </>}
        </section>
      </div>

      <section className="calculator-support">
        <div>
          <h2>Examples</h2>
          {active.examples.map(example => <button key={example.title} onClick={() => setInputs(example.inputs)}>
            <span>{example.title}</span>
            <code>{displayNumber(example.expected.primaryValue)} {example.expected.primaryUnit || ''}</code>
          </button>)}
        </div>
        <div className="calculator-qa"><details>
          <summary>QA Fixtures · 공식 검증 예제</summary><div>
          {[...active.examples, ...active.unitTests].map(fixture => <div key={fixture.title}>
            <span>{fixture.title}</span>
            <code>{fixture.expected.primaryLabel}: {displayNumber(fixture.expected.primaryValue)} {fixture.expected.primaryUnit || ''}</code>
          </div>)}
          {active.edgeCases.map(edge => <div key={edge.title}>
            <span>{edge.title}</span>
            <code>{edge.error || 'expected output'}</code>
          </div>)}
        </div></details></div>
      </section>

      <section className="calculator-support">
        <div>
          <h2>FAQ</h2>
          {active.faq.map(item => <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>)}
        </div>
        <div>
          <h2>Related Calculators</h2>
          {active.related.map(id => calculators.find(calculator => calculator.id === id)).filter(Boolean).map(calculator => <button key={calculator!.id} onClick={() => select(calculator!)}>
            <span>{calculator!.title}</span>
            <code>{calculator!.path}</code>
          </button>)}
        </div>
      </section>
    </section>
  </main>;
}
