# Resistor Indust · 실용 아날로그 회로 3종

칩 내부에서 재사용할 수 있는 센서 전류 입력 TIA, ADC 입력 Track/Hold, 히스테리시스 비교기입니다. 편집 가능한 MOS 계층 회로와 실제 ngspice 결과를 함께 제공합니다. **기본 28회와 출력 부하 변경 1회의 수치 해석 및 지정 회로 기준을 통과했습니다.** 레이아웃·DRC/LVS/PEX·제조 signoff는 수행하지 않았습니다.

## 바로 열기

| 설계 | 편집 프로젝트 | 회로 넷리스트 | 지원 해석 |
| --- | --- | --- | --- |
| 자체 바이어스 전류 입력 TIA | [sensor_current_tia.register.zip](sensor_current_tia.register.zip) | [sensor_current_tia.spice](sensor_current_tia.spice) | OP · AC · TRAN |
| 전송 게이트 Track/Hold | [adc_track_hold.register.zip](adc_track_hold.register.zip) | [adc_track_hold.spice](adc_track_hold.spice) | OP · TRAN |
| 저항 피드백 히스테리시스 비교기 | [sensor_schmitt.register.zip](sensor_schmitt.register.zip) | [sensor_schmitt.spice](sensor_schmitt.spice) | OP · TRAN |

Resistor Indust의 프로젝트 열기 화면에서 **설계 파일 가져오기**로 ZIP 하나를 선택하세요. 새 프로젝트로 가져오며 기존 사용자 설계를 덮어쓰지 않습니다. 회로도·테스트벤치·템플릿 정보의 왕복 보존을 API로 확인했으며, 이전 실행 결과는 가져오지 않습니다. 다시 실행해야 현재 프로젝트의 결과가 생깁니다. 자세한 조작 순서는 [사용 가이드](usage-guide.md)에 있습니다.

최신 소스에서는 **작업 시작 → 프로젝트 → 내 반도체**의 `실용 아날로그 블록`에서도 세 회로를 새로 생성할 수 있습니다. 이 추가 기능은 이번 소스 작업에 포함되며 기존 설치 파일이 자동 갱신됐다는 의미는 아닙니다.

## 실제 결과

[측정 그림 PNG](measured-overview.png) · [SVG](measured-overview.svg) · [PDF](measured-overview.pdf) · [수치 보고서](report.json) · [그림 출처](plot-provenance.json)

아래 대표값은 **TT · 1.8 V · 27 °C · 출력 부하 100 fF**에서 얻었습니다. 전력은 외부 VDD의 실제 전류를 20–320 µs 구간에서 적분한 평균이며, 이상적인 입력·클록 구동기의 전력은 포함하지 않습니다.

| 설계 | 측정 항목 | 결과 |
| --- | --- | --- |
| TIA | 정착 후 전류-전압 이득 | −199.950 kV/A; 목표 −200 kV/A 대비 오차 0.02525% |
| TIA | 영입력 오프셋, OP | −0.290 mV |
| TIA | 평균 VDD 전력, TRAN | 249.624 µW |
| Track/Hold | 3회 중 최대 획득 오차 / 최대 홀드 오차 | 0.440 mV / 0.749 mV |
| Track/Hold | HOLD의 최대 절대 드루프, 28 µs 측정창 | 0.279 mV |
| Track/Hold | 평균 VDD 전력, TRAN | 246.723 µW |
| 히스테리시스 비교기 | 상승 / 하강 입력 임계값 | 0.986961 V / 0.809804 V |
| 히스테리시스 비교기 | 두 임계값 차이 | 177.157 mV |
| 히스테리시스 비교기 | 평균 VDD 전력, TRAN | 198.354 µW |

비교기 임계값은 정해진 입력 램프 중 출력이 VDD/2를 통과하는 순간의 입력 전압입니다. 유한한 지연이 포함되므로 준정적 DC 임계값과 같다고 가정하지 않습니다. Track/Hold 오차는 출력 OTA의 오차도 포함하며, 드루프는 `HOLD` 노드에서 따로 측정합니다.

