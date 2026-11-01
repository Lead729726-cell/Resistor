# Resistor Edu — 신뢰 서명·Apple 공증 운영

2026-11-01 기준 **서명 실행 경로와 실패 차단을 구현했으며, 실제 Developer ID/Authenticode 서명 및 Apple 공증은 아직 실행하지 않았습니다.** 읽기 전용 확인에서 이 PC의 사용 가능한 Windows 코드 서명 인증서는 0개, GitHub 저장소 secret 이름 목록도 0개였습니다. Apple 계정의 회원권·인증서는 계정에서 별도로 확인해야 합니다. 이미 공개된 Edu 0.32.0은 Windows 미서명, Mac ad-hoc 상태를 유지합니다.

## 먼저 확인

```text
npm run signing:preflight
node scripts/signing-preflight.mjs --require-trusted
```

이 명령은 누락된 환경변수 **이름**, 설정 상태, 로컬 인증서 개수만 표시합니다. 값·키·암호는 출력하지 않으며 가입, 결제, 키 생성, 서명, Apple 업로드를 수행하지 않습니다. `--require-trusted`는 선택한 플랫폼의 필수 설정이 없으면 실패합니다. 설정 존재는 공급자 승인이나 실제 서명 성공의 증거가 아닙니다.

## 비용·자격 확인

