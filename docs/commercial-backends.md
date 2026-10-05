# 레지스터 상용 EDA Backend

v0.5는 설치된 상용 실행 파일을 호출하는 작업 서버와 별도 실행 에이전트,
버전별 recipe, 결과 parser, UI 설정·실행·취소·다운로드·레이아웃 반입을 제공합니다.
현재 PC/worker에 상용 도구와 라이선스가 없으므로 실제 vendor 실행은 미검증입니다.
공개 ngspice의 1V/1kΩ 회로로 실행·전송·결과 수집 경로를 검증하며, 이 결과는
상용 도구나 파운드리 signoff 검증을 뜻하지 않습니다.

| 도구 계열 | 등록 가능한 작업 | Native 자료 처리 |
|---|---|---|
| Cadence Virtuoso | layout/netlist export | OA library를 native site SKILL exporter로 GDS/OAS/CDL 출력 |
| Spectre | simulation | 설치된 Spectre와 모델로 실행, ASCII/exporter 결과 수집 |
| Assura, Pegasus | DRC/LVS, Assura PEX | 설치 버전에 맞는 RSF/runset와 기술 deck |
| Quantus QRC | PEX | native extraction, SPEF/DSPF 또는 명시적 교환 결과 |
| Innovus | implementation, layout/netlist export | native database와 site Tcl flow |
| Synopsys Custom Compiler | layout/netlist export | OA와 site Tcl exporter |
| PrimeSim, HSPICE | simulation | native 입력 deck, LIS 측정/명시적 파형·전류 export |
| IC Validator | DRC/LVS | native runset와 기술 deck |
| StarRC | PEX | command file, SPEF/DSPF |
| IC Compiler, IC Compiler II, Fusion Compiler | implementation, layout/netlist export | Milkyway/NDM과 site Tcl flow |
| Siemens Calibre nmDRC/nmLVS/xACT | DRC/LVS/PEX | native SVRF/runset, summary 및 RC export |

17개 상용 profile 템플릿은 `adapters/commercial/templates`에 있습니다. 각 템플릿에는
확인해야 할 버전 범위와 공식 출처가 `catalog.json`에 기록되어 있습니다. 공개 문서로
제품 기능만 확인된 CLI 후보는 `needs-site-validation`입니다. 설치된 release의
매뉴얼과 실제 site deck에 맞게 수정해야 하며, 등록만으로 실행 성공을 표시하지 않습니다.

## 화면 절차

1. 설계 화면 또는 독립 뷰어에서 **상용 Backend**를 엽니다. 독립 뷰어의 GDS 표시에는
   로그인·Docker가 필요하지 않으며, 이 버튼을 누를 때 native 연결을 시작합니다.
2. 실행할 도구를 고르고 operator가 local/agent manifest를 등록합니다. 공유 프로젝트에서는
   서버 operator가 먼저 등록하며 참여자는 설치된 profile만 선택합니다.
3. **검증**으로 실행 파일·리소스·환경 변수 이름·hash를 확인합니다. 모델과 PDK deck은
   native 도구에 맞는 원본을 operator 리소스로 지정합니다.
4. 작업 종류, 실제 GDS top cell, schema에 허용된 scalar 파라미터를 저장합니다.
   외부 OA/NDM의 library/cell 선택은 operator site flow가 담당합니다.
5. **실행** 후 실제 상태·로그·출력 파일을 확인합니다. 실행 중 **취소**가 가능하며,
   완료된 GDS/OAS 출력은 **레이아웃 반입**으로 새 revision을 만듭니다.
6. 수치 결과는 파형·측정·전류 표에서 확인합니다. 공간 대응이 없는 전류는 수치만 보입니다.
   명시적 사용자 경로를 부여한 화살표도 자동 추출된 물리적 대응으로 취급하지 않습니다.

원본 layout, 입력 revision, recipe/resource hash와 출력 hash를 기록합니다. 변경된 profile,
모델 또는 설계 revision의 결과는 STALE입니다. PDK·해석 설정과 상용 설정을 각각 보존하며,
마지막 저장한 설정의 backend를 사용합니다. 상용 실패를 공개 ngspice 실행으로 바꾸지 않습니다.

## 설치된 서버의 별도 실행 에이전트

