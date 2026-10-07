# 오픈소스 PDK 모음집

대표 공개 PDK, 교육·연구용 예측 PDK와 관련 설치·설계 도구의 공식 자료 모음입니다.

자료 확인: 2026-10-04 · 13개 항목 · 33개 링크

레지스터의 현재 기본 실행 검증 공정은 SKY130A입니다. 나머지 항목은 참고 자료이며 자동 설치 또는 완전 호환 인증을 뜻하지 않습니다. 자료별 라이선스·제조 제출 조건을 확인하세요. GDS만으로 공정 높이·피복 특성을 알 수 없으므로 별도 공정 자료가 필요합니다.

## 제조 공정 기반 공개 PDK

실제 제조 공정을 바탕으로 공개된 설계 자료입니다. 공개판의 개발 단계와 제조 검증 범위는 각 프로젝트 문서를 확인하세요.

### SKY130 (130 nm · CMOS)

SkyWater의 130 nm 공개 PDK. 소자 모델, 배선·소자 규칙과 표준셀 자료를 제공합니다.

공개판: Experimental Preview / alpha

레지스터: SKY130A 기본 프로파일에서 회로 해석·DRC·LVS 실행 확인. 제조 signoff 인증과는 별도입니다.

- [공식 문서](https://skywater-pdk.readthedocs.io/en/main/)
- [PDK 구성](https://skywater-pdk.readthedocs.io/en/main/contents.html)
- [소스 저장소](https://github.com/google/skywater-pdk)
- [SkyWater 안내](https://www.skywatertechnology.com/sky130-open-source-pdk/)

### GF180MCU (180 nm · 3.3 V / 6 V MCU)

GlobalFoundries의 공개 MCU 공정 자료. MOS·수동 소자 모델과 표준셀·물리 검증 자료를 살펴볼 수 있습니다.

공개판: Experimental Preview / alpha. Google 원본 저장소는 보관 상태입니다.

레지스터: 참고 자료 · 레지스터에서 전체 공정 실행 검증은 아직 하지 않았습니다.

- [공식 문서](https://gf180mcu-pdk.readthedocs.io/en/latest/)
- [Google 원본 · 보관됨](https://github.com/google/gf180mcu-pdk)
- [FOSSi 소자 모델](https://github.com/fossi-foundation/globalfoundries-pdk-libs-gf180mcu_fd_pr)
- [FOSSi 물리 검증](https://github.com/fossi-foundation/globalfoundries-pdk-libs-gf180mcu_fd_pv)
- [Open PDKs 설정 안내](https://github.com/fossi-foundation/open-pdks/blob/main/gf180mcu/README)

### IHP SG13G2 (130 nm · SiGe BiCMOS)

IHP의 아날로그·혼합 신호·RF 설계를 위한 공개 PDK. MOS, HBT와 수동 소자 및 오픈소스 도구용 자료를 제공합니다.

공개판: preview · 각 도구별 지원 범위는 공식 문서 참조

레지스터: 참고 자료 · 레지스터에서 전체 공정 실행 검증은 아직 하지 않았습니다.

- [공식 문서](https://ihp-open-pdk-docs.readthedocs.io/en/latest/)
- [소스·설치 안내](https://github.com/IHP-GmbH/IHP-Open-PDK)

## 교육·연구용 예측 PDK

공정 연구와 설계 흐름 학습을 위한 예측 모델입니다. 실제 제조 공정의 수율·성능을 보증하는 자료와 구분됩니다.

### ASAP7 (7 nm · 예측 FinFET)

Arizona State University의 연구·교육용 예측 PDK와 표준셀 자료. OpenROAD용 플랫폼도 제공됩니다.

실제 제조 공정용 PDK와 구분 · Calibre 관련 자료는 ASU 안내의 별도 취득 절차 참조

레지스터: 참고 자료 · 레지스터 실행 검증 전

- [ASU 공식 사이트](https://asap.asu.edu/)
- [OpenROAD PDK·표준셀](https://github.com/The-OpenROAD-Project/asap7)

### FreePDK45 / Nangate45 (45 nm · 예측 CMOS)

NC State의 FreePDK45와 이를 사용하는 Nangate45 디지털 설계 플랫폼. PDK와 표준셀 라이브러리는 별도 자료입니다.

교육·연구용 예측 모델 · Nangate 셀은 별도 비상업적 사용 조건을 확인하세요.

레지스터: 참고 자료 · 레지스터 실행 검증 전

- [NC State 원본 안내](https://eda.ncsu.edu/freepdk/freepdk45/)
- [Lambdapdk 패키지](https://github.com/siliconcompiler/lambdapdk/tree/main/lambdapdk/freepdk45)
- [OpenROAD Nangate45 플랫폼](https://github.com/The-OpenROAD-Project/OpenROAD-flow-scripts/tree/master/flow/platforms/nangate45)

## 실리콘 포토닉스

광 도파로와 광 회로를 위한 PDK·라이브러리입니다.

### SiEPIC EBeam PDK (실리콘 포토닉스 · KLayout)

KLayout에서 광 도파로와 광 회로를 설계하는 PDK·소자 라이브러리입니다. 전기 CMOS PDK와 별도 분야입니다.

플랫폼·소자별 적용 조건은 프로젝트 문서 참조

레지스터: 참고 자료 · 레지스터의 광 소자 해석·제조 제출 검증 전

- [소스·설치 안내](https://github.com/SiEPIC/SiEPIC_EBeam_PDK)
- [배포 버전](https://github.com/SiEPIC/SiEPIC_EBeam_PDK/releases)
- [문서](https://github.com/SiEPIC/SiEPIC_EBeam_PDK/tree/master/docs)

## 설치·버전 관리 도구

공개 PDK를 내려받고 구성하거나 개발 환경에 묶어 사용하는 도구입니다.

### Open PDKs (PDK 빌드·도구별 구성)

SKY130·GF180MCU 원본 자료를 오픈소스 EDA 도구에서 사용할 수 있도록 구성하는 빌더입니다. 현재 FOSSi 저장소를 안내합니다.

설치 도구 · 자체 제조 공정 PDK가 아닙니다.

레지스터: 외부 설정 참고 · 현재 엔진의 고정 버전을 임의로 변경하지 않습니다.

- [현재 소스·사용법](https://github.com/fossi-foundation/open-pdks)
- [GF180 구성 안내](https://github.com/fossi-foundation/open-pdks/blob/main/gf180mcu/README)

### Ciel (PDK 설치·버전 관리)

공개 PDK의 사전 빌드와 버전을 관리하는 FOSSi 도구. SKY130, GF180MCU, IHP SG13G2 설정은 README에서 확인할 수 있습니다.

프로젝트 명칭: formerly Volare

레지스터: 외부 설치 참고 · 레지스터에 자동 설치되지 않습니다.

- [소스·사용법](https://github.com/fossi-foundation/ciel)
- [배포 버전](https://github.com/fossi-foundation/ciel/releases)

### Volare (기존 PDK 버전 관리 환경)

SKY130·GF180MCU를 사용하는 기존 Volare 환경의 설정 자료. 이전 efabless 주소 대신 현재 chipfoundry 저장소를 연결합니다.

기존 Volare 환경용 · Ciel 자료도 함께 참고

레지스터: 외부 설치 참고 · 레지스터에 자동 설치되지 않습니다.

- [현재 소스·사용법](https://github.com/chipfoundry/volare)
- [배포 버전](https://github.com/chipfoundry/volare/releases)

### Lambdapdk (SiliconCompiler용 PDK 패키지)

SKY130, GF180MCU, IHP, ASAP7와 FreePDK45 등 여러 공개 설계 자료를 SiliconCompiler 흐름에서 구성하는 패키지입니다.

각 PDK·표준셀의 개별 라이선스와 사용 조건 적용

레지스터: 외부 설정 참고 · 패키지 지원 목록은 레지스터의 지원 목록과 별도입니다.

- [소스·지원 PDK·사용 조건](https://github.com/siliconcompiler/lambdapdk)
- [배포 버전](https://github.com/siliconcompiler/lambdapdk/releases)

### IIC-OSIC-TOOLS (Docker · AMD64 / ARM64)

공개 PDK와 회로·레이아웃·검증 도구를 묶은 개발 환경. SKY130, GF180MCU와 IHP 공정 자료를 다룹니다.

개발 환경 묶음 · 도구와 PDK별 버전·사용 조건 확인

레지스터: 외부 개발 환경 참고 · 현재 레지스터 엔진과 별도로 구성할 수 있습니다.

- [소스·설치 안내](https://github.com/iic-jku/IIC-OSIC-TOOLS)
- [배포 버전](https://github.com/iic-jku/IIC-OSIC-TOOLS/releases)

## RTL → GDS 설계 흐름

지원 플랫폼과 예제를 통해 디지털 설계 흐름을 실행하는 프로젝트입니다.

### OpenROAD-flow-scripts (디지털 RTL → GDS)

OpenROAD 기반 디지털 설계 흐름과 PDK별 플랫폼 예제. 지원 공정별 기술 파일과 설정을 살펴볼 수 있습니다.

설계 도구 · 공정 자체와 지원 도구의 검증 범위는 별도

레지스터: 외부 흐름 참고 · 레지스터의 자동 연동 검증 전

- [공식 문서](https://openroad-flow-scripts.readthedocs.io/en/latest/)
- [소스·플랫폼 목록](https://github.com/The-OpenROAD-Project/OpenROAD-flow-scripts)

### LibreLane (디지털 RTL → GDS)

OpenLane에서 이어진 공개 디지털 설계 흐름. 공정 설정, 실행 환경과 예제를 공식 문서에서 확인할 수 있습니다.

설계 도구 · PDK 설치와 흐름별 설정 절차 필요

레지스터: 외부 흐름 참고 · 레지스터의 자동 연동 검증 전

- [공식 문서](https://librelane.readthedocs.io/en/latest/)
- [소스 저장소](https://github.com/librelane/librelane)

