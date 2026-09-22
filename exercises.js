import {DAYS,LIFTS,NAMES} from './progression.js';
import {normalizeName} from './history-reference.js';
export const exerciseKey=a=>a.exerciseKey||'aux:'+normalizeName(a.name);
export function exercises(payload,{hidden=false}={}){
 const map=new Map(LIFTS.map(lift=>['main:'+lift,{key:'main:'+lift,name:NAMES[lift],lift,hidden:false}]));
 for(const e of [...payload.events].sort((a,b)=>a.seq-b.seq))for(const a of e.aux||[])map.set(exerciseKey(a),{key:exerciseKey(a),name:a.name.trim(),hidden:false});
 for(const m of payload.exerciseSettings||[])map.set(m.key,{...map.get(m.key),...m,...(m.key.startsWith('main:')?{lift:m.key.slice(5)}:{})});
 return [...map.values()].filter(a=>hidden||!a.hidden).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}
export function updateExercise(payload,key,changes){
 const all=exercises(payload,{hidden:true}),current=all.find(a=>a.key===key);if(!current)throw Error('종목을 찾을 수 없습니다.');
 const next={key,name:current.name,hidden:current.hidden,...changes};next.name=next.name.trim();
 if(!next.name||next.name.length>200)throw Error('종목 이름은 1–200자로 입력하세요.');
 if(all.some(a=>a.key!==key&&normalizeName(a.name)===normalizeName(next.name)))throw Error('같은 이름의 종목이 있습니다. 다른 이름을 사용하세요.');
 const copy=structuredClone(payload);copy.exerciseSettings=[...(copy.exerciseSettings||[]).filter(a=>a.key!==key),next];return copy;
}
export function recentExercise(payload,key,mode='all'){
 const lift=key.startsWith('main:')?key.slice(5):null;
 return payload.events.filter(e=>e.type==='workout').map(e=>{
  if(lift){if(e.day===6||DAYS[e.day].lift!==lift||(mode!=='all'&&DAYS[e.day].mode!==mode))return null;return {event:e,sets:e.sets.map(r=>({name:r.name,...r.actual})),mode:DAYS[e.day].mode};}
  const rows=e.aux.filter(a=>exerciseKey(a)===key).flatMap(a=>a.sets);return rows.length?{event:e,sets:rows.map((r,i)=>({name:`Set ${i+1}`,...r}))}:null;
 }).filter(x=>x&&x.sets.some(r=>r.done)).sort((a,b)=>b.event.date.localeCompare(a.event.date)||b.event.seq-a.event.seq).slice(0,3);
}
// Existing program RIR targets; these are guidance only and do not change actual inputs.
export function targetRir(day,key){if(day===6)return null;const dead=DAYS[day].lift==='dead';return {warm1:5,warm2:4,warm3:4,primer:3,prepare:3,scale:1,backoff:dead?3:2,hyper1:dead?3:2,hyper2:dead?3:2,hyper3:3,pr:0}[key]??null;}
