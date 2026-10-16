import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {z} from 'zod/v4';
import {leagueKinds,buildLeagueQuestions} from '../../packages/education/src/league-problems.ts';
import {requestStructured,structuredStatus,structuredEstimate} from '../../scripts/structured-ai.mjs';
import {difficultyLevel,difficultyLevels} from '../../packages/education/src/difficulty.ts';

// Operator-only. Participants cannot trigger provider calls or supply grading logic.
export async function generateLeaguePack({league,workspace,day,cap,approved=false,level=1},{provider=requestStructured,statusReader=structuredStatus}={}){
 difficultyLevel(level);
 if(approved!==true)throw Error('출제 요청의 외부 전송·비용 사용 승인이 필요합니다.');
 if(typeof day!=='string'||!Number.isFinite(cap)||cap<=0||cap>1)throw Error('A future day and explicit USD cap (0..1) are required.');
 const config=JSON.parse(await readFile(path.join(workspace,'.runtime/education/study/provider.json'),'utf8')),status=await statusReader(config.credential_workspace);
 const schema=z.object({problems:z.array(z.object({kind:z.enum(leagueKinds),variants:z.array(z.number().int().min(0).max(15)).length(3)}).strict()).length(5)}).strict();
 const system='Resistor Edu 일일 리그 출제 조합을 만든다. 서로 다른 kind 5개를 선택하고 variants는 각 0..15 정수 3개다. 수치 정답·학생 정보·풀이를 생성하지 않는다. 수치는 공통 deterministic calculator가 결정한다.';
 const content={day,difficulty:difficultyLevels[level-1],allowed_kinds:leagueKinds,task:'요청한 난이도에서 서로 다른 공학 계산 영역 다섯 개를 균형 있게 선택한다. 계산 단계는 저장 템플릿으로 고정한다.'};
 if(!status.configured||structuredEstimate(system,content,z.toJSONSchema(schema))>Math.min(cap,status.remaining_usd))throw Error('기존 키 연결 또는 명시한 비용 상한·공통 잔여를 확인하세요.');
 league.reserveAI(day,level);
 try{
  const reply=await provider(config.credential_workspace,{system,content,schema:z.toJSONSchema(schema),name:'resistor_daily_league',approved:true});
  const recipes=schema.parse(reply.value).problems;buildLeagueQuestions(recipes,level);
  league.publish(day,recipes,'openai-recipe-selection',level);league.finishAI(day,'completed',reply.receipt,level);
  return {day,level,questions:5,reused_by_all_participants:true,receipt:reply.receipt};
 }catch(e){league.finishAI(day,'error',{message:'Generation failed. No automatic retry; reservation retained.'},level);throw e;}
}
