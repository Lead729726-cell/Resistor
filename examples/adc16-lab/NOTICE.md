# 출처와 범위 · Resistor Indust

생성 회로·RTL·테스트·문서는 이 저장소의 MIT license를 따릅니다. 별도 파운드리 제조 권리나 상용 도구 라이선스를 부여하지 않습니다. SKY130 모델은 포함하지 않으며 [SKY130 공식 문서](https://skywater-pdk.readthedocs.io/en/main/)의 설치·license 조건을 확인하세요.

구조와 검증 관점의 참고 자료:

- [Analog Devices · SAR architecture](https://www.analog.com/en/resources/technical-articles/successive-approximation-registers-sar-and-flash-adcs.html): 순차 비교·분할 DAC·정밀도 한계.
- [Analog Devices · Pipeline architecture](https://www.analog.com/en/resources/technical-articles/understanding-pipelined-adcs.html): 1.5-bit MDAC·잔류전압·중복 코드·지연 정렬.
- [Analog Devices · AN-0979](https://www.analog.com/en/resources/app-notes/an-0979.html): sinc 필터의 지연·정착.
- [arXiv:2610.15240](https://arxiv.org/abs/2610.15240): 앞선 SAR12 연구 레퍼런스의 검증 관점. 이번 ADC16 세 구조는 그 논문의 성능 재현이 아닙니다.

문서의 회로식은 구현 설명과 독립 수학 검사에 사용했습니다. 논문/상용 ADC의 실측 수치를 이 회로의 결과로 사용하지 않았습니다.
