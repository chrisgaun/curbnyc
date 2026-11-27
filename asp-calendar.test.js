import assert from 'node:assert/strict';
import test from 'node:test';
import {plannedAspDays} from './asp-calendar.js';
import {evaluate} from './meter-schedule-v11.js';

const meter={
 vehicle_ty:'All Vehicles',
 all_vehi_1:'Monday-Saturday 8 AM-12 AM',
 all_vehicl:'6 Hours',
 all_vehi_2:'$2.00 per Hour'
};
const days=(arrival,hours)=>plannedAspDays(arrival,hours)?.days;

test('observed holiday dates in the NYC DOT calendar suspend meter payment',()=>{
 for(const date of ['2026-07-03','2026-07-04','2027-07-05','2027-12-24','2027-12-31']){
  assert.equal(evaluate(meter,date+'T09:00',1).cost,0,date);
  assert.equal(days(date+'T09:00')[0].status,'planned-suspension',date);
 }
});

test('street-cleaning-only suspension leaves the normal meter schedule in effect',()=>{
 const date='2027-06-18T09:00';
 assert.equal(days(date)[0].status,'planned-suspension');
 assert.equal(evaluate(meter,date,1).cost,2);
});

test('a Thursday stay past midnight includes the Friday observed holiday',()=>{
 const start='2026-07-02T23:30';
 assert.deepEqual(days(start,0.5),[{day:'2026-07-02',status:'not-listed'}]);
 assert.deepEqual(days(start,1),[
  {day:'2026-07-02',status:'not-listed'},{day:'2026-07-03',status:'planned-suspension'}
 ]);
 const result=evaluate(meter,start,1);
 assert.equal(result.paidMinutes,30);
 assert.equal(result.cost,null);
});

test('keep commercial precedence and Sundays on official holiday dates',()=>{
 const dual={...meter,vehicle_ty:'Dual (Commercial / All Vehicles)',commerci_1:'Monday-Friday 8 AM-6 PM'};
 assert.equal(evaluate(dual,'2026-07-03T10:00',1).state,'restricted');
 assert.equal(evaluate(meter,'2026-11-01T10:00',0).state,'unknown'); // DST requires review.
 assert.equal(evaluate(meter,'2026-11-08T10:00',1).cost,0);
});

test('unpublished years and invalid civil dates are explicit',()=>{
 assert.equal(days('2028-01-02T09:00')[0].status,'unavailable');
 assert.equal(days('2027-02-30T09:00'),undefined);
 assert.equal(days('2026-07-02T09:00',7),undefined);
});
