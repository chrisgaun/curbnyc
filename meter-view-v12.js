import {setupDestinationSearch} from './destination-search.js';
import {readMapPreferences,saveMapPreferences} from './map-preferences.js';
import {applyMapTheme,applyMeterPatterns,applyPageTheme,mapPaint,meterLineWidth,meterPatternLayers,resolveTheme} from './map-theme.js';
import {plannedAspDays} from './asp-calendar.js';
import {compileMeter} from './meter-schedule-v11.js';
import {indexMeters} from './meter-spatial.js';
import {createBasemapLoader} from './viewport-basemap.js';
import {readPackedMeters} from './meter-packed.js';
// Time-aware meter inventory; official curb geometry, no sign matching.
const $=id=>document.getElementById(id),status=$('status'),mapStatus=$('map-status');
const base='https://data.cityofnewyork.us';
const empty=()=>({type:'FeatureCollection',features:[]});
const bryant=[-73.9832,40.7536];let center=[...bryant],inventory=null,map=null,ready=false,loadId=0,visible=[],localCount=0;
function el(tag,str,parent){const n=document.createElement(tag);n.textContent=str;parent.append(n);return n;}
async function request(url,signal,read){
 const controller=new AbortController(),abort=()=>controller.abort();
 const timer=setTimeout(abort,30000);
 if(signal?.aborted)abort();
 else signal?.addEventListener('abort',abort,{once:true});
 try{
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  return await read(response);
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener('abort',abort);
 }
}
const json=(url,signal)=>request(url,signal,response=>response.json());
function normalize(input){const raw=Array.isArray(input)?input:input?.features;if(!Array.isArray(raw))throw Error('Invalid data response');return raw.flatMap(row=>{const geometry=row.geometry||row.the_geom,p=row.properties||row;if(!['LineString','MultiLineString'].includes(geometry?.type))return [];const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.coordinates;if(!Array.isArray(lines)||!lines.length||!lines.every(line=>Array.isArray(line)&&line.length>=2&&line.every(c=>Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1])&&c[0]>=-180&&c[0]<=180&&c[1]>=-90&&c[1]<=90)))return [];return [{type:'Feature',geometry,properties:Object.fromEntries(Object.entries(p).filter(([k,v])=>k!=='the_geom'&&k!=='geometry'&&typeof v==='string'))}];});}
const nyClock=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function nyNow(){return nyClock.format(new Date()).replace(' ','T');}
const arrival=$('arrival'),stay=$('stay'),hide=$('hide-restricted'),radiusControl=$('radius');
const preferences=readMapPreferences();
const themeControl=$('theme'),patternControl=$('line-patterns'),systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
themeControl.value=preferences.theme;
patternControl.checked=preferences.linePatterns;
let theme=resolveTheme(themeControl.value,systemTheme.matches);
applyPageTheme(document.documentElement,theme);
function syncPatterns(){
 document.documentElement.dataset.linePatterns=String(patternControl.checked);
 if(ready)applyMeterPatterns(map,theme,patternControl.checked);
}
syncPatterns();
function syncTheme(){
 const next=resolveTheme(themeControl.value,systemTheme.matches);
 if(next===theme)return;
 theme=next;
 applyPageTheme(document.documentElement,theme);
 if(ready)applyMapTheme(map,theme);
 syncPatterns();
}
systemTheme.addEventListener('change',syncTheme);
radiusControl.value=preferences.radius;
hide.checked=preferences.hideRestricted;let live=true,gps=null,locationNote='Bryant Park preview',userMoved=false,locRequest=0;arrival.value=nyNow();
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
function card(p,node){const header=el('div','',node);header.className='curb-card-header';el('strong',heading(p),header);const title=el('div',labels[p.state]||'Check signs',node);title.className='curb-state';title.dataset.state=Object.hasOwn(labels,p.state)?p.state:'unknown';
 if(p.state==='paid'){
  const rate=p.firstRate===''||p.firstRate==null?'Meter rate needs review'
   :'$'+Number(p.firstRate).toFixed(2)+(p.rateMinutes===60?' first hour':' per '+p.rateMinutes+' min');
  el('div',rate,node).className=p.firstRate===''?'':'price';
 }
 if(p.nextText)el('div',p.nextText,node);
 if(p.plannedText)el('div',p.plannedText,node);
 if(p.state==='restricted'||p.state==='unknown')el('div',p.reason||'',node);
 if(p.maxHours)el('small',(p.maxHours<1?p.maxHours*60+' min':p.maxHours+'h')+' posted meter limit'+(p.pay_by_cel?' · Zone '+p.pay_by_cel:''),node);else if(p.pay_by_cel)el('small','ParkNYC zone '+p.pay_by_cel,node);
 const more=el('details','',node);more.className='meter-schedule';el('summary','Full meter schedule',more);details(p,more);el('small','Meter schedule only. Check all posted signs.',node).className='caveat';return header;}
