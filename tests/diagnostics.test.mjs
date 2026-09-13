import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDiagnostics,summarizeRecord} from '../diagnostics.js';
import {baseline} from '../progression.js';
import {seal} from '../db.js';

test('diagnostic is read-only and omits workout contents and URL query',async()=>{
 const record=await seal({schemaVersion:1,baseline:baseline(),events:[]},1),snapshot=structuredClone(record);
 const ledger={name:'kovea-workout-ledger',marker:'marker',mirrorKey:'mirror',recovery:false,error:'',readRoot:async()=>record,snapshots:async()=>[{createdAt:'now',record}],draft:async()=>({savedAt:'now',revision:1,value:{date:'2026-09-13',note:'PRIVATE NOTE',sets:[]}}),metaGet:async()=>({revision:1})};
 const env={location:{origin:'https://example.test',pathname:'/app/',search:'?secret=PASSWORD'},localStorage:{getItem:k=>k==='mirror'?JSON.stringify(record):JSON.stringify({dataset:'a',revision:1,savedAt:'now'})},indexedDB:{databases:async()=>[{name:'kovea-workout-ledger',version:1}]},navigator:{userAgent:'test',onLine:true,storage:{persisted:async()=>true,estimate:async()=>({usage:123})},serviceWorker:{getRegistrations:async()=>[]}},matchMedia:()=>({matches:true})};
 const result=await collectDiagnostics(ledger,env);
 assert.equal(result.root.integrity,'valid');assert.equal(result.root.eventCount,0);assert.equal(result.mirror.revision,1);assert.equal(result.snapshots.count,1);assert.equal(result.storage.persisted,true);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE NOTE|PASSWORD|oneRM|settings/);assert.deepEqual(record,snapshot);
});
test('missing or unreadable storage remains visible without a write or initialization',async()=>{
 const ledger={name:'test',readRoot:async()=>null,snapshots:async()=>[],draft:async()=>null,metaGet:async()=>null};
 const result=await collectDiagnostics(ledger,{});assert.equal(result.root.present,false);assert.ok(result.mirror.error);assert.equal(result.storage.databases,'unavailable');
 assert.deepEqual(summarizeRecord(null),{present:false});
 const r=summarizeRecord({revision:2,payload:{events:[{type:'workout',date:'2026-09-12',note:'SECRET',aux:['PRIVATE']}]}});assert.equal(r.workoutCount,1);assert.doesNotMatch(JSON.stringify(r),/SECRET|PRIVATE/);
});
