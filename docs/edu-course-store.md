# Resistor Edu 강의와 자체 구매

Edition: **Resistor Edu**. Industry 강의·사용권을 묶지 않는다.

## 학습자가 완성하는 것

`/course/`는 실제 동작하는 공개 워크북이다. 8개 미션에서 예측, 입력 조건,
변경 전후 수식 결과, revision, 직접 쓴 설명과 자기 점검 상태를 보관한다.
브라우저 재열기, JSON 내보내기/검증 후 다시 열기, 전체 보고서 인쇄를 지원한다.
저장 실패 시 입력을 지우지 않는다. 호환되지 않는 기존 기록은 자동으로 덮어쓰지 않는다.
계산은 공통 `packages/calculators`를 재사용한다. 새 교육용 공식을 복제하지 않는다.

- 무부하 전압 분배기: R2 10 kΩ→20 kΩ, 1.8 V에서 0.9 V→1.2 V, 90 µA→60 µA.
- RC: 10 kΩ·1 nF에서 τ=10 µs. C만 5 nF로 바꾸면 50 µs.
- NMOS: 웹 결과는 `unavailable`. Edu 앱의 실제 ngspice·SKY130A TT 모델 연결이 필요하다.
- 계산과 앱 실행을 구분하고, 현재 입력보다 오래된 결과에 이전 revision 안내를 붙인다.
- 학생 설명을 자동 생성 답안으로 채우거나 완료 체크를 엔진 PASS로 표시하지 않는다.

MIT 공개 자료의 접근을 유료 강의의 독점 혜택으로 광고하지 않는다. 강의 가치는
비전공자에게 맞춘 순서·강사 해설·오류를 좁히는 과정·실험 보고서 완성에 둔다.
촬영용 [진행 가이드](course-recording-guide.md)에 장면, 멈춤 질문과 확인 기준을 제공한다.
교육 효과나 취업 효과를 검증했다고 주장하지 않는다.

## 확인한 상품 상태

기존 Edu 강의 준비 파일은 12강·약 105분, 인프런 표시 가격 110,000원,
영상 파일 미지정 상태였다. 자체 사이트에 확정된 판매 가격으로 재사용하지 않고
**예정 가격**으로 표시한다. 88,000원 출시가는 이전 제안이며 활성화하지 않았다.
Edu 단품 가격은 미확정이다. 강사 직접 내레이션 선택을 보존한다.
`platform/commerce/catalog.json`의 제품별 상태·가격·전달 가능 여부가 서버 권위이다.
영상, 수강 기간, 수강 전달 경로와 지원/환불 조건은 판매 전 확정해야 한다.

`/shop/`에서 두 구성을 비교하고 `/checkout/`에서 상품별 준비 상태를 확인한다.
현재는 **실제 결제·예약금·이메일을 수집하지 않는다**. 홈페이지에도 진입 링크를 추가했다.

## 주문과 결제

- 영구 디스크를 사용하는 Node 24 단일 commerce 프로세스 + SQLite WAL.
- `scripts/commerce-server.mjs`는 기존 라이선스 서명키·암호화 저장소를 재사용한다.
  키를 재생성하거나 다른 버전의 데이터·키를 복사하지 않는다.
- Vercel `/api/shop`은 정해진 HTTPS 서버로만 프록시한다. 임시 함수 디스크에 주문 DB를 두지 않는다.
  기존 Vercel 프로젝트에는 현재 결제/서버 환경변수가 없다.
- 브라우저에는 공개 client key만 전달한다. secret key·gateway token은 서버에만 둔다.
- HttpOnly/Secure/SameSite=Lax 세션을 가진 원래 브라우저만 주문과 시리얼을 조회한다.
  다른 기기/쿠키 소실 시 주문 번호·이메일 확인을 통한 운영자 복구가 필요하다. 자동 이메일 복구는 미지원이다.
- 가격·통화·orderId·paymentKey·상태를 서버 주문 및 결제사 응답과 대조한다.
  redirect 성공이나 사용자 제출 영수증만으로 발급하지 않는다.
- 승인 요청에는 고정 멱등키를 사용한다. 타임아웃이면 `unknown`으로 남기고 GET 조회로 조정한다.
  재시작 후 같은 승인 POST를 새 결제로 재발행하지 않는다.
