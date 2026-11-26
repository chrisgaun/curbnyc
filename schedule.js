// Conservative recurring schedule hints, not a legal determination.
const days=['SUN','MON','TUE','WED','THU','FRI','SAT'];
export function assess(raw,arrival,stay=120){
 const s=raw.toUpperCase().replace(/MONDAY/g,'MON').replace(/TUESDAY/g,'TUE').replace(/WEDNESDAY/g,'WED').replace(/THURSDAY/g,'THU').replace(/FRIDAY/g,'FRI').replace(/SATURDAY/g,'SAT').replace(/SUNDAY/g,'SUN').replace(/THURS\b/g,'THU').replace(/TUES\b/g,'TUE').replace(/\bTHRU\b|\bTHROUGH\b|\bTO\b/g,'-').replace(/\s+/g,' ').trim();
 const restricted=/NO (PARKING|STANDING|STOPPING)|COMMERCIAL VEHICLES ONLY|TRUCK LOADING ONLY|LOADING ONLY|AUTHORIZED VEHICLES ONLY|BUS STOP|TAXI STAND/.test(s);
 const meter=/METERED PARKING|MUNI.?METER/.test(s)&&!restricted;
 if(!restricted&&!meter)return 'unknown';
 const start=new Date(arrival+'Z');if(!Number.isFinite(+start)||!Number.isFinite(stay)||stay<1||stay>1440)return 'unknown';
 if(/HOLIDAY|SCHOOL|EXCEPT (?!SUN\b)|WHEN |AND |\bOR\b|MIDNIGHT|NOON/.test(s))return 'unknown';
 const ranges=[...s.matchAll(/\b(SUN|MON|TUE|WED|THU|FRI|SAT)\s*-\s*(SUN|MON|TUE|WED|THU|FRI|SAT)\b/g)];
 const exceptSun=/EXCEPT SUN\b/.test(s);
 let activeDays=new Set(days);
 if(ranges.length===1&&!exceptSun){activeDays=new Set();let a=days.indexOf(ranges[0][1]),b=days.indexOf(ranges[0][2]);for(let i=0;i<7;i++){activeDays.add(days[(a+i)%7]);if((a+i)%7===b)break;}}
 else if(exceptSun&&ranges.length===0)activeDays.delete('SUN');
 else if(ranges.length||/\b(SUN|MON|TUE|WED|THU|FRI|SAT)\b/.test(s))return 'unknown';
 const rest=s.replace(/\b(SUN|MON|TUE|WED|THU|FRI|SAT)\s*-\s*(SUN|MON|TUE|WED|THU|FRI|SAT)\b/g,'').replace(/EXCEPT SUN\b/g,'');
 if(/\b(SUN|MON|TUE|WED|THU|FRI|SAT)\b/.test(rest))return 'unknown';
 const time=[...s.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/g)];
 let lo=0,hi=1440;
 if(time.length===1){const t=time[0],parse=(h,m,a)=>+h>=1&&+h<=12&&+(m||0)<60?(+h%12)*60+(a==='PM'?720:0)+ +(m||0):NaN;lo=parse(t[1],t[2],t[3]);hi=parse(t[4],t[5],t[6]);if(!(lo<hi)||/\b(AM|PM)\b/.test(s.replace(t[0],'')))return 'unknown';}
 else if(time.length||/\b(AM|PM)\b/.test(s)||(!/ANY\s*TIME|AT ALL TIMES/.test(s)&&!exceptSun&&!ranges.length))return 'unknown';
 const max=s.match(/\b(\d+)\s*H(?:OU)?RS?\b/);if(meter&&(!max||stay>+max[1]*60))return 'unknown';
 let on=0;
 for(let i=0;i<stay;i++){const d=new Date(+start+i*60000),day=days[d.getUTCDay()],m=d.getUTCHours()*60+d.getUTCMinutes();if(activeDays.has(day)&&m>=lo&&m<hi)on++;}
 if(restricted)return on?'avoid':'candidate';
 return on===stay?'meter':on===0?'candidate':'unknown';
}
export function aggregate(states){if(states.includes('avoid'))return 'avoid';if(!states.length||states.includes('unknown'))return 'unknown';if(states.includes('meter'))return 'meter';return 'candidate';}
