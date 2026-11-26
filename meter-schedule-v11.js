// Evaluates the published meter schedule only, never all curb restrictions.
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const absent=v=>!v||/^(N\/A|NONE|-)$/i.test(String(v).trim());
function clock(h,m,ap){h=Number(h);m=Number(m||0);return h>=1&&h<=12&&m>=0&&m<60?(h%12)*60+m+(ap.toUpperCase()==='PM'?720:0):NaN;}
export function parseSchedule(value){
 if(absent(value))return [];
 const windows=[];
 for(const part of String(value).split(',')){
  const m=part.trim().match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(?:\s*-\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday))?\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if(!m)return null;
  const dayIndex=d=>DAYS.findIndex(x=>x.toLowerCase()===d.toLowerCase());
  const first=dayIndex(m[1]),last=dayIndex(m[2]||m[1]),start=clock(m[3],m[4],m[5]);let end=clock(m[6],m[7],m[8]);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start===end)return null;
  if(end===0)end=1440;
  for(let i=0;i<7;i++){const day=(first+i)%7;if(end>start)windows.push({day,start,end});else{windows.push({day,start,end:1440},{day:(day+1)%7,start:0,end});}if(day===last)break;}
 }
 return windows;
}
export function rateEstimate(value,hours){
 if(!Number.isInteger(hours)||hours<1||hours>24||absent(value))return null;
 const v=value.trim();const flat=v.match(/^\$(\d+(?:\.\d{2})?) per (Hour|30 Minutes)$/i);
 if(flat)return Math.round(Number(flat[1])*hours*(flat[2].toLowerCase()==='hour'?1:2)*100)/100;
 const rates=new Map();let additional=null;
 for(const p of v.split('/')){const m=p.trim().match(/^\$(\d+(?:\.\d{2})?)\s+(?:(\d+)(?:st|nd|rd|th) Hour|(Add'l Hours))$/i);if(!m)return null;if(m[3])additional=Number(m[1]);else rates.set(Number(m[2]),Number(m[1]));}
 let cents=0;for(let i=1;i<=hours;i++){const cost=rates.get(i)??(i>Math.max(...rates.keys())?additional:null);if(cost==null)return null;cents+=Math.round(cost*100);}return cents/100;
}
// New York civil time. Actual elapsed times on DST transition dates need separate handling.
function holiday(d){const m=d.getUTCMonth(),n=d.getUTCDate(),w=d.getUTCDay();return (m===0&&n===1)||(m===4&&w===1&&n>=25)||(m===6&&n===4)||(m===8&&w===1&&n<=7)||(m===10&&w===4&&n>=22&&n<=28)||(m===11&&n===25);}
function dstDay(d){const y=d.getUTCFullYear(),m=d.getUTCMonth(),n=d.getUTCDate();return (m===2&&n===8+(7-new Date(Date.UTC(y,2,1)).getUTCDay())%7)||(m===10&&n===1+(7-new Date(Date.UTC(y,10,1)).getUTCDay())%7);}
export function compileMeter(p){
 const passenger=parseSchedule(p.all_vehi_1),commercial=parseSchedule(p.commerci_1);
 const max=String(p.all_vehicl||'').match(/^(\d+) Hours?$/i);
 const firstRate=rateEstimate(p.all_vehi_2,1);
 return (arrival,hours=0)=>evaluateCompiled(p,arrival,hours,passenger,commercial,max,firstRate);
}
export function evaluate(p,arrival,hours=0){
 return compileMeter(p)(arrival,hours);
}
function evaluateCompiled(p,arrival,hours,passenger,commercial,max,firstRate){
 const type=p.vehicle_ty,result=(state,reason,extra={})=>({state,reason,cost:null,...extra});
 if(!['All Vehicles','Dual (Commercial / All Vehicles)','Commercial Only','Charter Bus Only'].includes(type))return result('unknown','Vehicle type needs review');
 if(type==='Charter Bus Only')return result('restricted','Charter bus meter');
 const start=new Date(arrival+'Z');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(arrival)||!Number.isFinite(+start)||!Number.isInteger(hours)||hours<0||hours>6)return result('unknown','Invalid arrival or duration');
 if(!passenger||!commercial||(type!=='Commercial Only'&&!passenger.length)||(type!=='All Vehicles'&&!commercial.length))return result('unknown','Meter schedule needs review');
 const active=(windows,d,m)=>windows.some(w=>w.day===d&&m>=w.start&&m<w.end);
 const at=i=>{const d=new Date(+start+i*60000);if(dstDay(d))return 'unknown';const day=d.getUTCDay(),minute=d.getUTCHours()*60+d.getUTCMinutes();
 // Preserve explicit commercial restrictions even on no-payment holidays: posted exceptions are not in this dataset.
 if(active(commercial,day,minute))return 'restricted';
 if(type==='Commercial Only')return 'unknown';
 if(day!==0&&!holiday(d)&&active(passenger,day,minute))return 'paid';return 'inactive';};
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
  if(state!==intervals.at(-1).state)intervals.push({offset,state});
 }
 const change=intervals[1];
 const next=change?{at:new Date(+start+change.offset*60000).toISOString().slice(0,16),state:change.state}:null;
 const extra={current,next,firstRate,maxHours:max?Number(max[1]):null};
 if(current==='restricted')return result('restricted','Commercial vehicles only during this time',extra);
 if(current==='unknown')return result('unknown','Passenger eligibility not established',extra);
 let paid=0,longest=0;
 const duration=hours*60;
 for(let i=0;i<intervals.length&&intervals[i].offset<duration;i++){
  const {offset,state}=intervals[i];
  if(state==='restricted')return result('restricted','Commercial restriction starts during your planned stay',extra);
  if(state==='unknown')return result('unknown','Part of your planned stay needs review',extra);
  if(state==='paid'){
   const minutes=Math.min(duration,intervals[i+1]?.offset??duration)-offset;
   paid+=minutes;
   longest=Math.max(longest,minutes);
  }
 }
 if(hours&&paid&&!max)return result('unknown','Passenger meter limit needs review',extra);
 if(hours&&max&&longest>Number(max[1])*60)return result('restricted','Planned stay exceeds posted meter limit',extra);
 const cost=hours&&paid===hours*60?rateEstimate(p.all_vehi_2,hours):hours&&paid===0?0:null;
 return result(current,current==='paid'?'Passenger meter active':'No meter payment scheduled',{...extra,cost,paidMinutes:hours?paid:null});
}
