import {category,distance} from './rules.js';
const $=id=>document.getElementById(id), status=$('status'), results=$('results');
const map=L.map('map',{minZoom:12,maxZoom:19}).setView([40.7536,-73.9832],16);
// NYC GIS planimetric basemap and separate street labels, without business POIs.
const tileOptions={minNativeZoom:8,maxNativeZoom:19,subdomains:'1234',bounds:L.latLngBounds([40.0341,-74.2727],[41.2919,-71.9101]),attribution:'<a href="https://gis.nyc.gov/tiles/">NYC GIS</a>'};
L.tileLayer('https://maps{s}.nyc.gov/xyz/1.0.0/carto/basemap/{z}/{x}/{y}.jpg',tileOptions).addTo(map);
L.tileLayer('https://maps{s}.nyc.gov/xyz/1.0.0/carto/label/{z}/{x}/{y}.png8',tileOptions).addTo(map);
const layer=L.layerGroup().addTo(map); let center=[40.7536,-73.9832],generation=0;
const colors={commercial:'#d97706',restriction:'#dc2626',meter:'#2563eb',unknown:'#64748b'};
const labels={commercial:'Commercial / loading sign',restriction:'Restriction sign',meter:'Meter sign',unknown:'Review sign'};
const base='https://data.cityofnewyork.us';
function localNow(){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());return parts.replace(' ','T');} $('arrival').value=localNow();
async function get(path,params={}){const u=new URL(base+path);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));const r=await fetch(u);if(!r.ok)throw Error('NYC data returned HTTP '+r.status);return r.json();}
function text(tag,value,parent){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
async function search(){const id=++generation;const origin=[...center];const radius=Number($('radius').value);layer.clearLayers();results.replaceChildren();L.circle(origin,{radius,color:'#2563eb',fillOpacity:.04}).addTo(layer);L.circleMarker(origin,{radius:7,color:'#2563eb',fillOpacity:1}).addTo(layer);if(origin[0]>40.8015||origin[0]<40.700||origin[1]<-74.025||origin[1]>-73.945){status.textContent='Outside initial Manhattan pilot bounding area. Try Bryant Park.';return;}status.textContent='Loading NYC DOT sign records…';try{
 const projection='+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666667 +lat_0=40.16666666666667 +lon_0=-74 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs';
 if(typeof proj4!=='function')throw Error('Coordinate converter could not load');
 const [x,y]=proj4('EPSG:4326',projection,[origin[1],origin[0]]);
 const buffer=radius/0.3048006096012192*1.02+10;
 const where="record_type = 'Current' AND borough = 'Manhattan' AND sign_x_coord between "+Math.floor(x-buffer)+" and "+Math.ceil(x+buffer)+" AND sign_y_coord between "+Math.floor(y-buffer)+" and "+Math.ceil(y+buffer);
 const rows=await get('/resource/nfid-uabd.json',{'$where':where,'$limit':'5000'});if(id!==generation)return;const entries=[];for(const row of rows){if(row.sign_x_coord==null||row.sign_y_coord==null)continue;const sx=Number(row.sign_x_coord),sy=Number(row.sign_y_coord);if(!Number.isFinite(sx)||!Number.isFinite(sy))continue;const [lon,lat]=proj4(projection,'EPSG:4326',[sx,sy]);const p=[lat,lon];if(!p.every(Number.isFinite)||distance(origin,p)>radius)continue;const description=row.sign_description||'No description';entries.push({p,description,d:distance(origin,p),row});}entries.sort((a,b)=>a.d-b.d);
 for(const e of entries){const c=category(e.description);const popup=document.createElement('div');text('strong',labels[c],popup);text('p',e.description,popup);L.circleMarker(e.p,{radius:5,color:colors[c],fillOpacity:.8}).bindPopup(popup).addTo(layer);}
 status.textContent=entries.length+' nearby sign records'+(rows.length===5000?' (query limit reached; incomplete)':'')+'. Arrival and stay are planning inputs only; time rules are not evaluated yet.';
 for(const e of entries.slice(0,80)){const a=text('article','',results);text('strong',labels[category(e.description)]+' · '+Math.round(e.d)+' m',a);text('p',e.description,a);const street=Object.entries(e.row).filter(([k])=>/street|side_of/.test(k)).map(([k,v])=>k+': '+v).join(' · ');if(street)text('small',street,a);const b=text('button','Show on map',a);b.onclick=()=>map.setView(e.p,19);}
 }catch(e){if(id===generation)status.textContent='Could not load live signs: '+e.message+'. No parking conclusions available.';}}
function move(p){center=p;map.setView(p,16);search();} $('bryant').onclick=()=>move([40.7536,-73.9832]);$('refresh').onclick=search;map.on('click',e=>move([e.latlng.lat,e.latlng.lng]));$('loc').onclick=()=>{if(!navigator.geolocation){status.textContent='Location unavailable';return;}navigator.geolocation.getCurrentPosition(p=>move([p.coords.latitude,p.coords.longitude]),e=>status.textContent='Location unavailable: '+e.message,{enableHighAccuracy:true,timeout:15000});};$('radius').onchange=search;search();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
