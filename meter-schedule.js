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
export function evaluate(p,arrival,hours){
 const type=p.vehicle_ty;
 const result=(state,reason,cost=null)=>({state,reason,cost});
 if(!['All Vehicles','Dual (Commercial / All Vehicles)','Commercial Only','Charter Bus Only'].includes(type))return result('unknown','Unrecognized vehicle type');
 if(type==='Charter Bus Only')return result('restricted','Charter bus meter; passenger eligibility not established');
 const start=new Date(arrival+'Z');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(arrival)||!Number.isFinite(+start)||!Number.isInteger(hours)||hours<1||hours>6)return result('unknown','Invalid date or duration');
 // Civil time arithmetic; DST transition days are not evaluated (ambiguous local times).
 const y=start.getUTCFullYear(),march=new Date(Date.UTC(y,2,1)),nov=new Date(Date.UTC(y,10,1));
 const spring=8+(7-march.getUTCDay())%7,fall=1+(7-nov.getUTCDay())%7;
 const passenger=parseSchedule(p.all_vehi_1),commercial=parseSchedule(p.commerci_1);
 if(!passenger||!commercial||(type!=='Commercial Only'&&!passenger.length)||(type!=='All Vehicles'&&!commercial.length))return result('unknown','Missing or unrecognized meter schedule');
 let paid=0,restricted=0;const active=(windows,d,m)=>windows.some(w=>w.day===d&&m>=w.start&&m<w.end);
 for(let i=0;i<hours*60;i++){const d=new Date(+start+i*60000),month=d.getUTCMonth(),date=d.getUTCDate();if((month===2&&date===spring)||(month===10&&date===fall))return result('unknown','Daylight-saving transition; verify hours');
 const day=d.getUTCDay(),minute=d.getUTCHours()*60+d.getUTCMinutes();
 if(active(commercial,day,minute))restricted++;
 if(day!==0&&active(passenger,day,minute))paid++;
 }
 if(restricted)return result('restricted','Commercial meter schedule applies during part or all of your stay');
 if(paid===0)return result('inactive','No meter payment scheduled; other parking restrictions may still apply');
 if(paid!==hours*60)return result('unknown','Meter schedule changes during stay; check posted signs');
 const max=String(p.all_vehicl||'').match(/^(\d+) Hours?$/i);
 if(!max)return result('unknown','Maximum stay unrecognized');
 if(hours>Number(max[1]))return result('restricted','Selected stay exceeds published passenger meter limit');
 return result('paid','Passenger meter schedule active; verify posted restrictions',rateEstimate(p.all_vehi_2,hours));
}
