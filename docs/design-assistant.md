# Design assistant and measured CPU execution

Resistor keeps deterministic engineering and native engine validation separate from AI advice. The assistant reads a revision-pinned project, the selected/root cell connectivity, recent actual engine status and measurement summaries. It does not receive raw GDS, PDK/model/deck files, waveform arrays or credentials. The evidence preview shows exactly what will be sent.

## Providers

- **Ollama:** loopback HTTP only, installed models only, JSON schema constrained output. Install from [Ollama](https://ollama.com/download), run `ollama pull qwen2.5:1.5b`, then `ollama serve` if a server is not already running. Model quality varies; this small model is a connection test option, not an expert signoff system. [Chat API](https://docs.ollama.com/api/chat).
- **OpenAI:** server/main-process credential only. Set `OPENAI_API_KEY` in the local workspace `.env.local` or the server environment. Never use a `VITE_` key. The fixed `gpt-6-luna` request uses structured output, `store:false`, no tools and no automatic retries. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Web development uses the protected same-origin `/api/rpc` relay. Packaged Windows/macOS builds bundle the Node assistant into the Electron main process. Cloud rooms disable the local assistant: shared users do not obtain access to another user's key. Credentials, settings, budget ledger and private receipts are excluded from Git and application archives.

## Cost and approval

New workspaces have a US$0 cap. Set only a budget you explicitly authorize:

```sh
npm run assistant:settings -- --budget-usd=1 --ollama-model=qwen2.5:1.5b
```

This writes local `.runtime/assistant/settings.json`. Every paid request requires a current evidence preview and the explicit one-call checkbox. The backend atomically reserves the conservative maximum before sending; concurrent processes cannot exceed the cap. Reservations remain after ambiguous/provider failures, and the UI labels them as reservations, not final billing. The rate table is dated and uses the higher standard input/output rates from [official pricing](https://developers.openai.com/api/docs/pricing). Check current pricing before changing the model or reauthorizing a new budget. The model/context/output bounds must be updated together.

For an installed desktop app, use the **writable workspace shown by desktop diagnostics**, not `Register.app/Contents/Resources/app`. Source npm commands require the source checkout and Node 24. In that writable workspace, an explicitly authorized cap can instead be configured in `.runtime/assistant/settings.json`:

```json
{"budget_usd":1,"ollama_url":"http://127.0.0.1:11434","ollama_model":"qwen2.5:1.5b"}
```

Place the user's own key in that same workspace's `.env.local`; do not send it through the renderer or place it inside the application bundle. The example cap is not permission to spend: a new installation retains US$0 until its owner configures a cap and approves a particular request. Installing Ollama and downloading a model are separate from installing Resistor.

Advice cites supplied evidence IDs. Unknown IDs, malformed/incomplete/refused output, changed evidence, stale revisions, missing models and exhausted budget are rejected. A design changed while a response is pending is marked stale. Buttons open the suggested inspection screen; AI never edits geometry or executes verification automatically.

## Routing assistance

`design.route_search` deterministically inspects up to 32 bbox-track detours. The work budget is at most approximately one million shape/candidate comparisons, and each candidate is checked against the whole native hierarchy. Candidates use exact integer DBU, actual installed hashed SKY130 metal1 rules and conservative spacing. Custom paths must contain 2–16 on-grid Manhattan points without crossing/reversal.

The selected preview returns the exact input, revision, geometry hash and PDK fingerprint. Explicit apply rechecks them and makes one undoable revision. A blocked finite search does not prove that no route exists. This is single-layer assistance with at most two bends; it creates no vias and does not claim global autorouting, extracted net connectivity or DRC/LVS PASS.

## CPU and simulation measurements

The existing four-bit accumulator CPU supports LOAD, ADD, AND and XOR, four-bit ACC/PC, carry, zero and a 16×6-bit ROM. Creation accepts 16–64 execution cycles; omitted metadata retains the old 16-cycle behavior. The UI offers 16, 32 and 64 cycles. Python computes the independent expected trace only after transistor-level ngspice waveforms exist. It never supplies ideal output voltages.

Verification checks actual opcode/immediate inputs, PC before/after, reset, ACC, carry, zero and stable windows. It fails on ambiguous/missing/truncated samples. Per-cycle settling is a sampled upper observation bound within the first 30% of the cycle, not STA or a characterized propagation delay.

Supply current is the actual signed `-i(VDD)` vector. Average current uses trapezoidal charge integration divided by the observation interval; constant testbench VDD gives energy and mean power. Boundaries are interpolated; a few ULPs of decimal/computed endpoint roundoff are tolerated. Missing intervals return unavailable, not a zero measurement. This measures VDD-source energy only; ideal clock/reset source energy and physical regulator losses are outside the scope.

## Tests and evidence

```sh
npm run test:assistant
npm run test:assistant-native
npm run test:core
npm run test:design-tools
npm run test:mcp
npm run typecheck
npm run build
```

Provider-boundary unit tests use labelled fixtures and spend no API budget. Native extension evidence distinguishes exact geometry tests, numerical fixtures, actual ngspice execution and deliberately altered actual waveform regressions. Live-provider receipts and the manually operated CPU demonstration are recorded separately under `examples/cpu4-assistant`.
