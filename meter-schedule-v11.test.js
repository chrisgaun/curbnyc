import {readFileSync} from 'node:fs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {evaluate} from './meter-schedule-v11.js';
const p={vehicle_ty:'Dual (Commercial / All Vehicles)',all_vehicl:'6 Hours',all_vehi_1:'Monday-Friday 6 PM-12 AM, Saturday 8 AM-12 AM',all_vehi_2:"$5.50 1st Hour / $9.00 2nd Hour / $5.50 Add'l Hours",commerci_1:'Monday-Saturday 7 AM-6 PM'};
test('screenshot: paid now, unpaid after midnight, not unknown',()=>{const x=evaluate(p,'2026-11-25T22:36',2);assert.equal(x.state,'paid');assert.equal(x.next.at,'2026-11-26T00:00');assert.equal(x.next.state,'inactive');assert.equal(x.paidMinutes,84);assert.equal(x.firstRate,5.5);assert.equal(x.cost,null);});
test('commercial hours',()=>assert.equal(evaluate(p,'2026-11-25T14:00').state,'restricted'));
test('Sunday',()=>assert.equal(evaluate(p,'2026-11-29T14:00').state,'inactive'));
test('transition into commercial period',()=>assert.equal(evaluate(p,'2026-11-25T06:30',1).state,'restricted'));
test('full paid duration',()=>assert.equal(evaluate(p,'2026-11-25T19:00',2).cost,14.5));
test('commercial only outside hours unknown',()=>assert.equal(evaluate({...p,vehicle_ty:'Commercial Only',all_vehi_1:''},'2026-11-25T22:00').state,'unknown'));
test('holiday payment suspended',()=>assert.equal(evaluate(p,'2026-11-26T20:00').state,'inactive'));
test('unknown schedule stays unknown',()=>assert.equal(evaluate({...p,all_vehi_1:'weird'},'2026-11-25T22:00').state,'unknown'));


const fixtures=JSON.parse(readFileSync(new URL('./fixtures/meter-blockfaces.json',import.meta.url)));
const cases=[
 ['104933','2026-11-25T22:36',2,{state:'paid',paidMinutes:84,cost:null,firstRate:5.5,next:{at:'2026-11-26T00:00',state:'inactive'}}],
 ['104933','2026-11-26T15:00',0,{state:'restricted'}],
 ['104933','2026-11-26T19:00',0,{state:'inactive'}],
 ['104933','2026-11-28T19:00',2,{state:'paid',cost:14.5}],
 ['301265','2026-11-28T08:00',1,{state:'inactive',paidMinutes:30,cost:null,next:{at:'2026-11-28T08:30',state:'paid'}}],
 ['301265','2026-11-28T09:00',2,{state:'paid',cost:5}],
 ['301265','2026-11-29T09:00',2,{state:'inactive',cost:0}],
 ['300598','2026-11-23T10:00',2,{state:'paid',maxHours:2,cost:4}],
 ['300598','2026-11-23T10:00',3,{state:'restricted',maxHours:2}],
 ['300598','2026-11-27T10:00',4,{state:'paid',maxHours:4,cost:6}],
 ['466707','2026-11-27T10:00',0.5,{state:'paid',firstRate:1,rateMinutes:30,maxHours:0.5,cost:1}],
 ['466707','2026-11-27T10:00',0.25,{state:'paid',cost:null}],
 ['466707','2026-11-27T10:00',1,{state:'restricted'}],
 ['104496','2026-11-28T13:00',2,{state:'inactive',paidMinutes:0,next:{at:'2026-11-28T15:00',state:'paid'}}],
 ['104496','2026-11-28T15:00',0.5,{state:'paid',paidMinutes:30,cost:null}],
 ['301265','2026-03-08T02:30',0,{state:'unknown'}],
 ['301265','2026-11-01T01:30',0,{state:'unknown'}],
 ['301265','2026-02-30T12:00',0,{state:'unknown'}],
 ['301265','2026-11-20T24:00',0,{state:'unknown'}],
];
for(const [zone,at,hours,expected] of cases){
 test(`NYC blockface ${zone} at ${at} for ${hours}h`,()=>{
  assert.ok(fixtures[zone]);
  const result=evaluate(fixtures[zone],at,hours);
  for(const [key,value] of Object.entries(expected))assert.deepEqual(result[key],value,key);
 });
}

test('unsupported seasonal schedules and equal endpoints require review',()=>{
 for(const text of ['Monday-Saturday 8 AM-7 PM Jan-May, Sept-Dec','Monday-Saturday 12 AM-12 AM']){
  assert.equal(evaluate({...fixtures['301265'],all_vehi_1:text},'2026-11-28T12:00').state,'unknown');
 }
});

test('explicit overlapping commercial schedule wins, including listed days',()=>{
 const result=evaluate({...fixtures['104933'],commerci_1:'Monday, Wednesday, Friday 7 AM-8 PM'},'2026-11-25T19:00');
 assert.equal(result.state,'restricted');
 assert.deepEqual(result.next,{at:'2026-11-25T20:00',state:'paid'});
});

test('noncontiguous rate tiers are ambiguous even when the meter is active',()=>{
 const result=evaluate({...fixtures['301265'],all_vehi_2:'$2.00 2nd Hour / $3.00 Add\'l Hours'},'2026-11-28T12:00',2);
 assert.equal(result.state,'paid');
 assert.equal(result.firstRate,null);
 assert.equal(result.cost,null);
});

test('a Saturday overnight stay extending into a DST transition requires review',()=>{
 const result=evaluate({...fixtures['301265'],all_vehi_1:'Saturday 8 PM-2 AM'},'2026-10-31T23:30',1);
 assert.equal(result.state,'unknown');
 assert.deepEqual(result.next,{at:'2026-11-01T00:00',state:'unknown'});
});
