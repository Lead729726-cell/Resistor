# Resistor Indust · 설계 대화와 근거 안내

회로·레이아웃에서 항목을 선택한 뒤 **설계 도구 → AI 대화·검토**를 여세요. 현재 셀, 선택 소자(최대 32개), 선택 도형(최대 64개), 최근 실행 기록을 함께 검토합니다. 수학·geometry·엔진은 Edu와 공유하고 작업공간·키·대화는 버전별로 분리합니다.

## 사용 순서

1. **빠른 점검**은 모델·API 호출 없이 실제 연결 오류와 미실행/실패/이전 revision 기록을 정리합니다. 결과에는 **규칙 기반 안내**라고 표시합니다.
2. **설계 근거·연결 상태 읽기**로 제공자 상태와 전달할 정보를 확인하세요. 로컬 Ollama 또는 OpenAI를 선택합니다. 키가 없거나 예산이 0이어도 빠른 점검을 사용할 수 있습니다.
3. 질문을 입력하고 이번 전송을 승인한 뒤 **질문 보내기**를 누릅니다. 추천 질문은 입력만 채우고 전송하지 않습니다. 후속 질문도 별도로 승인합니다.
4. 답변의 소자·net·마스크·실행 근거 버튼을 누르면 실제 위치/결과 화면을 엽니다. AI는 설계를 수정하거나 검증을 자동 실행하지 않습니다. **한 번 검토** 방식도 유지합니다.

대화는 로컬 작업공간 `.runtime/assistant/conversations/`에 저장됩니다. **저장된 대화**로 복원하거나 근거·대화를 JSON으로 내보낼 수 있습니다. 한 대화는 최대 12개 질문이며, 모델에는 최근 최대 4개 질문/답변을 전달합니다. 크기 제한으로 더 적게 전달되면 응답의 `history_window`에 기록합니다.

설계 revision, 셀/선택 범위, 실행 근거가 바뀌면 전송 승인을 해제합니다. 이전 근거의 대화는 읽을 수 있지만 이어 묻기와 근거 위치 열기를 차단합니다. 새 근거를 읽고 새 대화를 시작하세요. 같은 revision에서도 새로운 DRC/시뮬레이션 결과가 생기면 기존 근거와 구분합니다.

## 실제 수치와 AI 해석

최근 완료된 현재 revision의 해석에는 **전압·전류·전압 강하 요약**을 제공합니다. 통계와 단위는 프로그램이 계산하고 AI에 근거로 전달합니다.

- 일반 파형: 저장된 샘플의 최소·최대·처음·마지막·샘플 평균. 샘플 평균은 시간 가중 평균이 아닙니다.
- 전류: 저장된 branch 값과 `from_net → to_net` 기준, 부호, source vector, convention을 보존합니다. 마스크만으로 전류를 계산하지 않습니다.
- 전압 강하: 동일한 저장 샘플 격자에 두 노드 전압이 모두 있을 때 `V(from_net) − V(to_net)`을 계산합니다. 누락·길이 불일치·비유한 값은 수치를 만들지 않습니다.
- 복소 AC에는 실수 전류 방향을 표시하지 않습니다. 계층 셀의 핀 이름과 프로젝트 수준 파형의 전기적 대응도 자동 인증하지 않습니다.

선택 마스크는 첫 2,000개 native mask에서 찾은 bbox·레이어·net 등 제한된 메타데이터만 제공합니다. 그 범위 밖의 선택은 미확인으로 남깁니다. raw GDS, 전체 polygon, 원시 파형 배열, PDK 모델/검증 deck과 키는 모델에 전달하지 않습니다. mask net annotation이나 bbox는 LVS/PEX 및 전기적 매칭의 증거가 아닙니다.

## 비용·오류 처리

기존 키와 사용자가 정한 예산을 사용합니다. 새 작업공간의 기본 API 한도는 US$0입니다. 매 질문 전에 최대 비용을 원자적으로 예약하고, 실패·중단·불완전 응답을 자동 재호출하지 않습니다. 표시 금액은 최종 청구액이 아닌 **비용 예약**입니다. 키처럼 보이는 값을 질문/근거에서 발견하면 전송을 거절합니다.

