import {DAYS,LIFTS,NAMES,PARTS,replay,estimate} from './progression.js';

export const isWarmup=key=>['warm1','warm2','warm3'].includes(key);
const mainParts={squat:['하체'],bench:['가슴'],dead:['하체','등']};
export function inferParts(name){
 const n=name.toLowerCase().replace(/\s/g,'');
 const rules=[
  ['하체',/스쿼트|데드리프트|레그|런지|힙|카프|대퇴|둔근|adduction|abduction|squat|deadlift|leg|lunge|calf/],
  ['가슴',/벤치|가슴|체스트|펙덱|bench|chest|pec/],
  ['등',/광배|승모|풀다운|풀업|친업|로우|등|데드리프트|pulldown|pullup|chinup|row|deadlift/],
  ['어깨',/어깨|숄더|레터럴|바이킹|페이스풀|리버스펙덱|리어델트|shoulder|lateral|rear.?delt|overhead/],
  ['팔',/이두|삼두|바벨컬|덤벨컬|프리처|해머컬|푸시다운|트라이셉|biceps|triceps|preacher|hammer.?curl/]
 ];
 const found=rules.filter(([,r])=>r.test(n)).map(([p])=>p);
 if(/플라이|fly/.test(n)&&!found.includes('어깨'))found.push('가슴');
 return PARTS.filter(p=>found.includes(p)&&!(p==='가슴'&&/리버스펙덱|reversepec/.test(n)));
}
export const exerciseParts=a=>a.parts===undefined?inferParts(a.name):a.parts;
const performed=a=>a.done&&a.reps>0;
export function exposure(e){
 const sets=Object.fromEntries(PARTS.map(p=>[p,0])),seen=new Set(),unknown=[];
 const add=(parts,count)=>{for(const p of parts){seen.add(p);sets[p]+=count;}};
 if(e.day<6){const count=e.sets.filter(r=>!isWarmup(r.key)&&!['primer','prepare'].includes(r.key)&&performed(r.actual)).length;if(count)add(mainParts[DAYS[e.day].lift],count);}
 for(const a of e.aux){const count=a.sets.filter(performed).length;if(!count)continue;const parts=exerciseParts(a);if(parts.length)add(parts,count);else unknown.push(a.name);}
 // Free-session selections express exposure, but cannot attribute sets to a muscle.
 if(e.day===6&&e.aux.some(a=>a.sets.some(performed)))for(const p of e.parts)seen.add(p);
 return {sets,seen,unknown};
}
export function buildReports(payload){
 const events=[...payload.events].sort((a,b)=>a.seq-b.seq),workouts=events.filter(e=>e.type==='workout'),reports=[];
 for(let end=12;end<=workouts.length;end+=12){
  const block=workouts.slice(end-12,end),first=block[0],last=block.at(-1);
  const before=events.filter(e=>e.seq<first.seq),through=events.filter(e=>e.seq<=last.seq);
  const startState=replay(payload.baseline,before),endState=replay(payload.baseline,through);
  const parts=Object.fromEntries(PARTS.map(p=>[p,{sessions:0,sets:0}])),unknown=new Set();
  for(const e of block){const x=exposure(e);for(const p of PARTS){parts[p].sessions+=Number(x.seen.has(p));parts[p].sets+=x.sets[p];}x.unknown.forEach(n=>unknown.add(n));}
  const dates=block.map(e=>e.date).sort(),span=Math.round((Date.parse(dates.at(-1))-Date.parse(dates[0]))/86400000);
  const chronological=block.every((e,i)=>!i||e.date>=block[i-1].date);
  const lifts=Object.fromEntries(LIFTS.map(l=>{
   const entries=block.filter(e=>e.day<6&&DAYS[e.day].lift===l);
   const points=entries.map(e=>({date:e.date,value:estimate(e.sets.find(r=>r.key==='scale')?.actual)})).filter(x=>x.value!==null);
   const start=startState.lifts[l].oneRM,finish=endState.lifts[l].oneRM;
   const manual=through.filter(e=>e.seq>=first.seq&&e.type==='manual_1rm_adjustment'&&e.lift===l).length;
   const successes=endState.prHistory.filter(e=>e.lift===l&&block.some(w=>w.id===e.id)&&e.result==='success').length;
   const training=entries.filter(e=>e.sets.some(r=>!isWarmup(r.key)&&!['prepare','primer'].includes(r.key)&&performed(r.actual))).length;
   const hyper=entries.map(e=>e.sets.find(r=>r.key==='hyper1')?.actual).filter(a=>a&&performed(a)).map(a=>({weight:a.weight,reps:a.reps,rir:a.rir}));
   return [l,{start,finish,delta:finish-start,rate:span>=7&&chronological&&!manual?(finish-start)*7/span:null,manual,successes,training,points,hyper,pending:endState.lifts[l].pendingPR}];
  }));
  const ranked=PARTS.slice().sort((a,b)=>parts[a].sessions-parts[b].sessions),zero=ranked.filter(p=>!parts[p].sessions);
  const notes=[];
  if(zero.length)notes.push(`기록상 수행이 없는 부위: ${zero.join(' · ')}. 누락된 종목이나 부위 지정이 있는지 먼저 확인하세요.`);
  if(parts[ranked[0]].sessions!==parts[ranked.at(-1)].sessions)notes.push(`상대적으로 빈도가 낮은 부위: ${ranked.filter(p=>parts[p].sessions===parts[ranked[0]].sessions).join(' · ')}. 다음 12회 계획에서 배분을 확인하세요.`);
  else notes.push('다섯 부위의 기록상 운동 빈도가 같습니다. 세트 수와 실제 수행 강도도 함께 확인하세요.');
  if(unknown.size)notes.push(`부위 미분류 종목: ${[...unknown].join(' · ')}. 기록을 수정해 부위를 지정하면 리포트도 다시 계산됩니다.`);
  for(const l of LIFTS){const x=lifts[l];if(x.training<2)notes.push(`${NAMES[l]}: 본세트 수행 ${x.training}회로 추세 판단 자료가 적습니다.`);else if(!x.delta)notes.push(`${NAMES[l]}: 실제 1RM 변화 없음. 추정 1RM과 반복수 향상 없이 정체를 단정할 수 없습니다.`);}
  reports.push({version:1,id:`${payload.baseline.id}:${end}`,from:end-11,to:end,firstDate:dates[0],lastDate:dates.at(-1),span,chronological,parts,lifts,notes,sourceIds:block.map(e=>e.id)});
 }
 return reports;
}
const signed=n=>`${n>0?'+':''}${Math.round(n*10)/10}`;
export function reportText(r){
 return [`운동 ${r.from}–${r.to}회 리포트`,`${r.firstDate} ~ ${r.lastDate} · ${r.span+1}일`,
  '', '부위별 빈도 / 세트 수',...PARTS.map(p=>`${p}: ${r.parts[p].sessions}/12회 · ${r.parts[p].sets}세트`),
  '완료·1회 이상 본세트 기준. 웜업·준비 세트 제외. 복합종목은 여러 부위에 집계될 수 있으며 간접 자극 전체를 뜻하지 않습니다. 자유운동 선택 부위는 빈도에만 포함됩니다.',
  '', '3대 중량 추이',...LIFTS.flatMap(l=>{const x=r.lifts[l],p=x.points;return [
   `${NAMES[l]}: 실제 1RM ${x.start} → ${x.finish}kg (${signed(x.delta)}kg) · 본세트 수행 ${x.training}회`,
   `증량 속도: ${x.rate===null?'산출 보류 (7일 미만·날짜 역순·수동 변경 여부 확인)':signed(x.rate)+'kg/주 (관찰 기간 환산, 향후 예측 아님)'} · PR 성공 ${x.successes}회 · 수동 변경 ${x.manual}회`,
   `척도 e1RM: ${p.length>=2?`${p[0].value} → ${p.at(-1).value}kg (${signed(p.at(-1).value-p[0].value)}kg), ${p.length}개 관측`:p.length?'1개 관측 · 비교 자료 부족':'관측 없음'}${x.pending?' · 다음 PR '+x.pending+'kg 예약':''}`,
   `근비대 첫 본세트: ${x.hyper.length>=2?[x.hyper[0],x.hyper.at(-1)].map(a=>`${a.weight}kg × ${a.reps}회 (RIR ${a.rir})`).join(' → '):'비교 자료 부족'}`];}),
  'e1RM은 기존 앱의 척도 세트 계산식에 따른 추정치이며 실제 1RM과 구분합니다.',
  '', '다음 12회에서 확인할 점',...r.notes,
  '', '저장 완료 순서로 12회씩 집계합니다. 과거 기록 수정·삭제 시 재계산됩니다. 빈도가 낮다는 이유만으로 근육 발달 부족이나 운동 효과를 판정하지 않습니다.'
 ].join('\n');
}