Python 3.10 이상만 필요합니다. 라이선스가 설치된 Linux/Windows 서버에
`platform/commercial/agent.py`와 `runner.py`를 배치합니다. 전체 레지스터 소스가 있는
서버에서는 아래 helper도 사용할 수 있습니다.

```sh
npm run backend:agent -- --profiles /srv/register-private/profiles.json \
  --state /srv/register-private/jobs --token-file /srv/register-private/agent.token \
  --bind 127.0.0.1 --port 8878
```

`profiles.json` 형식은 다음과 같습니다. `profiles` 안에는 선택한 도구의 local manifest를
넣습니다. 값이 들어 있는 라이선스 환경 변수는 operator가 서버에서 설정하고, manifest에는
`env_names` 이름만 지정합니다.

```json
{
  "allowed_roots": ["/opt/cadence", "/opt/synopsys", "/opt/siemens", "/srv/register-site"],
  "profiles": []
}
```

에이전트는 지정한 profile만 실행하며 HTTP를 통한 새 recipe 등록을 허용하지 않습니다.
기본 바인딩은 loopback입니다. 다른 서버에서는 HTTPS reverse proxy를 사용합니다.
`docs/commercial-agent.Caddyfile.example`을 실제 도메인에 맞게 설정하세요.
HTTP는 loopback 및 동일 PC의 `host.docker.internal` companion 주소에만 허용합니다.
Docker에서 호스트의 agent로 접근하려면 Docker가 도달할 수 있는 bind interface와
해당 PC의 방화벽 설정이 필요합니다. 원격 서버에는 HTTPS를 사용합니다.

기본 Compose worker는 internal network에 연결됩니다. 외부 HTTPS 에이전트로 연결할 때는
`REGISTER_AGENT_TOKEN_FILE`에 private token **파일 경로**를 설정하고 다음 override를
추가합니다. worker 포트를 외부에 공개하지 않습니다.

```sh
docker compose -f platform/cloud/compose.yaml -f platform/cloud/compose.backend-agent.yaml up -d --build
```

에이전트 token 파일은 서버에서 생성합니다. worker 쪽에는 해당 private token을 운영자가
안전한 파일 전달로 provision하고, 아래처럼 **파일 경로만** 등록합니다. 이 파일은
웹 UI, 공유 프로젝트, 다운로드 bundle, Git에 포함하지 않습니다. 값 자체를 대화에 보내지 마세요.

```json
{
  "schema_version": 1,
  "id": "virtuoso-agent-site-v1",
  "name": "설치 서버 Virtuoso",
  "tool_id": "virtuoso",
  "version": "설치된 release와 site flow version",
  "runner": {
    "kind": "agent",
    "url": "https://eda-agent.example.com",
    "token_file": "/workspace/.runtime/eda/backend-private/agent.token",
    "profile_id": "virtuoso-site-v1"
  }
}
```

Compose worker 운영자는 private manifest를 worker에 준비한 뒤 아래 CLI로 등록할 수
있습니다. `--agent-token-source`는 mounted private 파일을 owner-only 파일로 provision하며
token을 출력하지 않습니다. local profile 등록에는 해당 옵션을 생략합니다.

```sh
docker exec register-cloud-eda-1 python3 /workspace/platform/commercial/register.py \
  --manifest /workspace/site/virtuoso-agent.json --agent-token-source /run/secrets/commercial_agent
```

`/health`는 service/protocol만 반환합니다. 인증된 `/rpc`는 profile 조회/검증/typed 입력 검사와
job submit/status/cancel/artifact를 제공합니다. command ID는 같은 입력의 중복 실행을 막습니다.
프로세스 종료·timeout·에이전트 재시작은 실패/취소/unknown 상태로 기록합니다.

## Local manifest와 native script

`runner.executable`은 도구 계열에 허용된 실행 파일의 절대 경로입니다. `resources`는
PDK 모델·rule deck·site script·OA/NDM directory의 operator 경로입니다. 리소스는 작업마다
별도 snapshot으로 복사합니다. opaque directory는 파일 내용의 hash를 보존하며 최대
256MiB/4096 directory entries 범위에서 다룹니다. 대규모 라이브러리는 site exporter로
작업에 필요한 부분을 준비해야 합니다. 레지스터는 OA/NDM의 내부 구조를 해독하지 않습니다.

