import {isMeterHoliday} from './asp-calendar.js';

// Evaluates the published meter schedule only, never all curb restrictions.
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const absent=v=>!v||/^(N\/A|NONE|-)$/i.test(String(v).trim());
function clock(h,m,ap){h=Number(h);m=Number(m||0);return h>=1&&h<=12&&m>=0&&m<60?(h%12)*60+m+(ap.toUpperCase()==='PM'?720:0):NaN;}
const dayPattern='Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday';
const dayRange=new RegExp(`^(${dayPattern})(?:\\s*-\\s*(${dayPattern}))?(?:\\s+|$)`,'i');
const timeRange=/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i;

export function parseSchedule(value){
 if(absent(value))return [];
 const windows=[];
 let days=[],pending=[],hadTime=false;
 for(const part of String(value).split(',')){
  let text=part.trim();
  const dates=text.match(dayRange);
  if(dates){
   const first=DAYS.findIndex(day=>day.toLowerCase()===dates[1].toLowerCase());
   const last=dates[2]?DAYS.findIndex(day=>day.toLowerCase()===dates[2].toLowerCase()):first;
   const count=(last-first+7)%7+1;
   pending.push(...Array.from({length:count},(_,i)=>(first+i)%7));
   text=text.slice(dates[0].length);
   if(!text)continue;
   days=pending;
   pending=[];
  }else if(pending.length||!days.length){
   return null;
  }
  const times=text.match(timeRange);
  if(!times)return null;
  const start=clock(times[1],times[2],times[3]);
  let end=clock(times[4],times[5],times[6]);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start===end)return null;
  if(end===0)end=1440;
  for(const day of days){
   if(end>start)windows.push({day,start,end});
   else windows.push({day,start,end:1440},{day:(day+1)%7,start:0,end});
  }
  hadTime=true;
 }
 return hadTime&&!pending.length?windows:null;
}