- 검증한 결제를 먼저 영구 저장하고 공통 라이선스 엔진에서 `resistor_web` 출처로 발급한다.
  전달 실패는 `paid_pending`. 같은 주문·증빙으로 복구하며 재결제하지 않는다.
- 웹 Edu SKU는 2대·Edu 전용. 기존 Inflearn Edu와 직접 Industry의 발급·환불 네임스페이스를 유지한다.
- 웹훅 본문을 믿지 않고 결제사에서 현재 상태를 재조회한다. 전체 취소는 발급 회수,
  부분 취소는 `review_required`. 취소 후 늦은 DONE 이벤트로 재발급하지 않는다.
- DB에는 이메일·paymentKey·최소 영수증을 AES-GCM 암호화하고 원문 카드/계좌 응답은 저장하지 않는다.
  공개 로그·정적 파일·테스트 증거에 구매자 데이터나 시리얼을 넣지 않는다.

토스 개별 연동 API용 어댑터를 구현했다. **주입한 fixture 검증이며 실제 토스 테스트 상점 결제는 아직 미실행**이다.
연동 근거: [통합 결제창](https://docs.tosspayments.com/guides/v2/payment-window/integration),
[승인·조회 API](https://docs.tosspayments.com/reference),
[인증·멱등키](https://docs.tosspayments.com/reference/using-api/authorization).
판매자 정보는 기존 사용자 확인 정보와 [운영 중인 사업자 페이지](https://factraptor.shop/business)를 대조했다.
사업자 공개 페이지 확인을 정부 등록 검증으로 표현하지 않는다.

## 실행과 검증

```powershell
npm run download:store
node scripts/course-store-preview.mjs
# http://127.0.0.1:18953/shop/ /course/
npm run test:commerce
npm run typecheck
npm run test:core
```

운영 서버 설정은 [환경변수 템플릿](../platform/commerce/.env.example)을 참조한다.
기존 개인 라이선스 저장소를 지정한 후 `npm run commerce:server`로 시작한다.
라이선스 서버는 기존 `npm run license:server`의 별도 프로세스로 실행한다.
공개 HTTPS reverse proxy는 두 서비스의 허용 경로를 구분하고 commerce gateway 경로를 토큰으로 보호해야 한다.
게이트웨이 요청 빈도 제한, 모니터링, 일관된 DB/키 백업·복구, 개인정보 보관·삭제 절차를 운영에서 설정한다.
SQLite를 여러 호스트/서버리스 인스턴스가 공유하지 않는다. 이 구현은 단일 프로세스를 대상으로 한다.

판매 개방 전 필요한 실제 확인:
1. 가맹점 계약·본인 상점 테스트 키/라이브 키 연결 (다른 제품의 키를 복사하지 않음).
2. 고정 HTTPS 주문·라이선스 서버와 영구 디스크, 실제 앱 인증·환불 회수 확인.
3. 상품 가격·제공 기간·개인정보/거래조건·환불 안내 확정 및 catalog의 draft 조건 제거.
4. 제공할 강의 파일·접근 제어·전달 경로 또는 공식 설치 파일 준비 확인.
5. 실제 상점의 성공·실패·중복·네트워크 단절·환불·웹훅·쿠키 소실 테스트.

준비가 끝나지 않은 상품은 `purchasable=false`. 환경변수 하나로 초안을 강제 판매할 수 없다.
유료 서비스를 개설하거나 실제 고객에게 메일을 보내지 않았다. 새 설치 파일을 발행하지 않는다.

## 운영 사이트 보존

현재 운영 사이트의 Industry source/update 정보가 Edu checkout보다 최신일 수 있다.
`store-deploy-stage.mjs`는 Vercel 읽기 API로 얻은 현재 파일 트리와 config를 입력받아
모든 파일 SHA-1을 확인한 뒤 별도 `.runtime` staging을 만든다. 그 위에
`RESISTOR_SITE_OUTPUT=<staging>`으로 store generator를 실행해 새 페이지/API만 덧붙인다.
원래 업데이터·설치 해시·Industry source 링크를 오래된 Edu checkout 값으로 덮어쓰지 않는다.
배포 전 production deployment ID가 바뀌었다면 기준을 다시 받아 조정한다.
