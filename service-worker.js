// App shell ONLY. This file must never access IndexedDB or localStorage.
const CACHE_VERSION='app-shell-6';
const PREFIX='kovea-shell:';
const CACHE=PREFIX+CACHE_VERSION;
const ASSETS=['./','./index.html','./crypto-utils.js','./app.js','./db.js','./schema.js','./reports.js','./diagnostics.js','./history-reference.js','./exercises.js','./progression.js','./styles.css','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
// No automatic skipWaiting or clients.claim: old open tabs retain their worker.
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();if(event.data?.type==='VERSION')event.ports[0]?.postMessage({cacheVersion:CACHE_VERSION});});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))));});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||u.origin!==scope.origin||!u.pathname.startsWith(scope.pathname))return;
 // A version-coherent cached shell is intentional: network-first HTML could mix
 // new HTML with old JS before the user approves an update.
 event.respondWith((async()=>{
 const cache=await caches.open(CACHE);
 const hit=await cache.match(event.request,{ignoreSearch:true});if(hit)return hit;
 try{return await fetch(event.request);}catch(e){if(event.request.mode==='navigate')return await cache.match('./index.html');throw e;}
 })());
});
