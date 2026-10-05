# 레지스터 공동 작업 서버

실제 Node HTTP/WS + SQLite WAL, Linux EDA worker 및 immutable snapshots를 사용합니다. 유료 Supabase 생성은 사용자가 보류했고 기존 서비스는 변경하지 않았습니다.

v0.5 상용 native backend도 같은 계정·Editor/Viewer 권한·revision 충돌·command receipt를
사용합니다. 실행 profile 등록과 private agent token provision은 서버 operator 작업입니다.
참여자는 설치된 profile을 선택해 설정·실행하고 권한이 있는 프로젝트의 결과만 받습니다.
라이선스 서버가 별도 PC에 있으면 [native 에이전트 안내](commercial-backends.md)를 따릅니다.

## 로컬

`npm run cloud:start` →127.0.0.1:18766. 데스크톱은 같은 허브를 자동 시작하고 기존 레지스터 허브를 재사용합니다. 전용 worker18765와 다른 서비스의 포트/데이터를 보존합니다. 공동 작업에서 가입/로그인→공유 프로젝트→Editor/Viewer 초대→다른 browser/desktop 참여를 진행합니다.

가입 암호는12자 이상, 서버에는 scrypt hash만 저장합니다. 암호는 UI 제출 후 지웁니다. bearer는 sessionStorage에 두며 로그/URL에 넣지 않습니다. WS는 첫 메시지로 인증하고 명령/권한 변경에서 membership을 검사합니다.

## Linux 서버

Node24/Docker Linux에서 소스를 준비합니다.

```sh
npm ci
npm run build
npm run cloud:prepare
docker compose -f platform/cloud/compose.yaml up -d --build
```

`.secrets/worker_session`은 임의 session을 만들고 기존 파일은 유지합니다. Git/배포물에 포함하지 않습니다. worker는 private network이고 hub만127.0.0.1:18766에 bind합니다. `REGISTER_HOST_PORT`로 변경할 수 있습니다. 이 PC에서 별도 Linux hub+worker를18767로 실행하고 실제 PDK와 다섯 EDA 도구, 로그인한 remote web, MOS DC·DRC·LVS·PEX·post-layout 및 새로고침 복원을 확인했습니다. 인터넷 VM 배포와 구분하며 cloud-container.json에 기록했습니다.

인터넷에서는 HTTPS reverse proxy를 연결합니다. `.env.example`과 `Caddyfile.example`의 도메인을 실제 소유 주소로 바꾸고 DNS/TLS를 연결합니다. `REGISTER_PUBLIC_URL`과 허용 origin을 같은 주소로 설정합니다. 클라이언트의 외부 주소는 HTTPS만 허용합니다. 허브가 compiled web app도 제공하므로 원격 이용자는 로컬 Docker 없이 로그인 후 설계를 엽니다.

## 충돌/권한/실행

Owner는 초대와 회원 권한을 관리하고 Editor는 편집/분석, Viewer는 열람합니다. 다른 프로젝트 run/artifact와 서버 파일 경로는 거부합니다. remote import는16MiB GDS/OAS와2MiB sidecar 실제 업로드를 사용합니다.

명령 UUID/base revision 및 room queue로 commit합니다. 알려진 분리 변경은 반영하고 겹침/전체 설계/알 수 없는 로컬 직접 변경은 충돌을 반환합니다. 동일 UUID/payload는 receipt로 한 번만 처리합니다. 중간 연결 단절은 같은 명령의 native receipt를 확인하고 미확인을 보존합니다. 다른 사람의 최신 수정 undo는 차단합니다. 충돌 입력은 자동 재실행하지 않고 JSON으로 보관합니다. 새로고침 후 room과 로그인도 복원합니다.

공유 설계는 새 native ID로 복제하고 로컬 원본을 유지합니다. 실행 결과와 파일은 실제 worker의 것입니다. 최적화 후보는 source experiment/trial ancestry를 검사해서 조회하고 별도 shared room으로 복사할 수 있습니다. 모델/덱은 export에 넣지 않습니다.

PDK·해석 설정은 같은 프로젝트 revision과 receipt에 저장합니다. Owner/Editor가
설정 및 실제 해석을 실행하고 Viewer는 등록된 profile·검사·결과를 읽습니다.
공유 허브에서는 서버에 등록된 profile ID만 선택할 수 있습니다. 운영자는
worker에 PDK를 먼저 설치·등록합니다. 사용자 입력 경로/ZIP 설치를 공유
native API로 전달하지 않습니다. 오래된 설정 화면의 revision으로 실행하면
충돌을 반환합니다. 절차는 [pdk-setup.md](pdk-setup.md)에 있습니다.

## 영구 저장/백업

`eda-data`, `cloud-data`, `backup-data` 영구 볼륨에 source/snapshot/run, 계정/권한/receipt, 백업을 저장합니다. `docker compose down`은 볼륨을 유지합니다. 데이터 보존 시 `down -v`를 실행하지 않습니다.

```sh
docker compose -f platform/cloud/compose.yaml exec hub node scripts/cloud-backup.mjs
```

로컬은 `npm run cloud:backup`입니다. SQLite online backup/DB SHA manifest와 immutable snapshots/native artifacts를 복사합니다. 실행 중 job은 불완전 상태로 보존되고 복원 후 다시 실행해야 합니다. 기본 백업은 PDK registry metadata를 보존하고 worker session과 PDK/model binary는 제외합니다. 업로드한 관리 PDK 파일이 필요하면 `--include-managed-pdks`를 명시해 SHA 목록과 함께 보관합니다. 실제 두 DB의 SHA/PRAGMA integrity_check와 hub 재시작 뒤 백업 볼륨 보존도 확인했습니다 (evidence/cloud-backup.json, evidence/pdk-backup.json). 복원은 서버 중지·DB hash/구조 검사 후 해당 cloud/eda 디렉터리를 복원하는 운영 작업입니다. 자동으로 현재 데이터를 지우거나 덮어쓰지 않습니다.

v0.5 기본 백업은 상용 backend 리소스 snapshot과 configured job의 모델 snapshot도
제외합니다. 복원이 필요한 operator는 각각 `--include-backend-resources`,
`--include-managed-pdks`를 명시합니다. private agent token/config/state는 기본 백업에서
제외되며 해당 서버에서 별도 provision합니다. metadata의 operator 경로 참조도 비공개로
보관합니다. [상용 실행 에이전트 및 선택적 외부 연결](commercial-backends.md)을 참고하세요.

외부 호스팅/DNS/TLS는 아직 미개설입니다. actual cloud integration, PDK/native backend
역할·receipt 검증, UI 두 계정 흐름 및 Linux isolated stack 증거를 기준으로 보고합니다.