let lastAspWindow;
const aspDate=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
function syncClock(){
 if(live)arrival.value=nyNow();
 $('time-label').textContent=live?'Now':arrival.value.replace('T',' ');
 if(Number(stay.value))$('time-label').textContent+=' · '+stay.options[stay.selectedIndex].text;
 const key=arrival.value+'|'+stay.value;
 if(key===lastAspWindow)return;
 lastAspWindow=key;
 const planned=plannedAspDays(arrival.value,Number(stay.value));
 const note=$('asp-status');
 if(!planned){
  note.textContent='Choose a valid NYC arrival time to check the planned street cleaning calendar.';
  return;
 }
 const list=days=>days.map(day=>aspDate.format(new Date(day.day+'T00:00Z'))).join(', ');
 const suspended=planned.days.filter(day=>day.status==='planned-suspension');
 const missing=planned.days.filter(day=>day.status==='unavailable');
 const reported=suspended.length?'Planned street cleaning suspension: '+list(suspended)+'.':
  missing.length===planned.days.length?'':
  missing.length?'No planned holiday suspension listed for '+list(planned.days.filter(day=>day.status==='not-listed'))+'.':
  'No planned holiday suspension listed for your selected time.';
 const unavailable=missing.length?' Calendar unavailable for '+list(missing)+'.':'';
 note.textContent=(reported+unavailable).trim()+' DOT calendar verified '+planned.checked+'.';
}
const nearbyPanel=$('nearby-panel');
let compileCache=new WeakMap(),assessmentCache=new WeakMap(),assessmentKey='';
function assess(feature,hours){
 if(!compileCache.has(feature))compileCache.set(feature,compileMeter(feature.properties));
 if(!assessmentCache.has(feature))assessmentCache.set(feature,compileCache.get(feature)(arrival.value,hours));
 return assessmentCache.get(feature);
}
function render(){syncClock();if(!inventory)return;const radius=Number(radiusControl.value),hours=Number(stay.value);const key=arrival.value+'|'+hours;
 if(key!==assessmentKey){assessmentCache=new WeakMap();assessmentKey=key;}
 const local=inventory(center,radius);localCount=local.length;const counts={paid:0,inactive:0,restricted:0,unknown:0};
 const assessed=local.map(f=>{const e=assess(f,hours);counts[e.state]++;let nextText='';if(e.next){const t=timeLabel(e.next.at)+(e.next.at.slice(0,10)!==arrival.value.slice(0,10)?' next day':'');if(e.current==='paid'&&e.next.state==='inactive')nextText='Meter payment ends '+t;else if(e.next.state==='restricted')nextText='Commercial restriction starts '+t;else if(e.next.state==='paid')nextText='Meter payment starts '+t;else if(e.next.state==='unknown')nextText='Meter schedule needs review from '+t;else if(e.current==='restricted')nextText='Commercial schedule ends '+t;}
 let plannedText='';if(hours&&['paid','inactive'].includes(e.state)){if(e.cost!=null)plannedText='Estimated meter cost: $'+e.cost.toFixed(2)+' / '+stay.options[stay.selectedIndex].text;else if(e.paidMinutes!=null&&e.paidMinutes<hours*60)plannedText=e.paidMinutes+' min in scheduled paid hours. Check the meter for the charge.';else plannedText='Check the meter for the charge for this stay.';}
 return {...f,properties:{...f.properties,state:e.state,reason:e.reason,firstRate:e.firstRate??'',rateMinutes:e.rateMinutes,maxHours:e.maxHours??'',nextText,plannedText}};});
 visible=assessed.filter(f=>!hide.checked||f.properties.state!=='restricted');status.textContent=locationNote+' · '+counts.paid+' paid · '+counts.inactive+' no scheduled payment'+(counts.unknown?' · '+counts.unknown+' review':'')+(counts.restricted?' · '+counts.restricted+' avoid':'')+(meterLoadWarning?' · Refresh failed':meterDataStale?' · Older meter snapshot':'')+(navigator.onLine===false?' · Offline':'');
 visibleById=new Map(visible.map(f=>[featureIds.get(f.geometry),f]));
 if(ready)map.getSource('meters').setData({type:'FeatureCollection',features:visible.map(f=>({
  type:'Feature',geometry:f.geometry,properties:{id:featureIds.get(f.geometry),state:f.properties.state}
 }))});
 if(nearbyPanel.open)renderList();
 refreshCurbPopup(assessed);
}
let activePopup,nearbySelected;
let popupCard;
function returnToNearby(id){
 nearbyPanel.open=true;
 const target=$('results').querySelector(`button[data-curb-id="${id}"]`)??nearbyPanel.querySelector('summary');
 target.focus();
}

