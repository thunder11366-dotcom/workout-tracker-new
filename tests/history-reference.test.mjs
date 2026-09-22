import test from 'node:test';
import assert from 'node:assert/strict';
import {historyPlan,previousMain,previousAux,exerciseCatalog} from '../history-reference.js';
import {baseline,emptyActual,replay} from '../progression.js';
import {validate} from '../schema.js';
import {seal,verify} from '../db.js';
const base=baseline();
const done={...emptyActual(),weight:62.5,reps:9,rir:1,done:true};
const event=(seq,day,date)=>({id:'e'+seq,seq,day,date,type:'workout',ruleVersion:2,createdAt:date,note:'',parts:day===6?['하체']:[],condition:{overall:3,fatigue:3,sleep:3,soreness:1,note:''},oneRMAtStart:base.oneRM,prResult:'none',sets:historyPlan(day),aux:[{id:'a'+seq,name:'너틸러스 어드덕션',sets:[{...done},emptyActual(),{...done,reps:7}]}]});
test('same day type only, dates then sequence; exclude self and future on edit',()=>{
 const events=[event(1,0,'2026-09-01'),event(2,3,'2026-09-02'),event(3,0,'2026-09-03'),event(4,0,'2026-08-01')];events.forEach(e=>e.sets[0].actual={...done});
 assert.equal(previousMain(events,{id:'new',seq:0,date:'2026-09-04',day:0}).id,'e3');
 assert.equal(previousMain(events,events[2]).id,'e1');
 assert.equal(previousMain(events,{id:'new',seq:0,date:'2026-09-04',day:4}),null);
});
test('auxiliary search spans day types, preserves set positions, normalizes spacing only',()=>{
 const e=event(1,6,'2026-09-01'),current={id:'new',seq:0,date:'2026-09-02'};
 const ref=previousAux([e],current,' 너틸러스어드덕션 ');assert.equal(ref.exercise.sets.length,3);assert.equal(ref.exercise.sets[1].done,false);assert.equal(ref.exercise.sets[2].reps,7);
 assert.equal(previousAux([e],current,'너틸러스 힙 어드덕션'),null);
 assert.deepEqual(exerciseCatalog([e],{aux:[{name:'너틸러스어드덕션'}]}),['너틸러스어드덕션']);
});
test('new plans have no prescribed load/reps, retain blank actuals, validate and roundtrip',async()=>{
 const events=Array.from({length:7},(_,i)=>event(i+1,i,'2026-09-01'));
 for(const e of events){assert.ok(e.sets.every(r=>r.weight===null&&r.min===null&&r.max===null&&r.actual.weight===null));assert.ok(!e.sets.some(r=>r.key==='pr'));}
 const p={schemaVersion:1,baseline:base,events};validate(p);assert.deepEqual((await verify(await seal(p,3))).payload,p);
 const state=replay(base,events);assert.equal(state.count,7);assert.equal(state.lifts.squat.oneRM,100);assert.equal(state.lifts.squat.pendingPR,null);assert.doesNotMatch(state.outcomes.e1.message,/5kg|예약/);
});
