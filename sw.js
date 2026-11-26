// Retire old app caches; always use the deployed network version.
self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('curb-shell-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()).then(()=>self.registration.unregister())));
