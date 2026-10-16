import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes,randomUUID,createHmac,createPublicKey,verify,createCipheriv,createDecipheriv} from 'node:crypto';
import {z} from 'zod/v4';
import {canonical,leagueEmojis} from '../../packages/education/src/league-protocol.ts';
import {difficultyLevels,difficultyLevel,difficultyPolicy,classifyDifficulty,recommendDifficulty} from '../../packages/education/src/difficulty.ts';
import {buildLeagueQuestions,leagueKinds,leagueProblemVersion,publicLeagueQuestion,gradeLeague} from '../../packages/education/src/league-problems.ts';

const digest=v=>createHash('sha256').update(v).digest('hex'),DAY=86400000;
const error=(code,message)=>{throw Object.assign(Error(message),{code});};
export function calendar(now){const day=new Date(now+9*3600000).toISOString().slice(0,10),start=Date.parse(day+'T00:00:00+09:00');return {day,start,end:start+DAY};}
const blank=z.object({}).strict(),id=z.string().uuid(),integer=z.number().int().positive(),daySchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const leagueSchemas={
 'league.info':blank,'league.enroll':z.object({public_key:z.string().min(80).max(180)}).strict(),'league.me':blank,'league.start':blank,
 'league.difficulty':z.object({mode:z.enum(['auto','manual']),level:z.number().int().min(1).max(3).optional(),expected_revision:z.number().int().nonnegative()}).strict().refine(p=>p.mode!=='manual'||p.level!==undefined),
 'league.submit':z.object({attempt_id:id,answers:z.record(z.string().regex(/^q[1-5]$/),z.string().trim().min(1).max(100))}).strict(),
 'league.snapshot':z.object({period:z.enum(['today','week']).default('today'),level:z.number().int().min(1).max(3).optional()}).strict(),
 'league.board':z.object({period:z.enum(['today','week']).default('today'),level:z.number().int().min(1).max(3).optional()}).strict(),
 'league.emoji':z.object({emoji:z.enum(leagueEmojis)}).strict(),
 'community.thread':z.object({post_id:integer,before:integer.optional()}).strict(),
 'community.feed':z.object({before:integer.optional()}).strict(),
 'community.post':z.object({body:z.string().trim().min(2).max(1200),category:z.enum(['question','reflection','tip']),parent_id:integer.optional()}).strict(),
 'community.react':z.object({post_id:integer,active:z.boolean()}).strict(),
 'community.report':z.object({post_id:integer,reason:z.enum(['spoiler','abuse','spam','personal-data'])}).strict(),
 'community.hide':z.object({post_id:integer,hidden:z.boolean()}).strict()
};
const envelopeSchema=z.object({schema_version:z.literal(1),device_id:z.string().regex(/^[a-f0-9]{64}$/),method:z.string().max(60),params:z.record(z.string(),z.unknown()),issued_at:z.number().int().nonnegative(),nonce:id,signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/)}).strict();
function validDay(day){daySchema.parse(day);const value=Date.parse(day+'T12:00:00+09:00');if(!Number.isFinite(value)||calendar(value).day!==day)error('INVALID_DAY','실제 달력 날짜를 입력하세요.');return day;}
const adjectives=['반짝이는','차분한','노래하는','용감한','느긋한','빛나는','호기심많은','집중하는','꿈꾸는','날아가는','정교한','따뜻한','활기찬','엉뚱한','튼튼한','기민한'];
const nouns=['바지','수달','저항','별','나침반','고양이','연필','파도','구름','회로','여우','망원경','펭귄','단추','달팽이','오실로스코프'];

