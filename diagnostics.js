import {APP_VERSION,DATA_SCHEMA_VERSION} from './progression.js';
import {verify} from './db.js';

// Export storage evidence, never exercise details, notes, or account credentials.
export function summarizeRecord(record){
 if(!record)return {present:false};
 const p=record.payload,events=Array.isArray(p?.events)?p.events:[];
 return {present:true,revision:record.revision??null,dataset:p?.baseline?.id??null,
  createdAt:p?.baseline?.createdAt??null,eventCount:events.length,
  workoutCount:events.filter(e=>e?.type==='workout').length,
  lastWorkoutDate:events.filter(e=>e?.type==='workout'&&typeof e.date==='string').map(e=>e.date).sort().at(-1)??null};
}
async function recordEvidence(record){
 const summary=summarizeRecord(record);
 if(record){try{await verify(record);summary.integrity='valid';}catch(e){summary.integrity='invalid';summary.error=e.message;}}
 return summary;
}
const read=async fn=>{try{return await fn();}catch(e){return {error:e.message};}};
export async function collectDiagnostics(ledger,env=globalThis){
 const current=await read(()=>ledger.readRoot());
 const root=current?.error?current:await recordEvidence(current);
 const mirror=await read(async()=>{const raw=env.localStorage.getItem(ledger.mirrorKey);return raw?recordEvidence(JSON.parse(raw)):{present:false};});
 const marker=await read(()=>{const raw=env.localStorage.getItem(ledger.marker);if(!raw)return null;const m=JSON.parse(raw);return {dataset:m.dataset,revision:m.revision,savedAt:m.savedAt};});
 const snapshots=await read(async()=>{const all=await ledger.snapshots();return {count:all.length,records:all.slice(0,20).map(s=>({savedAt:s.createdAt,...summarizeRecord(s.record)}))};});
 const draft=await read(async()=>{const d=await ledger.draft();return d?{present:true,savedAt:d.savedAt,revision:d.revision,date:d.value?.date,completedSets:(d.value?.sets??[]).filter(s=>s.actual?.done).length}:{present:false};});
 const databases=await read(async()=>typeof env.indexedDB?.databases==='function'?(await env.indexedDB.databases()).map(d=>({name:d.name,version:d.version})):'unavailable');
 const serviceWorkers=await read(async()=>typeof env.navigator?.serviceWorker?.getRegistrations==='function'?(await env.navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.scriptURL??null,waiting:r.waiting?.scriptURL??null})):'unavailable');
 return {format:'record-storage-diagnostics',generatedAt:new Date().toISOString(),appVersion:APP_VERSION,schema:DATA_SCHEMA_VERSION,
  environment:{origin:env.location?.origin,path:env.location?.pathname,userAgent:env.navigator?.userAgent,standalone:env.matchMedia?.('(display-mode: standalone)').matches??false,online:env.navigator?.onLine},
  storage:{databaseName:ledger.name,persisted:await read(()=>env.navigator.storage.persisted()),estimate:await read(()=>env.navigator.storage.estimate()),databases},
  root,mirror,marker,snapshots,draft,witness:await read(()=>ledger.metaGet('witness')),serviceWorkers,
  recovery:{active:ledger.recovery,error:ledger.error},
  limitation:'현재 브라우저·사이트의 저장소만 확인합니다. 다른 브라우저나 이미 삭제된 저장소는 확인할 수 없습니다. 긴급 미러가 있어도 현재 빈 기록의 사본일 수 있습니다.'};
}