function updatePopupCard(selection,properties){
 const signature=JSON.stringify([properties.state,properties.reason,properties.firstRate,
  properties.rateMinutes,properties.maxHours,properties.nextText,properties.plannedText]);
 if(selection.signature===signature)return;
 selection.signature=signature;
 const {body,region}=selection;
 const previous=body.querySelector('.meter-schedule');
 const expanded=previous?.open??false;
 const focused=previous?.querySelector('summary')===document.activeElement;
 body.replaceChildren();
 card(properties,body);
 const schedule=body.querySelector('.meter-schedule');
 schedule.open=expanded;
 if(focused)schedule.querySelector('summary').focus({preventScroll:true});
 if(region)region.setAttribute('aria-label',heading(properties)+' · '+(labels[properties.state]||'Check signs'));
}

function refreshCurbPopup(assessed){
 if(!popupCard)return;
 const {id,body,region}=popupCard;
 const updated=assessed.find(feature=>featureIds.get(feature.geometry)===id);
 if(updated){
  updatePopupCard(popupCard,updated.properties);
  return;
 }
 const hadFocus=(region??body).closest('.maplibregl-popup-content')?.contains(document.activeElement);
 activePopup.remove();
 if(hadFocus){
  if(region)returnToNearby(id);
  else map.getCanvas().focus({preventScroll:true});
 }
}

function attachCurbPopup(popup,node,body,id,properties,coord,region){
 const selection={id,body,region};
 updatePopupCard(selection,properties);
 popup.on('close',()=>{
  if(activePopup!==popup)return;
  activePopup=undefined;
  popupCard=undefined;
  nearbySelected=undefined;
 });
 activePopup=popup.setLngLat(coord).setDOMContent(node).addTo(map);
 popupCard=selection;
}

function showNearbyCurb(feature,id){
 if(!ready)return;
 activePopup?.remove();
 const lines=feature.geometry.type==='LineString'?[feature.geometry.coordinates]:feature.geometry.coordinates;
 const coord=lines[0][0];
 const node=document.createElement('div');
 node.setAttribute('role','region');
 node.tabIndex=-1;
 const body=el('div','',node);
 const back=el('button','Back to nearby meters',node);
 back.type='button';
 const popup=new maplibregl.Popup({maxWidth:'300px',closeButton:false,closeOnClick:false,focusAfterOpen:false});
 const close=()=>{
  popup.remove();
  returnToNearby(id);
 };
 back.onclick=close;
 node.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  event.preventDefault();
  event.stopPropagation();
  close();
 });
 userMoved=true;
 ++locRequest;
 nearbySelected=id;
 map.jumpTo({center:coord,zoom:18});
 attachCurbPopup(popup,node,body,id,feature.properties,coord,node);
 $('map-wrap').scrollIntoView({block:'nearest'});
 node.focus({preventScroll:true});
}