- Apple Developer Program은 **US$99/년**이며 지역 통화 금액은 등록 화면에서 확인합니다. 개인/개인사업자와 법인 조직의 가입 조건은 다릅니다. 조직은 법적 실체·권한·D-U-N-S 등의 확인이 필요합니다. [Apple 가입 안내](https://developer.apple.com/programs/enroll/)
- Microsoft Artifact Signing Basic은 **US$9.99/월, 월 5,000회 포함, 초과 US$0.005/회**입니다. 유료 Azure 구독과 Public Trust 신원 검증·프로필·서명 권한이 필요합니다. 공식 현재 안내는 한국 **조직**을 지원하지만 개인 개발자는 미국/캐나다로 제한합니다. 한국 개인사업자의 조직 검증 승인 여부는 실제 심사로 확인해야 합니다. [요금](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku), [자격·설정](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart), [유료 구독 조건](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)
- 대안은 기존 CA 발급 코드 서명 인증서/하드웨어 키입니다. 이 구현은 Windows CurrentUser `My` 저장소에서 실제 개인키에 접근할 수 있는 인증서를 지원합니다. CA별 가격·신원 확인·토큰 요건은 별도로 확인합니다. 자체 서명 인증서를 일반 배포 신뢰 인증서로 대체하지 않습니다.
- [SignPath Foundation](https://signpath.org/terms)의 무료 오픈소스 신청은 별도 자격·검토·승인 절차입니다. Resistor의 승인이나 무료 자동 서명이 확보되었다고 주장하지 않으며, 이 배포 경로에 SignPath 연동은 구현하지 않았습니다.

서비스 가입·유료 리소스 생성은 이 코드가 수행하지 않습니다. 실제 서명 실행 전 계정 소유자가 비용과 사용할 서비스/계정을 승인해야 합니다. 서명은 출처·무결성 확인이며 SmartScreen 평판 경고가 언제나 즉시 없어짐을 보장하지 않습니다. [Microsoft 배포 서명 안내](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options)

## Mac: 기존 Developer ID 키와 공증 인증 연결

네이티브 Mac 빌드 호스트에 Xcode 명령 도구, 유효한 **Developer ID Application** 인증서와 개인키, notarization 인증을 준비합니다. App Store 배포용 인증서와 혼동하지 않습니다. [Apple Developer ID](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/), [공증 절차](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)

| 환경변수 | 내용 |
| --- | --- |
| `RESISTOR_MAC_SIGNING` | `developer-id`로 명시 선택; 기본 `adhoc` |
| `RESISTOR_MAC_IDENTITY` | 사용할 Developer ID 인증서의 SHA-1 지문 40자리 |
| `RESISTOR_APPLE_TEAM_ID` | 인증서 팀 ID 10자리 |
| `RESISTOR_NOTARY_PROFILE` | `notarytool store-credentials`로 이미 준비한 Keychain 프로필 이름 |
| `RESISTOR_MAC_KEYCHAIN` | 선택 사항: 인증서·공증 프로필을 담은 Keychain 절대 경로 |

인증 암호를 명령 기록이나 저장소에 적지 않습니다. 로컬 프로필은 Apple의 대화형 `notarytool store-credentials` 절차로 준비할 수 있습니다. [Apple 도구 이전 안내](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool)

코드는 SDK의 실행 Mach-O/dylib와 Electron 바이너리, helper app/framework를 안쪽부터 동일 identity로 서명하고 hardened runtime·보안 타임스탬프를 적용합니다. Python `.o` 같은 링크용 객체는 실행 코드가 아닌 서명된 리소스로 보존합니다. Electron 본체·helper에는 기존 `allow-jit`을 적용하고, JIT이 필요 없는 내장 Python/ngspice/KLayout SDK에 해당 권한을 추가하지 않습니다. `disable-library-validation`, `allow-unsigned-executable-memory`, `get-task-allow`를 전체 기본값으로 추가하지 않습니다. Electron main/renderer/GPU의 JIT 필요는 [공식 osx-sign entitlements](https://github.com/electron/osx-sign/tree/main/entitlements)를 확인했습니다. 실제 hardened 앱 시작·엔진 검증은 인증서가 연결된 네이티브 빌드에서 다시 통과해야 합니다.

완료 조건은 Apple 앵커·Developer ID OID·팀 확인, 추출한 인증서 SHA-1과 선택 identity 일치, `codesign --verify --deep --strict`, 공증 `Accepted`, `stapler staple/validate`, Gatekeeper `Notarized Developer ID` 수락입니다. 최종 ZIP을 새 폴더에 풀어 같은 검사를 반복하고, QA한 실행 파일·런타임 해시도 대조합니다. 업로드나 제출 접수만으로 `notarized:true`를 기록하지 않습니다.

## Windows: 기존 인증서 또는 Azure Artifact Signing

| 환경변수 | 내용 |
| --- | --- |
| `RESISTOR_WINDOWS_SIGNING` | `store` 또는 `azure`; 기본 `none` |
| `RESISTOR_WINDOWS_PUBLISHER` | 인증서의 정확한 publisher 간단 이름 |
| `RESISTOR_SIGNTOOL_PATH` | 설치된 Microsoft SignTool 절대 경로 |
| `RESISTOR_WINDOWS_CERT_SHA1` | `store` 모드의 CurrentUser/My 인증서 지문 |
| `RESISTOR_AZURE_SIGN_ENDPOINT` | `azure` 모드의 공식 HTTPS `*.codesigning.azure.net` 리전 주소 |
| `RESISTOR_AZURE_SIGN_ACCOUNT` / `RESISTOR_AZURE_SIGN_PROFILE` | 승인된 Public Trust 계정·프로필 이름 |
| `RESISTOR_AZURE_SIGN_DLIB` | Microsoft `Azure.CodeSigning.Dlib.dll` 절대 경로 |

Azure 모드는 승인된 Entra identity에 Certificate Profile Signer 역할이 필요합니다. 빌드 호스트의 지원 인증 경로를 사용하며, GitHub에서는 OIDC 로그인을 준비합니다. [Microsoft SignTool/Dlib 통합](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations)

앱의 주 실행 파일을 **QA 전에** SHA-256 + RFC3161 타임스탬프로 서명합니다. NSIS 생성 시 custom hook이 설치·제거 프로그램을 서명하고 검증합니다. 이미 QA한 주 실행 파일을 builder가 다시 수정하지 못하도록 구성하고, 최종 해시를 다시 대조합니다. `Get-AuthenticodeSignature`의 Valid·Authenticode·정확한 publisher/인증서·타임스탬프와 `signtool verify /pa /all`을 모두 확인합니다. 영수증은 주 실행 파일/설치 파일/제거 프로그램의 실제 서명·해시를 구분합니다. 내장 제3자 Windows SDK 전체를 재서명했다는 범위의 주장은 하지 않습니다.

## 선택 실행과 CI

서명 설정 후 동일 환경에서 `npm run package:edu:build`, 실제 네이티브 인증 QA, `npm run package:edu:finish`를 수행합니다. 새 서명 파일은 **새 버전·새 커밋**으로 배포해야 합니다. 공개된 0.32.0 파일을 같은 버전 이름으로 덮어쓰지 않습니다.

`.github/workflows/edu-native.yml`은 **수동 실행 전용**입니다. 새 배포 버전과 짧은 수명의 QA 사용권을 먼저 준비하고, 선택한 신뢰 서명 경로의 인증서·권한을 확인한 뒤 실행합니다. 수동 입력 `mac_developer_id`, `windows_artifact_signing`은 각각 기본 false입니다. 일반 push는 네이티브 빌드를 시작하지 않으며, 별도 source-validation 워크플로와 업데이트 검사는 유지합니다. Mac CI는 이미 발급된 키를 잠시 가져오는 다음 설정을 사용합니다.

- Secrets: `RESISTOR_MAC_CERTIFICATE_P12_BASE64`, `RESISTOR_MAC_CERTIFICATE_PASSWORD`, `RESISTOR_APPLE_NOTARY_KEY_BASE64`.
- Variables: 위 Mac identity/team, `RESISTOR_APPLE_NOTARY_KEY_ID`, `RESISTOR_APPLE_NOTARY_ISSUER_ID`.
- 새 임시 Keychain에 한정하여 가져온 뒤, 성공/실패와 관계없이 Keychain과 임시 P12/P8 파일을 제거합니다. 서명 키는 빌드 산출물에 넣지 않습니다.

Azure CI는 위 Windows publisher/endpoint/account/profile variables와 `RESISTOR_AZURE_CLIENT_ID`, `RESISTOR_AZURE_TENANT_ID`, `RESISTOR_AZURE_SUBSCRIPTION_ID`, 사전 구성한 Entra OIDC 신뢰를 사용합니다. 현재 Microsoft 공식 action 기준 SDK 10.0.26100.4188 및 ArtifactSigning.Client 1.0.128을 명시해 준비합니다. [Microsoft action 버전별 설정](https://github.com/Azure/artifact-signing-action/blob/v2.0.0/action.yml)

서명·공증 설정과 별도로 실제 앱 인증 QA를 위한 짧은 수명의 작업용 시리얼이 필요합니다. 서명 실패·공증 대기/거절·인증 QA 실패 시 새 설치 파일 공개는 중단됩니다. 검증 기록의 신뢰 서명 bool만으로 공개하지 않고, 원본/최종 파일 해시·identity·publisher·타임스탬프·공증/Staple/Gatekeeper 증거를 함께 검사합니다. 현재 단위 검사에 쓰인 서명 응답은 **fixture**이며 실제 공급자 서명 성공의 증거가 아닙니다.
