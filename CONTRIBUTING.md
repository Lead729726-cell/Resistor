# Contributing to Resistor / Register

Resistor combines deterministic electronics calculators with the Register EDA
workspace. Small, reproducible changes with engineering evidence are welcome.
Use Node.js 24 and `npm ci`. Calculator development needs no Docker:
`npm run dev:calculators`. For native EDA, start Docker in Linux container mode,
run `npm run doctor`, then `npm run dev:web` or `npm run dev`.

## Before a pull request

```sh
npm run test:core
npm run typecheck
npm run build
npm run audit:source
npm run check:docs
```

For a formula change, add independent known values, expected units, invalid
inputs and unit conversion cases in `tests/formulas/`. Do not assert correctness
only by recalculating the same implementation. Keep the formula, explanation,
engineering example and related calculator links consistent.

For EDA changes, test the affected native tool and record the tool version,
source revision, conditions and result. Most `tests/integration/` and cloud
tests require the Docker worker. UI tests need the development server and
Playwright Chromium (`npx playwright install chromium`, `npm run test:ui`).
Platform-specific tests and commercial tools require their real target environment.
Do not substitute fixtures for an actual engine or native-platform claim.

There is no configured standalone linter yet; type checking and tests are the
current automated source gate. A successful web build does not establish native
Mac execution, commercial tool compatibility or foundry signoff.

## Scope and records

Preserve signed currents, explicit units, integer DBU geometry, source provenance
and stale-result handling. Make unsupported or missing data visible. GDS alone
does not contain simulated currents or physical process Z topography.

Keep commits focused. Explain the problem, resulting behavior, verification and
remaining limits in a pull request. Include a mobile and desktop screen check for
UI changes. Update `CHANGELOG.md` for user-visible changes. Do not publish private
PDKs, license files, credentials, local databases or browser traces.
Application contributions use the MIT license; keep third-party notices intact.

한국어 이슈와 PR도 환영합니다. 재현 방법, 입력 조건, 기대 결과와 실제 결과를
함께 적어 주세요. 비밀정보를 제거한 최소 예제로 공유해 주세요.
