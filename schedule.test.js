import {test} from 'node:test';import assert from 'node:assert/strict';import {assess,aggregate} from './schedule.js';
test('Sunday exception',()=>assert.equal(assess('NO STANDING COMMERCIAL VEHICLES ONLY 7AM-7PM EXCEPT SUNDAY','2026-11-29T14:00',120),'candidate'));
test('weekday restriction',()=>assert.equal(assess('NO STANDING 7AM-7PM MON-FRI','2026-11-30T14:00',120),'avoid'));
test('restriction begins during stay',()=>assert.equal(assess('NO PARKING 4PM-7PM MON-FRI','2026-11-30T15:00',120),'avoid'));
test('permanent restriction Sunday',()=>assert.equal(assess('NO STANDING ANYTIME','2026-11-29T14:00',120),'avoid'));
test('unknown or conflicting',()=>{assert.equal(assess('NO PARKING SCHOOL DAYS','2026-11-30T14:00',120),'unknown');assert.equal(aggregate(['candidate','unknown']),'unknown');assert.equal(aggregate(['candidate','avoid']),'avoid');});
test('meter maximum',()=>assert.equal(assess('2 HR METERED PARKING 8AM-7PM EXCEPT SUNDAY','2026-11-28T14:00',180),'unknown'));
