# Resistor Edu 자율학습 영상

실제 Edu 앱 조작 18단계를 한국어 합성 음성·타이밍 자막과 편집한 **7분 7초 / 1920×1080 / 30 fps** 가이드다. RC 배치·핀 연결·실제 ngspice·시간 커서·C 변경, NMOS 게이트 대조, 무료 규칙 코치, AI 재사용 정책, 문제 은행의 SI 단위 채점, 설명 저장·재열기를 다룬다.

유료 AI 호출을 하지 않았다. 사용자가 승인한 공개 대본만 무료 Microsoft Edge 음성 서비스에 전송했다. 회로·학습 기록·API 키는 보내지 않는다. 생성형 모델의 실제 답변 장면은 포함하지 않으며, AI 모드의 동의·예산 UI를 설명한다.

## 재현

1. `scripts/tutorial-capture.mjs`의 recorder를 CUA 브라우저 조작에서 사용한다. 이 파일은 브라우저 조작 대체 실행기가 아니다. 각 start → 실제 UI 동작 → stop을 같은 호출에서 실행한다.
2. 원본은 `.runtime/edu-study-video-20261016/raw/<clip>/capture.json` 및 JPEG 프레임에 저장한다. 대본과 clip 이름은 `scripts/edu-study-video-plan.json`에 있다.
3. Python Pillow, FFmpeg/ffprobe, 승인된 무료 `edge-tts==7.3.1`을 준비한다. `python scripts/edu-study-video.py --phase voice --voice-lib .tools/edu-study-voice`는 대본을 외부 음성 서비스로 보낸다. 기존 승인 범위를 확인한 뒤 실행한다. 키를 읽지 않는다.
4. `--phase render`로 한국어 음성·자막·18개 챕터 영상을 편집한다. 실제 녹화 프레임을 느리게 재생한 뒤 마지막 프레임을 설명 시간 동안 유지한다. 중앙 작업 화면 크롭과 명시적 음성 속도 조정을 manifest에 기록한다. 배율이 잘못된 Page.captureScreenshot 보조 정지는 제외하고 native screencast 프레임만 사용한다.
5. `--phase verify`로 해상도·프레임률·H.264/AAC·전체 디코딩을 검사한다. 자동 검사가 전체 사람 청취나 학습 효과 평가를 뜻하지 않는다.
6. `--phase package`는 영상·SRT·VTT·챕터·manifest·검사 결과 ZIP과 원본 녹화 ZIP을 만들고, 로컬 플레이어용 파일을 `public/edu-study-tutorial/`에 준비한다. 웹에서는 챕터 플레이어를 열고, 설치 앱에서는 고정된 패키지 MP4만 기본 동영상 플레이어로 연다. 영상이 없는 빌드는 구체적인 준비 안내를 표시한다. 인터넷 업로드는 수행하지 않는다.

기본 산출물은 `release/tutorials/Resistor-Edu-Self-Study-KO/` 아래에 있다. `--raw`, `--out`으로 입력·출력 경로를 바꿀 수 있다. MP4와 원본 프레임은 Git에서 제외하며 다운로드 산출물로 보존한다.

## 정직한 범위

- RC는 이상 R/C, MOS는 공개 SKY130A nfet_01v8 TT 모델이다. 영상의 조건은 해당 QA run에 한정된다.
- DRC·LVS·PEX는 각각 미실행이다. 실제 해석 완료를 제조 검증이나 실물 측정으로 설명하지 않는다.
- 예시 답안은 QA 예시이며 학생 제출물과 구분한다.
- 최종 파일의 자동 디코딩·음성 트랙·워드 경계 자막을 확인한다. 전체 사람 청취와 학습 효과 평가는 별도다.
