import {compileMeter} from './meter-schedule-v11.js';
import {indexMeters} from './meter-spatial.js';
import {createBasemapLoader} from './viewport-basemap.js';
// Time-aware meter inventory; official curb geometry, no sign matching.
const $=id=>document.getElementById(id),status=$('status'),mapStatus=$('map-status');
const base='https://data.cityofnewyork.us';
const empty=()=>({type:'FeatureCollection',features:[]});
const bryant=[-73.9832,40.7536];let center=[...bryant],inventory=null,map=null,ready=false,loadId=0,visible=[],localCount=0;
function el(tag,str,parent){const n=document.createElement(tag);n.textContent=str;parent.append(n);return n;}
async function json(url,signal){
 const controller=new AbortController(),abort=()=>controller.abort();
 const timer=setTimeout(abort,30000);
 if(signal?.aborted)abort();
 else signal?.addEventListener('abort',abort,{once:true});
 try{
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  return await response.json();
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener('abort',abort);
 }
}
function normalize(input){const raw=Array.isArray(input)?input:input?.features;if(!Array.isArray(raw))throw Error('Invalid data response');return raw.flatMap(row=>{const geometry=row.geometry||row.the_geom,p=row.properties||row;if(!['LineString','MultiLineString'].includes(geometry?.type))return [];const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.coordinates;if(!Array.isArray(lines)||!lines.length||!lines.every(line=>Array.isArray(line)&&line.length>=2&&line.every(c=>Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1])&&c[0]>=-180&&c[0]<=180&&c[1]>=-90&&c[1]<=90)))return [];return [{type:'Feature',geometry,properties:Object.fromEntries(Object.entries(p).filter(([k,v])=>k!=='the_geom'&&k!=='geometry'&&typeof v==='string'))}];});}
const nyClock=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function nyNow(){return nyClock.format(new Date()).replace(' ','T');}
const arrival=$('arrival'),stay=$('stay'),hide=$('hide-restricted');let live=true,gps=null,locationNote='Bryant Park preview',userMoved=false,locRequest=0;arrival.value=nyNow();
const color={paid:'#2563eb',inactive:'#26965c',restricted:'#cf4444',unknown:'#858b94'};
const labels={paid:'Passenger parking · meter active',inactive:'No meter payment scheduled',restricted:'Avoid',unknown:'Check signs'};
function valid(v){return v&&String(v).trim().toUpperCase()!=='N/A';}
function timeLabel(at){if(!at)return '';const d=new Date(at+'Z');const hh=d.getUTCHours(),mm=d.getUTCMinutes();return (hh%12||12)+(mm?':'+String(mm).padStart(2,'0'):'')+(hh<12?' AM':' PM');}
function heading(p){return [p.on_street,p.side_of_st].filter(Boolean).join(' · ')||'Meter blockface';}
// Keep the city's original values; only split them into readable rows.
function scheduleSection(parent,label,values){
 const items=values.map(v=>String(v).trim()).filter(Boolean);
 if(!items.length)return;
 const section=el('div','',parent);section.className='schedule-section';
 el('strong',label,section).className='schedule-label';
 const list=el('ul','',section);
 for(const value of items)el('li',value,list);
}
function details(p,parent){
 const wrap=el('div','',parent);wrap.className='schedule-details';
 const location=[p.from_stree&&p.to_street?'Between '+p.from_stree+' and '+p.to_street:'',valid(p.vehicle_ty)?p.vehicle_ty:''].filter(Boolean);
 scheduleSection(wrap,'Location & vehicle type',location);
 const passenger=valid(p.all_vehi_1)?String(p.all_vehi_1).split(/,\s*/):[];
 if(valid(p.all_vehicl))passenger.push('Maximum stay: '+p.all_vehicl);
 scheduleSection(wrap,'Passenger parking',passenger);
 scheduleSection(wrap,'Passenger rates',valid(p.all_vehi_2)?String(p.all_vehi_2).split(/\s+\/\s+/):[]);
 scheduleSection(wrap,'Commercial parking',valid(p.commerci_1)?String(p.commerci_1).split(/,\s*/):[]);
}
function card(p,node){el('strong',heading(p),node);const title=el('div',labels[p.state]||'Check signs',node);title.className='curb-state';title.style.color=color[p.state]||color.unknown;
 if(p.state==='paid'&&p.firstRate!==''&&p.firstRate!=null)el('div','$'+Number(p.firstRate).toFixed(2)+' first hour',node).className='price';
 if(p.nextText)el('div',p.nextText,node);
 if(p.plannedText)el('div',p.plannedText,node);
 if(p.state==='restricted'||p.state==='unknown')el('div',p.reason||'',node);
 if(p.maxHours)el('small',p.maxHours+'h posted meter limit'+(p.pay_by_cel?' · Zone '+p.pay_by_cel:''),node);else if(p.pay_by_cel)el('small','ParkNYC zone '+p.pay_by_cel,node);
 const more=el('details','',node);more.className='meter-schedule';el('summary','Full meter schedule',more);details(p,more);el('small','Meter schedule only. Check all posted signs.',node).className='caveat';}
