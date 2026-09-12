import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline,replay,plan,emptyActual} from '../progression.js';
import {validate,migrate} from '../schema.js';
import {buildReports,exposure,inferParts,reportText} from '../reports.js';
import {seal,verify} from '../db.js';
const base=baseline();
function workout(seq,day=0){return {id:`w${seq}`,seq,type:'workout',date:`2026-08-${String(seq).padStart(2,'0')}`,createdAt:'2026-08-01T00:00:00Z',note:'',day,ruleVersion:1,parts:day===6?['팔']:[],condition:{overall:3,fatigue:3,sleep:3,soreness:1,note:''},oneRMAtStart:base.oneRM,prResult:'none',sets:plan(day,replay(base,[])),aux:[]};}
const done=(rir=1)=>({...emptyActual(),weight:50,reps:6,rir,done:true});
const payload=events=>({schemaVersion:1,baseline:base,events});
test('warmups allow null RIR, but work and auxiliary sets still require it',()=>{
 const e=workout(1);for(const r of e.sets.filter(r=>r.key.startsWith('warm')))r.actual=done(null);
 assert.doesNotThrow(()=>validate(payload([e])));
 e.sets.find(r=>r.key==='scale').actual=done(null);assert.throws(()=>validate(payload([e])),/RIR/);
 e.sets.find(r=>r.key==='scale').actual=done();e.aux=[{id:'a',name:'컬',sets:[done(),done(null)]}];assert.throws(()=>validate(payload([e])),/RIR/);
 e.aux[0].sets[1].rir=1;assert.doesNotThrow(()=>validate(payload([e])));
 e.sets[0].actual.rir=11;assert.throws(()=>validate(payload([e])),/rir/);
});
test('old schema, hash verification, export-shaped round trip preserve null and parts',async()=>{
 const e=workout(1);e.sets[0].actual=done(null);e.aux=[{id:'a',name:'custom',parts:['어깨'],sets:[done()]}];
 const p=payload([e]);assert.deepEqual(migrate(p),p);
 const updated={...p,reports:buildReports(p)};const sealed=await seal(updated,2);assert.deepEqual((await verify(JSON.parse(JSON.stringify(sealed)))).payload,updated);
 e.aux[0].parts=['없는부위'];assert.throws(()=>validate(p),/부위/);
});
test('only performed work counts; a muscle counts once per workout; explicit mapping wins',()=>{
 const e=workout(1);e.sets[0].actual=done(null);assert.equal(exposure(e).seen.size,0);
 e.sets.find(r=>r.key==='scale').actual=done();e.aux=[{id:'a',name:'레그프레스',sets:[done(),done()]},{id:'b',name:'custom',parts:['어깨'],sets:[done()]}];
 const x=exposure(e);assert.equal(x.sets['하체'],3);assert.equal(x.seen.size,2);assert.equal(x.sets['어깨'],1);
 assert.deepEqual(inferParts('리버스 펙덱'),['어깨']);assert.deepEqual(inferParts('레그컬'),['하체']);
 const free=workout(2,6);free.aux=[{id:'x',name:'모르는운동',sets:[done()]}];assert.deepEqual([...exposure(free).seen],['팔']);assert.deepEqual(exposure(free).unknown,['모르는운동']);
});
test('12 and 24 boundaries, edits, deletions, manual events and estimates',()=>{
 const events=Array.from({length:24},(_,i)=>{const e=workout(i+1);e.sets.find(r=>r.key==='scale').actual={...done(),weight:50+i};return e;});
 assert.equal(buildReports(payload(events.slice(0,11))).length,0);
 assert.equal(buildReports(payload(events.slice(0,12))).length,1);
 let reports=buildReports(payload(events));assert.equal(reports.length,2);assert.deepEqual(reports.map(r=>[r.from,r.to]),[[1,12],[13,24]]);
 assert.equal(reports[0].parts['하체'].sessions,12);assert.equal(reports[0].lifts.bench.points.length,0);assert.match(reportText(reports[0]),/기록상 수행이 없는 부위/);
 events[0].sets.find(r=>r.key==='scale').actual.weight=40;reports=buildReports(payload(events));assert.equal(reports[0].lifts.squat.points[0].value,49.3);
 assert.equal(buildReports(payload(events.slice(1))).length,1);
 events.forEach(e=>e.seq*=2);events.push({id:'manual',seq:5,type:'manual_1rm_adjustment',date:'2026-08-03',createdAt:'2026-08-03',note:'',lift:'squat',value:105});
 reports=buildReports(payload(events));assert.equal(reports.length,2);assert.equal(reports[0].lifts.squat.manual,1);assert.equal(reports[0].lifts.squat.delta,5);assert.equal(reports[0].lifts.squat.rate,null);
 events[2].date='2026-07-01';assert.equal(buildReports(payload(events))[0].chronological,false);
});
