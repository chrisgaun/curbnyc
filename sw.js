// Fetch the map from the server on every navigation. Never cache curb rules here.
const offlinePage=`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CurbCommons is offline</title>
<style>
body{max-width:30rem;margin:4rem auto;padding:0 1rem;font:1rem system-ui;color:#142d3b;background:#f4f6f7}
button{min-height:44px;padding:.5rem 1rem;font:inherit;border-radius:8px;border:1px solid #142d3b;background:white;color:inherit}
</style>
<main>
<h1>CurbCommons is offline</h1>
<p>Connect to the internet to load meter schedules. Check posted signs for parking rules.</p>
<form method="get"><button>Try again</button></form>
</main>
</html>`;

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(
 caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('curb-shell-')).map(key=>caches.delete(key))))
  .then(()=>self.clients.claim())
));

const scope=new URL(self.registration.scope);
self.addEventListener('fetch',event=>{
 const {request}=event;
 if(request.method!=='GET'||request.mode!=='navigate')return;
 const url=new URL(request.url);
 if(url.origin!==scope.origin||(url.pathname!==scope.pathname&&url.pathname!==scope.pathname+'index.html'))return;
 event.respondWith(fetch(request).catch(()=>new Response(offlinePage,{
  status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}
 })));
});
