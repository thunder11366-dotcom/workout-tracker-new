import {DATA_SCHEMA_VERSION,LIFTS,PARTS,DAYS} from './progression.js';
const fail=m=>{throw new Error(`데이터 검증 실패: ${m}`);};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const num=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const str=(x,max=20000)=>typeof x==='string'&&x.length<=max;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
function actual(a){
 if(!obj(a)||typeof a.done!=='boolean'||typeof a.technique!=='boolean'||!str(a.note))fail('실제 세트 형식');
 for(const [k,max] of [['weight',2000],['reps',1000],['rir',10]])if(a[k]!==null&&!num(a[k],0,max))fail(`세트 ${k}`);
 if(a.reps!==null&&!Number.isInteger(a.reps))fail('반복수는 정수');
 if(a.done&&['weight','reps','rir'].some(k=>a[k]===null))fail('완료 세트의 중량·반복·RIR 누락');
}
export function validate(p){
 if(!obj(p)||p.schemaVersion!==DATA_SCHEMA_VERSION)fail('지원하지 않는 schema; 원본을 보관하고 호환 버전에서 복구하세요');
 if(!obj(p.baseline)||!str(p.baseline.id,100)||!str(p.baseline.createdAt)||!obj(p.baseline.settings))fail('baseline');
 if(p.baseline.settings.units!=='kg'||p.baseline.settings.step!==5||p.baseline.settings.bar!==20)fail('기본 설정');
 for(const l of LIFTS)if(!num(p.baseline.oneRM?.[l],20,1000)||p.baseline.oneRM[l]%5)fail('초기 1RM');
 if(!Array.isArray(p.events)||p.events.length>100000)fail('이벤트 목록');
 const ids=new Set(),seqs=new Set();
 for(const e of p.events){
 if(!obj(e)||!str(e.id,100)||!e.id||ids.has(e.id)||!Number.isSafeInteger(e.seq)||e.seq<1||seqs.has(e.seq)||!date(e.date)||!str(e.createdAt)||!str(e.note))fail('이벤트 식별자/순서/날짜/메모');
 ids.add(e.id);seqs.add(e.seq);
 if(e.type==='manual_1rm_adjustment'){
 if(!LIFTS.includes(e.lift)||!num(e.value,20,1000)||e.value%5)fail('수동 1RM');continue;
 }
 if(e.type!=='workout'||!Number.isInteger(e.day)||e.day<0||e.day>6||e.ruleVersion!==1)fail('운동/규칙 버전');
 if(!Array.isArray(e.parts)||new Set(e.parts).size!==e.parts.length||e.parts.some(x=>!PARTS.includes(x))||(e.day===6&&!e.parts.length))fail('운동 부위');
 if(!obj(e.condition)||!str(e.condition.note))fail('컨디션');
 for(const k of ['overall','fatigue','sleep','soreness'])if(!num(e.condition[k],1,5)||!Number.isInteger(e.condition[k]))fail('컨디션 척도');
 for(const l of LIFTS)if(!num(e.oneRMAtStart?.[l],20,1000))fail('당시 1RM');
 if(!['none','success','failure','deferred'].includes(e.prResult))fail('PR 결과');
 if(!Array.isArray(e.sets)||e.sets.length>30)fail('추천 세트');
 const keys=new Set();
 for(const r of e.sets){
 if(!str(r.key,50)||keys.has(r.key)||!str(r.name,200)||!str(r.purpose,1000)||!num(r.weight,20,2000)||r.weight%5||!num(r.min,1,100)||!num(r.max,r.min,100)||!num(r.rir,0,10))fail('추천 세트 형식');
 keys.add(r.key);actual(r.actual);
 }
 if(e.day===6&&e.sets.length)fail('자유운동에 3대 추천 세트 포함');
 if(e.day<6){const mode=DAYS[e.day].mode;
 const expected=mode==='hypertrophy'?['warm1','warm2','hyper1','hyper2','hyper3']:
 keys.has('pr')?['warm1','warm2','warm3','prepare','pr','backoff']:['warm1','warm2','warm3','primer','scale','backoff'];
 if(expected.length!==keys.size||expected.some(k=>!keys.has(k)))fail('프로그램 세트 누락/중복');
 }
 const pr=e.sets.find(r=>r.key==='pr');
 if(!pr&&e.prResult!=='none')fail('PR 없는 세션의 PR 결과');
 if(pr&&e.prResult==='none')fail('PR 결과를 선택하세요');
 if(pr&&e.prResult==='success'&&(!pr.actual.done||!pr.actual.technique||pr.actual.reps<1||pr.actual.weight!==pr.weight))fail('PR 성공 조건');
 if(pr&&e.prResult==='failure'&&(!pr.actual.done||pr.actual.weight!==pr.weight))fail('PR 실패 세트 기록');
 if(!Array.isArray(e.aux)||e.aux.length>100)fail('보조운동');
 for(const a of e.aux){if(!str(a.id,100)||!str(a.name,200)||!a.name.trim()||!Array.isArray(a.sets)||a.sets.length>100)fail('보조운동 형식');a.sets.forEach(actual);}
 if(!e.sets.some(r=>r.actual.done)&&!e.aux.some(x=>x.sets.some(a=>a.done)))fail('완료된 세트가 없습니다');
 }
 return p;
}
export function migrate(p){
 // v1 is the first public schema. Never invent a conversion for an unknown format.
 if(p?.schemaVersion===1)return validate(structuredClone(p));
 throw new Error('명시적인 migration이 없는 데이터입니다. 원본을 변경하지 않았습니다.');
}
