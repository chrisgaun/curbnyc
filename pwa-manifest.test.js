import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const manifestURL=new URL('./manifest.json',import.meta.url);
const manifest=JSON.parse(readFileSync(manifestURL,'utf8'));

test('install manifest keeps the existing app identity under the GitHub Pages path',()=>{
 const deployed=new URL('https://chrisgaun.github.io/curbnyc/manifest.json');
 const expected='https://chrisgaun.github.io/curbnyc/';
 for(const key of ['id','start_url','scope'])assert.equal(new URL(manifest[key],deployed).href,expected,key);
 assert.equal(manifest.display,'standalone');
});

test('install icon files match their declared sizes and purposes',()=>{
 const raster=manifest.icons.filter(icon=>icon.type==='image/png');
 const expected=['any:192x192','any:512x512','maskable:512x512'];
 assert.deepEqual(raster.map(icon=>icon.purpose+':'+icon.sizes),expected);
 for(const icon of raster){
  const data=readFileSync(new URL(icon.src,manifestURL));
  assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(data.subarray(12,16).toString(),'IHDR');
  assert.equal(data.readUInt32BE(16)+'x'+data.readUInt32BE(20),icon.sizes);
 }
});


test('service worker provides an offline screen only on app navigation without caching results',async()=>{
 const listeners=new Map();
 let connected=true;
 const appURL='https://chrisgaun.github.io/curbnyc/';
 const online=new Response('Current map');
 runInNewContext(readFileSync(new URL('./sw.js',import.meta.url),'utf8'),{
  URL,Response,
  self:{registration:{scope:appURL},addEventListener:(name,listener)=>listeners.set(name,listener)},
  fetch:async()=>{if(!connected)throw Error('Unavailable');return online;}
 });
 const eventFor=(url,mode='navigate')=>{
  let result;
  listeners.get('fetch')({request:{url,mode,method:'GET'},respondWith:response=>{result=response;}});
  return result;
 };
 assert.equal(await eventFor(appURL),online);
 connected=false;
 for(const url of [appURL,appURL+'index.html?from=install']){
  const result=await eventFor(url);
  assert.equal(result.status,503);
  assert.match(await result.text(),/CurbNYC is offline/);
  assert.equal(result.headers.get('Cache-Control'),'no-store');
 }
 assert.equal(eventFor(appURL+'data/meters.json','cors'),undefined);
 assert.equal(eventFor(appURL+'meters-baseline.html'),undefined);
 assert.equal(eventFor('https://example.org/curbnyc/'),undefined);
});
