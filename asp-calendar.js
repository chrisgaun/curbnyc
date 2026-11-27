import {calendar} from './asp-calendar-data.js';

const dayMs=86400000;
const isoDay=date=>date.toISOString().slice(0,10);
const publishedYear=date=>calendar.years[date.getUTCFullYear()];

export function isMeterHoliday(date){
 const published=publishedYear(date);
 if(published)return published.dates[isoDay(date)]===true;
 // Preserve the recurring-date rule when no official publication is bundled.
 const month=date.getUTCMonth(),day=date.getUTCDate(),weekday=date.getUTCDay();
 return (month===0&&day===1)||(month===4&&weekday===1&&day>=25)||(month===6&&day===4)||
  (month===8&&weekday===1&&day<=7)||(month===10&&weekday===4&&day>=22&&day<=28)||(month===11&&day===25);
}

export function plannedAspDays(arrival,hours=0){
 if(typeof arrival!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(arrival)||
    !Number.isFinite(hours)||hours<0||hours>6||!Number.isInteger(hours*60))return null;
 const start=new Date(arrival+'Z');
 if(!Number.isFinite(+start)||start.toISOString().slice(0,16)!==arrival)return null;
 const midnight=Date.parse(isoDay(start)+'T00:00:00Z');
 // A stay that ends exactly at midnight does not include the new date.
 const lastMinute=+start+Math.max(0,hours*60-1)*60000;
 const days=[];
 for(let time=midnight;time<=lastMinute;time+=dayMs){
  const date=new Date(time),day=isoDay(date),published=publishedYear(date);
  const status=published?(Object.hasOwn(published.dates,day)?'planned-suspension':'not-listed'):'unavailable';
  days.push({day,status});
 }
 return {checked:calendar.checked,days};
}
