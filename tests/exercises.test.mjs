import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline,emptyActual} from '../progression.js';
import {historyPlan,previousAux} from '../history-reference.js';
import {exercises,exerciseKey,updateExercise,recentExercise,targetRir} from '../exercises.js';
import {validate} from '../schema.js';
import {seal,verify} from '../db.js';
const base=baseline(),done={...emptyActual(),weight:50,reps:8,rir:2,done:true};
function payload(){return {schemaVersion:1,baseline:base,events:Array.from({length:5},(_,i)=>({id:'e'+i,seq:i+1,day:i%2?3:0,date:`2026-09-${10+i}`,type:'workout',ruleVersion:2,createdAt:'2026-09-10',note:'',parts:[],condition:{overall:3,fatigue:3,sleep:3,soreness:1,note:''},oneRMAtStart:base.oneRM,prResult:'none',sets:historyPlan(i%2?3:0).map(r=>({...r,actual:{...done}})),aux:[{id:'a'+i,name:'너틸러스 어드덕션',sets:[{...done}]}]}))};}
test('history limits display to latest 3; mode filters; original 5 workouts intact',()=>{
 const p=payload(),original=JSON.stringify(p);assert.deepEqual(recentExercise(p,'main:squat').map(x=>x.event.seq),[5,4,3]);assert.deepEqual(recentExercise(p,'main:squat','scale').map(x=>x.event.seq),[5,3,1]);assert.equal(recentExercise(p,'aux:너틸러스어드덕션').length,3);assert.equal(JSON.stringify(p),original);
});
test('rename and list removal survive sealed backup with history and identity intact',async()=>{
 const p=payload(),key=exerciseKey(p.events[0].aux[0]);let q=updateExercise(p,key,{name:'내전근 머신'});q=updateExercise(q,key,{hidden:true});validate(q);
 assert.deepEqual(q.events,p.events);assert.ok(!exercises(q).some(a=>a.key===key));assert.equal(exercises(q,{hidden:true}).find(a=>a.key===key).name,'내전근 머신');
 const restored=(await verify(JSON.parse(JSON.stringify(await seal(q,4))))).payload;assert.deepEqual(restored,q);assert.equal(recentExercise(restored,key).length,3);
 const ref=previousAux(restored.events,{id:'new',date:'2026-09-22',seq:0},{name:'내전근 머신',exerciseKey:key});assert.equal(ref.event.seq,5);
 q=updateExercise(q,key,{hidden:false});assert.ok(exercises(q).some(a=>a.key===key));assert.throws(()=>updateExercise(q,key,{name:'스쿼트'}),/같은 이름/);
 q=updateExercise(q,'main:squat',{name:'백스쿼트'});assert.equal(recentExercise(q,'main:squat').length,3);assert.deepEqual(q.events,p.events);
});
test('RIR is guidance only, main-only targets match previous program',()=>{
 assert.equal(targetRir(0,'scale'),1);assert.equal(targetRir(0,'backoff'),2);assert.equal(targetRir(2,'backoff'),3);assert.equal(targetRir(1,'hyper1'),2);assert.equal(targetRir(5,'hyper1'),3);assert.equal(targetRir(1,'hyper3'),3);assert.equal(targetRir(0,'warm1'),5);assert.equal(targetRir(6,'scale'),null);assert.ok(historyPlan(0).every(r=>r.actual.rir===null&&r.rir===null));
});