같은 대화의 동시 질문은 막고, 저장된 질문 수를 확인해 덮어쓰기를 방지합니다. 잘못된 JSON·없는 근거 ID·미완성 응답은 답변으로 저장하지 않으며 질문 입력은 남깁니다. 대화 도중 설계가 바뀐 늦은 응답은 이전 근거로 저장합니다. 로컬 Ollama는 loopback에 설치된 모델만 사용하고 16K 문맥 한도를 넘으면 근거를 조용히 잘라내지 않고 거절합니다.

OpenAI 연동은 [공식 구조화 응답 규격](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)을 사용합니다. 일반 대화·검토는 `gpt-6-luna`, 승인할 실행안 작성은 `gpt-6.1-sol`을 사용합니다. [공식 모델 카탈로그](https://developers.openai.com/api/docs/models)의 표준 텍스트 가격을 2026-10-27에 확인했으며, 역할별 가격과 모델 ID는 서버의 `scripts/assistant-models.mjs`에 둡니다. 서버/메인 프로세스에만 키를 두며 `store:false`로 요청합니다. 공동 설계 방에서는 로컬 키·대화를 공유하지 않습니다.

## Luna 판단 → Sol 실행안 → 실제 엔진

새 회로를 후보별로 만들고 비교하려면 **AI 오토 설계** 탭을 사용하세요. [목표 입력 → native 미리보기 → 승인 → 실제 해석 가이드](auto-design.md)와 [DUET-AFE 실제 설계 예제](../examples/duet-afe/README.md)를 제공합니다. 아래의 현재 프로젝트 변경 계획과는 별도 기록이며 기존 프로젝트를 수정하지 않습니다.

Resistor Indust의 **설계 도우미 → 설계 근거·연결 상태 읽기 → Luna 판단 · Sol 실행**에서 사용합니다. Edu에도 같은 코어를 사용하지만 작업공간·키·계획 기록은 합치지 않습니다.

1. 현재 셀·선택·revision의 근거를 읽고 요청합니다. 예: `R1을 2200 Ω으로 바꿔줘`.
2. 전송·비용에 동의하고 **Luna 판단 → Sol 실행안 만들기**를 누릅니다. Luna가 정보 부족으로 판단하면 질문을 반환하고 Sol은 호출하지 않습니다. 지원하는 작업의 미리보기를 요청해도 실행안을 먼저 작성하며 이 단계에서는 엔진을 실행하지 않습니다.
3. Sol이 작성한 기존 값 → 새 값, SI 단위, 예상 영향과 제약을 확인합니다. **위 계획을 현재 프로젝트에 한 번 적용**에 체크하고 **승인한 계획 실제 실행**을 누릅니다. 실행 요청에는 plan ID/hash만 전달하며 클라이언트가 명령을 끼워 넣을 수 없습니다.
4. 값 변경 뒤 근거를 다시 읽고 `기존 testbench 설정 그대로 시뮬레이션해줘`를 요청할 수 있습니다. 새 계획을 승인하면 실제 native job을 시작합니다. **실제 결과 새로고침**은 모델을 호출하지 않고 실제 job의 실행 상태와 분석 결과를 읽습니다. 상세 파형과 로그는 기존 결과 패널에 표시됩니다.

한 계획은 **기존 이상적 R/C/L의 numeric value 또는 전원의 dc 한 항목 변경**, 또는 **simulation/DRC/LVS/PEX 한 번 요청**을 지원합니다. 물리 PDK 모델의 W/L, MOS 크기, 배선·토폴로지·레이아웃 생성은 이 경로의 자동 변경 범위에 포함하지 않습니다. 회로 값 변경은 기존 레이아웃을 다시 그리지 않습니다. 엔진 검사는 루트 프로젝트 범위입니다. 상용·imported analysis 설정은 해당 전용 실행 패널을 사용하도록 안내하며 native 경로로 대체하지 않습니다.

Luna와 Sol은 같은 atomic 누적 예산 ledger를 사용합니다. Sol의 가격으로 별도 상한을 예약하므로 더 싼 Luna 가격으로 실행안을 청구 계산하지 않습니다. UTF-8 입력 크기와 최대 출력 4096 token에 따라 보수적으로 예약하며 예약액은 실제 청구액이 아닙니다. 자동 유료 재시도·모델 대체는 하지 않습니다. 모델이 없거나 호출이 실패하면 해당 단계가 실패로 남습니다.

계획은 제품·프로젝트·revision·선택 근거 hash에 묶어 `.runtime/assistant/workflows/`에 보관합니다. **저장된 계획**과 JSON 저장으로 모델·단계·usage·예약액·실제 job ID를 확인할 수 있습니다. 설계 변경이나 같은 revision에서의 새 엔진 결과도 기존 계획 적용을 차단합니다. 응답이 끊긴 엔진 적용은 command receipt로 복구하며, receipt가 없으면 중복 실행하지 않고 수신 확인 필요 상태를 표시합니다. 사용자 프로젝트나 키는 이 파일에 복사하지 않습니다.

## 검증 기록

- [Luna·Sol 실행안 검증](evidence/assistant-workflow-20261027/verification.json): 실제 앱에서 Luna 4회·Sol 3회를 호출하고, 승인한 R1 10kΩ → 2.2kΩ 변경과 ngspice 2,022 샘플 해석을 확인했습니다. 모델이 질문한 경우, 미승인 계획, 같은 revision에 새 결과가 생긴 경우의 적용 차단도 구분했습니다. [실제 실행 결과 화면](evidence/assistant-workflow-20261027/actual-ngspice.jpg) · [모바일 화면](evidence/assistant-workflow-20261027/mobile.jpg). 이 실행의 추가 비용 예약은 US$0.212555이며 실제 최종 청구액이 아닙니다. DRC/LVS/PEX의 고정 호출 경로와 실패 상태는 fixture 테스트로 검사했고, 이 검증에서 해당 실물 엔진 job은 실행하지 않았습니다.
- [화면 조작 검증](evidence/assistant-chat/ui-verification.json): 실제 native 연결·계층·선택과 실제 앱의 대화 승인/복원/근거 이동/이전 답변 차단을 검사합니다. 대화 제공자는 명시한 loopback fixture이며 모델 추론 품질 검사와 구분합니다. ngspice가 준비된 환경에서는 실제 전류·전압 강하 표까지 확인합니다.
- [실제 OpenAI 호출](evidence/assistant-chat/native-openai.json): 공개 RC 회로의 실제 ngspice 결과를 근거로 1회 호출했습니다. 이 호출 후 branch 전류/노드 차이 요약을 추가했습니다. 응답 시점의 코드 hash와 당시 제공한 근거를 그대로 보존합니다.
- [실제 전류·전압 강하 대조](evidence/assistant-chat/native-flow.json): 추가한 통계가 저장된 ngspice 샘플과 일치하는지 모델 호출 없이 검사했습니다. R1 최대 전류 약 179.99091µA, IN−OUT 최대 약 1.7999091V는 이 공개 RC 조건의 결과입니다.
- [대화 화면](evidence/assistant-chat/chat-desktop.png) · [모바일](evidence/assistant-chat/chat-mobile.png) · [실제 조작 녹화](evidence/assistant-chat/assistant-workflow.webm). 녹화의 모델 응답은 QA fixture라고 표시합니다.

```sh
npm run test:assistant
npm run test:assistant-chat
npm run test:core
npm run typecheck
npm run build:indust
npm run build:edu
```

화면 검사는 격리된 공개 fixture 작업공간을 사용하며 OpenAI를 호출하지 않습니다. 실제 유료 호출 검사는 별도로 명시적으로 승인한 경우에만 `node scripts/assistant-live-check.mjs --approve-one-openai-call`로 실행합니다. 기존 예산을 늘리거나 키를 생성하지 않습니다. 테스트 성공은 모든 설계에 대한 AI 정확도, 고객 가치, 상용 엔진 실행, foundry signoff 또는 신규 설치 파일 발행을 뜻하지 않습니다.
