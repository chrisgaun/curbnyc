import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {indexMeters,nearby} from './meter-spatial.js';
import {createBasemapLoader} from './viewport-basemap.js';
import {evaluate} from './meter-schedule-v11.js';

test('indexed line selection matches the full scan along the NYC fixture route',()=>{
 const features=JSON.parse(readFileSync(new URL('./data/meters.json',import.meta.url)))
  .map(row=>({geometry:row.the_geom}));
 const indexed=indexMeters(features);
 for(const center of [[-73.9832,40.7536],[-73.9855,40.758],[-73.957,40.7148]]){
  for(const radius of [250,500,800,1200]){
   const expected=features.filter(feature=>nearby(feature,center,radius));
   assert.ok(expected.length);
   assert.deepEqual(indexed(center,radius),expected);
  }
 }
});

test('adjacent paid windows count as one continuous stay',()=>{
 const p={vehicle_ty:'All Vehicles',all_vehicl:'1 Hour',all_vehi_1:'Monday 8 AM - 9 AM, Monday 9 AM - 10 AM'};
 const result=evaluate(p,'2026-11-23T08:00',2);
 assert.equal(result.state,'restricted');
 assert.deepEqual(result.next,{at:'2026-11-23T10:00',state:'inactive'});
});

test('next transition includes the same minute tomorrow',()=>{
 const p={vehicle_ty:'All Vehicles',all_vehi_1:'Tuesday 8 AM - 9 AM'};
 assert.deepEqual(evaluate(p,'2026-11-23T08:00').next,{at:'2026-11-24T08:00',state:'paid'});
});

test('background geometry reuses covered extents and cancels obsolete requests',async()=>{
 let x=0,requests=[],applied=[];
 const sample=()=>({type:'FeatureCollection',features:[{properties:{stname_label:'W 42 ST',unused:'metadata'}}]});
 let report;
 let reported=new Promise(resolve=>{report=resolve;});
 const refresh=createBasemapLoader({
  getBounds:()=>({getWest:()=>x,getEast:()=>x+1,getSouth:()=>0,getNorth:()=>1}),
  fetchGeometry:(url,signal)=>new Promise(resolve=>requests.push({signal,resolve})),
  apply:(name,data)=>applied.push([name,data.features[0].properties]),
  report:()=>report()
 });
 const wait=async count=>{
  for(let tries=0;requests.length<count&&tries<100;tries++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(requests.length,count);
 };
 refresh();
 await wait(3);
 x=0.2;
 refresh();
 assert.ok(requests.every(request=>!request.signal.aborted));
 x=2;
 refresh();
 assert.ok(requests.every(request=>request.signal.aborted));
 for(const request of requests)request.resolve(sample());
 await wait(6);
 assert.deepEqual(applied,[]);
 for(const request of requests.slice(3))request.resolve(sample());
 await reported;
 assert.equal(applied.length,3);
 assert.deepEqual(applied.find(([name])=>name==='streets')[1],{st_label:'W 42 ST'});
 x=2.2;
 reported=new Promise(resolve=>{report=resolve;});
 refresh();
 await reported;
 assert.equal(requests.length,6);
 assert.equal(applied.length,3);
});