function parseRate(value){
 if(absent(value))return null;
 const flat=value.trim().match(/^\$(\d+(?:\.\d{2})?) per (Hour|30 Minutes)$/i);
 if(flat){
  const cents=Math.round(Number(flat[1])*100);
  const unit=/hour/i.test(flat[2])?60:30;
  return {unit,charge:minutes=>minutes%unit===0?cents*(minutes/unit)/100:null};
 }
 const rates=[];
 let additional=null;
 for(const part of value.split('/')){
  const tier=part.trim().match(/^\$(\d+(?:\.\d{2})?)\s+(?:(\d+)(?:st|nd|rd|th) Hour|(Add'l Hours))$/i);
  if(!tier||additional!==null)return null;
  const cents=Math.round(Number(tier[1])*100);
  if(tier[3]){
   if(!rates.length)return null;
   additional=cents;
  }else{
   if(Number(tier[2])!==rates.length+1)return null;
   rates.push(cents);
  }
 }
 return {unit:60,charge:minutes=>{
  const hours=minutes/60;
  if(!Number.isInteger(hours)||hours>rates.length&&additional===null)return null;
  return (rates.slice(0,hours).reduce((sum,cents)=>sum+cents,0)+Math.max(0,hours-rates.length)*(additional??0))/100;
 }};
}

export function rateEstimate(value,hours){
 return Number.isFinite(hours)&&hours>0&&hours<=24?parseRate(value)?.charge(hours*60)??null:null;
}

function weekdayRates(value){
 const match=String(value??'').match(/^(.+) \(Mon-Thurs\) \/ (.+) \(Friday\)$/i);
 if(!match){
  const rate=parseRate(value);
  return ()=>rate;
 }
 const monThu=parseRate(match[1]),friday=parseRate(match[2]);
 return day=>day===5?friday:day>=1&&day<=4?monThu:null;
}

function weekdayLimits(value){
 const flat=String(value??'').trim().match(/^(\d+) (Hours?|Minutes?)$/i);
 if(flat){
  const minutes=Number(flat[1])*(/^hour/i.test(flat[2])?60:1);
  return ()=>minutes>0?minutes:null;
 }
 const match=String(value??'').match(/^(\d+) Hours? \(Mon-Thurs\), (\d+) Hours? \(Fri\)$/i);
 return day=>match?(day===5?Number(match[2]):day>=1&&day<=4?Number(match[1]):0)*60||null:null;
}
// New York civil time. Actual elapsed times on DST transition dates need separate handling.
function dstDay(d){const y=d.getUTCFullYear(),m=d.getUTCMonth(),n=d.getUTCDate();return (m===2&&n===8+(7-new Date(Date.UTC(y,2,1)).getUTCDay())%7)||(m===10&&n===1+(7-new Date(Date.UTC(y,10,1)).getUTCDay())%7);}
export function compileMeter(p){
 const passenger=parseSchedule(p.all_vehi_1),commercial=parseSchedule(p.commerci_1);
 const limit=weekdayLimits(p.all_vehicl),rate=weekdayRates(p.all_vehi_2);
 return (arrival,hours=0)=>evaluateCompiled(p,arrival,hours,passenger,commercial,limit,rate);
}
export function evaluate(p,arrival,hours=0){
 return compileMeter(p)(arrival,hours);
}
function evaluateCompiled(p,arrival,hours,passenger,commercial,limit,rate){
 const type=p.vehicle_ty,result=(state,reason,extra={})=>({state,reason,cost:null,...extra});
 if(!['All Vehicles','Dual (Commercial / All Vehicles)','Commercial Only','Charter Bus Only'].includes(type))return result('unknown','Vehicle type needs review');
 if(type==='Charter Bus Only')return result('restricted','Charter bus meter');
 const start=new Date(arrival+'Z');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(arrival)||!Number.isFinite(+start)||start.toISOString().slice(0,16)!==arrival||!Number.isInteger(hours*60)||hours<0||hours>6)return result('unknown','Invalid arrival or duration');
 if(!passenger||!commercial||(type!=='Commercial Only'&&!passenger.length)||(type!=='All Vehicles'&&!commercial.length))return result('unknown','Meter schedule needs review');
 const active=(windows,d,m)=>windows.some(w=>w.day===d&&m>=w.start&&m<w.end);
 const at=i=>{const d=new Date(+start+i*60000);if(dstDay(d))return 'unknown';const day=d.getUTCDay(),minute=d.getUTCHours()*60+d.getUTCMinutes();
 // Preserve explicit commercial restrictions even on no-payment holidays: posted exceptions are not in this dataset.
 if(active(commercial,day,minute))return 'restricted';
 if(type==='Commercial Only')return 'unknown';
 if(day!==0&&!isMeterHoliday(d)&&active(passenger,day,minute))return 'paid';return 'inactive';};
 const current=at(0);
 // The state can change only at a schedule endpoint or at midnight.
 const minuteOfDay=start.getUTCHours()*60+start.getUTCMinutes();
 const midnight=1440-minuteOfDay;
 const boundaries=new Set([midnight]);
 for(const {day,start:from,end:to} of [...passenger,...commercial]){
  const dayOffset=(day-start.getUTCDay()+7)%7;
  if(dayOffset>1)continue;
  for(const endpoint of [from,to]){
   const offset=dayOffset*1440+endpoint-minuteOfDay;
   if(offset>0&&offset<=1440)boundaries.add(offset);
  }
 }
 const intervals=[{offset:0,state:current}];
 for(const offset of [...boundaries].sort((a,b)=>a-b)){
  const state=at(offset);
  if(state!==intervals.at(-1).state||offset===midnight)intervals.push({offset,state});
 }
 const change=intervals.find(interval=>interval.state!==current);
 const next=change?{at:new Date(+start+change.offset*60000).toISOString().slice(0,16),state:change.state}:null;
 const currentLimit=limit(start.getUTCDay());
 const currentRate=rate(start.getUTCDay());
 const rateMinutes=currentRate?Math.min(currentRate.unit,currentLimit??currentRate.unit):null;
 const extra={current,next,firstRate:currentRate?.charge(rateMinutes)??null,
  rateMinutes,maxHours:currentLimit===null?null:currentLimit/60};
 if(current==='restricted')return result('restricted','Commercial vehicles only during this time',extra);
 if(current==='unknown')return result('unknown','Passenger eligibility not established',extra);
 let paid=0,run=0,runLimit,uncertainLimit=false,exceedsLimit=false,uncertainRate=false;
 const duration=hours*60;
 for(let i=0;i<intervals.length&&intervals[i].offset<duration;i++){
  const {offset,state}=intervals[i];
  if(state==='restricted')return result('restricted','Commercial restriction starts during your planned stay',extra);
  if(state==='unknown')return result('unknown','Part of your planned stay needs review',extra);
  if(state!=='paid'){run=0;continue;}
  const day=(start.getUTCDay()+(offset>=midnight?1:0))%7;
  const minutes=Math.min(duration,intervals[i+1]?.offset??duration)-offset;
  const segmentLimit=limit(day);
  if(run===0)runLimit=segmentLimit;
  if(segmentLimit===null||segmentLimit!==runLimit)uncertainLimit=true;
  if(rate(day)!==currentRate)uncertainRate=true;
  paid+=minutes;
  run+=minutes;
  if(runLimit!==null&&segmentLimit===runLimit&&run>runLimit)exceedsLimit=true;
 }
 if(uncertainLimit)return result('unknown','Passenger meter limit needs review',extra);
 if(exceedsLimit)return result('restricted','Planned stay exceeds posted meter limit',extra);
 const cost=!duration?null:paid===0?0:paid===duration&&!uncertainRate?currentRate?.charge(duration)??null:null;
 return result(current,current==='paid'?'Passenger meter active':'No meter payment scheduled',{...extra,cost,paidMinutes:hours?paid:null});
}