export async function createLeague({directory,now=Date.now,mode='local',maxDevices=5000,maxEnrollmentsPerIP=100}={}){
 if(!directory)throw Error('A separate league data directory is required.');await mkdir(directory,{recursive:true});
 const secretFile=path.join(directory,'server-secret');let secret;
 try{secret=await readFile(secretFile);}catch(e){if(e.code!=='ENOENT')throw e;try{await writeFile(secretFile,randomBytes(32),{mode:0o600,flag:'wx'});}catch(x){if(x.code!=='EEXIST')throw x;}secret=await readFile(secretFile);}
 if(secret.length!==32)throw Error('Invalid league secret; do not reset it or overwrite the database.');
 const db=new DatabaseSync(path.join(directory,'league.sqlite3'));db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 INSERT OR IGNORE INTO meta VALUES('schema_version','1');
 CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,public_key TEXT NOT NULL,nickname TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,blocked INTEGER NOT NULL DEFAULT 0);
 CREATE TRIGGER IF NOT EXISTS device_identity_immutable BEFORE UPDATE OF id,public_key,nickname ON devices BEGIN SELECT RAISE(ABORT,'Device identity is immutable'); END;
 CREATE TABLE IF NOT EXISTS packs(day TEXT PRIMARY KEY,version TEXT NOT NULL,origin TEXT NOT NULL,cipher TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,day TEXT NOT NULL REFERENCES packs(day),device_id TEXT NOT NULL REFERENCES devices(id),started_at INTEGER NOT NULL,deadline INTEGER NOT NULL,status TEXT NOT NULL,score INTEGER,correct INTEGER,elapsed_ms INTEGER,finished_at INTEGER,answers_cipher TEXT,UNIQUE(day,device_id));
 CREATE INDEX IF NOT EXISTS standings ON attempts(day,status,score DESC,elapsed_ms,finished_at);
 CREATE TABLE IF NOT EXISTS emojis(day TEXT NOT NULL,device_id TEXT NOT NULL REFERENCES devices(id),emoji TEXT NOT NULL,PRIMARY KEY(day,device_id));
 CREATE TABLE IF NOT EXISTS receipts(device_id TEXT,nonce TEXT,digest TEXT,result_cipher TEXT,created_at INTEGER,PRIMARY KEY(device_id,nonce));
 CREATE INDEX IF NOT EXISTS receipt_age ON receipts(created_at);
 CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS limit_expiry ON limits(expires_at);
 CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY AUTOINCREMENT,device_id TEXT NOT NULL REFERENCES devices(id),parent_id INTEGER REFERENCES posts(id),category TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'visible',created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS feed ON posts(parent_id,status,id DESC);
 CREATE TABLE IF NOT EXISTS reactions(post_id INTEGER REFERENCES posts(id),device_id TEXT REFERENCES devices(id),PRIMARY KEY(post_id,device_id));
 CREATE TABLE IF NOT EXISTS reports(post_id INTEGER REFERENCES posts(id),device_id TEXT REFERENCES devices(id),reason TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(post_id,device_id));
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,event TEXT,subject TEXT,reason TEXT,created_at INTEGER);
 CREATE TABLE IF NOT EXISTS ai_jobs(day TEXT PRIMARY KEY,status TEXT NOT NULL,receipt TEXT,created_at INTEGER);
 `);
 const databaseVersion=db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value;
 if(!['1','2'].includes(databaseVersion))throw Error('Unsupported league database schema.');
 db.exec('BEGIN IMMEDIATE');try{
  const columns=new Set(db.prepare('PRAGMA table_info(attempts)').all().map(c=>c.name));
  for(const [name,type] of [['level','INTEGER NOT NULL DEFAULT 1'],['difficulty_mode',"TEXT NOT NULL DEFAULT 'legacy'"],['difficulty_context',"TEXT NOT NULL DEFAULT '{}'" ]])if(!columns.has(name))db.exec(`ALTER TABLE attempts ADD COLUMN ${name} ${type}`);
  db.exec(`CREATE TABLE IF NOT EXISTS difficulty_packs(day TEXT NOT NULL,level INTEGER NOT NULL CHECK(level IN (2,3)),version TEXT NOT NULL,origin TEXT NOT NULL,cipher TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(day,level));
  CREATE TABLE IF NOT EXISTS difficulty_preferences(device_id TEXT PRIMARY KEY REFERENCES devices(id),mode TEXT NOT NULL,level INTEGER NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS difficulty_ai_jobs(day TEXT NOT NULL,level INTEGER NOT NULL,status TEXT NOT NULL,receipt TEXT,created_at INTEGER,PRIMARY KEY(day,level));
  CREATE INDEX IF NOT EXISTS tier_standings ON attempts(level,day,status,score DESC,elapsed_ms,finished_at);
  UPDATE meta SET value='2' WHERE key='schema_version';`);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');db.close();throw e;}
 const seal=(value,aad)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',secret,iv);c.setAAD(Buffer.from(aad));const body=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]).toString('base64');};
 const unseal=(value,aad)=>{const b=Buffer.from(value,'base64'),c=createDecipheriv('aes-256-gcm',secret,b.subarray(0,12));c.setAAD(Buffer.from(aad));c.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([c.update(b.subarray(28)),c.final()]).toString('utf8'));};
 const hmac=value=>createHmac('sha256',secret).update(value).digest('hex');
 const audit=(event,subject,reason='')=>db.prepare('INSERT INTO audit(event,subject,reason,created_at) VALUES(?,?,?,?)').run(event,subject,reason,now());
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 function limit(key,max,expires){const row=db.prepare('SELECT count FROM limits WHERE key=?').get(key);if((row?.count||0)>=max)error('RATE_LIMIT','요청이 많습니다. 잠시 후 다시 시도하세요.');db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,expires);}
 function storedPack(day,level){return level===1?db.prepare('SELECT * FROM packs WHERE day=?').get(day):db.prepare('SELECT * FROM difficulty_packs WHERE day=? AND level=?').get(day,level);}
 const packAAD=(day,level)=>'pack:'+day+(level===1?'':':'+level);
 function publish(day,recipes,origin,level=1){validDay(day);difficultyLevel(level);const questions=buildLeagueQuestions(recipes,level);if(storedPack(day,level))error('PACK_LOCKED','이미 고정된 날짜·난이도의 문제를 교체할 수 없습니다.');const value={schema_version:1,version:leagueProblemVersion,day,level,questions,origin};
  if(level===1)db.prepare('INSERT INTO packs VALUES(?,?,?,?,?)').run(day,leagueProblemVersion,origin,seal(value,packAAD(day,level)),now());else db.prepare('INSERT INTO difficulty_packs VALUES(?,?,?,?,?,?)').run(day,level,leagueProblemVersion,origin,seal(value,packAAD(day,level)),now());audit('pack.published',day+':L'+level,origin);return value;
 }
 function pack(day,level=1){difficultyLevel(level);const row=storedPack(day,level);if(row)return unseal(row.cipher,packAAD(day,level));
  // Retain the original L1 date seed so cached historical packs are untouched.
  const bytes=Buffer.from(hmac('daily:'+day+(level===1?'':':L'+level)),'hex'),offset=bytes[0]%leagueKinds.length;
  const recipes=Array.from({length:5},(_,i)=>({kind:leagueKinds[(offset+i)%leagueKinds.length],variants:[bytes[1+i*3]%16,bytes[2+i*3]%16,bytes[3+i*3]%16]}));return publish(day,recipes,'ai-assisted-saved-templates',level);
 }
 function preference(device){return db.prepare('SELECT * FROM difficulty_preferences WHERE device_id=?').get(device)||{mode:'auto',level:1,revision:0};}
 function difficulty(device){const pref=preference(device),a=db.prepare('SELECT * FROM attempts WHERE day=? AND device_id=?').get(calendar(now()).day,device);
  const records=db.prepare("SELECT id,level,score FROM attempts WHERE device_id=? AND status='submitted' ORDER BY started_at,id").all(device).map(r=>({key:r.id,level:r.level,score:r.score}));const recommendation=recommendDifficulty(records);
  return {mode:pref.mode,manual_level:pref.level,selected_level:a?.level||(pref.mode==='auto'?recommendation.level:pref.level),locked:!!a,revision:pref.revision,recommendation,policy_version:difficultyPolicy};
 }
 function boardLevel(device,requested){return requested??(device?difficulty(device).selected_level:1);}
 function board(period,device,level=1){difficultyLevel(level);const c=calendar(now()),since=period==='week'?new Date(c.start-6*DAY+9*3600000).toISOString().slice(0,10):c.day;
  const rows=period==='week'?db.prepare(`SELECT device_id,sum(score) score,sum(elapsed_ms) elapsed_ms,max(finished_at) finished_at,count(*) days FROM attempts WHERE level=? AND day>=? AND day<=? AND status='submitted' GROUP BY device_id ORDER BY score DESC,days DESC,elapsed_ms,finished_at,device_id`).all(level,since,c.day):db.prepare("SELECT device_id,score,elapsed_ms,finished_at,1 days FROM attempts WHERE level=? AND day=? AND status='submitted' ORDER BY score DESC,elapsed_ms,finished_at,device_id").all(level,c.day);
  const visible=rows.filter(r=>!db.prepare('SELECT blocked FROM devices WHERE id=?').get(r.device_id)?.blocked).map((r,i)=>{const d=db.prepare('SELECT nickname FROM devices WHERE id=?').get(r.device_id);return {rank:i+1,nickname:d.nickname,member_id:hmac('public:'+r.device_id).slice(0,20),score:r.score,elapsed_ms:r.elapsed_ms,days:r.days,self:r.device_id===device,emoji:period==='today'&&i<3?db.prepare('SELECT emoji FROM emojis WHERE day=? AND device_id=?').get(c.day,r.device_id)?.emoji||'':''};});
  return {period,level,level_label:difficultyLevels[level-1].label,since,day:c.day,entries:visible.slice(0,50),participants:visible.length,mine:visible.find(r=>r.self)||null,tie_break:period==='today'?'같은 난이도 · 점수↓, 서버 소요시간↑, 제출시각↑, 등록 ID↑':'같은 난이도의 최근 7일 점수↓, 완료일수↓, 합계 소요시간↑, 제출시각↑, 등록 ID↑'};
 }
 function attemptView(a){if(!a)return null;const p=pack(a.day,a.level),closed=now()>=calendar(Date.parse(a.day+'T12:00:00+09:00')).end;return {id:a.id,day:a.day,level:a.level,difficulty_mode:a.difficulty_mode,difficulty_context:JSON.parse(a.difficulty_context),origin:p.origin,problem_version:p.version,started_at:a.started_at,deadline:a.deadline,status:a.status==='started'&&now()>=a.deadline?'expired':a.status,score:a.score,correct:a.correct,elapsed_ms:a.elapsed_ms,answers:a.answers_cipher?unseal(a.answers_cipher,'answers:'+a.id):null,questions:p.questions.map(q=>({...publicLeagueQuestion(q),difficulty:classifyDifficulty(q)})),review:closed&&a.answers_cipher?{questions:p.questions,answers:unseal(a.answers_cipher,'answers:'+a.id)}:null,review_available_at:calendar(Date.parse(a.day+'T12:00:00+09:00')).end};}
 function publicPost(r,device){const author=db.prepare('SELECT nickname,blocked FROM devices WHERE id=?').get(r.device_id);return {id:r.id,parent_id:r.parent_id,category:r.category,body:author.blocked?'운영자가 제한한 작성자입니다.':r.body,status:r.status,created_at:r.created_at,nickname:author.nickname,self:r.device_id===device,reactions:db.prepare('SELECT count(*) n FROM reactions WHERE post_id=?').get(r.id).n,reacted:!!device&&!!db.prepare('SELECT 1 FROM reactions WHERE post_id=? AND device_id=?').get(r.id,device),reported:!!device&&!!db.prepare('SELECT 1 FROM reports WHERE post_id=? AND device_id=?').get(r.id,device),reply_count:db.prepare("SELECT count(*) n FROM posts WHERE parent_id=? AND status='visible'").get(r.id).n};}
 function feed(p,device){const rows=db.prepare("SELECT * FROM posts WHERE parent_id IS NULL AND (status='visible' OR device_id=?) AND id<? ORDER BY id DESC LIMIT 20").all(device||'',p.before||Number.MAX_SAFE_INTEGER);return {posts:rows.map(r=>publicPost(r,device)),next_before:rows.length===20?rows.at(-1).id:null};}
 function thread(p,device){const root=db.prepare("SELECT * FROM posts WHERE id=? AND parent_id IS NULL AND (status='visible' OR device_id=?)").get(p.post_id,device||'');if(!root)error('NOT_FOUND','공개된 원글을 찾을 수 없습니다.');const replies=db.prepare("SELECT * FROM posts WHERE parent_id=? AND (status='visible' OR device_id=?) AND id<? ORDER BY id DESC LIMIT 20").all(root.id,device||'',p.before||Number.MAX_SAFE_INTEGER);return {root:publicPost(root,device),replies:replies.map(r=>publicPost(r,device)).reverse(),next_before:replies.length===20?replies.at(-1).id:null};}

 function dispatch(method,p,d,ip){const c=calendar(now());
  if(method==='league.info'){const active=pack(c.day);return {name:'Resistor Edu · 오늘의 공부 리그',mode,server_time:now(),day:c.day,ends_at:c.end,question_count:5,duration_ms:600000,difficulty_levels:difficultyLevels,difficulty_policy:difficultyPolicy,origin:active.origin,problem_version:active.version,public_fields:['nickname','score','elapsed_ms','winner emoji','community posts'],identity_scope:'browser/app-profile signing key; clearing storage or reinstalling can create a new identity',automatic_ai_calls:false,registration_required_for_reading:false};}
  if(method==='league.snapshot'){const me=d?dispatch('league.me',{},d,ip):null,level=boardLevel(d?.id,p.level),active=pack(c.day,me?.difficulty.selected_level||level);return {info:{...dispatch('league.info',{},d,ip),origin:active.origin,problem_version:active.version},me,board:board(p.period,d?.id,level),feed:feed({},d?.id)};}
  if(method==='league.board')return board(p.period,d?.id,boardLevel(d?.id,p.level));
  if(method==='community.feed')return feed(p,d?.id);if(method==='community.thread')return thread(p,d?.id);
  if(!d)error('AUTH_REQUIRED','이 기기를 먼저 등록하세요.');if(d.blocked)error('DEVICE_RESTRICTED','이 등록은 운영자에 의해 제한되어 있습니다.');
  if(method==='league.enroll')return {nickname:d.nickname,device_id:d.id,can_rename:false};
  if(method==='league.me'){const a=db.prepare('SELECT * FROM attempts WHERE day=? AND device_id=?').get(c.day,d.id),setting=difficulty(d.id);return {nickname:d.nickname,device_id:d.id,can_rename:false,difficulty:setting,attempt:attemptView(a),standing:board('today',d.id,setting.selected_level).mine,history:db.prepare('SELECT * FROM attempts WHERE device_id=? AND day<? ORDER BY day DESC LIMIT 14').all(d.id,c.day).map(attemptView),allowed_emojis:leagueEmojis};}
  if(method==='league.difficulty'){if(db.prepare('SELECT 1 FROM attempts WHERE day=? AND device_id=?').get(c.day,d.id))error('DIFFICULTY_LOCKED','오늘 리그를 시작한 뒤에는 난이도·자동 설정을 변경할 수 없습니다.');const pref=preference(d.id);if(pref.revision!==p.expected_revision)error('REVISION_CONFLICT','다른 창에서 난이도를 변경했습니다. 새로고침 후 다시 선택하세요.');db.prepare('INSERT INTO difficulty_preferences VALUES(?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET mode=excluded.mode,level=excluded.level,revision=excluded.revision,updated_at=excluded.updated_at').run(d.id,p.mode,p.level??pref.level,pref.revision+1,now());return {difficulty:difficulty(d.id)};}
  if(method==='league.start'){let a=db.prepare('SELECT * FROM attempts WHERE day=? AND device_id=?').get(c.day,d.id);if(!a){const setting=difficulty(d.id);pack(c.day);pack(c.day,setting.selected_level);a={id:randomUUID(),day:c.day,device_id:d.id,started_at:now(),deadline:Math.min(now()+600000,c.end)};db.prepare("INSERT INTO attempts(id,day,device_id,started_at,deadline,status,level,difficulty_mode,difficulty_context) VALUES(?,?,?,?,?,'started',?,?,?)").run(a.id,a.day,d.id,a.started_at,a.deadline,setting.selected_level,setting.mode,JSON.stringify(setting));a=db.prepare('SELECT * FROM attempts WHERE id=?').get(a.id);audit('attempt.started',a.id);}return {attempt:attemptView(a)};}
  if(method==='league.submit'){const a=db.prepare('SELECT * FROM attempts WHERE id=? AND device_id=?').get(p.attempt_id,d.id);if(!a)error('NOT_FOUND','내 리그 참가 기록을 찾을 수 없습니다.');if(a.status!=='started')error('ALREADY_SUBMITTED','하루 한 번 확정한 답안을 바꿀 수 없습니다.');if(now()>=a.deadline)error('DEADLINE','제출 시간이 지났습니다. 현재 기록을 새로 확인하세요.');const graded=gradeLeague(pack(a.day,a.level).questions,p.answers),elapsed=Math.max(0,now()-a.started_at);db.prepare("UPDATE attempts SET status='submitted',score=?,correct=?,elapsed_ms=?,finished_at=?,answers_cipher=? WHERE id=?").run(graded.score,graded.correct,elapsed,now(),seal(p.answers,'answers:'+a.id),a.id);audit('attempt.submitted',a.id);return {score:graded.score,correct:graded.correct,total:5,standing:board('today',d.id,a.level).mine,review_available_at:c.end};}
  if(method==='league.emoji'){const mine=board('today',d.id,difficulty(d.id).selected_level).mine;if(!mine||mine.rank>3)error('TOP_THREE_ONLY','오늘 순위 1·2·3위만 이모지 상태를 설정할 수 있습니다.');db.prepare('INSERT INTO emojis VALUES(?,?,?) ON CONFLICT(day,device_id) DO UPDATE SET emoji=excluded.emoji').run(c.day,d.id,p.emoji);return {emoji:p.emoji,standing:board('today',d.id,difficulty(d.id).selected_level).mine};}
  if(method==='community.post'){const latest=db.prepare('SELECT created_at FROM posts WHERE device_id=? ORDER BY id DESC LIMIT 1').get(d.id);if(latest&&now()-latest.created_at<10000)error('RATE_LIMIT','글·답글은 10초 간격으로 작성하세요.');if(db.prepare('SELECT count(*) n FROM posts WHERE device_id=? AND created_at>=?').get(d.id,c.start).n>=30)error('RATE_LIMIT','오늘 작성 한도 30개에 도달했습니다.');if(p.parent_id){const parent=db.prepare('SELECT * FROM posts WHERE id=?').get(p.parent_id);if(!parent||parent.parent_id||parent.status!=='visible')error('NOT_FOUND','공개된 원글에만 답글을 달 수 있습니다.');}if(db.prepare('SELECT count(*) n FROM posts').get().n>=100000)error('STORAGE_LIMIT','커뮤니티 저장 한도입니다. 운영자의 보관 정리가 필요합니다.');const r=db.prepare('INSERT INTO posts(device_id,parent_id,category,body,created_at) VALUES(?,?,?,?,?)').run(d.id,p.parent_id||null,p.category,p.body,now());return {post_id:Number(r.lastInsertRowid)};}
  const post=db.prepare('SELECT * FROM posts WHERE id=?').get(p.post_id);if(!post)error('NOT_FOUND','글을 찾을 수 없습니다.');
  if(method==='community.hide'){if(post.device_id!==d.id)error('FORBIDDEN','내 글만 숨길 수 있습니다.');if(!['visible','author-hidden'].includes(post.status))error('MODERATED','신고·운영자 제한은 작성자가 해제할 수 없습니다.');db.prepare('UPDATE posts SET status=? WHERE id=?').run(p.hidden?'author-hidden':'visible',post.id);return {hidden:p.hidden};}
  if(post.status!=='visible')error('NOT_FOUND','공개된 글이 아닙니다.');
  if(method==='community.react'){if(p.active)db.prepare('INSERT OR IGNORE INTO reactions VALUES(?,?)').run(post.id,d.id);else db.prepare('DELETE FROM reactions WHERE post_id=? AND device_id=?').run(post.id,d.id);return {active:p.active};}
  if(method==='community.report'){if(post.device_id===d.id)error('OWN_POST','내 글은 숨기기 기능을 사용하세요.');db.prepare('INSERT OR IGNORE INTO reports VALUES(?,?,?,?)').run(post.id,d.id,p.reason,now());if(db.prepare('SELECT count(*) n FROM reports WHERE post_id=?').get(post.id).n>=3){db.prepare("UPDATE posts SET status='reported' WHERE id=?").run(post.id);audit('post.reported',String(post.id));}return {reported:true};}
  error('UNSUPPORTED','지원하지 않는 리그 작업입니다.');
 }
 function request(raw,{ip='local'}={}){
  try{
   const method=raw?.method;if(!Object.hasOwn(leagueSchemas,method))error('UNSUPPORTED','지원하지 않는 리그 작업입니다.');const params=leagueSchemas[method].parse(raw.params??{});
   if(!raw.signature&&['league.info','league.snapshot','league.board','community.feed','community.thread'].includes(method)){if(Object.keys(raw).some(k=>!['method','params'].includes(k)))error('AUTH_REQUIRED','서명 형식이 올바르지 않습니다.');return {ok:true,result:{schema_version:1,edition:'edu',server_time:now(),...transaction(()=>dispatch(method,params,null,ip))}};}
   const e=envelopeSchema.parse(raw),{signature,...unsigned}=e;if(Math.abs(now()-e.issued_at)>180000)error('CLOCK_SKEW','기기 시각을 서버와 다시 맞춘 뒤 요청하세요.');
   let d=db.prepare('SELECT * FROM devices WHERE id=?').get(e.device_id),publicKey=d?.public_key;
   if(method==='league.enroll'){const bytes=Buffer.from(params.public_key,'base64url');if(bytes.toString('base64url')!==params.public_key||digest(bytes)!==e.device_id)error('BAD_IDENTITY','공개 키와 기기 ID가 일치하지 않습니다.');if(d&&d.public_key!==params.public_key)error('BAD_IDENTITY','등록 키가 일치하지 않습니다.');publicKey=params.public_key;}
   if(!publicKey)error('AUTH_REQUIRED','기기 등록을 먼저 진행하세요.');const key=createPublicKey({key:Buffer.from(publicKey,'base64url'),format:'der',type:'spki'});
   if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1'||!verify('sha256',Buffer.from(canonical(unsigned)),{key,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')))error('BAD_SIGNATURE','기기 서명을 확인할 수 없습니다.');
   const cacheable=!['league.info','league.snapshot','league.me','league.board','community.feed','community.thread'].includes(method);
   const fingerprint=digest(canonical(unsigned)),previous=cacheable&&db.prepare('SELECT * FROM receipts WHERE device_id=? AND nonce=?').get(e.device_id,e.nonce);
   if(previous){if(previous.digest!==fingerprint)error('REPLAY_CONFLICT','같은 요청 ID에 다른 내용을 사용할 수 없습니다.');return {ok:true,result:{...unseal(previous.result_cipher,'receipt:'+e.device_id+e.nonce),replayed:true}};}
   const result=transaction(()=>{
    db.prepare('DELETE FROM limits WHERE expires_at<?').run(now());db.prepare('DELETE FROM receipts WHERE created_at<?').run(now()-DAY);
    limit('minute:'+e.device_id+':'+Math.floor(now()/60000),90,now()+120000);
    if(method==='league.enroll'&&!d){limit('enroll:'+hmac(ip)+':'+calendar(now()).day,maxEnrollmentsPerIP,calendar(now()).end);if(db.prepare('SELECT count(*) n FROM devices').get().n>=maxDevices)error('STORAGE_LIMIT','신규 기기 등록 한도입니다. 운영자 확인이 필요합니다.');let nickname;for(let i=0;i<40;i++){const b=randomBytes(4);nickname=adjectives[b[0]%adjectives.length]+' '+nouns[b[1]%nouns.length]+' #'+String(b.readUInt16BE(2)%10000).padStart(4,'0');if(!db.prepare('SELECT 1 FROM devices WHERE nickname=?').get(nickname))break;nickname=null;}if(!nickname)error('IDENTITY_FULL','닉네임을 배정하지 못했습니다.');db.prepare('INSERT INTO devices(id,public_key,nickname,created_at) VALUES(?,?,?,?)').run(e.device_id,publicKey,nickname,now());d=db.prepare('SELECT * FROM devices WHERE id=?').get(e.device_id);audit('device.enrolled',d.id);}
    const value={schema_version:1,edition:'edu',server_time:now(),...dispatch(method,params,d,ip)};if(cacheable)db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(e.device_id,e.nonce,fingerprint,seal(value,'receipt:'+e.device_id+e.nonce),now());return value;
   });return {ok:true,result};
  }catch(e){return {ok:false,error:{code:e instanceof z.ZodError?'INVALID_INPUT':e.code||'LEAGUE_ERROR',message:e instanceof z.ZodError?'입력 형식·길이와 허용 필드를 확인하세요.':['ERR_OSSL_UNSUPPORTED','ERR_CRYPTO_INVALID_KEYTYPE'].includes(e.code)?'기기 공개 키 형식이 올바르지 않습니다.':e.message}};}
 }
 return {request,close:()=>db.close(),publish:(day,recipes,origin='operator-imported-ai-recipes',level=1)=>transaction(()=>publish(day,recipes,origin,level)),
  reserveAI(day,level=1){validDay(day);difficultyLevel(level);if(day<=calendar(now()).day)error('FUTURE_DAY_REQUIRED','AI 출제는 아직 열리지 않은 다음 날짜부터 준비하세요.');if(storedPack(day,level))error('PACK_LOCKED','이미 고정된 날짜·난이도의 문제는 바꿀 수 없습니다.');if(level===1)db.prepare("INSERT INTO ai_jobs VALUES(?,'started',NULL,?)").run(day,now());else db.prepare("INSERT INTO difficulty_ai_jobs VALUES(?,?,'started',NULL,?)").run(day,level,now());},
  finishAI(day,status,receipt,level=1){difficultyLevel(level);if(level===1)db.prepare('UPDATE ai_jobs SET status=?,receipt=? WHERE day=?').run(status,JSON.stringify(receipt),day);else db.prepare('UPDATE difficulty_ai_jobs SET status=?,receipt=? WHERE day=? AND level=?').run(status,JSON.stringify(receipt),day,level);},
  moderate({device_id,post_id,blocked,reason}){if(typeof reason!=='string'||reason.length<3||reason.length>300)throw Error('A moderation reason is required.');return transaction(()=>{if(device_id){if(!/^[a-f0-9]{64}$/.test(device_id))throw Error('Invalid device ID');db.prepare('UPDATE devices SET blocked=? WHERE id=?').run(blocked?1:0,device_id);audit('device.moderated',device_id,reason);}else if(Number.isSafeInteger(post_id)){db.prepare('UPDATE posts SET status=? WHERE id=?').run(blocked?'moderated':'visible',post_id);audit('post.moderated',String(post_id),reason);}else throw Error('Choose a device or post.');});}
 };
}
