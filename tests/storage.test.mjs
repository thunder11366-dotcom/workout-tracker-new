import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {Ledger,SNAPSHOT_LIMIT} from '../db.js';
import {updateExercise} from '../exercises.js';
globalThis.indexedDB=indexedDB;
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
test('bounded snapshots, export/import catalog roundtrip, conflicts preserve root',async()=>{
 const l=new Ledger({name:'storage-test'});await l.open();await l.initialize();
 try{
 for(let i=0;i<15;i++)await l.write(updateExercise(l.record.payload,'main:squat',{name:'스쿼트 '+i}),'rename');
 let snapshots=await l.snapshots();assert.equal(snapshots.length,SNAPSHOT_LIMIT);assert.ok(snapshots.every(s=>s.record.revision>=6));assert.equal(l.record.revision,16);
 for(let i=0;i<3;i++)await l.snapshot('preview');assert.equal((await l.snapshots()).length,10);
 const raw=await l.export(),p=await l.importPreview(raw);assert.deepEqual(p,l.record.payload);assert.equal((await l.snapshots()).length,10);
 const original=structuredClone(l.record);await assert.rejects(()=>l.write(l.record.payload,'stale',1),/다른 탭/);assert.deepEqual(await l.readRoot(),original);
 await l.restore(p);assert.deepEqual(l.record.payload,p);assert.equal((await l.snapshots()).length,10);
 }finally{l.db.close();l.channel?.close();}
});
