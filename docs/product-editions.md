# Resistor Edu와 Industry

Resistor는 회로도·계층·레이아웃·GDS/OASIS·실제 엔진 시뮬레이션과 전자공학 계산을 연결하는 작업대입니다. 교육용과 전문 설계용은 같은 엔진과 수학을 사용합니다.

| 구분 | Resistor Edu | Resistor Industry |
| --- | --- | --- |
| Git 브랜치 | `codex/resistor-edu` | `codex/resistor-indust` |
| 내부 edition ID | `edu` | `indust` |
| Codex 사이드바 폴더 | Resistor Edu | Resistor Industry |
| MCP 서버 이름 | `resistor-edu` | `resistor-indust` |
| 기본 개발 화면 | `http://127.0.0.1:5177/eda` | `http://127.0.0.1:5176/eda` |
| 기본 엔진 포트 | 18775 | 18765 |
| 로컬 협업 포트 | 18776 | 18766 |
| 데스크톱 저장 폴더 | `Resistor Edu` | 기존 `레지스터` 폴더 보존 |
| 소스 워크스페이스 | `.runtime/editions/edu/workspace` | 선택한 checkout의 기존 workspace |
| 실행 화면 | 실습 과정·학습 체크·보고서 | 현재 프로젝트·다음 실행·실제 결과 |

`main`은 공통 구현입니다. Edu 브랜치의 `product-edition.json`은 `edu`, Industry 브랜치는 `indust`로 설정합니다. 환경 변수 `RESISTOR_EDITION`을 사용하면 같은 checkout에서도 명시적으로 선택할 수 있습니다. 잘못된 값은 실행을 중단합니다. 계산식, 단위, 정밀도, 파일 형식, 기존 엔진 API를 별도로 복제하지 않습니다.

## 소스에서 실행

Node.js 24를 사용합니다. 각 checkout에서 `npm ci` 후 `npm run native:prepare`로 해당 CPU·OS용 공개 엔진을 준비하세요.

```sh
npm run dev:edu
npm run dev:indust
npm run build:edu
npm run build:indust
npm run desktop:edu
npm run desktop:indust
```

두 빌드는 `dist-edu`와 `dist-indust`에 따로 생성되므로 다른 버전의 결과를 지우지 않습니다. 데스크톱은 renderer의 product ID를 확인하며 다른 버전의 화면을 이름만 바꿔 열지 않습니다. 현재 릴리스 v0.27.0의 설치 파일은 공통판입니다. 새 Edu/Industry 전용 설치 파일은 이번 작업에서 발행하지 않았습니다. Edu 업데이트 기능은 기존 Industry 설치 파일을 받거나 적용하지 않습니다.

## 교육용 실습

앱의 **교육 실습**에서 전압 분배기, CMOS 인버터, 직접 레이아웃, MUX4, 가산기, CPU4, 시그마델타 ADC, SAR ADC의 8개 과정을 선택합니다. 각 과정에서 필요한 도구, 수행 순서, 확인할 값, 해석 범위와 원문 튜토리얼을 확인할 수 있습니다.

**새 실습 프로젝트 만들기**는 기존 설계를 덮어쓰지 않습니다. 현재 열린 설계와 저장된 실습의 프로젝트가 다르면 표시합니다. 학습 체크는 해당 브라우저에 저장되며, **학습 보고서 내려받기**는 실제 최신 run의 ID·revision·실행 상태·분석 결과·최신성을 함께 기록합니다. 체크 수는 점수나 엔진 PASS로 변환하지 않습니다.

소스 Edu 기본 workspace는 Industry와 분리합니다. 공개 adapter와 SKY130 예제만 초기화하고 키·환경 파일·데이터베이스는 복사하지 않습니다. 기존 실습 파일은 다시 실행해도 덮어쓰지 않습니다. 화면 패널·최근 프로젝트·클라우드 로그인·방 선택도 edition별로 저장합니다. 사용자가 선택한 다크/라이트 테마와 스킨은 계속 사용할 수 있습니다.

## ChatGPT 연동 구분

각 MCP 호출 결과에 product ID와 이름을 붙이며 `register_product_context`로 실제 workspace를 확인합니다. 같은 도구 이름이라도 선택한 서버의 workspace에서만 동작합니다. 연결 목록에 두 항목을 등록할 때 실행 위치와 edition을 명시하세요. 토큰은 설정 파일에서 읽으며 renderer·보고서·제품 문맥에 반환하지 않습니다.

```json
{
  "mcpServers": {
    "resistor-edu": {
      "command": "node",
      "args": ["<absolute Edu checkout>/scripts/mcp.mjs"],
      "env": { "RESISTOR_EDITION": "edu" }
    },
    "resistor-indust": {
      "command": "node",
      "args": ["<absolute Industry checkout>/scripts/mcp.mjs"],
      "env": { "RESISTOR_EDITION": "indust", "MOS_WORKSPACE": "<absolute Industry workspace>" }
    }
  }
}
```

これは 로컬 stdio MCP 구성입니다. 인터넷 ChatGPT에 연결 가능한 공개 MCP 서버를 배포하거나 계정에 자동 등록한 것은 아닙니다. Codex의 두 작업 폴더·Git checkout은 실제로 분리하고 ChatGPT에는 별도 참고 Space를 구성합니다. 현재 워크스페이스의 실제 도구 설치 상태를 확인하세요. Windows 기본 번들에 Magic/Netgen이 없을 때 DRC/LVS/PEX는 미실행으로 유지합니다.

## 검증과 공개 안내

`npm run test:editions`는 workspace·데이터 보존, CPU와 무관한 product ID, 실제 MCP handshake, 잘못된 renderer 거절, Edu의 다른 제품 업데이트 거절을 검사합니다. 공통 회귀 검사는 `npm run test:core`, 타입 검사는 `npm run typecheck`입니다. Source validation은 main과 두 edition 브랜치에서 실행합니다.

[버전 선택 안내](https://resistor-downloads.vercel.app/editions/) · [전체 튜토리얼](https://resistor-downloads.vercel.app/tutorial/library/) · [네이티브 엔진](native-runtime.md) · [원본 회로 작성](schematic-quickstart.md)

Industry는 전문 작업 흐름의 이름입니다. 공개 PDK·도구 검사, 실측 공정 지형, 상용 도구 라이선스, 제조 signoff는 각각 실제 검증 범위를 따릅니다.