function syncClock(){if(live)arrival.value=nyNow();$('time-label').textContent=live?'Now':arrival.value.replace('T',' ');if(Number(stay.value))$('time-label').textContent+=' · '+stay.value+'h';}
const nearbyPanel=$('nearby-panel');
let compileCache=new WeakMap(),assessmentCache=new WeakMap(),assessmentKey='';
function assess(feature,hours){
 if(!compileCache.has(feature))compileCache.set(feature,compileMeter(feature.properties));
 if(!assessmentCache.has(feature))assessmentCache.set(feature,compileCache.get(feature)(arrival.value,hours));
 return assessmentCache.get(feature);
}
function render(){syncClock();if(!inventory)return;const radius=Number($('radius').value),hours=Number(stay.value);const key=arrival.value+'|'+hours;
 if(key!==assessmentKey){assessmentCache=new WeakMap();assessmentKey=key;}
 const local=inventory(center,radius);localCount=local.length;const counts={paid:0,inactive:0,restricted:0,unknown:0};
 const assessed=local.map(f=>{const e=assess(f,hours);counts[e.state]++;let nextText='';if(e.next){const t=timeLabel(e.next.at)+(e.next.at.slice(0,10)!==arrival.value.slice(0,10)?' next day':'');if(e.current==='paid'&&e.next.state==='inactive')nextText='Meter payment ends '+t;else if(e.next.state==='restricted')nextText='Commercial restriction starts '+t;else if(e.next.state==='paid')nextText='Meter payment starts '+t;else if(e.current==='restricted')nextText='Commercial schedule ends '+t;}
 let plannedText='';if(hours&&['paid','inactive'].includes(e.state)){if(e.cost!=null)plannedText='Estimated meter cost: $'+e.cost.toFixed(2)+' / '+hours+'h';else if(e.paidMinutes!=null&&e.paidMinutes<hours*60)plannedText=e.paidMinutes+' min of planned stay in paid hours; exact charge varies';}
 return {...f,properties:{...f.properties,state:e.state,color:color[e.state],reason:e.reason,firstRate:e.firstRate??'',maxHours:e.maxHours??'',nextText,plannedText}};});
 visible=assessed.filter(f=>!hide.checked||f.properties.state!=='restricted');status.textContent=locationNote+' · '+counts.paid+' paid · '+counts.inactive+' no scheduled payment'+(counts.unknown?' · '+counts.unknown+' review':'')+(counts.restricted?' · '+counts.restricted+' avoid':'');
 visibleById=new Map(visible.map(f=>[featureIds.get(f.geometry),f]));
 if(ready)map.getSource('meters').setData({type:'FeatureCollection',features:visible.map(f=>({
  type:'Feature',geometry:f.geometry,properties:{id:featureIds.get(f.geometry),color:f.properties.color}
 }))});
 if(nearbyPanel.open)renderList();
}
function renderList(){
 if(!inventory)return;
 const list=$('results');list.replaceChildren();if(!visible.length)el('p',localCount?'No blockfaces pass this filter. Change settings to show restricted curbs.':'No meter records in this area.',list);
 const rank={paid:1,inactive:0,unknown:2,restricted:3};for(const f of [...visible].sort((a,b)=>rank[a.properties.state]-rank[b.properties.state]).slice(0,40)){const a=el('article','',list);card(f.properties,a);const btn=el('button','Show on map',a);btn.onclick=()=>{const coord=f.geometry.type==='LineString'?f.geometry.coordinates[0]:f.geometry.coordinates[0][0];if(ready)map.flyTo({center:coord,zoom:18});};}
}
nearbyPanel.addEventListener('toggle',()=>{if(nearbyPanel.open)renderList();});
function renderFocus(){
 if(ready&&gps)map.getSource('focus').setData({type:'FeatureCollection',features:[
  {type:'Feature',geometry:{type:'Point',coordinates:gps},properties:{}}
 ]});
}
let featureIds=new WeakMap(),visibleById=new Map(),nextFeatureId=0;
arrival.onchange=()=>{live=false;render();};stay.onchange=render;hide.onchange=render;$('now').onclick=()=>{live=true;render();};$('settings').onclick=()=>{$('settings-panel').showModal();};$('done').onclick=()=>{$('settings-panel').close();render();};
setInterval(()=>{if(live&&arrival.value!==nyNow())render();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&live)render();});
async function load(){const id=++loadId;status.textContent='Loading official NYC meter inventory…';let features;try{try{const snap=await json('https://raw.githubusercontent.com/chrisgaun/curbnyc/main/data/meters.json?day='+new Date().toISOString().slice(0,10));features=normalize(snap);if(features.length<9000)throw Error('Incomplete local snapshot');}catch{let rows=[];for(let offset=0;offset<30000;offset+=5000){const url=new URL(base+'/resource/e7yp-wx55.json');url.searchParams.set('$limit','5000');url.searchParams.set('$offset',String(offset));url.searchParams.set('$order',':id');const page=await json(url);if(!Array.isArray(page))throw Error('Expected meter records');rows.push(...page);if(page.length<5000)break;if(offset===25000)throw Error('Pagination limit exceeded');}features=normalize(rows);if(features.length<9000)throw Error('Incomplete inventory ('+features.length+' valid lines)');}if(id!==loadId)return;featureIds=new WeakMap(features.map(feature=>[feature.geometry,nextFeatureId++]));compileCache=new WeakMap();assessmentCache=new WeakMap();inventory=indexMeters(features);render();}catch(e){if(id!==loadId)return;status.textContent='Meter load failed: '+e.message+'. Use Reload meter data or the official NYC map.';}}
const basemap=createBasemapLoader({
 getBounds:()=>map.getBounds(),
 fetchGeometry:json,
 apply:(name,data)=>map.getSource(name).setData(data),
 report:message=>{mapStatus.textContent=message;}
});
function move(p,note){center=p;locationNote=note;if(ready)map.jumpTo({center:p,zoom:16});render();}
function locate(auto=false){const id=++locRequest;if(!navigator.geolocation){locationNote='Location unavailable · Bryant Park preview';render();return;}if(!auto)userMoved=false;locationNote='Finding your location…';render();navigator.geolocation.getCurrentPosition(p=>{if(id!==locRequest)return;gps=[p.coords.longitude,p.coords.latitude];renderFocus();if(!userMoved)move(gps,'Near you');else render();},e=>{if(id!==locRequest)return;locationNote='Location unavailable · browsing map';render();if(!inventory)status.textContent=locationNote;},{timeout:12000,maximumAge:30000,enableHighAccuracy:true});}
$('radius').onchange=render;$('retry').onclick=load;$('loc').onclick=()=>locate(false);$('bryant').onclick=()=>{userMoved=true;++locRequest;move([...bryant],'Bryant Park');};
try{const attribution='NYC Open Data';map=new maplibregl.Map({container:'map',center,zoom:16,minZoom:14,maxZoom:19,style:{version:8,glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',sources:Object.fromEntries(['buildings','parks','streets','meters','focus'].map(n=>[n,{type:'geojson',data:empty(),attribution}])),layers:[
{id:'background',type:'background',paint:{'background-color':'#eeeee8'}},{id:'parks',type:'fill',source:'parks',paint:{'fill-color':'#c8dbc0'}},{id:'buildings',type:'fill',source:'buildings',paint:{'fill-color':'#d6d7d2','fill-outline-color':'#c7c9c3'}},{id:'road-outline',type:'line',source:'streets',paint:{'line-color':'#d1d3cd','line-width':['interpolate',['linear'],['zoom'],14,5,16,15,19,65]}},{id:'roads',type:'line',source:'streets',paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],14,3,16,13,19,63]}},{id:'street-names',type:'symbol',source:'streets',layout:{'symbol-placement':'line','text-field':['coalesce',['get','st_label'],['get','street'],['get','full_stree'],''],'text-font':['Open Sans Regular'],'text-size':11},paint:{'text-color':'#505a5d','text-halo-color':'#fff','text-halo-width':1}},{id:'meters',type:'line',source:'meters',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#858b94'],'line-width':['interpolate',['linear'],['zoom'],14,3,16,6,19,9]}},{id:'focus',type:'circle',source:'focus',paint:{'circle-radius':7,'circle-color':'#2265bf','circle-stroke-width':2,'circle-stroke-color':'#fff'}}]}});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');map.once('load',()=>{ready=true;map.jumpTo({center});render();renderFocus();basemap();map.on('dragstart',()=>{userMoved=true;});map.on('moveend',()=>{const c=map.getCenter();const moved=Math.hypot(c.lng-center[0],c.lat-center[1])>0.00001;if(moved){center=[c.lng,c.lat];locationNote='Browsing map';render();}basemap();});map.on('click','meters',e=>{const p=visibleById.get(e.features[0].properties.id)?.properties;if(!p)return;const node=document.createElement('div');card(p,node);new maplibregl.Popup({maxWidth:'300px'}).setLngLat(e.lngLat).setDOMContent(node).addTo(map);});});map.on('error',e=>{if(!ready)mapStatus.textContent='Map error: '+(e.error?.message||'Map could not initialize')+'; meter list works independently.';});setTimeout(()=>{if(!ready)mapStatus.textContent='Map not ready. Meter list loads independently.';},12000);
}catch(e){mapStatus.textContent='Map unavailable: '+e.message+'; meter list works independently.';}
load();locate(true);if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