다음 **네 가지 결합 조건**을 각 회로에 적용했습니다. TIA 3개 해석 × 4조건 = 12회, 나머지 각각 2개 해석 × 4조건 = 8회로 총 28회입니다. 모든 공정·전압·온도의 조합을 검사한 전체 PVT 행렬은 아닙니다.

| MOS corner | VDD | 온도 | 7개 기본 해석 |
| --- | --- | --- | --- |
| TT | 1.8 V | 27 °C | 7/7 수치 완료 · 지정 기준 통과 |
| SS | 1.6 V | 85 °C | 7/7 수치 완료 · 지정 기준 통과 |
| FF | 1.8 V | −40 °C | 7/7 수치 완료 · 지정 기준 통과 |
| SS | 1.62 V | 125 °C | 7/7 수치 완료 · 지정 기준 통과 |

추가로 Track/Hold의 TT · 1.8 V · 27 °C에서 **출력 부하를 2 pF로 변경한 TRAN 1회**를 실행했습니다. 생성 테스트벤치의 `CLOAD`가 설정값을 실제 반영함을 확인했으며 최대 획득 오차 0.440 mV, 최대 홀드 오차 0.749 mV로 지정 기준을 통과했습니다. 이 추가 실행은 전체 부하 스윕이 아닙니다.

## 계층과 기본값

공통 `SELF_BIAS → SOC_BIAS`에는 MOS 다이오드 바이어스, 30 kΩ 저항, VCM 분압·버퍼가 있습니다. `SOC_OTA`는 두 단계 Miller 보상 구조이며 보상 커패시터 5 pF와 직렬 저항 5 kΩ를 사용합니다.

| 설계 | 신호 경로와 하위 블록 | 기본값 |
| --- | --- | --- |
| TIA | `SENSOR_CURRENT_FRONTEND → PRACTICAL_TIA → CURRENT_AMPLIFIER → SOC_OTA` | RF 200 kΩ · CF 2 pF · 입력 C 5 pF · 전류 단계 1 µA |
| Track/Hold | `TRACK_AND_STORAGE → PRACTICAL_SAMPLE_SWITCH`; 클록 반전기 + NMOS/PMOS 전송 게이트, `HOLD_READOUT_BUFFER → SOC_OTA` | NMOS W/L 10/0.15 µm · PMOS 20/0.15 µm · 저장 C 10 pF · 10 kHz 클록 |
| 비교기 | `HYSTERESIS_NETWORK → PRACTICAL_HYSTERESIS`; `MOS_COMPARATOR → SOC_COMPARATOR → PREAMP` | 입력 저항 100 kΩ · 양의 피드백 저항 1 MΩ |

비교기 신호 경로는 **5-MOS 차동 전치 증폭기 + CMOS 인버터 1개**입니다. 이 회로에서 `SOC_OTA`는 공통 바이어스의 VCM 버퍼에 쓰이며, 비교기 신호 경로의 두 단계 OTA가 아닙니다. Track/Hold에는 **HOLD→VCM의 이상적 1 GΩ 누설 저항**을 명시적으로 넣었습니다. 이 조건에서의 드루프 결과를 실제 공정의 누설 분포로 해석하지 마세요.

모든 MOS는 공개 SKY130의 `sky130_fd_pr__nfet_01v8` 또는 `sky130_fd_pr__pfet_01v8_hvt` 모델을 사용합니다. R/C와 외부 자극은 이상 소자입니다. 포토다이오드는 전류원과 입력 커패시턴스로 근사했으며 광응답·접합·암전류 모델을 넣지 않았습니다. 300 × 300 µm, 90,000 µm², 경계 여유 10 µm는 **설계 공간 제한 설정**이며 실제 배치 면적이나 제작된 칩 면적이 아닙니다.

## 재현과 증거

