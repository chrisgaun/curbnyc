import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {decodePackedMeters,readPackedMeters} from './meter-packed.js';

const payload=Buffer.from(readFileSync(new URL('./fixtures/packed-meter-sample.base64',import.meta.url),'utf8'),'base64');

test('Python-packed gzip preserves coordinate precision, shape and schedule strings',async()=>{
 const a=[-73.98325256983255,40.75360583029261];
 const b=[-73.98245568346274,40.75317641294855];
 const c=[-73.98274768442653,40.75387230428599];
 assert.deepEqual(await readPackedMeters(new Response(payload)),{
  metadata:{recordCount:2,fetchedAt:'2026-11-26T00:00:00Z'},
  features:[
   {type:'Feature',geometry:{type:'LineString',coordinates:[a,b]},properties:{on_street:'West 41 Street',all_vehi_2:'$5.50 per Hour'}},
   {type:'Feature',geometry:{type:'MultiLineString',coordinates:[[a,c],[c,b]]},properties:{on_street:'Example — NYC'}}
  ]
 });
});

test('an incomplete or invalid packed snapshot is rejected instead of returning incomplete lines',async()=>{
 const unpacked=Uint8Array.from(gunzipSync(payload));
 assert.throws(()=>decodePackedMeters(unpacked.slice(0,-1).buffer),/Incomplete compact meter coordinates/);
 unpacked[0]=0;
 assert.throws(()=>decodePackedMeters(unpacked.buffer),/Unknown compact meter format/);
 await assert.rejects(readPackedMeters(new Response(payload.subarray(0,20))));
});
