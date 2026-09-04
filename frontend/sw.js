const CACHE="lavagna-v3";
const ASSETS=["./","./index.html","./style.css","./app.js","./manifest.json","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const url=new URL(e.request.url);
  // bypass api - network first
  if(url.pathname.startsWith("/api/")){
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
    return;
  }
  // navigate - cache fallback to index.html
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).catch(()=>caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
    // cache new assets
    const copy=res.clone();
    caches.open(CACHE).then(c=>c.put(e.request, copy));
    return res;
  }).catch(()=>r)));
});