function renderList(){
 if(!inventory)return;
 const list=$('results'),active=document.activeElement;
 const focusedCard=active?.closest('article[data-curb-id]');
 const focused=focusedCard&&list.contains(focusedCard)?focusedCard.dataset.curbId:undefined;
 const focusSelector=active?.matches('.meter-schedule > summary')?'.meter-schedule > summary':'button[data-curb-id]';
 const expanded=new Set([...list.querySelectorAll('article[data-curb-id]')].filter(
  article=>article.querySelector('.meter-schedule').open
 ).map(article=>article.dataset.curbId));
 list.replaceChildren();
 if(!visible.length){
  const message=localCount?'All nearby meter records are hidden by your settings.':
   'No meter records within '+$('radius').value+' m of this map location.';
  el('p',message,list);
  const retry=el('button',localCount?'Show restricted curbs':'Browse Bryant Park',list);
  retry.type='button';
  retry.onclick=()=>{
   if(localCount){
    hide.checked=false;
    hide.onchange();
   }else{
    $('bryant').click();
   }
   list.focus();
  };
 }
 const rank={paid:1,inactive:0,unknown:2,restricted:3};
 const cards=[...visible].sort((a,b)=>rank[a.properties.state]-rank[b.properties.state]).slice(0,40);
 const selected=visibleById.get(nearbySelected);
 if(selected&&!cards.includes(selected))cards[cards.length-1]=selected;
 let nextFocus;
 for(const feature of cards){
  const id=featureIds.get(feature.geometry);
  const article=el('article','',list);
  article.dataset.curbId=id;
  const header=card(feature.properties,article);
  article.querySelector('.meter-schedule').open=expanded.has(String(id));
  const button=el('button','Show on map',header);
  button.dataset.curbId=id;
  button.disabled=!ready;
  button.setAttribute('aria-label','Show on map: '+heading(feature.properties));
  button.onclick=()=>showNearbyCurb(feature,id);
  if(focused===String(id))nextFocus=article.querySelector(focusSelector);
 }
 if(focused!==undefined)(nextFocus??nearbyPanel.querySelector('summary')).focus({preventScroll:true});
}
const nearbyToggle=$('nearby-toggle');
nearbyToggle.onclick=()=>{
 nearbyPanel.open=true;
 renderList();
 const results=$('results');
 results.scrollIntoView({block:'start'});
 results.focus({preventScroll:true});
};
nearbyPanel.addEventListener('toggle',()=>{
 nearbyToggle.setAttribute('aria-expanded',String(nearbyPanel.open));
 if(nearbyPanel.open)renderList();
});
function renderFocus(){
 if(ready&&gps)map.getSource('focus').setData({type:'FeatureCollection',features:[
  {type:'Feature',geometry:{type:'Point',coordinates:gps},properties:{}}
 ]});
}
let featureIds=new WeakMap(),visibleById=new Map(),nextFeatureId=0;
arrival.onchange=()=>{live=false;render();};stay.onchange=render;$('now').onclick=()=>{live=true;render();};$('settings').onclick=()=>{$('settings-panel').showModal();};$('done').onclick=()=>{$('settings-panel').close();render();};
setInterval(()=>{if(live&&arrival.value!==nyNow())render();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&live)render();});
const snapshotStatus=$('snapshot-status');
let meterDataNote='',meterLoadWarning='',meterDataStale=false,meterRequest;
function showMeterDataNote(){
 snapshotStatus.textContent=[meterDataNote,meterLoadWarning].filter(Boolean).join(' ');
}
function snapshotNote(snapshot){
 const timestamp=snapshot?.metadata?.fetchedAt;
 const time=typeof timestamp==='string'?Date.parse(timestamp):NaN;
 if(!Number.isFinite(time)||time>Date.now())return {note:'NYC meter snapshot. Refresh date unavailable.',stale:false};
 const stale=Date.now()-time>45*24*60*60*1000;
 const version=String(snapshot.metadata.version??'');
 const shortId=/^[a-f0-9]{64}$/.test(version)?' · '+version.slice(0,8):'';
 return {note:'NYC meter snapshot · fetched '+timestamp.slice(0,10)+shortId+'.'+(stale?' This snapshot may be out of date.':''),stale};
}
async function load(){
 const day=new Date().toISOString().slice(0,10);
 // Bot commits update main without rebuilding branch-published GitHub Pages.
 const snapshotBase=['localhost','127.0.0.1','[::1]'].includes(location.hostname)
  ?'./data/'
  :'https://raw.githubusercontent.com/chrisgaun/curbnyc/main/data/';
 const id=++loadId;
 meterRequest?.abort();
 const controller=new AbortController();
 meterRequest=controller;
 const {signal}=controller;
 status.textContent='Loading official NYC meter inventory…';
 try{
  let features,source;
  try{
   if(typeof DecompressionStream==='function'){
    try{
     const compact=await request(snapshotBase+'meters-v1.bin.gz?day='+day,signal,readPackedMeters);
     if(compact.features.length<9000)throw Error('Incomplete compact meter snapshot');
     features=compact.features;
     source=snapshotNote(compact);
    }catch(error){
     if(signal.aborted)throw error;
    }
   }
   if(!features){
    const snapshot=await json(snapshotBase+'meters.json?day='+day,signal);
    features=normalize(snapshot);
    if(features.length<9000)throw Error('Incomplete meter snapshot');
    source=snapshotNote(snapshot);
   }
  }catch(error){
   if(signal.aborted)throw error;
   const rows=[];
   for(let offset=0;offset<30000;offset+=5000){
    const url=new URL(base+'/resource/e7yp-wx55.json');
    url.searchParams.set('$limit','5000');
    url.searchParams.set('$offset',String(offset));
    url.searchParams.set('$order',':id');
    const page=await json(url,signal);
    if(!Array.isArray(page))throw Error('Expected meter records');
    rows.push(...page);
    if(page.length<5000)break;
    if(offset===25000)throw Error('Pagination limit exceeded');
   }
   features=normalize(rows);
   if(features.length<9000)throw Error('Incomplete inventory ('+features.length+' valid lines)');
   source={note:'NYC Open Data · retrieved '+day+'.',stale:false};
  }
  if(id!==loadId)return;
  featureIds=new WeakMap(features.map(feature=>[feature.geometry,nextFeatureId++]));
  compileCache=new WeakMap();
  assessmentCache=new WeakMap();
  inventory=indexMeters(features);
  meterDataNote=source.note;
  meterDataStale=source.stale;
  meterLoadWarning='';
  showMeterDataNote();
  render();
 }catch(e){
  if(id!==loadId)return;
  if(inventory){
   meterLoadWarning='Refresh failed. Showing the last loaded meter data.';
   showMeterDataNote();
   render();
  }else{
   status.textContent='Meter load failed: '+e.message+'. Try Reload data or check the official NYC map.';
   $('results').replaceChildren();
   el('p','Meter data is unavailable. Use Reload data below to try again.',$('results'));
  }
 }finally{
  if(meterRequest===controller)meterRequest=undefined;
 }
}
const basemap=createBasemapLoader({
 getBounds:()=>map.getBounds(),
 fetchGeometry:json,
 apply:(name,data)=>map.getSource(name).setData(data),
 report:message=>{mapStatus.textContent=message;}
});
function move(p,note){center=p;locationNote=note;if(ready)map.jumpTo({center:p,zoom:16});render();}
function locate(auto=false){const id=++locRequest;if(!navigator.geolocation){locationNote='Location unavailable · Bryant Park preview';render();return;}if(!auto)userMoved=false;locationNote='Finding your location…';render();navigator.geolocation.getCurrentPosition(p=>{if(id!==locRequest)return;gps=[p.coords.longitude,p.coords.latitude];renderFocus();if(!userMoved)move(gps,'Near you');else render();},e=>{if(id!==locRequest)return;locationNote='Location unavailable · browsing map';render();if(!inventory)status.textContent=locationNote;},{timeout:12000,maximumAge:30000,enableHighAccuracy:true});}
function persistPreferences(){
 saveMapPreferences({radius:radiusControl.value,hideRestricted:hide.checked,theme:themeControl.value,linePatterns:patternControl.checked});
}
function updateMapPreferences(){
 persistPreferences();
 render();
}
radiusControl.onchange=updateMapPreferences;
hide.onchange=updateMapPreferences;
themeControl.onchange=()=>{
 persistPreferences();
 syncTheme();
};
patternControl.onchange=()=>{persistPreferences();syncPatterns();};
window.addEventListener('online',render);
window.addEventListener('offline',render);
setupDestinationSearch({
 open:$('search-toggle'),dialog:$('search-panel'),form:$('search-form'),
 input:$('destination'),status:$('search-status'),results:$('search-results'),close:$('search-close'),
 onSelect:({center:destination,label,borough})=>{
  userMoved=true;
  ++locRequest;
  move(destination,label+' · '+borough);
 }
});
$('retry').onclick=load;$('loc').onclick=()=>locate(false);$('bryant').onclick=()=>{userMoved=true;++locRequest;move([...bryant],'Bryant Park');};
try{const attribution='NYC Open Data',paint=mapPaint(theme);map=new maplibregl.Map({container:'map',center,zoom:16,minZoom:14,maxZoom:19,style:{version:8,glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',sources:Object.fromEntries(['buildings','parks','streets','meters','focus'].map(n=>[n,{type:'geojson',data:empty(),attribution}])),layers:[
{id:'background',type:'background',paint:paint.background},{id:'parks',type:'fill',source:'parks',paint:paint.parks},{id:'buildings',type:'fill',source:'buildings',paint:paint.buildings},{id:'road-outline',type:'line',source:'streets',paint:{...paint['road-outline'],'line-width':['interpolate',['linear'],['zoom'],14,5,16,15,19,65]}},{id:'roads',type:'line',source:'streets',paint:{...paint.roads,'line-width':['interpolate',['linear'],['zoom'],14,3,16,13,19,63]}},{id:'street-names',type:'symbol',source:'streets',layout:{'symbol-placement':'line','text-field':['coalesce',['get','st_label'],['get','street'],['get','full_stree'],''],'text-font':['Noto Sans Regular'],'text-size':11},paint:{...paint['street-names'],'text-halo-width':1}},{id:'meters',type:'line',source:'meters',layout:{'line-cap':'round','line-join':'round'},paint:{...paint.meters,'line-width':meterLineWidth,'line-opacity':patternControl.checked?0:1}},...meterPatternLayers(theme,patternControl.checked),{id:'focus',type:'circle',source:'focus',paint:{...paint.focus,'circle-radius':7,'circle-stroke-width':2}}]}});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');map.once('load',()=>{ready=true;applyMapTheme(map,theme);syncPatterns();map.jumpTo({center});render();renderFocus();basemap();map.on('dragstart',()=>{userMoved=true;});map.on('moveend',()=>{const c=map.getCenter();const moved=Math.hypot(c.lng-center[0],c.lat-center[1])>0.00001;if(moved){center=[c.lng,c.lat];locationNote='Browsing map';render();}basemap();});map.on('click','meters',e=>{const id=e.features[0].properties.id,p=visibleById.get(id)?.properties;if(!p)return;activePopup?.remove();const node=document.createElement('div');attachCurbPopup(new maplibregl.Popup({maxWidth:'300px'}),node,node,id,p,e.lngLat);});});map.on('error',e=>{if(!ready)mapStatus.textContent='Map error: '+(e.error?.message||'Map could not initialize')+'; meter list works independently.';});setTimeout(()=>{if(!ready)mapStatus.textContent='Map not ready. Meter list loads independently.';},12000);
}catch(e){mapStatus.textContent='Map unavailable: '+e.message+'; meter list works independently.';}
load();locate(true);if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
