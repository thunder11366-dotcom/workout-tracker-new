import {uuid} from './crypto-utils.js';
export const APP_VERSION='1.0.1';
export const DATA_SCHEMA_VERSION=1;
export const CACHE_VERSION='app-shell-2';
export const RULE_VERSION=1;
export const LIFTS=['squat','bench','dead'];
export const NAMES={squat:'스쿼트',bench:'벤치프레스',dead:'데드리프트'};
export const PARTS=['가슴','등','어깨','하체','팔'];
export const DAYS=[
 {name:'스쿼트 척도',focus:'하체 중심',lift:'squat',mode:'scale',aux:['레그 익스텐션','레그프레스','Abduction + Adduction 슈퍼세트','바벨컬']},
 {name:'벤치 근비대',focus:'어깨 중심',lift:'bench',mode:'hypertrophy',aux:['윗가슴 1종목','스미스 숄더프레스','사이드 레터럴 레이즈','후면어깨']},
 {name:'데드 척도',focus:'등 중심',lift:'dead',mode:'scale',aux:['광배 1종목','승모/등 1','승모/등 2','프리처컬']},
 {name:'스쿼트 근비대',focus:'팔 중심',lift:'squat',mode:'hypertrophy',aux:['Adduction','이두 1','이두 2','삼두 1','삼두 2']},
 {name:'벤치 척도',focus:'가슴 중심',lift:'bench',mode:'scale',aux:['윗가슴 1','윗가슴 2','플라이','바이킹프레스','사이드 레터럴 레이즈']},
 {name:'데드 근비대',focus:'대퇴이두 중심',lift:'dead',mode:'hypertrophy',aux:['시티드 레그컬','광배 1종목','승모/등 1종목','프리처컬']}
];
export const round5=n=>Math.max(20,Math.floor(n/5+0.5)*5);
export const floor5=n=>Math.max(20,Math.floor(n/5)*5);
export const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const baseline=()=>({id:uuid(),createdAt:new Date().toISOString(),oneRM:{squat:100,bench:80,dead:120},settings:{units:'kg',step:5,bar:20}});
export const emptyActual=()=>({weight:null,reps:null,rir:null,done:false,technique:true,note:''});
const row=(key,name,purpose,weight,min,max,rir)=>({key,name,purpose,weight,min,max,rir,actual:emptyActual()});
export function plan(day,state,deferPR=false){
 if(day===6)return [];
 const d=DAYS[day],s=state.lifts[d.lift],rm=s.oneRM,dead=d.lift==='dead';
 const scale=round5(rm*.8+s.scaleOffset),base=round5(rm*.7+s.hyperOffset);
 const work=d.mode==='scale'?scale:base;
 const rows=[row('warm1','웜업 1','동작과 가동범위 확인',floor5(Math.min(rm*.4,work*.65)),5,5,5),row('warm2','웜업 2','작업중량 준비',floor5(Math.min(rm*.6,work*.85)),3,3,4)];
 if(d.mode==='hypertrophy')return [...rows,
 row('hyper1','Set 1 · 장력','기계적 장력',base,6,8,dead?3:2),
 row('hyper2','Set 2 · 주 볼륨','주 볼륨 확보',base,dead?6:8,dead?8:10,dead?3:2),
 row('hyper3','Set 3 · 백오프','피로를 제한한 추가 볼륨',round5(base-5),dead?6:10,dead?8:12,3)];
 rows.push(row('warm3','웜업 3','고중량 전 준비',floor5(rm*.75),1,1,4));
 if(s.pendingPR&&!deferPR){
 rows.push(row('prepare','PR 준비','빠른 1회 · RPE 7 이하, 무거우면 중단',floor5(rm*.85),1,1,3));
 rows.push(row('pr','PR 도전','사용자가 성공 판정 · 안전바/보조자 확보',s.pendingPR,1,1,0));
 }else{
 rows.push(row('primer','모래주머니 효과 세트','Primer · RPE 7 이하 · 필요 시 감량/생략',floor5(rm*.85),1,1,3));
 rows.push(row('scale','1RM 척도 세트','기준 6회 · RIR 1에서 종료 · 실패 금지',scale,5,8,1));
 }
 rows.push(row('backoff','근비대 백오프','추가 볼륨 · 무거우면 감량',floor5(rm*(dead?.65:.7)),dead?6:8,dead?8:12,dead?3:2));
 return rows;
}
export function estimate(a){return a?.done&&a.technique&&a.reps>=5&&a.reps<=8&&a.rir>=0&&a.rir<=2&&a.weight>0?Math.round(a.weight*(1+(a.reps+a.rir)/30)*10)/10:null;}
export function replay(base,events){
 const state={next:0,count:0,cycleCount:0,freeCount:0,lifts:{},prHistory:[],outcomes:{}};
 for(const l of LIFTS)state.lifts[l]={oneRM:base.oneRM[l],scaleOffset:0,hyperOffset:0,pendingPR:null,ready:0,failures:0};
 // Sequence is completion order, independent of edited calendar dates.
 for(const e of [...events].sort((a,b)=>a.seq-b.seq)){
 if(e.type==='manual_1rm_adjustment'){
 const old=state.lifts[e.lift].oneRM;
 state.lifts[e.lift]={oneRM:e.value,scaleOffset:0,hyperOffset:0,pendingPR:null,ready:0,failures:0};
 state.outcomes[e.id]={message:`${NAMES[e.lift]} ${old} → ${e.value}kg · 진행 기준 재설정`};continue;
 }
 state.count++;
 if(e.day===6){state.freeCount++;state.outcomes[e.id]={message:'자유운동 기록 · 3대 진행 유지'};continue;}
 state.cycleCount++;state.next=(e.day+1)%6;
 const d=DAYS[e.day],s=state.lifts[d.lift];
 const out={message:'중량 유지',e1RM:null};state.outcomes[e.id]=out;
 if(d.mode==='hypertrophy'){
 const expected=plan(e.day,state).filter(r=>r.key.startsWith('hyper'));
 const pass=expected.every(r=>{const a=e.sets.find(x=>x.key===r.key)?.actual;return a?.done&&a.technique&&a.weight>=r.weight&&a.reps>=r.max&&a.rir>=r.rir;});
 if(pass){s.hyperOffset+=5;out.message='근비대 3세트 통과 · 다음 +5kg';}continue;
 }
 const pr=e.sets.find(r=>r.key==='pr');
 if(pr){
 const a=pr.actual,target=s.pendingPR;
 if(!target||pr.weight!==target||a.weight!==target){out.message='과거 변경으로 PR 자격/중량 불일치 · 1RM 반영 제외';continue;}
 if(!a.done||e.prResult==='deferred'){out.message='PR 보류 · 같은 목표 유지';continue;}
 if(e.prResult==='success'&&a.technique&&a.reps>=1){
 state.prHistory.push({id:e.id,date:e.date,lift:d.lift,target,result:'success'});
 s.oneRM=target;s.pendingPR=null;s.scaleOffset=0;s.hyperOffset=0;s.ready=0;s.failures=0;out.message=`PR 성공 · 실제 1RM ${target}kg · 척도 평가 복귀`;
 }else if(e.prResult==='failure'){
 s.failures++;state.prHistory.push({id:e.id,date:e.date,lift:d.lift,target,result:'failure'});
 if(s.failures>=2){s.pendingPR=null;s.ready=0;s.failures=0;out.message='PR 2회 실패 · 척도 평가로 복귀';}
 else out.message=`PR 실패 · 다음 척도일 ${target}kg 재도전`;
 }else out.message='PR 결과 미충족 · 목표 유지';
 continue;
 }
 const a=e.sets.find(r=>r.key==='scale')?.actual;
 const est=estimate(a);out.e1RM=est;
 if(s.pendingPR){out.message='PR 보류 후 척도 기록 · 예약 유지';continue;}
 const qualified=est!==null&&a.reps>=6&&a.rir>=1&&est>=(s.oneRM+5)*1.025;
 s.ready=qualified?s.ready+1:0;
 if(a?.done&&a.technique&&a.reps>=8&&a.rir>=1&&a.weight>=round5(s.oneRM*.8+s.scaleOffset)){s.scaleOffset+=5;out.message='척도 상한 달성 · 다음 척도 +5kg';}
 if(s.ready>=2){s.pendingPR=s.oneRM+5;s.ready=0;out.message=`척도 2회 확인 · 다음 ${s.pendingPR}kg PR 예약`;}
 else if(qualified)out.message+=' · PR 근거 1/2회';
 }
 return state;
}
