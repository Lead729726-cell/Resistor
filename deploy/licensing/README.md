# Resistor Indust / Edu 라이선스 서버 배포 준비본

이 구성은 Node.js 24와 systemd를 사용하는 Linux 서버용입니다. Docker는 필요하지 않습니다. 서버와 DNS를 연결하거나 고객 시리얼을 발급하지 않은 준비본이며, 설치판 배포 gate를 대신하지 않습니다.

1. 기존 서버·방화벽·디스크·백업 위치를 확정합니다. 앱 소스는 `/opt/resistor-license`, 서비스 계정은 `resistor-license`, 비공개 영속 데이터는 `/var/lib/resistor-license`를 사용합니다. Node.js 24와 Caddy가 필요합니다.
2. 기존 서명·암호화 키와 SQLite 데이터를 SSH 등 암호화된 경로로 옮깁니다. 현재 앱에 포함한 공개키와 일치해야 합니다. **개인 키, DB, 관리자 토큰은 이 공개 배포 꾸러미에 포함되지 않습니다.** 운영 데이터 이동 전에는 쓰기를 멈추고 DB의 WAL/SHM도 일관되게 처리해야 합니다. 새 키로 초기화해서 기존 키를 덮어쓰지 마세요.
3. 데이터 폴더는 서비스 계정만 읽고 쓰게 하고, 비밀 메일 설정은 필요할 때 `/etc/resistor-license.env`에 제한된 권한으로 저장합니다. 메일 연결과 실제 구매 확인은 별도입니다.
4. 제공한 systemd unit을 설치하고 서비스를 시작합니다. 기본 backend는 `127.0.0.1:18948`에만 연결됩니다. Caddy는 공개 health·기기 인증 경로만 전달하며 `/admin/*`는 전달하지 않습니다. 운영자 작업은 SSH/VPN을 거쳐 로컬 backend로 수행합니다.
5. 서버를 확정한 뒤 `licenses.resistor.kr` DNS를 연결하고 Caddy 설정을 실제 도메인에 적용합니다. 프록시 IP 신뢰는 **명시적으로 설정한 loopback 경로에만** 적용되므로 backend 포트를 외부에 열지 마세요. 다중 프록시/CDN은 실제 클라이언트 주소 전달과 제한 동작을 별도로 확인해야 합니다.
6. 공개 HTTPS `/health`에서 서비스명·key ID·공개키 fingerprint를 대조합니다. 영속 데이터의 백업·복원, 재시작 후 데이터 유지와 실제 인증·갱신·해제도 확인합니다. 임시 터널이나 로컬 테스트는 운영 검증으로 기록하지 않습니다.
7. 이 검증이 끝난 후에만 공개 앱 설정의 `server_url`과 `deployment_status=production_ready`를 갱신합니다. `assertLicenseReleaseReady`가 실제 HTTPS와 신뢰 공개키를 검증해야 새 설치판을 빌드·공개할 수 있습니다.

배포 꾸러미는 저장소에서 `node scripts/prepare-license-deployment.mjs`로 생성합니다. 영구 운영 비용·접속 환경이 정해지지 않았다면 서버 구매나 실제 배포를 수행하지 않습니다.
