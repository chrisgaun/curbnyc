import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {checkRelease,releaseAssets} from './scripts/check-pages-release.mjs';

test('the plan reaches active modules, local styles, icons, and the offline worker',async()=>{
 const files=await releaseAssets(path=>readFile(new URL(path,import.meta.url)));
 for(const file of ['meter-view-v12.js','meter-packed.js','asp-calendar-data.js','map-theme.css','icon-512.png','sw.js']){
  assert.ok(files.has(file),file);
 }
 assert.ok(!files.has('data/meters.json'));
 assert.ok(![...files.keys()].some(file=>file.includes('unpkg')));
});

test('a stale module or missing installation asset fails a deployment check',async()=>{
 const files=new Map([['index.html',Buffer.from('current')],['view.js',Buffer.from('expected')],['icon.png',Buffer.from('icon')]]);
 const observed=await checkRelease('https://example.org/app/',files,async(url,options)=>{
  assert.match(url.searchParams.get('verify'),/^[a-f0-9]{12}$/);
  assert.equal(options.redirect,'error');
  if(url.pathname.endsWith('view.js'))return new Response('stale');
  if(url.pathname.endsWith('icon.png'))return new Response('',{status:404});
  return new Response('current');
 });
 assert.deepEqual(observed,[{path:'index.html'},{path:'view.js',problem:'Deployed bytes differ'},{path:'icon.png',problem:'HTTP 404'}]);
});
