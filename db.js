import {uuid,sha256} from './crypto-utils.js';
import {APP_VERSION,DATA_SCHEMA_VERSION,baseline,replay} from './progression.js';
import {validate,migrate} from './schema.js';
// Stable names: NEVER derive the database name/version from APP_VERSION.
export const DB_NAME='kovea-workout-ledger';
const MARKER='kovea-workout-used',MIRROR='kovea-workout-emergency';
export class RecoveryError extends Error{}
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const committed=t=>new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=()=>reject(t.error||new Error('transaction aborted'));t.onerror=()=>{};});
const lsGet=k=>{try{return localStorage.getItem(k);}catch{return null;}};
export async function seal(payload,revision){return {revision,hash:await sha256(JSON.stringify(payload)),payload};}
export async function verify(record){
 if(!record||!Number.isSafeInteger(record.revision)||record.revision<1||typeof record.hash!=='string')throw new RecoveryError('저장 레코드 형식 오류');
 const sealed=await seal(record.payload,record.revision);
 if(sealed.hash!==record.hash)throw new RecoveryError('체크섬 불일치: 기록 손상 감지');
 try{migrate(record.payload);}catch(e){throw new RecoveryError(e.message);}return record;
}
export class Ledger{
 constructor({name=DB_NAME}={}){this.name=name;this.marker=name===DB_NAME?MARKER:name+'-used';this.mirrorKey=name===DB_NAME?MIRROR:name+'-mirror';this.db=null;this.record=null;this.recovery=false;this.error='';this.mirrorWarning='';this.channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(this.name+'-changes'):null;this.channel?.addEventListener('message',()=>this.onExternalChange?.());}
 async open(){
 try{
 const request=indexedDB.open(this.name,1);
 request.onupgradeneeded=e=>{if(e.oldVersion===0){for(const s of ['ledger','snapshots','drafts','meta'])request.result.createObjectStore(s);}else{request.transaction.abort();}};
 request.onblocked=()=>{this.onBlocked?.();};
 this.db=await req(request);
 this.db.onversionchange=()=>{this.db.close();this.recovery=true;this.error='다른 탭에서 DB 버전 변경 감지 · 다시 열어주세요';this.onExternalChange?.();};
 const root=await this.readRoot();
 if(!root){
 const tx=this.db.transaction(['snapshots','meta'],'readonly');const done=committed(tx);
 const [snapCount,witness]=await Promise.all([req(tx.objectStore('snapshots').count()),req(tx.objectStore('meta').get('witness'))]);await done;
 if(lsGet(this.marker)||lsGet(this.mirrorKey)||snapCount||witness)throw new RecoveryError('기존 사용 흔적은 있으나 원본 기록이 없습니다.');
 return null; // Explicit first-run setup; opening never writes an empty ledger.
 }
 this.record=await verify(root);
 const witness=await this.metaGet('witness');
 if(witness&&(witness.revision!==root.revision||witness.hash!==root.hash))throw new RecoveryError('DB 저장 이력과 원본이 일치하지 않습니다.');
 const marker=lsGet(this.marker);
 if(marker){let m;try{m=JSON.parse(marker);}catch{throw new RecoveryError('저장 흔적 JSON 오류');}if(m.dataset===root.payload.baseline.id&&m.revision>root.revision)throw new RecoveryError('이전보다 오래된 데이터가 감지되었습니다.');}
 return this.record.payload;
 }catch(e){this.recovery=true;this.error=e.message;throw new RecoveryError(e.message);}
 }
 async readRoot(){const tx=this.db.transaction('ledger','readonly'),done=committed(tx);const value=await req(tx.objectStore('ledger').get('root'));await done;return value;}
 async initialize(){if(this.recovery||this.record)throw new Error('초기화가 허용되지 않습니다.');const p={schemaVersion:DATA_SCHEMA_VERSION,baseline:baseline(),events:[]};await this.write(p,'최초 설정',null);return p;}
 async write(payload,reason,expected=this.record?.revision??null,allowRecovery=false,clearDraft=false,expectedContent=undefined){
 if(this.recovery&&!allowRecovery)throw new RecoveryError('복구 모드에서는 일반 저장이 중지됩니다.');validate(payload);
 let before;
 try{before=await this.readRoot();if(!allowRecovery){if(before)await verify(before);else if(expected!==null)throw new RecoveryError('저장 직전 원본 누락 감지');}}
 catch(e){this.recovery=true;this.error=e.message;throw new RecoveryError(e.message);}
 const comparison=expectedContent===undefined?JSON.stringify(before??null):expectedContent;
 const sealed=await seal(payload,(expected??0)+1),now=new Date().toISOString();
 const tx=this.db.transaction(['ledger','snapshots','meta','drafts'],'readwrite');const done=committed(tx);
 let conflict=false;
 const rootReq=tx.objectStore('ledger').get('root');
 rootReq.onsuccess=()=>{
 const old=rootReq.result;
 if((old?.revision??null)!==expected||JSON.stringify(old??null)!==comparison){conflict=true;tx.abort();return;}
 if(old)tx.objectStore('snapshots').put({id:uuid(),createdAt:now,reason,record:old},`${now}-${uuid()}`);
 tx.objectStore('ledger').put(sealed,'root');
 tx.objectStore('meta').put({revision:sealed.revision,hash:sealed.hash,savedAt:now},'witness');
 if(clearDraft)tx.objectStore('drafts').delete('active');
 };
 try{await done;}catch(e){if(conflict)throw new Error('다른 탭에서 기록이 변경되었습니다. 새로고침 후 다시 확인하세요. 입력 중인 값은 현재 화면에 남아 있습니다.');throw e;}
 try{const readBack=await verify(await this.readRoot());if(readBack.hash!==sealed.hash||readBack.revision!==sealed.revision)throw new Error('저장 후 검증 불일치');this.record=readBack;}
 catch(e){this.recovery=true;this.error=e.message;throw new RecoveryError(e.message);}
 try{localStorage.setItem(this.marker,JSON.stringify({dataset:payload.baseline.id,revision:sealed.revision,savedAt:now}));localStorage.setItem(this.mirrorKey,JSON.stringify(sealed));this.mirrorWarning='';}
 catch{this.mirrorWarning='긴급 미러 저장 실패 · IndexedDB 저장은 검증됨. JSON 백업을 내보내세요.';}
 this.recovery=false;this.error='';this.channel?.postMessage('changed');return this.record.payload;
 }
 async upsert(event){if(!this.record)throw new Error('원본 미확인');const p=structuredClone(this.record.payload),i=p.events.findIndex(e=>e.id===event.id);if(i<0)p.events.push({...event,seq:Math.max(0,...p.events.map(x=>x.seq))+1});else p.events[i]={...event,seq:p.events[i].seq};return this.write(p,i<0?'운동/수동 변경 저장':'과거 기록 수정',this.record.revision,false,event.type==='workout');}
 async remove(id){const p=structuredClone(this.record.payload);p.events=p.events.filter(e=>e.id!==id);return this.write(p,'과거 기록 삭제');}
 async snapshot(reason){if(!this.db)throw new Error('DB 연결 없음');const record=await this.readRoot();if(!record)return;const t=this.db.transaction('snapshots','readwrite'),done=committed(t);t.objectStore('snapshots').put({createdAt:new Date().toISOString(),reason,record},uuid());await done;}
 async snapshots(){if(!this.db)return [];const t=this.db.transaction('snapshots','readonly'),done=committed(t),r=await req(t.objectStore('snapshots').getAll());await done;return r.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 async importPreview(text){await this.snapshot('JSON 불러오기 전 원본 보존');if(text.length>40*1024*1024)throw new Error('JSON 40MB 제한');const raw=JSON.parse(text);if(raw.format!=='kovea-workout-backup'||!raw.record)throw new Error('이 앱의 JSON 백업 형식이 아닙니다.');try{await verify(raw.record);}catch(e){throw new Error('백업 불러오기 거부: '+e.message);}return raw.record.payload;}
 async restore(payload,expectedRecord=undefined){if(!this.db)throw new Error('DB 연결을 먼저 복구해야 합니다.');const root=expectedRecord===undefined?await this.readRoot():expectedRecord;return this.write(payload,'사용자 확인 복구',root?.revision??null,true,true,JSON.stringify(root??null));}
 async export(){const root=await this.readRoot();await verify(root);const raw={format:'kovea-workout-backup',APP_VERSION,DATA_SCHEMA_VERSION,exportedAt:new Date().toISOString(),record:root,prHistory:replay(root.payload.baseline,root.payload.events).prHistory,userSettings:root.payload.baseline.settings};return JSON.stringify(raw,null,2);}
 async exportRaw(){return JSON.stringify({format:'kovea-workout-recovery-raw',exportedAt:new Date().toISOString(),root:this.db?await this.readRoot():null,mirror:lsGet(this.mirrorKey),marker:lsGet(this.marker),snapshots:await this.snapshots()},null,2);}
 async mirror(){const raw=lsGet(this.mirrorKey);if(!raw)throw new Error('긴급 미러 없음');const r=JSON.parse(raw);await verify(r);return r.payload;}
 async metaGet(k){const t=this.db.transaction('meta','readonly'),done=committed(t),v=await req(t.objectStore('meta').get(k));await done;return v;}
 async metaSet(k,v){const t=this.db.transaction('meta','readwrite'),done=committed(t);t.objectStore('meta').put(v,k);await done;}
 async saveDraft(value){if(this.recovery||!this.record)return;const t=this.db.transaction('drafts','readwrite'),done=committed(t);t.objectStore('drafts').put({value,revision:this.record.revision,savedAt:new Date().toISOString()},'active');await done;}
 async draft(){const t=this.db.transaction('drafts','readonly'),done=committed(t),v=await req(t.objectStore('drafts').get('active'));await done;return v;}
 async clearDraft(){const t=this.db.transaction('drafts','readwrite'),done=committed(t);t.objectStore('drafts').delete('active');await done;}
 async diagnostics(){let storage={};try{storage=await navigator.storage.estimate();}catch{}let persistent=false;try{persistent=await navigator.storage.persisted();}catch{}return {app:APP_VERSION,schema:DATA_SCHEMA_VERSION,db:this.db?'연결됨':'연결 실패',events:this.record?.payload.events.length??'확인 불가',lastSave:this.db?(await this.metaGet('witness'))?.savedAt:null,lastExport:this.db?await this.metaGet('exportedAt'):null,persistent,usage:storage.usage,quota:storage.quota,mirror:!!lsGet(this.mirrorKey),revision:this.record?.revision??'—'};}
}
