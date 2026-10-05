# 원본 DB 읽기 · v0.7

**원본 DB 읽기**는 고정된 native API query를 실행해 원본 library/cell/view를
읽고, 반환된 도형·핀·넷·계층 데이터를 레지스터의 실제 KLayout 설계로 반입합니다.
GDS streamout만 호출하는 기존 파일 교환과 별도의 기능입니다.
인터넷 서버 배포는 보류 상태입니다.

## 현재 범위

| Reader | 구현 | 실제 환경 검증 |
|---|---|---|
| Cadence SKILL / OA library | 읽기 전용 cellview API, library/cell/view 목록, 지원 primitive·instance·pin·net의 neutral graph | 상용 실행 파일 미설치로 실제 Virtuoso 실행 미검증 |
| Synopsys ICC2/Fusion / NDM | 원본 library/block API query, 지원하는 flat shape/넷·핀 metadata | 상용 실행 파일 미설치로 실제 native 실행 미검증; unresolved master가 있으면 반입 차단 |
| KLayout file calibration | 실제 GDS/OAS API 읽기, cell 목록·primitive·계층 graph 및 설계 반입 | 공개 도구로 검증; 상용 OA/NDM 실행 증거로 표시하지 않음 |

원본 binary를 추측해서 해독하지 않습니다. Native SDK·실행 파일·라이선스와 해당
release의 API가 필요합니다. 현재 standalone OpenAccess C++ SDK reader와 Custom
Compiler 전용 DB API reader는 제공하지 않습니다. Custom Compiler의 지원 교환
파일 및 기존 operator backend는 사용할 수 있습니다.

## 화면 절차

1. 설계 화면이나 독립 뷰어에서 **원본 DB 읽기**를 엽니다. 여는 동작은 RPC를
   보내지 않습니다. **설치 도구 / 등록 소스 확인**을 눌러 실제 상태를 조회합니다.
2. 로컬 operator는 reader·library·view·원본 DB 경로와 설치 실행 파일 경로를
   입력합니다. 고정 query script를 사용하는 profile이 자동 생성됩니다. 실행
   코드·쉘 인수를 입력하지 않습니다. 기존 설치 profile ID를 연결할 수도 있습니다.
3. 필요한 실제 stream layer map을 입력하고 source를 등록합니다. 경로는 worker가
   접근할 수 있는 승인된 절대 경로입니다. Docker에서는 `/workspace`, `/tools` 등의
   경로를 사용하며, Windows 경로가 Linux 파일로 자동 변환되지는 않습니다.
4. source를 진단하고 실제 reader가 반환한 library/cell/view를 선택합니다.
5. 읽기를 실행하고 지원하지 않는 object·변환·원본 참조와 단위를 확인합니다.
   원본 무변경·리소스/스크립트·graph hash와 실제 실행 근거를 receipt에 기록합니다.
6. 유효한 graph만 명시적 확인 후 현재 프로젝트의 새 revision에 적용합니다.
   source/fingerprint/view가 달라지거나 입력 revision이 오래되면 다시 검사합니다.
7. Receipt/실제 graph artifact를 저장할 수 있습니다. 지원하지 않는 native object를
   bbox로 대신 만들거나 누락한 결과를 완전한 설계로 표시하지 않습니다.

## 공동 설계와 검증

source 등록·실행 파일 경로·원본 DB 경로 설정은 로컬 또는 서버 operator만
수행합니다. 공유 source는 operator가 지정한 native project ID에만 공개합니다.
Viewer는 읽고 검사할 수 있고 Editor/Owner가 반입할 수 있습니다. 다른 방의 source와
read receipt는 사용할 수 없습니다. 반입에는 revision과 중복 명령 receipt가 적용됩니다.

`execution_evidence`는 실제 API query·프로세스 완료·도구 버전·입출력 hash·원본
무변경·geometry 검사 정보를 구분합니다. 공개 calibration 또는 synthetic bridge
검사를 상용 실행이나 전체 vendor release의 호환 인증으로 표시하지 않습니다.
현재 실제 상용 실행 검증은 미완료이며, 설치된 도구와 원본 시험 DB가 있어야
해당 환경에서 검사할 수 있습니다.

```powershell
npm run worker:start
npm run database:doctor
npm run test:database
npm run test:database-cloud
```

구현 API의 근거: [Cadence 읽기 전용 cellview](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/47612/skill-function-to-open-a-layout-view),
[Cadence 원본 단위](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/26549/using-dbtransformbbox),
[Cadence batch 오류/종료 처리](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/59814/how-to-get-exit-code-0-when-there-is-a-skill-error-in-a-skill-script),
[Si2 OpenAccess](https://si2.org/openaccess-coalition/).
실제 지원 범위·hash·검사 기록은 `docs/evidence/native-database*.json`입니다.