측정 기준 실행은 `attempt-2026-11-12T05-00-57-428Z-7fb2b213`입니다. [evidence.zip](evidence.zip)에 해당 실행 전체의 원시 파형, 로그, 테스트벤치, 모델·소스 해시, 고정된 소스 스냅샷, 프로젝트 미리보기와 원본 보고서를 보관했습니다. 최상위 [report.json](report.json)은 그 원본의 사본입니다. 보고서의 상대 경로는 압축을 푼 해당 실행 폴더 기준입니다. 배포 파일의 크기와 SHA-256은 [checksums.json](checksums.json)에서 확인할 수 있습니다. 소프트웨어 검사·앱 연결·실행 후 메타데이터 수정 범위는 [QA 요약](qa-summary.json)과 [단위 검사 로그](unit-tests.txt)에 별도로 기록했습니다.

실제 엔진은 Windows native **ngspice 47**, 모델 출처는 sky130A `d400e26845538beaeb7cc5fdb9bfc06c30ea27cb`입니다. KLayout 0.30.5의 사용 가능 상태도 기록했지만 이 세 설계의 물리 검증을 실행한 것은 아닙니다. 해석 후 참고문헌 메타데이터의 비교기 토폴로지 설명 한 필드를 바로잡았습니다. 실행 보고서와 스냅샷은 수정하지 않았으며, 현 저장소 전체가 실행 시점과 바이트 단위로 같다고 주장하지 않습니다.

저장소 개발 환경에서 `npm run lab:practical-analog`로 별도의 검증 작업공간에 새 실행을 만들 수 있습니다. native worker, ngspice, 공개 SKY130 모델 및 해당 실행 환경의 정당한 접근 구성이 필요합니다. 기존 사용자 프로젝트를 복사하거나 접근 설정을 우회하지 않습니다. 새 실행은 별도 attempt 폴더에 남으며 이 배포 증거를 덮어쓰지 않습니다. 내보낸 `.spice`는 핵심 회로이므로 단독 실행하려면 해당 모델과 테스트벤치가 추가로 필요합니다.

이번 검증은 실제 native API, 결과 파형과 번들 왕복에 대한 검증입니다. GUI 브라우저 조작 QA는 이 실행 환경에서 로컬 브라우저 사용이 비활성화되어 수행하지 못했습니다. 또한 확률 잡음, mismatch/Monte Carlo, 수율, 전체 PVT, 루프 안정성·위상 여유, 추출 배선, ESD·신뢰성·파운드리 signoff는 미검증입니다. 물리 레이아웃이 없는 상태의 DRC/LVS/PEX 요청이 `NO_PHYSICAL_LAYOUT`으로 차단됨을 확인했으며, 이를 물리 검증 PASS로 계산하지 않았습니다.

## 설계에 참고한 자료

소프트웨어 검사는 [QA 요약](qa-summary.json)과 [단위 테스트 로그](unit-tests.txt)에 기록했습니다. 240개 중 239개 통과·1개 건너뜀이며 typecheck를 포함한 빌드를 완료했습니다. 로컬 앱의 인증된 API 경로에서도 세 프리셋과 편집 계층·실행 기록을 확인했습니다.

[회로식·단위·모델 한계 노트](reference-notes.md)에 실제 채택한 방법과 적용 범위를 정리했습니다. 참고 자료는 TI의 [TIA 분석 SBOA122](https://www.ti.com/lit/an/sboa122/sboa122.pdf), Berkeley의 [MOS Sample/Hold 강의](https://rfic.eecs.berkeley.edu/courses/ee240sp06/pdf/topic18.pdf), TI의 [양의 피드백 히스테리시스 SBOA313A](https://www.ti.com/lit/pdf/sboa313)와 [Schmitt 입력 해설 SCEA046B](https://www.ti.com/lit/pdf/scea046), 공식 SKY130 [소자 문서](https://skywater-pdk.readthedocs.io/en/main/rules/device-details.html)와 [공개 PDK 상태](https://skywater-pdk.readthedocs.io/en/main/status.html)입니다. 이 구현은 벤더 제품 복제나 논문 성능 재현·인증을 주장하지 않습니다.