recipe `argv`는 shell을 거치지 않는 argument 배열입니다. `{input.gds}`, `{input.oas}`,
`{input.project}`, `{input.settings}`, `{input.netlist}`, `{top_cell}`, `{output_dir}`,
`{resource.ID}`, `{parameter.NAME}`를 사용할 수 있습니다. operator site Tcl/SKILL에는
생성된 `{input.site_tcl}`/`{input.site_il}` wrapper가 고정 입력 변수를 전달합니다.
실제 vendor API 호출은 해당 release의 검증된 site script에 둡니다.

사용자가 입력하는 netlist text는 256KiB 이내의 data-only classic SPICE subset입니다.
`.control`, 임의 `.include`, shell, plugin/model loader는 허용하지 않습니다. Spectre 전용
문법이나 encrypted PDK는 trusted native deck 리소스로 설정합니다. 사용자 text를 임의 실행
스크립트로 보내지 않습니다. string 파라미터는 operator가 명시한 enum 값만 허용합니다.

입력 교환 package는 32MiB, 결과 artifact는 각 16MiB, 작업 timeout은 최대 3600초입니다.
선언한 summary/waves/currents/rc/exchange/netlist와 redacted stdout만 다운로드합니다.
공개 artifact API가 private 모델·라이선스·token 파일을 제공하지 않습니다. 기본 관리용 백업은
backend resource snapshot을 제외합니다. `--include-backend-resources`로 operator가 명시적으로
포함할 수 있으며 해당 서버에서 비공개로 보관해야 합니다. Agent token/config/state는 제외합니다.

## 결과와 전류 표시 범위

실제 ASCII summary, HSPICE LIS 측정, 명시적으로 column/unit를 지정한 CSV/table,
제한된 PSF ASCII grammar, SPEF/DSPF/classic RC netlist, versioned register-exchange-v1을
해석합니다. 모르는 grammar, PSF/PSFXL/FSDB/TR0 등 binary 또는 encrypted 파일은
unsupported/unknown이며 원본 artifact를 보존합니다. native exporter가 지원하는 text 교환
형식으로 변환해야 합니다. 프로세스 exit code 0만으로 DRC/LVS PASS를 선언하지 않습니다.

전류의 부호·방향·벡터·A 단위를 유지합니다. 상용 recipe가 원래 프로젝트 GDS 대신 외부
OA/NDM을 읽을 수 있으므로 project ID/revision만으로 물리적 대응을 검증했다고 표시하지
않습니다. `geometry_linkage: unverified`와 입력 출처를 유지하며, 사용자 경로도 그 한계가
표시됩니다. TCAD 전류 밀도나 분포 RC의 3D 전류장은 구현 범위에 포함되지 않습니다.

## 검증과 공식 근거

`npm run test:backend`, `npm run test:backend-cloud`, UI suite 및
`tests/commercial/test_results.py`, `test_bridge_audit.py`가 실행/권한/parser 경계를 검사합니다.
`docs/evidence/commercial-*.json`에서 실제 공개 engine, synthetic parser fixtures, 상용 미검증을
분리해 기록합니다. 현재 상용 실행 검증을 완료하려면 도구 설치·해당 버전의 PDK/site flow·
정상 라이선스 연결이 필요합니다.

- [Cadence 공식 Virtuoso stream-out CLI](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/36995/how-to-export-gds-using-terminal/1350197)
- [Cadence 공식 Assura batch와 지원 문서 안내](https://community.cadence.com/cadence_technology_forums/f/custom-ic-skill/40975/assura-drc-and-rcx-batch-run-with-skill/1358582)
- [Synopsys Custom Compiler datasheet: OpenAccess와 native APIs](https://www.synopsys.com/content/dam/synopsys/implementation%26signoff/datasheets/custom-compiler-ds.pdf)
- [Synopsys Fusion Compiler 교육: NDM library와 Tcl flow](https://training.synopsys.com/learn/courses/59/fusion-compiler-design-creation-and-synthesis)
- [Siemens Calibre nmLVS: SVRF/Tcl rules](https://static.sw.cdn.siemens.com/siemens-disw-assets/public/6KFNhwWdL7pnbYGUMDwSkM/en-US/82860_Siemens%20SW%20Calibre%20nmLVS%20FS%2082860%20F.pdf)
