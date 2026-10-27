export const eduAiPolicy={
 schema_version:1,edition:'edu',version:'edu-learning-coach-v1',
 judge:{model:'gpt-6-luna',label:'Luna · 학습 상태와 다음 활동 판단'},
 executor:{model:'gpt-6.1-sol',label:'Sol · 힌트·설명·비교 실험 작성'},
 goals:[{id:'hint',label:'정답 대신 단계별 힌트'},{id:'explain',label:'개념과 판단 근거 이해'},{id:'experiment',label:'한 변수를 바꾸는 다음 실험'}],
 learning_loop:['예측하기','직접 풀고 관찰하기','근거를 설명하기','조건 하나를 바꿔 다시 확인하기'],
 scope:'개인 자율학습 지원 · 공식 성적·제조 승인·설계 자동 변경과 별도',
 engine_authority:'수치·단위 채점과 DRC/LVS/PEX·시뮬레이션 상태는 기존 계산·실행 엔진이 담당합니다.',
 automatic_engine_execution:false,automatic_provider_calls:false,
 sources:['https://developers.openai.com/api/docs/models/gpt-6-luna','https://developers.openai.com/api/docs/models/gpt-6.1-sol','https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses']
} as const;
